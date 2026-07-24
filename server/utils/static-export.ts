// Static site generator utility supporting multiple export formats
// - Nuxt Generate: Self-contained static site
// - VitePress: Compatible with VitePress deployment
// - Plain HTML: Simple static pages

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { URL } from 'url';
import { format } from 'date-fns';

interface ProjectData {
  id: number;
  slug: string;
  name: string;
  description: string;
  accent_color: string;
  icon_url: string;
  font_family: string;
  bg_color: string;
  bg_subtle: string;
  text_color: string;
  text_muted: string;
  border_color: string;
  radius: number;
  sections: SectionData[];
}

interface SectionData {
  id: number;
  project_id: number;
  title: string;
  position: number;
  pages: PageData[];
}

interface PageData {
  id: number;
  project_id: number;
  section_id: number | null;
  slug: string;
  title: string;
  content: string;
  position: number;
  updated_at: string;
}

interface ExportOptions {
  format: 'nuxt' | 'vitepress' | 'plain';
  outputDir: string;
  includeAssets?: boolean;
}

interface ExportResult {
  success: boolean;
  format: string;
  outputDir: string;
  filesGenerated: number;
  pagesExported: number;
  sectionsExported: number;
  errors: string[];
}

/**
 * Get project data from database by slug
 */
function getProjectBySlug(slug: string): ProjectData | undefined {
  const db = useDb();
  
  const project = db.prepare(`
    SELECT id, slug, name, description, accent_color, icon_url, 
           font_family, bg_color, bg_subtle, text_color, text_muted,
           border_color, radius
    FROM projects WHERE slug = ?
  `).get(slug) as any;
  
  if (!project) return undefined;
  
  // Get sections with pages
  const sections = db.prepare(`
    SELECT s.id, s.project_id, s.title, s.position,
           (SELECT json_group_array(json_object(
             'id', p.id, 'project_id', p.project_id, 
             'section_id', p.section_id, 'slug', p.slug, 
             'title', p.title, 'content', p.content,
             'position', p.position, 'updated_at', p.updated_at
           ))
           FROM pages p WHERE p.section_id = s.id) as pages_json
    FROM sections s 
    WHERE s.project_id = ?
    ORDER BY s.position
  `).all(project.id) as any[];
  
  // Get root pages (no section)
  const rootPages = db.prepare(`
    SELECT json_group_array(json_object(
      'id', id, 'project_id', project_id, 
      'section_id', section_id, 'slug', slug, 
      'title', title, 'content', content,
      'position', position, 'updated_at', updated_at
    ))
    FROM pages WHERE project_id = ? AND section_id IS NULL
    ORDER BY position
  `).get(project.id) as any;
  
  const rootSection: SectionData = {
    id: 0,
    project_id: project.id,
    title: null as any,
    position: -1,
    pages: rootPages ? JSON.parse(rootPages) : []
  };
  
  const sectionList = sections.map((s: any) => ({
    id: s.id,
    project_id: s.project_id,
    title: s.title,
    position: s.position,
    pages: s.pages_json ? JSON.parse(s.pages_json) : []
  }));
  
  // Add root section if it has pages
  if (rootSection.pages.length > 0) {
    sectionList.unshift(rootSection);
  }
  
  return {
    ...project,
    sections: sectionList
  };
}

/**
 * Convert GitBook markdown to HTML for static export
 */
function convertMarkdownToHtml(markdown: string): string {
  const md = require('markdown-it')({
    html: true,
    breaks: true,
    linkify: true
  });
  
  // Add custom rules for image sizing
  md.rules.core.state.tokens.forEach((token: any) => {
    if (token.type === 'image') {
      const sizeMatch = token.attrs.find((attr: any) => attr[0] === 'size');
      if (sizeMatch) {
        token.attrs.push(['class', `image-size-${sizeMatch[1]}`]);
      }
    }
  });
  
  return md.render(markdown);
}

/**
 * Generate project metadata for export
 */
function generateProjectMetadata(project: ProjectData): Record<string, any> {
  return {
    title: project.name,
    description: project.description,
    theme: {
      accentColor: project.accent_color,
      fontFamily: project.font_family,
      bgColor: project.bg_color,
      bgSubtle: project.bg_subtle,
      textColor: project.text_color,
      textColorMuted: project.text_muted,
      borderColor: project.border_color,
      radius: project.radius
    },
    pages: project.sections.flatMap((s: SectionData) => 
      s.pages.map((p: PageData) => ({
        slug: p.slug,
        title: p.title,
        section: s.title || 'root',
        position: p.position
      }))
    ),
    generated: new Date().toISOString()
  };
}

/**
 * Export as Nuxt static site
 */
async function exportNuxt(project: ProjectData, options: ExportOptions): Promise<ExportResult> {
  const result: ExportResult = {
    success: true,
    format: 'nuxt',
    outputDir: options.outputDir,
    filesGenerated: 0,
    pagesExported: 0,
    sectionsExported: project.sections.length,
    errors: []
  };

  try {
    const publicDir = join(options.outputDir, 'public');
    const pagesDir = join(options.outputDir, 'pages');
    const assetsDir = join(options.outputDir, 'assets');
    
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(pagesDir, { recursive: true });
    mkdirSync(assetsDir, { recursive: true });
    
    // Write project metadata
    const metadata = generateProjectMetadata(project);
    writeFileSync(join(publicDir, 'project.json'), JSON.stringify(metadata, null, 2));
    
    // Generate Nuxt configuration
    const nuxtConfig = `export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  modules: [],
  css: ['~/assets/main.css'],
  runtimeConfig: {
    project: ${JSON.stringify(metadata)}
  }
});`;
    writeFileSync(join(options.outputDir, 'nuxt.config.ts'), nuxtConfig);
    
    // Generate layout
    const layout = `<template>
  <div class="layout" :style="themeStyles">
    <header class="header">
      <NuxtLink to="/" class="brand">{{ project.name }}</NuxtLink>
    </header>
    <main class="content">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const project = useNuxtApp().$config.public.project;
const themeStyles = {
  '--accent': project.theme.accentColor,
  '--bg': project.theme.bgColor,
  '--text': project.theme.textColor
};
</script>

<style scoped>
.layout { min-height: 100vh; }
.header { padding: 16px; border-bottom: 1px solid var(--border); }
.brand { font-weight: bold; }
.content { padding: 48px; }
</style>
`;
    writeFileSync(join(options.outputDir, 'layouts', 'default.vue'), layout);
    mkdirSync(join(options.outputDir, 'layouts'), { recursive: true });
    
    // Generate pages for each section
    let pageCount = 0;
    for (const section of project.sections) {
      for (const page of section.pages) {
        const pageContent = `\
<script setup lang="ts">
const page = ${JSON.stringify(page)};
</script>

<template>
  <article class="page">
    <h1>{{ page.title }}</h1>
    <div v-html="content" class="content"></div>
  </article>
</template>

<script lang="ts">
export default {
  computed: {
    content() {
      return \`${convertMarkdownToHtml(page.content)}\`;
    }
  }
};
</script>
`;
        const pagePath = join(pagesDir, `section-${section.position}`, `${page.slug}.vue`);
        mkdirSync(dirname(pagePath), { recursive: true });
        writeFileSync(pagePath, pageContent);
        result.filesGenerated++;
        pageCount++;
      }
    }
    
    result.pagesExported = pageCount;
    
    // Copy CSS assets if requested
    if (options.includeAssets) {
      const cssContent = `\
:root {
  --accent: ${project.accent_color};
  --bg: ${project.bg_color};
  --bg-subtle: ${project.bg_subtle};
  --text: ${project.text_color};
  --text-muted: ${project['text-muted']};
  --border: ${project.border_color};
  --radius: ${project.radius}px;
}

body {
  font-family: ${project.font_family};
  background: var(--bg);
  color: var(--text);
}

.content :deep(img) {
  max-width: 100%;
  height: auto;
}
`;
      writeFileSync(join(assetsDir, 'main.css'), cssContent);
      result.filesGenerated++;
    }
    
  } catch (error) {
    result.success = false;
    result.errors.push((error as Error).message);
  }

  return result;
}

/**
 * Export as VitePress site
 */
async function exportVitePress(project: ProjectData, options: ExportOptions): Promise<ExportResult> {
  const result: ExportResult = {
    success: true,
    format: 'vitepress',
    outputDir: options.outputDir,
    filesGenerated: 0,
    pagesExported: 0,
    sectionsExported: project.sections.length,
    errors: []
  };

  try {
    const docsDir = join(options.outputDir, 'docs');
    const configDir = join(options.outputDir, '.vitepress');
    
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    
    // Generate config.ts
    const config = `\
import DefaultTheme from 'vitepress/theme'
import './custom.css'
import './custom.js'

export default {
  extends: DefaultTheme
}
`;
    writeFileSync(join(configDir, 'config.ts'), config);
    
    // Generate custom.css
    const css = `\
:root {
  --vp-c-brand: ${project.accent_color};
  --vp-c-bg: ${project.bg_color};
  --vp-c-text: ${project.text_color};
}

.custom-class {
  --vp-c-brand-1: ${project.accent_color};
}
`;
    writeFileSync(join(configDir, 'custom.css'), css);
    
    // Generate custom.js
    const js = `\
import DefaultTheme from 'vitepress/theme'

export default {
  extends: DefaultTheme
}
`;
    writeFileSync(join(configDir, 'custom.js'), js);
    
    // Generate index.md
    const indexContent = `\
# ${project.name}

${project.description}

::: tip
This documentation was exported from KnowledgeBook.
:::
`;
    writeFileSync(join(docsDir, 'index.md'), indexContent);
    result.filesGenerated += 3;
    
    // Generate pages for each section
    let pageCounter = 0;
    for (const section of project.sections) {
      if (section.title) {
        const sectionDir = join(docsDir, section.slug || `section-${section.position}`);
        mkdirSync(sectionDir, { recursive: true });
        
        const sidebarContent = `\
# ${section.title}

This section contains ${section.pages.length} pages.
`;
        writeFileSync(join(sectionDir, 'index.md'), sidebarContent);
        result.filesGenerated++;
      }
      
      for (const page of section.pages) {
        const pagePath = join(docsDir, 
          section.title ? `${section.slug || `section-${section.position}`}` : '.',
          `${page.slug}.md`
        );
        const pageContent = `\
# ${page.title}

${page.content}

---
last_updated: ${new Date(page.updated_at).toISOString()}
`;
        writeFileSync(pagePath, pageContent);
        result.filesGenerated++;
        pageCounter++;
      }
    }
    
    result.pagesExported = pageCounter;
    
  } catch (error) {
    result.success = false;
    result.errors.push((error as Error).message);
  }

  return result;
}

/**
 * Export as Plain HTML site
 */
async function exportPlainHTML(project: ProjectData, options: ExportOptions): Promise<ExportResult> {
  const result: ExportResult = {
    success: true,
    format: 'plain',
    outputDir: options.outputDir,
    filesGenerated: 0,
    pagesExported: 0,
    sectionsExported: project.sections.length,
    errors: []
  };

  try {
    const publicDir = join(options.outputDir, 'public');
    mkdirSync(publicDir, { recursive: true });
    
    // Generate index.html
    const projectMetadata = generateProjectMetadata(project);
    const indexContent = `\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name}</title>
  <meta name="description" content="${project.description}">
  <style>
    :root {
      --accent: ${project.accent_color};
      --bg: ${project.bg_color};
      --bg-subtle: ${project.bg_subtle};
      --text: ${project.text_color};
      --text-muted: ${project['text-muted']};
      --border: ${project.border_color};
      --radius: ${project.radius}px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${project.font_family};
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 24px; }
    header { margin-bottom: 48px; }
    header h1 { margin-bottom: 16px; }
    nav { margin-bottom: 48px; }
    nav ul { list-style: none; padding: 0; }
    nav li { margin-bottom: 8px; }
    nav a { color: var(--accent); text-decoration: none; }
    nav a:hover { text-decoration: underline; }
    .page-content { margin-bottom: 48px; }
    .page-content h1 { margin-bottom: 24px; }
    .page-content img { max-width: 100%; height: auto; }
    footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${project.name}</h1>
      ${project.description ? `<p>${project.description}</p>` : ''}
    </header>
    
    <nav>
      <h2>Table of Contents</h2>
      <ul>
        ${project.sections.flatMap((s: SectionData) => 
          s.pages.map((p: PageData) => 
            `<li><a href="${p.slug}.html">${p.title}</a></li>`
          )
        ).join('\n        ')}
      </ul>
    </nav>
    
    <main id="content"></main>
    
    <footer>
      <p>Generated on ${new Date().toLocaleDateString()}</p>
    </footer>
  </div>
  
  <script>
    const pages = ${JSON.stringify(project.sections.flatMap((s: SectionData) => 
      s.pages.map((p: PageData) => ({
        slug: p.slug,
        title: p.title,
        content: p.content
      }))
    ))};
    
    const urlParams = new URLSearchParams(window.location.search);
    const pageSlug = urlParams.get('page') || '${project.sections[0]?.pages[0]?.slug || ''}';
    
    const currentPage = pages.find(p => p.slug === pageSlug);
    if (currentPage) {
      document.getElementById('content').innerHTML = \`
        <article class="page-content">
          <h1>\${currentPage.title}</h1>
          <div>\${currentPage.content.replace(/\\n/g, '<br>')}</div>
        </article>
      \`;
    }
  </script>
</body>
</html>
`;
    writeFileSync(join(publicDir, 'index.html'), indexContent);
    result.filesGenerated++;
    
    // Generate individual page HTML files
    let pageCounter = 0;
    for (const section of project.sections) {
      for (const page of section.pages) {
        const htmlContent = `\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title} - ${project.name}</title>
  <meta name="description" content="${page.content.substring(0, 150)}">
  <style>
    :root {
      --accent: ${project.accent_color};
      --bg: ${project.bg_color};
      --bg-subtle: ${project.bg_subtle};
      --text: ${project.text_color};
      --text-muted: ${project['text-muted']};
      --border: ${project.border_color};
      --radius: ${project.radius}px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${project.font_family};
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 24px; }
    header { margin-bottom: 48px; }
    header h1 { margin-bottom: 16px; }
    header a { color: var(--accent); text-decoration: none; }
    main { margin-bottom: 48px; }
    main h1 { margin-bottom: 24px; }
    main img { max-width: 100%; height: auto; }
    nav { margin: 48px 0; display: flex; justify-content: space-between; }
    nav a { color: var(--accent); text-decoration: none; padding: 12px 24px; background: var(--bg-subtle); border-radius: var(--radius); }
    nav a:hover { text-decoration: underline; }
    footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${page.title}</h1>
      <p><a href="index.html">${project.name}</a></p>
    </header>
    
    <main>
      <article>${convertMarkdownToHtml(page.content)}</article>
    </main>
    
    <nav>
      <a href="index.html">Back to home</a>
    </nav>
    
    <footer>
      <p>Last updated: ${new Date(page.updated_at).toLocaleDateString()}</p>
    </footer>
  </div>
</body>
</html>
`;
        writeFileSync(join(publicDir, `${page.slug}.html`), htmlContent);
        result.filesGenerated++;
        pageCounter++;
      }
    }
    
    result.pagesExported = pageCounter;
    
  } catch (error) {
    result.success = false;
    result.errors.push((error as Error).message);
  }

  return result;
}

/**
 * Main export function - creates deploy-ready package
 */
export async function exportStaticSite(
  projectSlug: string,
  options: ExportOptions
): Promise<ExportResult> {
  const project = getProjectBySlug(projectSlug);
  
  if (!project) {
    return {
      success: false,
      format: options.format,
      outputDir: options.outputDir,
      filesGenerated: 0,
      pagesExported: 0,
      sectionsExported: 0,
      errors: ['Project not found']
    };
  }

  // Clean output directory
  if (existsSync(options.outputDir)) {
    rmSync(options.outputDir, { recursive: true, force: true });
  }
  mkdirSync(options.outputDir, { recursive: true });

  // Export based on format
  switch (options.format) {
    case 'nuxt':
      return await exportNuxt(project, options);
    case 'vitepress':
      return await exportVitePress(project, options);
    case 'plain':
      return await exportPlainHTML(project, options);
    default:
      return {
        success: false,
        format: options.format,
        outputDir: options.outputDir,
        filesGenerated: 0,
        pagesExported: 0,
        sectionsExported: 0,
        errors: [`Unsupported format: ${options.format}`]
      };
  }
}

/**
 * Generate a ZIP archive for deployment
 */
export async function generateDeployPackage(
  outputDir: string,
  format: string
): Promise<{ success: boolean; archivePath?: string; errors: string[] }> {
  const result = { success: false, errors: [] as string[] };
  
  try {
    const { spawn } = require('child_process');
    const archiver = require('archiver');
    
    const archivePath = join(outputDir, `export-${format}-${Date.now()}.zip`);
    const output = require('fs').createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      result.success = true;
      result.archivePath = archivePath;
    });
    
    archive.pipe(output);
    archive.directory(outputDir, false);
    await archive.finalize();
    
  } catch (error) {
    result.errors.push((error as Error).message);
  }
  
  return result;
}

/**
 * Preview generated site locally
 */
export async function previewSite(
  outputDir: string,
  format: string,
  port: number = 3000
): Promise<{ success: boolean; url?: string; errors: string[] }> {
  const result = { success: false, errors: [] as string[] };
  
  try {
    const { spawn } = require('child_process');
    
    let command: string;
    let args: string[];
    
    switch (format) {
      case 'nuxt':
        command = 'npx';
        args = ['nuxti', 'preview', outputDir];
        break;
      case 'vitepress':
        command = 'npx';
        args = ['vitepress', 'preview', outputDir];
        break;
      case 'plain':
        command = 'npx';
        args = ['serve', '-s', outputDir, '-l', port.toString()];
        break;
      default:
        result.errors.push(`Unsupported format for preview: ${format}`);
        return result;
    }
    
    const child = spawn(command, args, { stdio: 'pipe', cwd: outputDir });
    
    child.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log(output);
      if (output.includes('Local:') || output.includes('Preview on')) {
        result.success = true;
      }
    });
    
    child.stderr.on('data', (data: Buffer) => {
      console.error(data.toString());
    });
    
  } catch (error) {
    result.errors.push((error as Error).message);
  }
  
  return result;
}
