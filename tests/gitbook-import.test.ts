import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createTestDb, destroyTestDbs } from './setup/db';
import { slugify, RESERVED_SLUGS, getProjectBySlug } from '#utils/auth';
import { importGitBookProject } from '#utils/gitbook';

/**
 * GitBook import against a fully faked site (fetch and storeFile are stubbed).
 *
 * The fixtures mirror what GitBook actually publishes:
 *  - llms.txt whose `##` headings are site tabs, with the real sidebar groups
 *    only visible in URL paths (docs.gitbook.com is shaped like this);
 *  - page .md exports that reference uploaded images as `/files/<id>`, which
 *    is resolvable only through the rendered HTML's proxied CDN URLs;
 *  - sitemap.xml-only sites with no grouping information at all.
 */

const g = globalThis as Record<string, any>;
g.slugify = slugify;
g.RESERVED_SLUGS = RESERVED_SLUGS;
g.getProjectBySlug = getProjectBySlug;

interface StoredAsset {
  key: string;
  bytes: number;
  contentType: string;
}

let storedAssets: StoredAsset[] = [];
g.storeFile = async (key: string, data: Buffer, contentType: string) => {
  storedAssets.push({ key, bytes: data.length, contentType });
  return `/uploads/${key}`;
};

/** URL -> response body/type; anything unregistered 404s. */
const routes = new Map<string, { body: string | Uint8Array; type: string }>();
const fetchedUrls: string[] = [];

g.fetch = async (input: unknown) => {
  const url = String(input);
  fetchedUrls.push(url);
  const route = routes.get(url);
  if (!route) return new Response('not found', { status: 404 });
  return new Response(route.body as BodyInit, {
    status: 200,
    headers: { 'content-type': route.type },
  });
};

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]);

/** Proxied content-image src the way GitBook renders it (inner URL encoded once). */
function proxiedSrc(host: string, innerUrl: string): string {
  return `https://${host}/~gitbook/image?url=${encodeURIComponent(innerUrl)}&width=768&dpr=2&quality=100&sign=sig`;
}

const CDN = 'https://123-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o';
const ARCH_URL = `${CDN}/spaces%2FS%2Fuploads%2Fabc%2Farchitecture.png?alt=media&token=tok1`;
const ARCH_DARK_URL = `${CDN}/spaces%2FS%2Fuploads%2Fzzz%2Farchitecture-dark.png?alt=media&token=tok9`;
const DIAGRAM_URL = `${CDN}/spaces%2FS%2Fuploads%2Fdef%2Fdiagram.png?alt=media&token=tok2`;
const LOGO_URL = `${CDN}/organizations%2FOrg%2Fsites%2Fsite%2Flogo.png?alt=media`;
const SETUP_ZIP_URL = `${CDN}/spaces%2FS%2Fuploads%2Fghi%2Fsetup.zip?alt=media&token=tok3`;

function registerLlmsSite() {
  const host = 'docs.example.com';
  const base = `https://${host}`;

  routes.set(`${base}/llms.txt`, {
    type: 'text/plain',
    body: [
      '# Example Docs',
      '',
      '> Docs for Example.',
      '',
      '## Documentation',
      '',
      `- [Overview](${base}/overview.md): Intro`,
      `- [Getting started](${base}/getting-started.md)`,
      `- [Quickstart](${base}/getting-started/quickstart.md)`,
      `- [Installation](${base}/getting-started/installation.md)`,
      `- [API](${base}/reference/api.md)`,
      `- [CLI](${base}/reference/cli.md)`,
      '',
      '## Guides',
      '',
      `- [Writing](${base}/guides/writing.md)`,
      `- [Publishing](${base}/guides/publishing.md)`,
    ].join('\n'),
  });

  routes.set(`${base}/overview.md`, {
    type: 'text/markdown',
    body: [
      '# Overview',
      '',
      'Welcome. See [Quickstart](/getting-started/quickstart).',
      '',
      '![Architecture](/files/imgA1)',
      '',
      '![](/files/imgB2)',
      '',
      '![External](https://images.unsplash.com/photo-1.jpg)',
    ].join('\n'),
  });

  // Rendered HTML for the page above: a logo (organizations path — not page
  // content), a light/dark image pair (dark variant must be skipped), and a
  // content image with an empty alt that only positional matching can resolve.
  routes.set(`${base}/overview`, {
    type: 'text/html',
    body: [
      '<!doctype html><html><body>',
      `<img alt="Logo" class="block dark:hidden" src="${proxiedSrc(host, LOGO_URL)}">`,
      `<img data-testid="zoom-image" alt="Architecture" class="block dark:hidden" src="${proxiedSrc(host, ARCH_URL)}">`,
      `<img data-testid="zoom-image" alt="Architecture" class="hidden dark:block" src="${proxiedSrc(host, ARCH_DARK_URL)}">`,
      `<img data-testid="zoom-image" alt="" class="block" src="${proxiedSrc(host, DIAGRAM_URL)}">`,
      '</body></html>',
    ].join('\n'),
  });

  routes.set(`${base}/getting-started.md`, {
    type: 'text/markdown',
    body: '# Getting started\n\nStart here.',
  });
  routes.set(`${base}/getting-started/quickstart.md`, {
    type: 'text/markdown',
    body: '# Quickstart\n\nInstall it: [Install](/getting-started/installation).',
  });
  routes.set(`${base}/getting-started/installation.md`, {
    type: 'text/markdown',
    body: `# Installation\n\n{% file src="${SETUP_ZIP_URL}" %}\n`,
  });
  routes.set(`${base}/reference/api.md`, { type: 'text/markdown', body: '# API\n\nEndpoints.' });
  routes.set(`${base}/reference/cli.md`, { type: 'text/markdown', body: '# CLI\n\nCommands.' });
  routes.set(`${base}/guides/writing.md`, { type: 'text/markdown', body: '# Writing\n\nWrite.' });
  routes.set(`${base}/guides/publishing.md`, {
    type: 'text/markdown',
    body: '# Publishing\n\nPublish.',
  });

  routes.set(ARCH_URL, { type: 'image/png', body: PNG_BYTES });
  routes.set(DIAGRAM_URL, { type: 'image/png', body: PNG_BYTES });
  routes.set(SETUP_ZIP_URL, { type: 'application/zip', body: ZIP_BYTES });
}

function registerSitemapSite() {
  const base = 'https://wiki.example.com';
  routes.set(`${base}/sitemap.xml`, {
    type: 'application/xml',
    body: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      `<url><loc>${base}/</loc></url>`,
      `<url><loc>${base}/faq</loc></url>`,
      `<url><loc>${base}/guides/a</loc></url>`,
      `<url><loc>${base}/guides/b</loc></url>`,
      '</urlset>',
    ].join('\n'),
  });
  routes.set(`${base}/index.md`, { type: 'text/markdown', body: '# Home\n\nHello.' });
  routes.set(`${base}/faq.md`, { type: 'text/markdown', body: '# FAQ\n\nAnswers.' });
  routes.set(`${base}/guides/a.md`, { type: 'text/markdown', body: '# A\n\nFirst.' });
  routes.set(`${base}/guides/b.md`, { type: 'text/markdown', body: '# B\n\nSecond.' });
}

interface SectionRow {
  id: number;
  title: string;
  position: number;
}

interface PageRow {
  section_id: number | null;
  slug: string;
  title: string;
  content: string;
  position: number;
}

function loadProject(db: ReturnType<typeof createTestDb>, slug: string) {
  const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as {
    id: number;
    name: string;
    description: string;
  };
  const sections = db
    .prepare('SELECT id, title, position FROM sections WHERE project_id = ? ORDER BY position, id')
    .all(project.id) as SectionRow[];
  const pages = db
    .prepare(
      'SELECT section_id, slug, title, content, position FROM pages WHERE project_id = ? ORDER BY position, id'
    )
    .all(project.id) as PageRow[];
  return { project, sections, pages };
}

function pagesOf(sections: SectionRow[], pages: PageRow[], title: string): PageRow[] {
  const section = sections.find((s) => s.title === title);
  expect(section, `section "${title}" should exist`).toBeDefined();
  return pages.filter((p) => p.section_id === section!.id).sort((a, b) => a.position - b.position);
}

describe('GitBook import (llms.txt site)', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    db.prepare('INSERT INTO users (email, name) VALUES (?, ?)').run('owner@test.dev', 'Owner');
    routes.clear();
    fetchedUrls.length = 0;
    storedAssets = [];
    registerLlmsSite();
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('divides sections by URL structure when a tab spans several path groups', async () => {
    const result = await importGitBookProject(1, 'https://docs.example.com');
    const { sections, pages } = loadProject(db, result.slug);

    // "Documentation" is a site tab, not a sidebar group: its pages split into
    // path-derived sections. "Guides" is cohesive (one path group) and stays.
    expect(sections.map((s) => s.title)).toEqual([
      'Documentation',
      'Getting started',
      'Reference',
      'Guides',
    ]);

    expect(pagesOf(sections, pages, 'Documentation').map((p) => p.slug)).toEqual(['overview']);
    // The landing page at /getting-started heads its own group's section.
    expect(pagesOf(sections, pages, 'Getting started').map((p) => p.slug)).toEqual([
      'getting-started',
      'getting-started-quickstart',
      'getting-started-installation',
    ]);
    expect(pagesOf(sections, pages, 'Reference').map((p) => p.slug)).toEqual([
      'reference-api',
      'reference-cli',
    ]);
    expect(pagesOf(sections, pages, 'Guides').map((p) => p.slug)).toEqual([
      'guides-writing',
      'guides-publishing',
    ]);
  });

  it('leaves no page outside a section (sectionless pages are invisible in the UI)', async () => {
    const result = await importGitBookProject(1, 'https://docs.example.com');
    const { pages } = loadProject(db, result.slug);
    expect(pages.length).toBe(8);
    for (const page of pages) expect(page.section_id).not.toBeNull();
  });

  it('copies /files/ images into project storage, matching by position in the page HTML', async () => {
    const result = await importGitBookProject(1, 'https://docs.example.com');
    const { pages } = loadProject(db, result.slug);
    const overview = pages.find((p) => p.slug === 'overview')!;

    // Both images — including the one with an empty alt, which alt-text
    // matching can never resolve — now point at copied local assets.
    expect(overview.content).toMatch(
      /!\[Architecture\]\(\/uploads\/projects\/example-docs\/[^)\s]*architecture\.png\)/
    );
    expect(overview.content).toMatch(
      /!\[\]\(\/uploads\/projects\/example-docs\/[^)\s]*diagram\.png\)/
    );

    // No unresolved /files/ refs, no token-signed CDN URLs left behind.
    expect(overview.content).not.toContain('/files/');
    expect(overview.content).not.toContain('gitbook.io');

    const storedKeys = storedAssets.map((a) => a.key).sort();
    expect(storedKeys.some((k) => k.endsWith('architecture.png'))).toBe(true);
    expect(storedKeys.some((k) => k.endsWith('diagram.png'))).toBe(true);
    expect(
      storedAssets
        .filter((a) => a.contentType === 'image/png')
        .every((a) => a.bytes === PNG_BYTES.length)
    ).toBe(true);
  });

  it('copies GitBook-hosted file attachments and links them by filename', async () => {
    const result = await importGitBookProject(1, 'https://docs.example.com');
    const { pages } = loadProject(db, result.slug);
    const installation = pages.find((p) => p.slug === 'getting-started-installation')!;

    expect(installation.content).toMatch(
      /\[setup\.zip\]\(\/uploads\/projects\/example-docs\/[^)\s]*setup\.zip\)/
    );
    expect(installation.content).not.toContain('gitbook.io');
    expect(storedAssets.some((a) => a.contentType === 'application/zip')).toBe(true);
  });

  it('leaves external images hot-linked and never fetches them', async () => {
    const result = await importGitBookProject(1, 'https://docs.example.com');
    const { pages } = loadProject(db, result.slug);
    const overview = pages.find((p) => p.slug === 'overview')!;

    expect(overview.content).toContain('![External](https://images.unsplash.com/photo-1.jpg)');
    expect(fetchedUrls.some((u) => u.includes('unsplash.com'))).toBe(false);
  });

  it('still rewrites internal links to the imported pages', async () => {
    const result = await importGitBookProject(1, 'https://docs.example.com');
    const { pages } = loadProject(db, result.slug);
    const overview = pages.find((p) => p.slug === 'overview')!;
    const quickstart = pages.find((p) => p.slug === 'getting-started-quickstart')!;

    expect(overview.content).toContain('](/example-docs/getting-started-quickstart)');
    expect(quickstart.content).toContain('](/example-docs/getting-started-installation)');
  });

  it('reports what was imported, including copied assets', async () => {
    const result = await importGitBookProject(1, 'https://docs.example.com');
    expect(result.name).toBe('Example Docs');
    expect(result.pageCount).toBe(8);
    expect(result.sectionCount).toBe(4);
    expect(result.failedCount).toBe(0);
    expect(result.assetCount).toBe(3);
  });
});

describe('GitBook import (sitemap-only site)', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    db.prepare('INSERT INTO users (email, name) VALUES (?, ?)').run('owner@test.dev', 'Owner');
    routes.clear();
    fetchedUrls.length = 0;
    storedAssets = [];
    registerSitemapSite();
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('groups sitemap pages into path-derived sections instead of one invisible pile', async () => {
    const result = await importGitBookProject(1, 'https://wiki.example.com');
    const { sections, pages } = loadProject(db, result.slug);

    expect(sections.map((s) => s.title)).toEqual(['Overview', 'Guides']);
    expect(pagesOf(sections, pages, 'Overview').map((p) => p.slug)).toEqual(['home', 'faq']);
    expect(pagesOf(sections, pages, 'Guides').map((p) => p.slug)).toEqual(['guides-a', 'guides-b']);
    for (const page of pages) expect(page.section_id).not.toBeNull();
  });

  it('names the project after the host when the site root has no path', async () => {
    const result = await importGitBookProject(1, 'https://wiki.example.com');
    expect(result.name).toBe('wiki.example.com');
  });
});
