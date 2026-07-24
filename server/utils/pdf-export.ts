// PDF Export Utility for KnowledgeBook
// Uses Puppeteer for HTML to PDF conversion

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { useRuntimeConfig } from '#imports';

export interface PdfExportOptions {
  projectSlug: string;
  theme?: string;
  includeToc?: boolean;
  headers?: PdfPageHeaders;
  footer?: PdfPageFooter;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  margin?: PdfMargins;
}

export interface PdfPageHeaders {
  left?: string;
  center?: string;
  right?: string;
}

export interface PdfPageFooter {
  left?: string;
  center?: string;
  right?: string;
  pageNum?: boolean;
}

export interface PdfMargins {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

export interface PdfExportResult {
  pdfPath: string;
  fileName: string;
  pageCount: number;
  fileSize: number;
}

const DEFAULT_PAPER_SIZE = 'A4';
const DEFAULT_MARGIN = '1cm';

/**
 * Get the print CSS theme based on theme name
 */
function getPrintTheme(theme?: string): string {
  const themes: Record<string, string> = {
    default: resolve(import.meta.dir, '../styles/print-default.css'),
    minimal: resolve(import.meta.dir, '../styles/print-minimal.css'),
    professional: resolve(import.meta.dir, '../styles/print-professional.css'),
    academic: resolve(import.meta.dir, '../styles/print-academic.css'),
  };

  const themePath = theme ? themes[theme] : themes.default;
  try {
    return readFileSync(themePath, 'utf8');
  } catch {
    // Fallback to default if theme not found
    return readFileSync(themes.default, 'utf8');
  }
}

/**
 * Generate HTML for table of contents
 */
function generateToc(sections: any[]): string {
  const tocItems = sections
    .flatMap(section => [
      { title: section.title, level: 1, pages: section.pages || [] },
      ...(section.pages || []).map((page: any) => ({
        title: page.title,
        level: 2,
        slug: page.slug,
      })),
    ])
    .map(
      (item, index) =>
        `<li class="toc-item toc-level-${item.level}" data-level="${item.level}">
          <a href="#page-${index + 1}">${escapeHtml(item.title)}</a>
        </li>`,
    )
    .join('');

  return `
    <div class="print-toc">
      <h1 class="toc-title">Table of Contents</h1>
      <ul class="toc-list">
        ${tocItems}
      </ul>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS in generated content
 */
function escapeHtml(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate HTML with all project content for PDF export
 */
export async function generateHtmlForPdf(project: any, sections: any[]): Promise<string> {
  const themeStyle = getPrintTheme(project.theme);
  
  // Get all pages content
  const pagesHtml = sections
    .flatMap(section =>
      (section.pages || []).map(page => ({
        ...page,
        section: section.title,
      })),
    )
    .map(
      (page, index) => `
      <section class="pdf-page" id="page-${index + 1}" data-page-number="${index + 1}">
        <h1 class="page-title">${escapeHtml(page.title)}</h1>
        <div class="page-content">${page.content}</div>
        <div class="page-footer">
          <span class="page-section">${escapeHtml(page.section)}</span>
          <span class="page-slug">${escapeHtml(page.slug)}</span>
        </div>
      </section>
    `,
    )
    .join('');

  // Generate TOC if requested
  const tocHtml = `
    <div class="print-toc" id="table-of-contents">
      <h1 class="toc-title">Table of Contents</h1>
      <ol class="toc-list">
        ${sections
          .map(
            (section, sIndex) => `
          <li class="toc-section">
            <a href="#section-${sIndex}">${escapeHtml(section.title)}</a>
            <ol>
              ${(section.pages || [])
                .map(
                  (page: any, pIndex: number) => `
                <li class="toc-page">
                  <a href="#page-${pagesHtml.indexOf(
                    pagesHtml.find((p: any) => p.includes(`id="page-${sIndex + 1}`),
                  )!,
                  )}">${escapeHtml(page.title)}</a>
                </li>
              `,
                )
                .join('')}
            </ol>
          </li>
        `,
          )
          .join('')}
      </ol>
    </div>
  `;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(project.name)} - Documentation</title>
      <style>
        ${themeStyle}
        /* Default print styles */
        @media print {
          @page {
            size: ${DEFAULT_PAPER_SIZE};
            margin: ${DEFAULT_MARGIN};
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      </style>
    </head>
    <body>
      <article class="pdf-document" data-project="${escapeHtml(project.slug)}">
        <header class="document-header">
          <h1 class="document-title">${escapeHtml(project.name)}</h1>
          ${project.description ? `<p class="document-description">${escapeHtml(project.description)}</p>` : ''}
        </header>
        
        ${tocHtml}
        
        <main class="document-content">
          ${pagesHtml}
        </main>
        
        <footer class="document-footer">
          <p class="document-meta">
            Generated on ${new Date().toLocaleDateString()} |
            ${escapeHtml(project.slug)}
          </p>
        </footer>
      </article>
    </body>
    </html>
  `;

  return html;
}

/**
 * Main PDF export function
 */
export async function exportToPdf(
  project: any,
  sections: any[],
  options: PdfExportOptions = {},
): Promise<PdfExportResult> {
  const {
    theme = 'default',
    includeToc = true,
    headers = {},
    footer = {},
    pageSize = DEFAULT_PAPER_SIZE,
    margin = DEFAULT_MARGIN,
  } = options;

  // Generate HTML content
  const html = await generateHtmlForPdf(project, sections);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    
    // Set page size and margins
    await page.setViewport({ width: 800, height: 1000 });
    
    // Set PDF settings
    const pdfSettings: puppeteer.PDFOptions = {
      path: '',
      printBackground: true,
      scale: 1,
      format: pageSize as any,
      margin: {
        top: margin,
        bottom: margin,
        left: margin,
        right: margin,
      },
      headerTemplate: headers.center
        ? `<div style="width: 100%; text-align: center; font-size: 10px;">${escapeHtml(
            headers.center,
          )}</div>`
        : undefined,
      footerTemplate: footer.pageNum
        ? `
        <div style="width: 100%; text-align: center; font-size: 10px; margin-top: 10px;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `
        : footer.center
          ? `<div style="width: 100%; text-align: center; font-size: 10px;">${escapeHtml(
              footer.center,
            )}</div>`
          : undefined,
    };

    // Set content
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    const pdfBuffer = await page.pdf(pdfSettings);

    // Save to file
    const outputDir = resolve(useRuntimeConfig().public.outputDir, 'exports', 'pdf');
    mkdirSync(outputDir, { recursive: true });
    
    const fileName = `${project.slug}-${new Date().toISOString().split('T')[0]}.pdf`;
    const pdfPath = join(outputDir, fileName);
    writeFileSync(pdfPath, pdfBuffer);

    return {
      pdfPath,
      fileName,
      pageCount: 1, // Puppeteer returns single PDF
      fileSize: pdfBuffer.length,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Get list of available export themes
 */
export function getAvailableThemes(): string[] {
  return ['default', 'minimal', 'professional', 'academic'];
}

/**
 * Get theme metadata
 */
export function getThemeInfo(theme: string): { name: string; description: string } {
  const themes: Record<string, { name: string; description: string }> = {
    default: {
      name: 'Default',
      description: 'Balanced layout with headers, TOC, and clean typography',
    },
    minimal: {
      name: 'Minimal',
      description: 'Clean, stripped-down layout for pure content focus',
    },
    professional: {
      name: 'Professional',
      description: 'Corporate style with company branding and advanced formatting',
    },
    academic: {
      name: 'Academic',
      description: 'Scholarly format with citations, references, and formal styling',
    },
  };
  return themes[theme] || themes.default;
}
