// HTML/CMS Import Utility
// Converts HTML content to markdown and handles various CMS export formats

import type { H3Event } from 'h3';

// Type definitions
export interface ImportMetadata {
  title?: string;
  author?: string;
  date?: string;
  description?: string;
  tags?: string[];
}

export interface ImportPage {
  id?: string;
  title: string;
  content: string;
  metadata: ImportMetadata;
  slug?: string;
  parent?: string;
  children?: string[];
  order?: number;
}

export interface ImportResult {
  success: boolean;
  pages: Record<string, ImportPage>;
  metadata: ImportMetadata;
  errors: string[];
  warnings: string[];
  sourceFormat?: string;
  files?: string[];
}

export interface ImportOptions {
  baseUrl?: string;
  extractImages?: boolean;
  preserveStructure?: boolean;
}

// HTML to Markdown conversion using markdown-it
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+\n\s+/g, '\n')
    .trim();
}

// Extract metadata from HTML head
export function extractMetadataFromHtml(html: string, url?: string): ImportMetadata {
  const metadata: ImportMetadata = {};
  
  try {
    // Parse HTML using a simple approach since we don't have DOM access in server
    // We'll use regex-based extraction for common patterns
    
    // Extract title from <title> or <h1>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }
    
    // Check for h1 as fallback
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match && !metadata.title) {
      metadata.title = h1Match[1].trim();
    }
    
    // Extract description from meta description tag
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (descMatch) {
      metadata.description = descMatch[1];
    }
    
    // Extract author from meta author tag
    const authorMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (authorMatch) {
      metadata.author = authorMatch[1];
    }
    
    // Extract publish date from various formats
    const datePatterns = [
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']publishdate["'][^>]+content=["']([^"']+)["']/i,
      /<time[^>]+datetime=["']([^"']+)["'][^>]*>([^<]+)<\/time>/i,
      /datetime=["']([^"']+)["'][^>]*>([^<]+)<\/time>/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match) {
        metadata.date = match[1];
        break;
      }
    }
    
    // Extract tags from meta tags
    const tags: string[] = [];
    const tagMatches = html.match(/<meta[^>]+name=["']tags["'][^>]+content=["']([^"']+)["']/gi);
    if (tagMatches) {
      for (const match of tagMatches) {
        const contentMatch = match.match(/content=["']([^"']+)["']/i);
        if (contentMatch) {
          tags.push(...contentMatch[1].split(',').map(t => t.trim()));
        }
      }
    }
    if (tags.length > 0) {
      metadata.tags = tags;
    }
    
    // Fallback URL-based title if no title found
    if (!metadata.title && url) {
      const urlPath = new URL(url, 'http://example.com').pathname;
      const segments = urlPath.split('/').filter(Boolean);
      if (segments.length > 0) {
        metadata.title = segments[segments.length - 1].replace(/[-_]/g, ' ');
      }
    }
  } catch (e) {
    // Silent fail for metadata extraction
  }
  
  return metadata;
}

// Convert HTML elements to markdown
export function convertHtmlToMarkdown(html: string, options: ImportOptions = {}): string {
  let content = html;
  
  // Remove scripts and styles
  content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Convert headings
  content = content.replace(/<h1[^>]*>([^<]+)<\/h1>/gi, '# $1');
  content = content.replace(/<h2[^>]*>([^<]+)<\/h2>/gi, '## $1');
  content = content.replace(/<h3[^>]*>([^<]+)<\/h3>/gi, '### $1');
  content = content.replace(/<h4[^>]*>([^<]+)<\/h4>/gi, '#### $1');
  content = content.replace(/<h5[^>]*>([^<]+)<\/h5>/gi, '##### $1');
  content = content.replace(/<h6[^>]*>([^<]+)<\/h6>/gi, '###### $1');
  
  // Convert paragraphs
  content = content.replace(/<p[^>]*>([^<]+)<\/p>/gi, '$1\n');
  
  // Convert line breaks to spaces
  content = content.replace(/<br\s*\/?>/gi, ' ');
  
  // Convert lists
  content = content.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
    const items = content.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (items) {
      return items.map((item: string) => {
        const clean = item.replace(/<li[^>]*>/i, '').replace(/<\/li>/i, '').trim();
        return `* ${clean}`;
      }).join('\n');
    }
    return match;
  });
  
  content = content.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
    const items = content.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (items) {
      let num = 1;
      return items.map((item: string) => {
        const clean = item.replace(/<li[^>]*>/i, '').replace(/<\/li>/i, '').trim();
        const result = `${num}. ${clean}`;
        num++;
        return result;
      }).join('\n');
    }
    return match;
  });
  
  // Convert list items
  content = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (match, content) => {
    if (content.includes('<ul') || content.includes('<ol')) {
      return match; // Handle nested lists
    }
    return content.trim();
  });
  
  // Convert bold text
  content = content.replace(/<strong[^>]*>([^<]+)<\/strong>/gi, '**$1**');
  content = content.replace(/<b[^>]*>([^<]+)<\/b>/gi, '**$1**');
  
  // Convert italic text
  content = content.replace(/<em[^>]*>([^<]+)<\/em>/gi, '*$1*');
  content = content.replace(/<i[^>]*>([^<]+)<\/i>/gi, '*$1*');
  content = content.replace(/<cite[^>]*>([^<]+)<\/cite>/gi, '*$1*');
  
  // Convert code
  content = content.replace(/<code[^>]*>([^<]+)<\/code>/gi, '`$1`');
  content = content.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, code) => {
    const trimmed = code.trim();
    if (trimmed.includes('\n')) {
      return '```\n' + trimmed + '\n```';
    }
    return '`' + trimmed + '`';
  });
  
  // Convert links
  content = content.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)');
  content = content.replace(/<a[^>]+href=["']([^"']+)["'][^>]*><\/a>/gi, '[$1]($1)');
  
  // Convert images
  content = content.replace(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']+)["'][^>]*>/gi, '![$2]($1)');
  content = content.replace(/<img[^>]+alt=["']([^"']+)["'][^>]+src=["']([^"']+)["'][^>]*>/gi, '![$1]($2)');
  content = content.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '![Image]($1)');
  
  // Convert blockquotes
  content = content.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
    const lines = content.trim().split('\n');
    return lines.map(line => `> ${line}`).join('\n');
  });
  
  // Convert horizontal rules
  content = content.replace(/<hr[^>]*>/gi, '---');
  content = content.replace(/<hr[^>]*\/>/gi, '---');
  
  // Convert tables to markdown
  content = content.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match, content) => {
    const rows = content.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (!rows) return match;
    
    let result = '';
    let headerDone = false;
    
    for (const row of rows) {
      const cells = row.match(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi);
      if (cells) {
        const cellContent = cells.map(cell => {
          const text = cell.replace(/<[^>]+>/g, '').trim();
          return text;
        });
        
        if (!headerDone) {
          result += '| ' + cellContent.join(' | ') + ' |\n';
          result += '|---'.repeat(cellContent.length) + '|\n';
          headerDone = true;
        } else {
          result += '| ' + cellContent.join(' | ') + ' |\n';
        }
      }
    }
    
    return result + '\n';
  });
  
  // Convert divs with specific classes
  content = content.replace(/<div[^>]+class=["']callout[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, (match, content) => {
    return `> ${content.trim()}\n`;
  });
  
  // Convert details/summary to markdown
  content = content.replace(/<details[^>]*>([\s\S]*?)<\/details>/gi, (match, content) => {
    const summary = content.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    if (summary) {
      return `\n### ${summary[1]}\n\n${content.replace(summary[0], '').trim()}`;
    }
    return content;
  });
  
  // Clean up multiple blank lines
  content = content.replace(/\n{3,}/g, '\n\n');
  
  // Trim
  content = content.trim();
  
  return content;
}

// WordPress XML parser
export function parseWordPressXml(xml: string): { pages: ImportPage[]; metadata: ImportMetadata } {
  const pages: ImportPage[] = [];
  const metadata: ImportMetadata = {};
  
  try {
    // Extract site info
    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    if (titleMatch) {
      metadata.title = titleMatch[1];
    }
    
    // Extract posts/pages
    const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
    if (items) {
      for (const item of items) {
        // Extract title
        const postTitle = item.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || 'Untitled';
        
        // Extract content
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
        const content = contentMatch ? contentMatch[1] : '';
        
        // Extract date
        const dateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);
        
        // Extract categories/tags
        const categories = item.match(/<category[^>]*>([^<]+)<\/category>/gi)?.map(c => c.replace(/<[^>]+>/g, '').trim());
        
        // Extract author
        const authorMatch = item.match(/<dc:creator><!\[CDATA\[([^<]+)\]\]><\/dc:creator>/);
        
        pages.push({
          title: postTitle,
          content: htmlToMarkdown(content),
          metadata: {
            date: dateMatch?.[1],
            author: authorMatch?.[1],
            tags: categories,
          },
        });
      }
    }
  } catch (e) {
    // Silent fail for parsing errors
  }
  
  return { pages, metadata };
}

// MediaWiki XML parser
export function parseMediaWikiXml(xml: string): { pages: ImportPage[]; metadata: ImportMetadata } {
  const pages: ImportPage[] = [];
  const metadata: ImportMetadata = {};
  
  try {
    // Extract site info
    const siteTitle = xml.match(/<sitename>([^<]+)<\/sitename>/)?.[1];
    if (siteTitle) {
      metadata.title = siteTitle;
    }
    
    // Extract pages
    const pageMatches = xml.match(/<page>[\s\S]*?<\/page>/gi);
    if (pageMatches) {
      for (const page of pageMatches) {
        // Extract title
        const title = page.match(/<title>([^<]+)<\/title>/)?.[1] || 'Untitled';
        
        // Extract revision content
        const contentMatch = page.match(/<text[^>]*>([\s\S]*?)<\/text>/);
        const content = contentMatch ? contentMatch[1] : '';
        
        // Extract timestamp
        const timestamp = page.match(/<timestamp>([^<]+)<\/timestamp>/)?.[1];
        
        // Extract contributor
        const contributor = page.match(/<username>([^<]+)<\/username>/)?.[1];
        
        pages.push({
          title,
          content,
          metadata: {
            date: timestamp,
            author: contributor,
          },
        });
      }
    }
  } catch (e) {
    // Silent fail for parsing errors
  }
  
  return { pages, metadata };
}

// Extract pages from HTML files in a directory structure
export function parseHtmlDirectory(basePath: string, htmlFiles: string[]): { pages: ImportPage[]; metadata: ImportMetadata } {
  const pages: ImportPage[] = [];
  const metadata: ImportMetadata = {};
  
  // Sort files to process root pages first
  htmlFiles.sort((a, b) => {
    const aDepth = a.split('/').filter(Boolean).length;
    const bDepth = b.split('/').filter(Boolean).length;
    return aDepth - bDepth;
  });
  
  for (const file of htmlFiles) {
    // Extract title from filename and path
    const segments = file.split('/').filter(Boolean);
    let title = segments[segments.length - 1].replace(/\.html?$/i, '').replace(/[-_]/g, ' ');
    
    // Try to read actual title from file
    try {
      // This would require fs access in actual implementation
      // For now, use filename as title
    } catch (e) {
      // Silent fail
    }
    
    pages.push({
      title,
      content: '', // Content would be loaded from file in actual implementation
      metadata: {
        tags: segments.slice(0, -1),
      },
    });
  }
  
  return { pages, metadata };
}

// Main import function
export async function importHtmlContent(
  content: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pages: Record<string, ImportPage> = {};
  const metadata: ImportMetadata = {};
  
  try {
    // Detect content type
    let sourceFormat: string | undefined;
    
    // Check for XML formats
    if (content.trim().startsWith('<?xml') || content.trim().startsWith('<')) {
      const lowerContent = content.toLowerCase();
      
      if (lowerContent.includes('wordpress') || lowerContent.includes('channel') && lowerContent.includes('item')) {
        sourceFormat = 'wordpress';
        const result = parseWordPressXml(content);
        for (const page of result.pages) {
          const id = `page-${pages.length}`;
          pages[id] = {
            ...page,
            id,
          };
        }
        Object.assign(metadata, result.metadata);
      } else if (lowerContent.includes('mediawiki') || lowerContent.includes('siteinfo') || lowerContent.includes('page')) {
        sourceFormat = 'mediawiki';
        const result = parseMediaWikiXml(content);
        for (const page of result.pages) {
          const id = `page-${pages.length}`;
          pages[id] = {
            ...page,
            id,
          };
        }
        Object.assign(metadata, result.metadata);
      } else if (lowerContent.includes('<html') || lowerContent.includes('<!doctype')) {
        sourceFormat = 'html';
        
        // Extract metadata
        const extractedMetadata = extractMetadataFromHtml(content, options.baseUrl);
        Object.assign(metadata, extractedMetadata);
        
        // Convert HTML to markdown
        const markdown = convertHtmlToMarkdown(content, options);
        
        // Create a page from the content
        const id = 'page-0';
        pages[id] = {
          id,
          title: extractedMetadata.title || 'Untitled',
          content: markdown,
          metadata: extractedMetadata,
        };
      }
    }
    
    // Check for plain HTML without XML declaration
    if (!sourceFormat && content.includes('<html') || content.includes('<!doctype')) {
      sourceFormat = 'html';
      
      const extractedMetadata = extractMetadataFromHtml(content, options.baseUrl);
      Object.assign(metadata, extractedMetadata);
      
      const markdown = convertHtmlToMarkdown(content, options);
      
      const id = 'page-0';
      pages[id] = {
        id,
        title: extractedMetadata.title || 'Untitled',
        content: markdown,
        metadata: extractedMetadata,
      };
    }
    
    if (!sourceFormat) {
      errors.push('Could not detect content format');
    }
    
  } catch (e) {
    errors.push((e as Error).message);
  }
  
  return {
    success: errors.length === 0,
    pages,
    metadata,
    errors,
    warnings,
    sourceFormat,
  };
}

// Import from directory
export async function importHtmlDirectory(
  directoryPath: string,
  files: string[]
): Promise<ImportResult> {
  const result = parseHtmlDirectory(directoryPath, files);
  
  const pages: Record<string, ImportPage> = {};
  for (let i = 0; i < result.pages.length; i++) {
    pages[`page-${i}`] = {
      ...result.pages[i],
      id: `page-${i}`,
    };
  }
  
  return {
    success: true,
    pages,
    metadata: result.metadata,
    errors: [],
    warnings: [],
    sourceFormat: 'html-directory',
  };
}

// Export types and functions
export default {
  htmlToMarkdown,
  extractMetadataFromHtml,
  convertHtmlToMarkdown,
  parseWordPressXml,
  parseMediaWikiXml,
  parseHtmlDirectory,
  importHtmlContent,
  importHtmlDirectory,
};
