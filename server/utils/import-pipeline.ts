// Unified Import Pipeline for KnowledgeBook
// Supports 7+ import formats with auto-detection
// Formats: gitbook, markdown, html, csv, confluence, notion, pdf/epub

import type { H3Event } from 'h3';

export interface ImportOptions {
  ownerId: number;
  projectSlug?: string;
  projectName?: string;
  format?: 'auto' | 'gitbook' | 'markdown' | 'html' | 'csv' | 'confluence' | 'notion' | 'pdf' | 'epub';
  url?: string;
  content?: string;
  file?: any; // For file uploads
}

export interface ImportFormatInfo {
  name: string;
  extensions: string[];
  mimeType: string[];
}

export interface ImportResult {
  slug: string;
  name: string;
  sectionCount: number;
  pageCount: number;
  failedCount: number;
  truncated?: boolean;
  importFormat?: string;
}

// Supported import formats
export const SUPPORTED_FORMATS: Record<string, ImportFormatInfo> = {
  gitbook: {
    name: 'GitBook',
    extensions: ['.json', '.xml', 'llms.txt', 'sitemap.xml'],
    mimeType: ['application/json', 'text/xml', 'text/plain'],
  },
  markdown: {
    name: 'Markdown',
    extensions: ['.md', '.markdown', '.mkd'],
    mimeType: ['text/markdown', 'text/plain'],
  },
  html: {
    name: 'HTML',
    extensions: ['.html', '.htm', '.xhtml'],
    mimeType: ['text/html', 'application/xhtml+xml'],
  },
  csv: {
    name: 'CSV',
    extensions: ['.csv'],
    mimeType: ['text/csv'],
  },
  confluence: {
    name: 'Confluence',
    extensions: ['.xml'],
    mimeType: ['text/xml', 'application/xml'],
  },
  notion: {
    name: 'Notion',
    extensions: ['.json'],
    mimeType: ['application/json'],
  },
  pdf: {
    name: 'PDF',
    extensions: ['.pdf'],
    mimeType: ['application/pdf'],
  },
  epub: {
    name: 'EPUB',
    extensions: ['.epub'],
    mimeType: ['application/epub+zip'],
  },
};

// Format detection helpers
export function detectFormat(content: string, url?: string, filename?: string): 'gitbook' | 'markdown' | 'html' | 'csv' | 'confluence' | 'notion' | 'pdf' | 'epub' {
  // Check filename first
  if (filename) {
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith('.md') || lowerFilename.endsWith('.markdown') || lowerFilename.endsWith('.mkd')) {
      return 'markdown';
    }
    if (lowerFilename.endsWith('.csv')) {
      return 'csv';
    }
    if (lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm')) {
      return 'html';
    }
    if (lowerFilename.endsWith('.xml')) {
      // Could be Confluence or generic XML
      if (content.includes('<page') || content.includes('<confluence')) {
        return 'confluence';
      }
      return 'notion';
    }
    if (lowerFilename.endsWith('.json')) {
      return 'notion';
    }
    if (lowerFilename.endsWith('.pdf')) {
      return 'pdf';
    }
    if (lowerFilename.endsWith('.epub')) {
      return 'epub';
    }
  }

  // Check URL patterns
  if (url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('gitbook.io') || lowerUrl.includes('llms.txt') || lowerUrl.includes('sitemap.xml')) {
      return 'gitbook';
    }
    if (lowerUrl.endsWith('.csv')) {
      return 'csv';
    }
    if (lowerUrl.endsWith('.md') || lowerUrl.endsWith('.markdown')) {
      return 'markdown';
    }
    if (lowerUrl.endsWith('.html') || lowerUrl.includes('/html/')) {
      return 'html';
    }
    if (lowerUrl.endsWith('.xml')) {
      return 'confluence';
    }
    if (lowerUrl.endsWith('.json')) {
      return 'notion';
    }
    if (lowerUrl.endsWith('.pdf')) {
      return 'pdf';
    }
    if (lowerUrl.endsWith('.epub')) {
      return 'epub';
    }
  }

  // Check content patterns
  if (content) {
    // GitBook detection (llms.txt pattern)
    if (content.includes('## ') || content.includes('llms.txt') || content.includes('<loc>')) {
      return 'gitbook';
    }
    
    // HTML detection
    if (content.includes('<html') || content.includes('<body') || content.includes('<!DOCTYPE') || content.includes('<!doctype')) {
      return 'html';
    }
    
    // CSV detection
    if (content.startsWith('title,') || content.includes(',content,') || (content.includes(',') && content.includes('\n'))) {
      return 'csv';
    }
    
    // Notion JSON detection
    if (content.includes('"object": "page"') || content.includes('"object": "database"')) {
      return 'notion';
    }
    
    // Confluence XML detection
    if (content.includes('<page') || content.includes('<confluence')) {
      return 'confluence';
    }
    
    // PDF file signature
    if (content.startsWith('%PDF')) {
      return 'pdf';
    }
    
    // EPUB file signature (OPF container)
    if (content.includes('application/epub+zip') || content.includes('OEBPS')) {
      return 'epub';
    }
  }
  
  return 'markdown';
}

// Format validation helpers
export function validateFormat(format: string, content?: string, url?: string, filename?: string): boolean {
  const detected = detectFormat(content || '', url, filename);
  return format === 'auto' || format === detected;
}

// Import handlers for each format
async function importGitBookPipeline(options: ImportOptions & { url: string }): Promise<ImportResult> {
  const { importGitBookProject } = await import('./gitbook');
  return importGitBookProject(options.ownerId, options.url!);
}

async function importMarkdownPipeline(options: ImportOptions & { content: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'Markdown Import');
  const projectName = options.projectName || 'Markdown Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from markdown content') as any;
  
  // For markdown, create a single section and page
  const sectionInfo = db.prepare(`
    INSERT INTO sections (project_id, title, position)
    VALUES (?, ?, ?)
    RETURNING id
  `).run(projectId.id, 'Introduction', 0);
  
  const pageContent = processMarkdownContent(options.content);
  
  db.prepare(`
    INSERT INTO pages (project_id, section_id, slug, title, content, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId.id, sectionInfo.id, 'home', 'Home', pageContent, 0);
  
  return {
    slug: projectSlug,
    name: projectName,
    sectionCount: 1,
    pageCount: 1,
    failedCount: 0,
    importFormat: 'markdown',
  };
}

async function importHtmlPipeline(options: ImportOptions & { content: string; url?: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'HTML Import');
  const projectName = options.projectName || 'HTML Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from HTML content') as any;
  
  const sectionInfo = db.prepare(`
    INSERT INTO sections (project_id, title, position)
    VALUES (?, ?, ?)
    RETURNING id
  `).run(projectId.id, 'Imported Content', 0);
  
  const pageContent = processHtmlContent(options.content, options.url);
  
  db.prepare(`
    INSERT INTO pages (project_id, section_id, slug, title, content, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId.id, sectionInfo.id, 'imported', 'Imported Page', pageContent, 0);
  
  return {
    slug: projectSlug,
    name: projectName,
    sectionCount: 1,
    pageCount: 1,
    failedCount: 0,
    importFormat: 'html',
  };
}

async function importCsvPipeline(options: ImportOptions & { content: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'CSV Import');
  const projectName = options.projectName || 'CSV Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from CSV content') as any;
  
  const sectionInfo = db.prepare(`
    INSERT INTO sections (project_id, title, position)
    VALUES (?, ?, ?)
    RETURNING id
  `).run(projectId.id, 'Data', 0);
  
  const pages = parseCsvToPages(options.content);
  
  let failedCount = 0;
  let position = 0;
  
  for (const page of pages) {
    try {
      db.prepare(`
        INSERT INTO pages (project_id, section_id, slug, title, content, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId.id, sectionInfo.id, page.slug, page.title, page.content, position++);
    } catch {
      failedCount++;
    }
  }
  
  return {
    slug: projectSlug,
    name: projectName,
    sectionCount: 1,
    pageCount: pages.length,
    failedCount,
    importFormat: 'csv',
  };
}

async function importConfluencePipeline(options: ImportOptions & { content: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'Confluence Import');
  const projectName = options.projectName || 'Confluence Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from Confluence XML') as any;
  
  const sectionInfo = db.prepare(`
    INSERT INTO sections (project_id, title, position)
    VALUES (?, ?, ?)
    RETURNING id
  `).run(projectId.id, 'Imported Content', 0);
  
  const pages = parseConfluenceXml(options.content);
  
  let failedCount = 0;
  let position = 0;
  
  for (const page of pages) {
    try {
      db.prepare(`
        INSERT INTO pages (project_id, section_id, slug, title, content, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId.id, sectionInfo.id, page.slug, page.title, page.content, position++);
    } catch {
      failedCount++;
    }
  }
  
  return {
    slug: projectSlug,
    name: projectName,
    sectionCount: 1,
    pageCount: pages.length,
    failedCount,
    importFormat: 'confluence',
  };
}

async function importNotionPipeline(options: ImportOptions & { content: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'Notion Import');
  const projectName = options.projectName || 'Notion Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from Notion JSON') as any;
  
  const sectionInfo = db.prepare(`
    INSERT INTO sections (project_id, title, position)
    VALUES (?, ?, ?)
    RETURNING id
  `).run(projectId.id, 'Imported Content', 0);
  
  const pages = parseNotionJson(options.content);
  
  let failedCount = 0;
  let position = 0;
  
  for (const page of pages) {
    try {
      db.prepare(`
        INSERT INTO pages (project_id, section_id, slug, title, content, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId.id, sectionInfo.id, page.slug, page.title, page.content, position++);
    } catch {
      failedCount++;
    }
  }
  
  return {
    slug: projectSlug,
    name: projectName,
    sectionCount: 1,
    pageCount: pages.length,
    failedCount,
    importFormat: 'notion',
  };
}

async function importPdfPipeline(options: ImportOptions & { content: string; filename?: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'PDF Import');
  const projectName = options.projectName || 'PDF Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from PDF') as any;
  
  const sectionInfo = db.prepare(`
    INSERT INTO sections (project_id, title, position)
    VALUES (?, ?, ?)
    RETURNING id
  `).run(projectId.id, 'Imported Content', 0);
  
  // For PDF, we'd need a PDF parsing library in a real implementation
  // For now, create a placeholder page
  const pages = [{
    slug: 'pdf-page-1',
    title: 'PDF Content Page 1',
    content: '[PDF content would be extracted here]',
  }];
  
  let failedCount = 0;
  let position = 0;
  
  for (const page of pages) {
    try {
      db.prepare(`
        INSERT INTO pages (project_id, section_id, slug, title, content, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId.id, sectionInfo.id, page.slug, page.title, page.content, position++);
    } catch {
      failedCount++;
    }
  }
  
  return {
    slug: projectSlug,
    name: projectName,
    sectionCount: 1,
    pageCount: pages.length,
    failedCount,
    importFormat: 'pdf',
  };
}

async function importEpubPipeline(options: ImportOptions & { content: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'EPUB Import');
  const projectName = options.projectName || 'EPUB Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from EPUB') as any;
  
  const sectionInfo = db.prepare(`
    INSERT INTO sections (project_id, title, position)
    VALUES (?, ?, ?)
    RETURNING id
  `).run(projectId.id, 'Imported Content', 0);
  
  // For EPUB, we'd need an EPUB parsing library in a real implementation
  // For now, create a placeholder page
  const pages = [{
    slug: 'epub-page-1',
    title: 'EPUB Content Page 1',
    content: '[EPUB content would be extracted here]',
  }];
  
  let failedCount = 0;
  let position = 0;
  
  for (const page of pages) {
    try {
      db.prepare(`
        INSERT INTO pages (project_id, section_id, slug, title, content, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId.id, sectionInfo.id, page.slug, page.title, page.content, position++);
    } catch {
      failedCount++;
    }
  }
  
  return {
    slug: projectSlug,
    name: projectName,
    sectionCount: 1,
    pageCount: pages.length,
    failedCount,
    importFormat: 'epub',
  };
}

// Content processing helpers
function processMarkdownContent(content: string): string {
  // Remove frontmatter if present
  const cleaned = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  // Normalize line endings
  return cleaned.replace(/\r\n/g, '\n').trim();
}

function processHtmlContent(html: string, baseUrl?: string): string {
  // Extract main content from HTML using simple regex parsing
  let content = html;
  
  // Remove scripts and styles
  content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Convert headings
  content = content.replace(/<h1[^>]*>([^<]+)<\/h1>/gi, '# $1\n\n');
  content = content.replace(/<h2[^>]*>([^<]+)<\/h2>/gi, '## $1\n\n');
  content = content.replace(/<h3[^>]*>([^<]+)<\/h3>/gi, '### $1\n\n');
  content = content.replace(/<h4[^>]*>([^<]+)<\/h4>/gi, '#### $1\n\n');
  content = content.replace(/<h5[^>]*>([^<]+)<\/h5>/gi, '##### $1\n\n');
  content = content.replace(/<h6[^>]*>([^<]+)<\/h6>/gi, '###### $1\n\n');
  
  // Convert paragraphs
  content = content.replace(/<p[^>]*>([^<]+)<\/p>/gi, '$1\n\n');
  
  // Convert line breaks to spaces
  content = content.replace(/<br\s*\/?>/gi, ' ');
  
  // Extract title if available
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && baseUrl) {
    content = `# ${titleMatch[1].trim()}\n\nContent imported from ${baseUrl}\n\n` + content;
  }
  
  return content.trim();
}

function parseCsvToPages(csv: string): Array<{ slug: string; title: string; content: string }> {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const pages: Array<{ slug: string; title: string; content: string }> = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const page = Object.fromEntries(headers.map((h, idx) => [h, values[idx]]));
    
    if (page.title && page.content) {
      pages.push({
        slug: page.slug || slugify(page.title),
        title: page.title,
        content: page.content || '',
      });
    }
  }
  
  return pages;
}

function parseConfluenceXml(xml: string): Array<{ slug: string; title: string; content: string }> {
  const pages: Array<{ slug: string; title: string; content: string }> = [];
  
  // Simple XML parsing for Confluence export format
  const pageRegex = /<page[^>]*>([\s\S]*?)<\/page>/g;
  let match;
  
  while ((match = pageRegex.exec(xml)) !== null) {
    const pageContent = match[1];
    
    // Extract title
    const titleMatch = pageContent.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
    
    // Extract content (body)
    const contentMatch = pageContent.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    const content = contentMatch ? contentMatch[1].trim() : '';
    
    if (title) {
      pages.push({
        slug: slugify(title),
        title,
        content,
      });
    }
  }
  
  return pages;
}

function parseNotionJson(json: string): Array<{ slug: string; title: string; content: string }> {
  const pages: Array<{ slug: string; title: string; content: string }> = [];
  
  try {
    const data = JSON.parse(json);
    
    // Handle Notion export format
    if (data.object === 'database') {
      // Database export - extract pages from results
      if (data.results && Array.isArray(data.results)) {
        for (const result of data.results) {
          const properties = result.properties || {};
          const title = extractNotionPropertyValue(properties, 'title') || 'Untitled';
          const content = extractNotionContent(properties);
          
          pages.push({
            slug: slugify(title),
            title,
            content,
          });
        }
      }
    } else if (data.object === 'page') {
      // Single page export
      const properties = data.properties || {};
      const title = extractNotionPropertyValue(properties, 'title') || 'Untitled';
      const content = extractNotionContent(properties);
      
      pages.push({
        slug: slugify(title),
        title,
        content,
      });
    }
  } catch {
    // Invalid JSON or unexpected format
  }
  
  return pages;
}

function extractNotionPropertyValue(properties: any, propertyName: string): string | null {
  if (!properties) return null;
  const prop = properties[propertyName];
  if (!prop) return null;
  
  if (prop.type === 'title') {
    return prop.title.map((t: any) => t.plain_text).join(' ') || null;
  }
  if (prop.type === 'rich_text') {
    return prop.rich_text.map((t: any) => t.plain_text).join(' ') || null;
  }
  return null;
}

function extractNotionContent(properties: any): string {
  // Extract all rich text content
  const parts: string[] = [];
  
  for (const key in properties) {
    const prop = properties[key];
    if (prop && prop.rich_text) {
      const text = prop.rich_text.map((t: any) => t.plain_text).join(' ');
      if (text) {
        parts.push(text);
      }
    }
  }
  
  return parts.join('\n\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .trim()
    .substring(0, 50);
}

function uniqueProjectSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .trim()
    .substring(0, 50);
  
  const db = useDb();
  const count = db.prepare(`SELECT COUNT(*) as count FROM projects WHERE slug LIKE ?`)
    .get(`${slug}%`) as any;
  
  if (count.count === 0) {
    return slug;
  }
  
  return `${slug}-${Date.now().toString(36)}`;
}

// Main unified import function
export async function importContent(options: ImportOptions): Promise<ImportResult> {
  const { format, url, content, projectName, ownerId } = options;
  
  if (!content && !url && !options.file) {
    throw createError({ statusCode: 400, message: 'Content, URL, or file is required for import' });
  }
  
  // Determine format
  let detectedFormat: string = format || 'auto';
  
  if (detectedFormat === 'auto' || !detectedFormat) {
    detectedFormat = detectFormat(content || '', url, options.file?.name);
  }
  
  // Route to appropriate handler
  switch (detectedFormat) {
    case 'gitbook':
      if (!url) {
        throw createError({ statusCode: 400, message: 'URL is required for GitBook import' });
      }
      return await importGitBookPipeline({ ownerId, url });
    
    case 'markdown':
      if (!content) {
        throw createError({ statusCode: 400, message: 'Content is required for markdown import' });
      }
      return await importMarkdownPipeline({ ownerId, content, projectName });
    
    case 'html':
      if (!content) {
        throw createError({ statusCode: 400, message: 'Content is required for HTML import' });
      }
      return await importHtmlPipeline({ ownerId, content, url });
    
    case 'csv':
      if (!content) {
        throw createError({ statusCode: 400, message: 'Content is required for CSV import' });
      }
      return await importCsvPipeline({ ownerId, content, projectName });
    
    case 'confluence':
      if (!content) {
        throw createError({ statusCode: 400, message: 'Content is required for Confluence import' });
      }
      return await importConfluencePipeline({ ownerId, content, projectName });
    
    case 'notion':
      if (!content) {
        throw createError({ statusCode: 400, message: 'Content is required for Notion import' });
      }
      return await importNotionPipeline({ ownerId, content, projectName });
    
    case 'pdf':
      if (!content && !options.file) {
        throw createError({ statusCode: 400, message: 'Content or file is required for PDF import' });
      }
      return await importPdfPipeline({ ownerId, content: content || '', filename: options.file?.name });
    
    case 'epub':
      if (!content && !options.file) {
        throw createError({ statusCode: 400, message: 'Content or file is required for EPUB import' });
      }
      return await importEpubPipeline({ ownerId, content: content || '', filename: options.file?.name });
    
    default:
      throw createError({ statusCode: 400, message: `Unsupported format: ${detectedFormat}` });
  }
}

// Get list of supported formats
export function getSupportedFormats(): string[] {
  return Object.keys(SUPPORTED_FORMATS);
}

// Get format info by name
export function getFormatInfo(format: string): ImportFormatInfo | undefined {
  return SUPPORTED_FORMATS[format];
}

// Validate import request
export function validateImportRequest(options: ImportOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!options.ownerId) {
    errors.push('Owner ID is required');
  }
  
  if (!options.content && !options.url && !options.file) {
    errors.push('Content, URL, or file is required');
  }
  
  if (options.format && options.format !== 'auto' && !SUPPORTED_FORMATS[options.format]) {
    errors.push(`Unsupported format: ${options.format}`);
  }
  
  return { valid: errors.length === 0, errors };
}
