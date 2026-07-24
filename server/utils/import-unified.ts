// Unified import pipeline supporting multiple source formats
// Auto-detects format and routes to appropriate import handler

interface ImportOptions {
  ownerId: number;
  projectSlug?: string;
  projectName?: string;
}

interface ImportResult {
  slug: string;
  name: string;
  sectionCount: number;
  pageCount: number;
  failedCount: number;
  truncated?: boolean;
}

// Format detection helpers
function detectFormat(content: string, url?: string): 'gitbook' | 'markdown' | 'html' | 'csv' {
  // Check URL patterns first
  if (url) {
    if (url.includes('gitbook.io') || url.includes('llms.txt') || url.includes('sitemap.xml')) {
      return 'gitbook';
    }
    if (url.endsWith('.csv')) {
      return 'csv';
    }
    if (url.endsWith('.md') || url.endsWith('.markdown')) {
      return 'markdown';
    }
    if (url.endsWith('.html') || url.includes('html')) {
      return 'html';
    }
  }

  // Check content patterns
  if (content.includes('## ') || content.includes('llms.txt') || content.includes('<loc>')) {
    return 'gitbook';
  }
  if (content.includes('<html') || content.includes('<body') || content.includes('<!DOCTYPE')) {
    return 'html';
  }
  if (content.startsWith('title,') || content.includes(',content,')) {
    return 'csv';
  }
  return 'markdown';
}

// GitBook import (existing functionality, reused)
async function importGitBookPipeline(options: ImportOptions & { url: string }): Promise<ImportResult> {
  const { importGitBookProject } = await import('./gitbook');
  return importGitBookProject(options.ownerId, options.url);
}

// Markdown import (direct file content)
async function importMarkdownPipeline(options: ImportOptions & { content: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'Imported');
  const projectName = options.projectName || 'Markdown Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from markdown content') as { id: number };
  
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
    failedCount: 0
  };
}

// HTML import (from网页 content)
async function importHtmlPipeline(options: ImportOptions & { content: string; url?: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'HTML Import');
  const projectName = options.projectName || 'HTML Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from HTML content') as { id: number };
  
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
    failedCount: 0
  };
}

// CSV import (for structured content)
async function importCsvPipeline(options: ImportOptions & { content: string }): Promise<ImportResult> {
  const db = useDb();
  
  const projectSlug = options.projectSlug || uniqueProjectSlug(options.projectName || 'CSV Import');
  const projectName = options.projectName || 'CSV Import';
  
  const projectId = db.prepare(`
    INSERT INTO projects (owner_id, slug, name, description)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(options.ownerId, projectSlug, projectName, 'Imported from CSV content') as { id: number };
  
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
    failedCount
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
  // Extract main content from HTML
  const doc = new JSDOM(html);
  const document = doc.window.document;
  
  // Remove scripts and styles
  document.querySelectorAll('script, style').forEach(el => el.remove());
  
  // Convert to markdown-like format
  let markdown = '';
  
  // Extract title
  const title = document.querySelector('title')?.textContent || 'Imported Content';
  markdown += `# ${title}\n\n`;
  
  // Process paragraphs
  const paragraphs = document.querySelectorAll('p');
  for (const p of paragraphs) {
    markdown += `${p.textContent}\n\n`;
  }
  
  // Process headings
  for (let i = 1; i <= 6; i++) {
    const headings = document.querySelectorAll(`h${i}`);
    for (const h of headings) {
      const level = '#'.repeat(i);
      markdown += `${level} ${h.textContent}\n\n`;
    }
  }
  
  return markdown.trim();
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
        content: page.content || ''
      });
    }
  }
  
  return pages;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .trim()
    .substring(0, 50);
}

// Main unified import function
export async function importContent(options: ImportOptions & {
  type?: 'auto' | 'gitbook' | 'markdown' | 'html' | 'csv';
  url?: string;
  content?: string;
  projectName?: string;
}): Promise<ImportResult> {
  const { type, url, content, projectName, ownerId } = options;
  
  if (!content && !url) {
    throw createError({ statusCode: 400, message: 'Content or URL is required for import' });
  }
  
  // Determine format
  let format: 'gitbook' | 'markdown' | 'html' | 'csv' = 'auto';
  
  if (type && type !== 'auto') {
    format = type;
  } else if (content) {
    format = detectFormat(content, url);
  } else {
    format = detectFormat('', url);
  }
  
  // Route to appropriate handler
  switch (format) {
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
    
    default:
      throw createError({ statusCode: 400, message: `Unsupported format: ${format}` });
  }
}

// Helper to generate unique project slugs
function uniqueProjectSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .trim()
    .substring(0, 50);
  
  const db = useDb();
  const count = db.prepare(`SELECT COUNT(*) as count FROM projects WHERE slug LIKE ?`)
    .get(`${slug}%`) as { count: number };
  
  if (count.count === 0) {
    return slug;
  }
  
  return `${slug}-${Date.now().toString(36)}`;
}
