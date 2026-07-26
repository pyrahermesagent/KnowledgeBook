// Imports a published GitBook site into a new KnowledgeBook project.
//
// GitBook publishes two machine-readable views of every site, which we use
// instead of scraping HTML:
//   - `<site>/llms.txt`  — the site structure: title, description, and pages
//     under `##` headings (site tabs; the sidebar groups readers see exist
//     only in the URL paths, so sections are derived from those)
//   - `<page-url>.md`    — the raw markdown of any page
// When llms.txt is unavailable we fall back to sitemap.xml for page discovery.
//
// Images and file attachments hosted by GitBook are copied into the project's
// own storage: their CDN URLs carry access tokens tied to the source site and
// stop resolving once it changes or unpublishes.

import { createHash } from 'node:crypto';

const MAX_PAGES = 500;
const MAX_NESTED_SITEMAPS = 10;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 8;
// Matches the manual upload endpoint's per-file cap.
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_ASSETS_PER_IMPORT = 200;

interface GitBookPageRef {
  title: string;
  /** Canonical page URL (no .md suffix). */
  url: string;
  /** URL that returns the page as raw markdown. */
  mdUrl: string;
}

interface GitBookSectionRef {
  /** null for pages that live at the site root, outside any group. */
  title: string | null;
  pages: GitBookPageRef[];
}

interface GitBookSite {
  title: string;
  description: string;
  /** Hostname the site's pages actually live on (after any redirects). */
  host: string;
  sections: GitBookSectionRef[];
  truncated: boolean;
}

export interface GitBookImportResult {
  slug: string;
  name: string;
  sectionCount: number;
  pageCount: number;
  failedCount: number;
  /** Images and attachments copied into project storage. */
  assetCount: number;
  truncated: boolean;
}

/** Crawls the GitBook site at `rawUrl` and creates a project owned by `ownerId`. */
export async function importGitBookProject(
  ownerId: number,
  rawUrl: string
): Promise<GitBookImportResult> {
  const base = parseImportUrl(rawUrl);
  const site = await discoverGitBookSite(base);

  const allPages = site.sections.flatMap((s) => s.pages);
  if (!allPages.length) {
    throw createError({ statusCode: 422, message: 'That GitBook site has no importable pages' });
  }

  const contents = await fetchPageContents(allPages);

  // A site can advertise pages (llms.txt/sitemap) without exposing markdown
  // exports — creating a project full of stubs would only look broken.
  const totalFailed = [...contents.values()].filter((page) => page.failed).length;
  if (totalFailed >= allPages.length * 0.9) {
    throw createError({
      statusCode: 422,
      message:
        'That site does not expose its content as markdown, so it cannot be imported. Only published GitBook sites are supported.',
    });
  }

  const slugByPath = assignPageSlugs(allPages);

  const name = site.title || base.hostname;
  const projectSlug = uniqueProjectSlug(site.title);
  const sections = divideSections(site);

  // Final page markdown — links repointed and GitBook-hosted assets copied
  // into project storage — is prepared before the insert transaction because
  // the downloads are async and better-sqlite3 transactions are not.
  const mirror: AssetMirror = { cache: new Map(), projectSlug, siteHost: site.host, count: 0 };
  const finalContent = new Map<GitBookPageRef, string>();
  for (const page of allPages) {
    let content = rewriteInternalLinks(
      contents.get(page)!.content,
      site.host,
      projectSlug,
      slugByPath
    );
    content = finalizeUnresolvedFileImages(content, site.host, page.url);
    finalContent.set(page, await mirrorRemoteAssets(content, mirror));
  }

  const db = useDb();
  const failedCount = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)')
      .run(ownerId, projectSlug, name, site.description.slice(0, 300));
    const projectId = Number(info.lastInsertRowid);

    let failures = 0;
    for (const [sectionPosition, section] of sections.entries()) {
      const sectionInfo = db
        .prepare('INSERT INTO sections (project_id, title, position) VALUES (?, ?, ?)')
        .run(projectId, section.title, sectionPosition);
      const sectionId = Number(sectionInfo.lastInsertRowid);

      for (const [pagePosition, page] of section.pages.entries()) {
        if (contents.get(page)!.failed) failures++;
        const slug = slugByPath.get(pathKey(page.url))!;
        db.prepare(
          'INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(projectId, sectionId, slug, page.title, finalContent.get(page)!, pagePosition);
      }
    }
    return failures;
  })();

  return {
    slug: projectSlug,
    name,
    sectionCount: sections.length,
    pageCount: allPages.length,
    failedCount,
    assetCount: mirror.count,
    truncated: site.truncated,
  };
}

interface ImportSection {
  title: string;
  pages: GitBookPageRef[];
}

/**
 * Turns the discovered site structure into the sections that get created.
 *
 * llms.txt `##` headings are site tabs (often a single "Documentation"), not
 * the sidebar groups readers see — those exist only in the URL paths. A
 * heading whose pages span several path groups is split into one section per
 * group; a cohesive heading is kept as one section. Every page lands in a real
 * section because the app never displays pages without one.
 */
function divideSections(site: GitBookSite): ImportSection[] {
  return site.sections.flatMap((group) => divideGroup(group, site.title));
}

function divideGroup(group: GitBookSectionRef, siteTitle: string): ImportSection[] {
  const paths = group.pages.map((page) => pathKey(page.url).split('/').filter(Boolean));

  // Deepest directory shared by every page in the group; pages are grouped by
  // their first segment below it, so /docs/a and /docs/guides/b group by
  // "guides" rather than by the common "docs".
  let shared = paths.length ? paths[0].slice(0, -1) : [];
  for (const segments of paths) {
    const dir = segments.slice(0, -1);
    let i = 0;
    while (i < shared.length && i < dir.length && shared[i] === dir[i]) i++;
    shared = shared.slice(0, i);
  }

  const keyOf = (segments: string[]): string | null =>
    segments.length > shared.length + 1 ? segments[shared.length] : null;
  const keys = new Set<string>();
  for (const segments of paths) {
    const key = keyOf(segments);
    if (key !== null) keys.add(key);
  }

  // Splitting only helps when the heading actually spans several path groups.
  // An untitled group (sitemap fallback, pages above the first `##`) splits
  // for a single one too — it has no meaningful title to preserve.
  if (keys.size < (group.title === null ? 1 : 2)) {
    return group.pages.length
      ? [{ title: group.title ?? (siteTitle || 'Documentation'), pages: group.pages }]
      : [];
  }

  const byKey = new Map<string, ImportSection>();
  const ordered: ImportSection[] = [];
  const sectionFor = (key: string, title: string): ImportSection => {
    let section = byKey.get(key);
    if (!section) {
      section = { title, pages: [] };
      byKey.set(key, section);
      ordered.push(section);
    }
    return section;
  };

  for (const [i, page] of group.pages.entries()) {
    const key = keyOf(paths[i]);
    if (key !== null) {
      sectionFor(key, lastSegmentTitle(key)).pages.push(page);
      continue;
    }
    const own = paths[i][shared.length] ?? '';
    if (keys.has(own)) {
      // The group's landing page (e.g. /getting-started itself): it heads the
      // section and gives it its human-written title.
      const section = sectionFor(own, page.title);
      section.title = page.title;
      section.pages.unshift(page);
    } else {
      sectionFor('', group.title ?? 'Overview').pages.push(page);
    }
  }
  return ordered;
}

/** Validates the user-supplied URL and rejects targets on private networks. */
function parseImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw createError({
      statusCode: 400,
      message: 'Enter a valid URL, e.g. https://docs.example.com',
    });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw createError({ statusCode: 400, message: 'Only http(s) URLs can be imported' });
  }
  assertPublicHost(url.hostname);
  url.hash = '';
  url.search = '';
  return url;
}

function assertPublicHost(hostname: string): void {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privatePatterns = [
    /^localhost$/,
    /\.local$/,
    /^0\.0\.0\.0$/,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^::1$/,
    /^f[cd][0-9a-f]{2}:/,
    /^fe80:/,
  ];
  if (privatePatterns.some((p) => p.test(host))) {
    throw createError({
      statusCode: 400,
      message: 'That URL points to a private address and cannot be imported',
    });
  }
}

interface FetchedText {
  ok: boolean;
  status: number;
  text: string;
  /** URL the response actually came from, after redirects. */
  finalUrl: string;
}

async function fetchText(
  url: string,
  accept = 'text/markdown, text/plain, */*'
): Promise<FetchedText> {
  let result: FetchedText = { ok: false, status: 0, text: '', finalUrl: url };
  // Retry transient failures (network errors, throttling, 5xx) once after a
  // short pause; a 404 is a real answer and is returned immediately.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'KnowledgeBook-Importer/1.0', accept },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const finalUrl = res.url || url;
      // A redirect may land elsewhere — re-check the final host before reading.
      assertPublicHost(new URL(finalUrl).hostname);
      result = { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '', finalUrl };
      if (res.ok || (res.status !== 429 && res.status < 500)) return result;
    } catch {
      result = { ok: false, status: 0, text: '', finalUrl: url };
    }
  }
  return result;
}

function looksLikeHtml(text: string): boolean {
  return /^\s*<(!doctype|html|head|body)/i.test(text);
}

/** Candidate site roots: the given path, then each ancestor up to the origin. */
function candidateRoots(base: URL): string[] {
  const roots: string[] = [];
  const segments = base.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  for (let i = segments.length; i >= 0; i--) {
    roots.push(
      `${base.origin}${segments
        .slice(0, i)
        .map((s) => `/${s}`)
        .join('')}`
    );
  }
  return roots;
}

async function discoverGitBookSite(base: URL): Promise<GitBookSite> {
  for (const root of candidateRoots(base)) {
    const res = await fetchText(`${root}/llms.txt`);
    if (!res.ok || looksLikeHtml(res.text)) continue;
    // The site may have redirected (e.g. docs.x.com -> x.com/docs); its pages
    // are listed relative to (or absolute under) the final URL.
    const site = parseLlmsTxt(res.text, new URL(res.finalUrl));
    if (site) return site;
  }

  for (const root of candidateRoots(base)) {
    const site = await siteFromSitemap(root);
    if (site) return site;
  }

  throw createError({
    statusCode: 422,
    message:
      'Could not find a GitBook site at that URL (no llms.txt or sitemap.xml). Make sure the site is published and the URL is its home page.',
  });
}

/**
 * Parses GitBook's llms.txt:
 *
 *   # Site title
 *   > Optional description
 *   ## Section
 *   - [Page title](https://host/path.md): optional description
 */
function parseLlmsTxt(text: string, llmsUrl: URL): GitBookSite | null {
  const expectedHost = llmsUrl.hostname;
  let title = '';
  let description = '';
  const sections: GitBookSectionRef[] = [];
  let current: GitBookSectionRef = { title: null, pages: [] };
  sections.push(current);
  let pageCount = 0;
  let truncated = false;

  for (const line of text.split('\n')) {
    const heading1 = line.match(/^#\s+(.+)/);
    if (heading1 && !title) {
      title = heading1[1].trim();
      continue;
    }
    const quote = line.match(/^>\s+(.+)/);
    if (quote && !description) {
      description = quote[1].trim();
      continue;
    }
    const heading2 = line.match(/^##\s+(.+)/);
    if (heading2) {
      current = { title: heading2[1].trim(), pages: [] };
      sections.push(current);
      continue;
    }
    const link = line.match(/^\s*[-*]\s+\[([^\]]*)\]\(([^)\s]+)\)/);
    if (link) {
      let url: URL;
      try {
        url = new URL(link[2], llmsUrl);
      } catch {
        continue;
      }
      if (url.hostname !== expectedHost) continue;
      if (pageCount >= MAX_PAGES) {
        truncated = true;
        continue;
      }
      pageCount++;
      const canonical = `${url.origin}${url.pathname.replace(/\.md$/, '').replace(/\/+$/, '')}`;
      current.pages.push({
        title: link[1].trim() || lastSegmentTitle(url.pathname),
        url: canonical,
        mdUrl: url.pathname.endsWith('.md')
          ? `${url.origin}${url.pathname}`
          : url.pathname === '/' || url.pathname === ''
            ? `${url.origin}/index.md`
            : `${canonical}.md`,
      });
    }
  }

  if (!pageCount) return null;
  return {
    title,
    description,
    host: expectedHost,
    sections: sections.filter((s) => s.pages.length),
    truncated,
  };
}

/** Fallback discovery: one flat section built from sitemap.xml page URLs. */
async function siteFromSitemap(root: string): Promise<GitBookSite | null> {
  const res = await fetchText(`${root}/sitemap.xml`);
  if (!res.ok || looksLikeHtml(res.text)) return null;
  const siteHost = new URL(res.finalUrl).hostname;

  const locs = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const pageUrls: string[] = [];
  let nested = 0;
  for (const loc of locs) {
    if (loc.endsWith('.xml')) {
      if (nested++ >= MAX_NESTED_SITEMAPS) continue;
      const child = await fetchText(loc);
      if (child.ok) {
        pageUrls.push(
          ...[...child.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
            .map((m) => m[1])
            .filter((u) => !u.endsWith('.xml'))
        );
      }
    } else {
      pageUrls.push(loc);
    }
  }

  const seen = new Set<string>();
  const pages: GitBookPageRef[] = [];
  let truncated = false;
  for (const raw of pageUrls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.hostname !== siteHost) continue;
    const canonical = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    if (pages.length >= MAX_PAGES) {
      truncated = true;
      break;
    }
    pages.push({
      title: lastSegmentTitle(url.pathname),
      url: canonical,
      mdUrl:
        url.pathname === '/' || url.pathname === '' ? `${url.origin}/index.md` : `${canonical}.md`,
    });
  }

  if (!pages.length) return null;
  const rootPath = new URL(root).pathname.replace(/\/+$/, '');
  return {
    // A site living at the origin root has no path segment to name it after —
    // use the host instead of the generic "Home".
    title: rootPath ? lastSegmentTitle(rootPath) : siteHost,
    description: '',
    host: siteHost,
    sections: [{ title: null, pages }],
    truncated,
  };
}

interface FetchedPage {
  content: string;
  failed: boolean;
}

async function fetchPageContents(
  pages: GitBookPageRef[]
): Promise<Map<GitBookPageRef, FetchedPage>> {
  const results = new Map<GitBookPageRef, FetchedPage>();
  await mapLimit(pages, FETCH_CONCURRENCY, async (page) => {
    const res = await fetchText(page.mdUrl);
    if (!res.ok || looksLikeHtml(res.text)) {
      results.set(page, {
        failed: true,
        content: `# ${page.title}\n\n> This page could not be imported automatically — see the original at ${page.url}\n`,
      });
      return;
    }

    let content = normalizeGitBookMarkdown(stripFrontMatter(res.text));
    content = await resolveGitBookFileImages(content, page.url);
    const h1 = content.match(/^#\s+(.+)/m);
    if (!page.title) page.title = h1?.[1].trim() || lastSegmentTitle(new URL(page.url).pathname);
    if (!h1) content = `# ${page.title}\n\n${content}`;
    results.set(page, { failed: false, content });
  });
  return results;
}

interface HtmlContentImage {
  url: string;
  alt: string;
  size?: string;
}

function sizeFromClass(classAttr: string): string | undefined {
  if (classAttr.includes('w-150') || classAttr.includes('w-128')) return 'small';
  if (classAttr.includes('w-300') || classAttr.includes('w-256')) return 'medium';
  if (classAttr.includes('w-full')) return 'large';
  return undefined;
}

/**
 * Content images of a rendered GitBook page, in document order. Every content
 * image is served through the `~gitbook/image?url=…` proxy; the decoded inner
 * URL is the durable CDN address. Site chrome (logos live under
 * `organizations/…`, not `…/uploads/…`) and the dark-theme duplicate GitBook
 * renders next to each light image are excluded.
 */
function extractContentImages(html: string): HtmlContentImage[] {
  const images: HtmlContentImage[] = [];
  for (const img of html.matchAll(/<img[^>]*>/g)) {
    const classAttr = img[0].match(/class="([^"]*)"/)?.[1] ?? '';
    if (/\bdark:(?:block|inline)\b/.test(classAttr)) continue;
    const proxied = img[0].match(/src="[^"]*[?&]url=([^&"]+)/)?.[1];
    if (!proxied) continue;
    let inner: string;
    try {
      inner = decodeURIComponent(proxied);
    } catch {
      continue;
    }
    if (!/\/files\/v0\//.test(inner) || !/uploads(?:%2F|\/)/i.test(inner)) continue;
    images.push({
      url: inner,
      alt: normalizeAltText(img[0].match(/alt="([^"]*)"/)?.[1] ?? ''),
      size: sizeFromClass(classAttr),
    });
  }
  return images;
}

/**
 * GitBook's markdown export references uploaded images as `/files/<id>`, which
 * has no public URL. The rendered HTML page does expose durable CDN URLs for
 * the same images, so fetch the page once and pair them up: positionally when
 * the page's markdown refs and content images line up one-to-one (the only way
 * to resolve empty or duplicated alt text), by alt text otherwise. Unresolved
 * refs are left in place and become placeholder links after internal-link
 * rewriting (see finalizeUnresolvedFileImages).
 */
async function resolveGitBookFileImages(content: string, pageUrl: string): Promise<string> {
  const refPattern = /!\[([^\]]*)\]\(\/files\/[^)\s]+\)/g;
  const refCount = [...content.matchAll(refPattern)].length;
  if (!refCount) return content;

  // GitBook content-negotiates: ask for HTML explicitly or we get markdown back.
  const html = await fetchText(pageUrl, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8');
  const images = html.ok && looksLikeHtml(html.text) ? extractContentImages(html.text) : [];

  const byAlt = new Map<string, HtmlContentImage>();
  for (const image of images) {
    if (image.alt && !byAlt.has(image.alt)) byAlt.set(image.alt, image);
  }

  const positional = refCount === images.length;
  let index = 0;
  return content.replace(refPattern, (full, alt: string) => {
    const image = positional ? images[index++] : byAlt.get(normalizeAltText(alt));
    if (!image) return full;
    const sizePart = image.size ? `{size=${image.size}}` : '';
    return `![${alt}](${image.url})${sizePart}`;
  });
}

interface AssetMirror {
  /** Source URL -> stored public URL, or null when the copy failed. */
  cache: Map<string, string | null>;
  projectSlug: string;
  siteHost: string;
  count: number;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'video/mp4': '.mp4',
};

/**
 * Copies every GitBook-hosted image and file attachment referenced by the page
 * into the project's own storage and points the reference at the copy. Assets
 * on other hosts (e.g. an embedded Unsplash photo) are ordinary public URLs
 * and stay hot-linked. Failed downloads leave the original reference.
 */
async function mirrorRemoteAssets(content: string, mirror: AssetMirror): Promise<string> {
  const sources = new Map<string, string>();
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const source = mirrorableSource(match[1], mirror.siteHost);
    if (source) sources.set(match[1], source);
  }
  if (!sources.size) return content;

  await mapLimit([...new Set(sources.values())], FETCH_CONCURRENCY, (source) =>
    mirrorOneAsset(source, mirror)
  );

  return content.replace(
    /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g,
    (full, bang: string, text: string, target: string) => {
      const source = sources.get(target);
      const stored = source ? mirror.cache.get(source) : null;
      if (!stored) return full;
      // `{% file %}` tags arrive as [url](url); label the copy by filename.
      const label = !bang && text === target ? assetFileName(source) : text;
      return `${bang}[${label}](${stored})`;
    }
  );
}

/** The URL to copy the asset from, or null when it should stay hot-linked. */
function mirrorableSource(target: string, siteHost: string): string | null {
  if (!/^https?:\/\//i.test(target)) return null;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  // GitBook's resizing proxy wraps the real CDN URL; copy from the CDN.
  if (url.pathname.includes('/~gitbook/image')) {
    const inner = url.searchParams.get('url');
    return inner ? mirrorableSource(inner, siteHost) : null;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'gitbook.io' || host.endsWith('.gitbook.io')) return target;
  if (url.pathname.includes('.gitbook/assets/')) return target;
  if (host === siteHost.toLowerCase() && url.pathname.startsWith('/files/')) return target;
  return null;
}

async function mirrorOneAsset(source: string, mirror: AssetMirror): Promise<void> {
  if (mirror.cache.has(source)) return;
  if (mirror.count >= MAX_ASSETS_PER_IMPORT) {
    mirror.cache.set(source, null);
    return;
  }
  const asset = await fetchBinary(source);
  if (!asset) {
    mirror.cache.set(source, null);
    return;
  }
  let name = assetFileName(source);
  if (!/\.[a-z0-9]{1,8}$/i.test(name)) name += EXT_BY_TYPE[asset.contentType] ?? '';
  // Hash-prefixed so distinct assets sharing a filename cannot collide.
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  const key = `projects/${mirror.projectSlug}/import/${hash}-${name}`;
  try {
    mirror.cache.set(source, await storeFile(key, asset.data, asset.contentType));
    mirror.count++;
  } catch {
    mirror.cache.set(source, null);
  }
}

/** Human-readable filename of an asset URL (its decoded last path segment). */
function assetFileName(source: string): string {
  let segment: string;
  try {
    segment = new URL(source).pathname.split('/').filter(Boolean).pop() ?? '';
    segment = decodeURIComponent(segment).split('/').filter(Boolean).pop() ?? '';
  } catch {
    segment = '';
  }
  const cleaned = segment
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(-80);
  return cleaned || 'file';
}

async function fetchBinary(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'KnowledgeBook-Importer/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // A redirect may land elsewhere — re-check the final host before reading.
    assertPublicHost(new URL(res.url || url).hostname);
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length') ?? 0) > MAX_ASSET_BYTES) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (!data.length || data.length > MAX_ASSET_BYTES) return null;
    const contentType =
      res.headers.get('content-type')?.split(';')[0].trim() || 'application/octet-stream';
    return { data, contentType };
  } catch {
    return null;
  }
}

/**
 * Runs after rewriteInternalLinks (which would otherwise turn a link to the
 * original page into a self-link): any image still pointing at the site's
 * unresolvable /files/ storage becomes a link to the original page.
 */
function finalizeUnresolvedFileImages(content: string, siteHost: string, pageUrl: string): string {
  const escapedHost = siteHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const unresolved = new RegExp(
    String.raw`!\[([^\]]*)\]\(https?://${escapedHost}/files/[^)\s]*\)`,
    'g'
  );
  return content.replace(
    unresolved,
    (_, alt: string) => `_[${alt.trim() || 'Image'} — view on the original page](${pageUrl})_`
  );
}

function normalizeAltText(alt: string): string {
  return alt
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFrontMatter(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? markdown.slice(match[0].length).replace(/^\s+/, '') : markdown;
}

const HINT_EMOJI: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  danger: '🚨',
  success: '✅',
};

/**
 * Rewrites GitBook-specific markdown into plain markdown that markdown-it can
 * render: `{% hint %}` / `{% tab %}` / `{% embed %}` template tags and the raw
 * `<figure><img>` HTML GitBook emits (raw HTML is disabled in our renderer).
 */
function normalizeGitBookMarkdown(markdown: string): string {
  let out = markdown.replace(/\r\n/g, '\n');

  // GitBook prepends a boilerplate blockquote advertising llms.txt/.md URLs.
  if (/^>[^\n]*llms\.txt/.test(out)) out = out.replace(/^(?:>[^\n]*\n)+\s*/, '');

  // Expandable blocks flatten to a bold title followed by their content.
  // They often span fenced code blocks, so handle them line by line here
  // rather than in the per-segment pass below.
  let inFence = false;
  const lines: string[] = [];
  for (let line of out.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      if (/^\s*<\/?details[^>]*>\s*$/.test(line)) continue;
      line = line.replace(
        /<summary[^>]*>([\s\S]*?)<\/summary>/g,
        (_, s) => `**${inlineHtmlToMarkdown(s).trim()}**`
      );
    }
    lines.push(line);
  }
  out = lines.join('\n');

  // Fenced code blocks may legitimately contain GitBook/HTML syntax as
  // examples — transform only the segments between fences.
  return out
    .split(/(```[\s\S]*?```)/)
    .map((segment, i) => (i % 2 ? segment : normalizeGitBookSegment(segment)))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
}

function normalizeGitBookSegment(segment: string): string {
  let out = segment;

  // Hints become blockquotes, keeping the style as a leading emoji.
  out = out.replace(
    /\{%\s*hint(?:\s+style="(\w+)")?.*?%\}\n?([\s\S]*?)\{%\s*endhint\s*%\}/g,
    (_, style, body) => {
      const emoji = HINT_EMOJI[style] ?? HINT_EMOJI.info;
      const lines = body
        .trim()
        .split('\n')
        .map((line: string) => (line ? `> ${line}` : '>'));
      if (lines.length) lines[0] = lines[0].replace(/^>\s?/, `> ${emoji} `);
      return `${lines.join('\n')}\n`;
    }
  );

  // Tabs flatten to bold headings; embeds and files become plain links.
  out = out.replace(/\{%\s*tab\s+title="([^"]*)".*?%\}/g, '**$1**');
  out = out.replace(/\{%\s*(?:embed|file)\s+(?:url|src)="([^"]+)".*?%\}/g, '[$1]($1)');

  // <figure>/<picture>/<img> blocks become markdown images (with any
  // figcaption as an italic line below).
  out = out.replace(/<figure>[\s\S]*?<\/figure>/g, (figure) => {
    const image = imgToMarkdown(figure.match(/<img([^>]*)>/)?.[1] ?? '');
    if (!image) return '';
    const caption = (figure.match(/<figcaption>([\s\S]*?)<\/figcaption>/)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return caption ? `${image}\n\n_${caption}_` : image;
  });
  out = out.replace(/<picture>[\s\S]*?<\/picture>/g, (picture) =>
    imgToMarkdown(picture.match(/<img([^>]*)>/)?.[1] ?? '')
  );
  out = out.replace(/<img([^>]*)>/g, (_, attrs) => imgToMarkdown(attrs));

  // HTML tables (GitBook uses them whenever cells hold rich content).
  out = out.replace(/<table[^>]*>[\s\S]*?<\/table>/g, tableToMarkdown);

  // HTML headings and interactive widgets that have no markdown equivalent.
  out = out.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g,
    (_, level, text) => `${'#'.repeat(Number(level))} ${text.trim()}\n`
  );
  out = out.replace(/<select[\s\S]*?<\/select>/g, '');
  out = out.replace(/<button[^>]*>([\s\S]*?)<\/button>/g, '$1');

  out = inlineHtmlToMarkdown(out);
  out = out.replace(/<br\s*\/?>/g, '\n');

  // Remaining template tags (stepper, step, tabs, code, content-ref, update,
  // column, …) just wrap content that reads fine on its own — drop the tags.
  out = out.replace(/[ \t]*\{%[\s\S]*?%\}[ \t]*\n?/g, '');

  return out;
}

function imgToMarkdown(attrs: string): string {
  const src = attrs.match(/src="([^"]*)"/)?.[1] ?? '';
  const alt = attrs.match(/alt="([^"]*)"/)?.[1] ?? '';
  const widthClass = attrs.match(/class="[^"]*\b(w-[0-9]+|w-full|w-auto)\b[^"]*"/)?.[0];
  const styleWidth = attrs.match(/style="[^"]*width\s*:\s*([0-9]+px|100%)"/)?.[1];

  if (!src) return '';

  // Determine size from width class or style
  let size: 'small' | 'medium' | 'large' | null = null;
  if (widthClass) {
    if (widthClass.includes('w-150') || widthClass.includes('w-128')) size = 'small';
    else if (widthClass.includes('w-300') || widthClass.includes('w-256')) size = 'medium';
    else if (widthClass.includes('w-full') || widthClass.includes('w-full')) size = 'large';
  } else if (styleWidth) {
    if (styleWidth.includes('150px')) size = 'small';
    else if (styleWidth.includes('300px')) size = 'medium';
    else if (styleWidth.includes('100%')) size = 'large';
  }

  if (size) return `![${alt}](${src}){size=${size}}`;
  return `![${alt}](${src})`;
}

/** Converts inline HTML elements to their markdown equivalents. */
function inlineHtmlToMarkdown(html: string): string {
  return (
    html
      .replace(
        /<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
        (_, href, text) => `[${text.replace(/<[^>]+>/g, '').trim()}](${href})`
      )
      .replace(/<(?:strong|b)(?:\s[^>]*)?>([\s\S]*?)<\/(?:strong|b)>/g, '**$1**')
      .replace(/<em(?:\s[^>]*)?>([\s\S]*?)<\/em>/g, '*$1*')
      .replace(/<(?:code|kbd)(?:\s[^>]*)?>([\s\S]*?)<\/(?:code|kbd)>/g, '`$1`')
      .replace(/<mark(?:\s[^>]*)?>([\s\S]*?)<\/mark>/g, '$1')
      // Decorative icon elements and layout wrappers carry no content.
      .replace(/<i\s+class="fa-[^"]*"[^>]*>[\s\S]*?<\/i>\s*/g, '')
      .replace(/<source[^>]*>/g, '')
      .replace(/<\/?(?:div|span|p|thead|tbody)[^>]*>/g, '')
  );
}

function tableToMarkdown(table: string): string {
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((row) =>
      [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => tableCellText(cell[1]))
    )
    .filter((cells) => cells.length);
  if (!rows.length) return '';

  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  return (
    [
      line(rows[0]),
      line(Array.from({ length: width }, () => '---')),
      ...rows.slice(1).map(line),
    ].join('\n') + '\n'
  );
}

function tableCellText(cell: string): string {
  return inlineHtmlToMarkdown(cell)
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<li[^>]*>/g, '• ')
    .replace(/<\/?(?:ul|ol|li)[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/** Normalized lookup key for a page URL's path (no .md, no trailing slash). */
function pathKey(url: string): string {
  try {
    return new URL(url).pathname.replace(/\.md$/, '').replace(/\/+$/, '').toLowerCase() || '/';
  } catch {
    return url;
  }
}

/** Derives a unique in-project slug for every page from its URL path. */
function assignPageSlugs(pages: GitBookPageRef[]): Map<string, string> {
  // Drop path segments shared by every page (e.g. the /docs in x.com/docs/…)
  // so slugs don't all carry the same prefix.
  const segmentLists = pages.map((page) => pathKey(page.url).split('/').filter(Boolean));
  let shared = 0;
  if (segmentLists.length > 1) {
    while (segmentLists.every((s) => s.length > shared && s[shared] === segmentLists[0][shared]))
      shared++;
  }

  const slugs = new Map<string, string>();
  const used = new Set<string>();
  for (const [i, page] of pages.entries()) {
    const fromPath = slugify(segmentLists[i].slice(shared).join('-'));
    const base = fromPath || slugify(page.title) || 'page';
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
    used.add(slug);
    slugs.set(pathKey(page.url), slug);
  }
  return slugs;
}

/**
 * Points links between imported pages at their new /<project>/<page> home.
 * Site-relative URLs that are not imported pages (images, files) are made
 * absolute so they keep resolving from their original host.
 */
function rewriteInternalLinks(
  content: string,
  siteHost: string,
  projectSlug: string,
  slugByPath: Map<string, string>
): string {
  return content.replace(/\]\(([^)\s]+)\)/g, (full, target: string) => {
    const [path, anchor] = splitAnchor(target);
    let key: string | null = null;
    let relative = false;
    if (/^https?:\/\//i.test(path)) {
      try {
        const url = new URL(path);
        if (url.hostname === siteHost) key = pathKey(path);
      } catch {
        /* leave unparseable links alone */
      }
    } else if (path.startsWith('/')) {
      key = path.replace(/\.md$/, '').replace(/\/+$/, '').toLowerCase() || '/';
      relative = true;
    }
    const slug = key !== null ? slugByPath.get(key) : undefined;
    if (slug) return `](/${projectSlug}/${slug}${anchor})`;
    if (relative) return `](https://${siteHost}${path}${anchor})`;
    return full;
  });
}

function splitAnchor(target: string): [string, string] {
  const i = target.indexOf('#');
  return i === -1 ? [target, ''] : [target.slice(0, i), target.slice(i)];
}

function lastSegmentTitle(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean).pop() ?? '';
  const words = segment.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Home';
}

function uniqueProjectSlug(title: string): string {
  let base = slugify(title) || 'imported-docs';
  if (RESERVED_SLUGS.has(base)) base = `${base}-docs`;
  let slug = base;
  for (let n = 2; getProjectBySlug(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
  return slug;
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await fn(item);
    }
  });
  await Promise.all(workers);
}
