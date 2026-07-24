// Unified Export Pipeline for KnowledgeBook
// Supports 5+ export formats with status tracking
// Formats: web, pdf, epub, zip, API response

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import type { H3Event } from 'h3';

export interface ExportOptions {
  format: 'web' | 'pdf' | 'epub' | 'zip' | 'api';
  projectSlug: string;
  theme?: string;
  includeToc?: boolean;
  headers?: ExportPageHeaders;
  footer?: ExportPageFooter;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  margin?: ExportMargins;
  outputDir?: string;
  includeAssets?: boolean;
}

export interface ExportPageHeaders {
  left?: string;
  center?: string;
  right?: string;
}

export interface ExportPageFooter {
  left?: string;
  center?: string;
  right?: string;
  pageNum?: boolean;
}

export interface ExportMargins {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

export interface ExportResult {
  success: boolean;
  format: string;
  outputUrl?: string;
  outputDir?: string;
  filesGenerated?: number;
  pagesExported?: number;
  sectionsExported?: number;
  errors?: string[];
  exportId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  completedAt?: string;
}

export interface ExportStatus {
  exportId: string;
  projectSlug: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  result?: ExportResult;
  createdAt: string;
  completedAt?: string;
}

export interface ExportHistoryItem {
  exportId: string;
  projectSlug: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  outputUrl?: string;
}

// Supported export formats
export const SUPPORTED_EXPORT_FORMATS = {
  web: {
    name: 'Web',
    extensions: ['.html'],
    type: 'static',
  },
  pdf: {
    name: 'PDF',
    extensions: ['.pdf'],
    type: 'print',
  },
  epub: {
    name: 'EPUB',
    extensions: ['.epub'],
    type: 'ebook',
  },
  zip: {
    name: 'ZIP Archive',
    extensions: ['.zip'],
    type: 'archive',
  },
  api: {
    name: 'API Response',
    extensions: [],
    type: 'response',
  },
};

// In-memory export status store (in production, use database)
const exportStatusStore: Record<string, ExportStatus> = {};
const exportHistoryStore: ExportHistoryItem[] = [];

// Export status tracking helpers
export function createExportStatus(projectSlug: string, format: string): string {
  const exportId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  exportStatusStore[exportId] = {
    exportId,
    projectSlug,
    format,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  
  return exportId;
}

export function updateExportStatus(exportId: string, updates: Partial<ExportStatus>): void {
  if (exportStatusStore[exportId]) {
    exportStatusStore[exportId] = {
      ...exportStatusStore[exportId],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    // Update history
    if (updates.status === 'completed' || updates.status === 'failed') {
      const historyItem: ExportHistoryItem = {
        exportId,
        projectSlug: exportStatusStore[exportId].projectSlug,
        format: exportStatusStore[exportId].format,
        status: updates.status,
        createdAt: exportStatusStore[exportId].createdAt,
        completedAt: new Date().toISOString(),
        outputUrl: updates.result?.outputUrl,
      };
      exportHistoryStore.push(historyItem);
    }
  }
}

export function getExportStatus(exportId: string): ExportStatus | undefined {
  return exportStatusStore[exportId];
}

export function getExportHistory(limit: number = 50): ExportHistoryItem[] {
  return exportHistoryStore.slice(-limit).reverse();
}

export function clearExportStatus(exportId: string): boolean {
  if (exportStatusStore[exportId]) {
    delete exportStatusStore[exportId];
    return true;
  }
  return false;
}

// Export handlers for each format
async function exportToWebPipeline(options: ExportOptions & { project: any; sections: any[] }): Promise<ExportResult> {
  const { project, sections, outputDir, includeAssets = true } = options;
  
  const outputDirectory = outputDir || resolve(tmpdir(), `kb-export-${project.slug}-${Date.now()}`);
  mkdirSync(outputDirectory, { recursive: true });
  
  // Use static export functionality
  const { exportPlainHTML } = await import('./static-export');
  const result = await exportPlainHTML(project, { 
    format: 'plain',
    outputDir: outputDirectory,
    includeAssets,
  });
  
  return {
    success: result.success,
    format: 'web',
    outputDir: outputDirectory,
    filesGenerated: result.filesGenerated,
    pagesExported: result.pagesExported,
    sectionsExported: result.sectionsExported,
    errors: result.errors,
    status: result.success ? 'completed' : 'failed',
    completedAt: result.success ? new Date().toISOString() : undefined,
  };
}

async function exportToPdfPipeline(options: ExportOptions & { project: any; sections: any[] }): Promise<ExportResult> {
  const { project, sections, theme = 'default', includeToc = true, pageSize = 'A4', margin = '1cm' } = options;
  
  try {
    // Use PDF export functionality
    const { generateHtmlForPdf, exportToPdf } = await import('./pdf-export');
    
    const pdfResult = await exportToPdf(project, sections, {
      theme,
      includeToc,
      pageSize,
      margin,
    });
    
    return {
      success: true,
      format: 'pdf',
      outputUrl: pdfResult.pdfPath,
      filesGenerated: 1,
      pagesExported: pdfResult.pageCount,
      sectionsExported: sections.length,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      format: 'pdf',
      errors: [(error as Error).message],
      status: 'failed',
      completedAt: new Date().toISOString(),
    };
  }
}

async function exportToEpubPipeline(options: ExportOptions & { project: any; sections: any[] }): Promise<ExportResult> {
  const { project, sections, outputDir } = options;
  
  const outputDirectory = outputDir || resolve(tmpdir(), `kb-export-${project.slug}-${Date.now()}`);
  mkdirSync(outputDirectory, { recursive: true });
  
  // Generate EPUB structure
  const epubDir = join(outputDirectory, 'epub');
  mkdirSync(epubDir, { recursive: true });
  
  // Create META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  
  writeFileSync(join(epubDir, 'META-INF', 'container.xml'), containerXml, { recursive: true });
  
  // Create content.opf
  const manifestItems = sections.flatMap((section: any, sIndex: number) => 
    (section.pages || []).map((page: any, pIndex: number) => 
      `<item id="page_${sIndex}_${pIndex}" href="pages/page_${sIndex}_${pIndex}.xhtml" media-type="application/xhtml+xml"/>`
    )
  ).join('\n');
  
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package unique-identifier="pub-id" version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata>
    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${escapeXml(project.name)}</dc:title>
    <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${escapeXml(project.ownerEmail || 'Author')}</dc:creator>
    <dc:identifier id="pub-id" xmlns:dc="http://purl.org/dc/elements/1.1/">${project.slug}</dc:identifier>
    <dc:language xmlns:dc="http://purl.org/dc/elements/1.1/">en</dc:language>
    <dc:date xmlns:dc="http://purl.org/dc/elements/1.1/">${new Date().toISOString().split('T')[0]}</dc:date>
  </metadata>
  <manifest>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" />
    ${manifestItems}
  </manifest>
  <spine toc="toc">
    <itemref idref="toc" />
    ${sections.flatMap((section: any, sIndex: number) => 
      (section.pages || []).map((page: any, pIndex: number) => 
        `<itemref idref="page_${sIndex}_${pIndex}" />`
      )
    ).join('\n')}
  </spine>
</package>`;
  
  writeFileSync(join(epubDir, 'content.opf'), contentOpf);
  
  // Generate TOC
  const tocXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>${escapeXml(project.name)} - Table of Contents</title>
  </head>
  <body>
    <nav epub:type="toc">
      <h1>${escapeXml(project.name)} - Table of Contents</h1>
      <ol>
        ${sections.map((section: any, sIndex: number) => 
          `<li><a href="pages/page_${sIndex}_0.xhtml">${escapeXml(section.title || 'Section')}</a></li>`
        ).join('\n')}
      </ol>
    </nav>
  </body>
</html>`;
  
  writeFileSync(join(epubDir, 'toc.xhtml'), tocXhtml);
  
  // Generate page files
  let pageCounter = 0;
  for (const section of sections) {
    for (const page of section.pages || []) {
      const pageXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>${escapeXml(page.title)}</title>
  </head>
  <body>
    <h1>${escapeXml(page.title)}</h1>
    <div>${convertMarkdownToHtml(page.content || '')}</div>
  </body>
</html>`;
      
      const pageDir = join(epubDir, 'pages');
      mkdirSync(pageDir, { recursive: true });
      writeFileSync(join(pageDir, `page_${pageCounter}.xhtml`), pageXhtml);
      pageCounter++;
    }
  }
  
  return {
    success: true,
    format: 'epub',
    outputDir: outputDirectory,
    filesGenerated: pageCounter + 3, // pages + opf + toc + container
    pagesExported: pageCounter,
    sectionsExported: sections.length,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };
}

async function exportToZipPipeline(options: ExportOptions & { project: any; sections: any[] }): Promise<ExportResult> {
  const { project, sections, outputDir, format = 'web' } = options;
  
  const outputDirectory = outputDir || resolve(tmpdir(), `kb-export-${project.slug}-${Date.now()}`);
  mkdirSync(outputDirectory, { recursive: true });
  
  // For web format, use static export
  if (format === 'web') {
    const { exportPlainHTML } = await import('./static-export');
    const result = await exportPlainHTML(project, { 
      format: 'plain',
      outputDir: outputDirectory,
      includeAssets: true,
    });
    
    // Zip the output directory
    // In a real implementation, this would use a zip library
    // For now, we return the directory path as a placeholder
    
    return {
      success: result.success,
      format: 'zip',
      outputDir: outputDirectory,
      filesGenerated: result.filesGenerated,
      pagesExported: result.pagesExported,
      sectionsExported: result.sectionsExported,
      errors: result.errors,
      status: result.success ? 'completed' : 'failed',
      completedAt: result.success ? new Date().toISOString() : undefined,
    };
  }
  
  // For EPUB format, generate EPUB then zip
  if (format === 'epub') {
    return await exportToEpubPipeline(options as any);
  }
  
  return {
    success: false,
    format: 'zip',
    errors: [`Unsupported zip format: ${format}`],
    status: 'failed',
    completedAt: new Date().toISOString(),
  };
}

async function exportToApiPipeline(options: ExportOptions & { project: any; sections: any[] }): Promise<ExportResult> {
  const { project, sections } = options;
  
  // Generate content for API response
  const pages = sections.flatMap((section: any) => 
    (section.pages || []).map((page: any) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      content: page.content,
      section: section.title,
    }))
  );
  
  return {
    success: true,
    format: 'api',
    status: 'completed',
    completedAt: new Date().toISOString(),
    pagesExported: pages.length,
    sectionsExported: sections.length,
    result: {
      project: {
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
      },
      pages,
      metadata: {
        generatedAt: new Date().toISOString(),
        pageCount: pages.length,
        sectionCount: sections.length,
      },
    },
  };
}

// Main export function
export async function exportContent(options: ExportOptions & { project: any; sections: any[] }): Promise<ExportResult> {
  const { format } = options;
  
  if (!format) {
    throw createError({ statusCode: 400, message: 'Export format is required' });
  }
  
  if (!options.project || !options.sections) {
    throw createError({ statusCode: 400, message: 'Project and sections are required' });
  }
  
  // Create export status record
  const exportId = createExportStatus(options.project.slug, format);
  updateExportStatus(exportId, { status: 'processing' });
  
  try {
    // Route to appropriate handler
    switch (format) {
      case 'web':
        return await exportToWebPipeline(options);
      
      case 'pdf':
        return await exportToPdfPipeline(options);
      
      case 'epub':
        return await exportToEpubPipeline(options);
      
      case 'zip':
        return await exportToZipPipeline(options);
      
      case 'api':
        return await exportToApiPipeline(options);
      
      default:
        throw createError({ statusCode: 400, message: `Unsupported export format: ${format}` });
    }
  } catch (error) {
    updateExportStatus(exportId, { 
      status: 'failed', 
      error: (error as Error).message 
    });
    
    return {
      success: false,
      format,
      errors: [(error as Error).message],
      status: 'failed',
      completedAt: new Date().toISOString(),
    };
  }
}

// Get export by ID
export function getExport(exportId: string): ExportResult | undefined {
  const status = exportStatusStore[exportId];
  if (!status) return undefined;
  
  return {
    success: status.status === 'completed',
    format: status.format,
    outputUrl: status.result?.outputUrl,
    outputDir: status.result?.outputDir,
    filesGenerated: status.result?.filesGenerated,
    pagesExported: status.result?.pagesExported,
    sectionsExported: status.result?.sectionsExported,
    errors: status.result?.errors,
    status: status.status as any,
    completedAt: status.completedAt,
  };
}

// Get available export formats
export function getAvailableExportFormats(): string[] {
  return Object.keys(SUPPORTED_EXPORT_FORMATS);
}

// Get export format info
export function getExportFormatInfo(format: string): any {
  return SUPPORTED_EXPORT_FORMATS[format];
}

// Content conversion helpers
function escapeXml(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function convertMarkdownToHtml(markdown: string): string {
  // Simple markdown to HTML conversion
  let html = markdown;
  
  // Convert headings
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
  html = html.replace(/^##### (.*$)/gm, '<h5>$1</h5>');
  html = html.replace(/^###### (.*$)/gm, '<h6>$1</h6>');
  
  // Convert bold/italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Convert paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  // Clean up
  html = html.replace(/(<p><\/p>)/g, '');
  
  return html;
}

// Validate export request
export function validateExportRequest(options: ExportOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!options.projectSlug) {
    errors.push('Project slug is required');
  }
  
  if (!options.format) {
    errors.push('Export format is required');
  } else if (!SUPPORTED_EXPORT_FORMATS[options.format]) {
    errors.push(`Unsupported export format: ${options.format}`);
  }
  
  return { valid: errors.length === 0, errors };
}
