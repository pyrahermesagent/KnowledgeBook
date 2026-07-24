// Preview Pipeline for KnowledgeBook
// Supports live preview with theme switching and multi-format rendering
// Formats: web preview, PDF preview, EPUB preview

import type { H3Event } from 'h3';

export interface PreviewOptions {
  projectSlug: string;
  theme?: string;
  format?: 'web' | 'pdf' | 'epub';
  live?: boolean;
  themeList?: string[];
}

export interface PreviewTheme {
  name: string;
  label: string;
  colors: {
    background: string;
    text: string;
    accent: string;
    border: string;
  };
  typography: {
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
  };
}

export interface PreviewResult {
  success: boolean;
  previewUrl?: string;
  previewContent?: string;
  themes?: PreviewTheme[];
  currentTheme?: PreviewTheme;
  format: string;
  status: 'ready' | 'processing' | 'completed' | 'failed';
  errors?: string[];
}

// Available themes for preview
export const AVAILABLE_THEMES: Record<string, PreviewTheme> = {
  default: {
    name: 'default',
    label: 'Default',
    colors: {
      background: '#ffffff',
      text: '#1f2430',
      accent: '#346ddb',
      border: '#e5e8ec',
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '16px',
      lineHeight: '1.6',
    },
  },
  light: {
    name: 'light',
    label: 'Light',
    colors: {
      background: '#fafafa',
      text: '#333333',
      accent: '#346ddb',
      border: '#dddddd',
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '16px',
      lineHeight: '1.6',
    },
  },
  dark: {
    name: 'dark',
    label: 'Dark',
    colors: {
      background: '#1a1b26',
      text: '#d4d4d8',
      accent: '#5f7a9d',
      border: '#444b59',
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '16px',
      lineHeight: '1.6',
    },
  },
  minimal: {
    name: 'minimal',
    label: 'Minimal',
    colors: {
      background: '#ffffff',
      text: '#374151',
      accent: '#6b7280',
      border: '#e5e7eb',
    },
    typography: {
      fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
      fontSize: '18px',
      lineHeight: '1.8',
    },
  },
  academic: {
    name: 'academic',
    label: 'Academic',
    colors: {
      background: '#fbf8ef',
      text: '#2c2c2c',
      accent: '#8c1b3a',
      border: '#ccc',
    },
    typography: {
      fontFamily: 'Times New Roman, Times, serif',
      fontSize: '12pt',
      lineHeight: '1.5',
    },
  },
  professional: {
    name: 'professional',
    label: 'Professional',
    colors: {
      background: '#f5f5f5',
      text: '#333333',
      accent: '#003366',
      border: '#cccccc',
    },
    typography: {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '14px',
      lineHeight: '1.5',
    },
  },
  read: {
    name: 'read',
    label: 'Read',
    colors: {
      background: '#fffef8',
      text: '#444444',
      accent: '#d63384',
      border: '#e0e0e0',
    },
    typography: {
      fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
      fontSize: '17px',
      lineHeight: '1.7',
    },
  },
  ink: {
    name: 'ink',
    label: 'Ink',
    colors: {
      background: '#f0f0f0',
      text: '#000000',
      accent: '#333333',
      border: '#666666',
    },
    typography: {
      fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
      fontSize: '16px',
      lineHeight: '1.6',
    },
  },
};

// Preview format handlers
async function previewWebPipeline(options: PreviewOptions & { project: any; sections: any[] }): Promise<PreviewResult> {
  const { project, sections, theme = 'default' } = options;
  
  const selectedTheme = AVAILABLE_THEMES[theme] || AVAILABLE_THEMES['default'];
  
  // Generate HTML preview content
  const pagesHtml = sections.flatMap((section: any) =>
    (section.pages || []).map((page: any) => ({
      title: page.title,
      content: page.content,
      section: section.title,
    }))
  );
  
  // Generate HTML with embedded styles
  const htmlContent = generatePreviewHtml(project, pagesHtml, selectedTheme);
  
  return {
    success: true,
    previewContent: htmlContent,
    themes: Object.values(AVAILABLE_THEMES),
    currentTheme: selectedTheme,
    format: 'web',
    status: 'completed',
  };
}

async function previewPdfPipeline(options: PreviewOptions & { project: any; sections: any[] }): Promise<PreviewResult> {
  const { project, sections, theme = 'default' } = options;
  
  try {
    // Use existing PDF export functionality
    const { generateHtmlForPdf } = await import('./pdf-export');
    
    const html = await generateHtmlForPdf(project, sections);
    
    return {
      success: true,
      previewContent: html,
      themes: Object.values(AVAILABLE_THEMES),
      currentTheme: AVAILABLE_THEMES[theme],
      format: 'pdf',
      status: 'completed',
    };
  } catch (error) {
    return {
      success: false,
      format: 'pdf',
      errors: [(error as Error).message],
      status: 'failed',
    };
  }
}

async function previewEpubPipeline(options: PreviewOptions & { project: any; sections: any[] }): Promise<PreviewResult> {
  const { project, sections, theme = 'default' } = options;
  
  // Generate EPUB content for preview
  const pages = sections.flatMap((section: any) =>
    (section.pages || []).map((page: any) => ({
      title: page.title,
      content: page.content,
      section: section.title,
    }))
  );
  
  // Generate simple HTML preview of EPUB content
  const htmlContent = generateEpubPreviewHtml(project, pages, AVAILABLE_THEMES[theme] || AVAILABLE_THEMES['default']);
  
  return {
    success: true,
    previewContent: htmlContent,
    themes: Object.values(AVAILABLE_THEMES),
    currentTheme: AVAILABLE_THEMES[theme],
    format: 'epub',
    status: 'completed',
  };
}

// Main preview function
export async function previewContent(options: PreviewOptions & { project: any; sections: any[] }): Promise<PreviewResult> {
  const { format = 'web', project, sections } = options;
  
  if (!project) {
    throw createError({ statusCode: 400, message: 'Project is required for preview' });
  }
  
  if (!sections) {
    throw createError({ statusCode: 400, message: 'Sections are required for preview' });
  }
  
  try {
    // Route to appropriate handler
    switch (format) {
      case 'web':
        return await previewWebPipeline(options);
      
      case 'pdf':
        return await previewPdfPipeline(options);
      
      case 'epub':
        return await previewEpubPipeline(options);
      
      default:
        throw createError({ statusCode: 400, message: `Unsupported preview format: ${format}` });
    }
  } catch (error) {
    return {
      success: false,
      format,
      errors: [(error as Error).message],
      status: 'failed',
    };
  }
}

// Get available themes
export function getAvailableThemes(): PreviewTheme[] {
  return Object.values(AVAILABLE_THEMES);
}

// Get theme by name
export function getTheme(name: string): PreviewTheme | undefined {
  return AVAILABLE_THEMES[name];
}

// Generate preview HTML with embedded styles
function generatePreviewHtml(project: any, pages: any[], theme: PreviewTheme): string {
  const { name, label, colors, typography } = theme;
  
  // Generate theme CSS
  const themeStyles = `
    :root {
      --preview-bg: ${colors.background};
      --preview-text: ${colors.text};
      --preview-accent: ${colors.accent};
      --preview-border: ${colors.border};
    }
    
    body {
      font-family: ${typography.fontFamily};
      font-size: ${typography.fontSize};
      line-height: ${typography.lineHeight};
      background: var(--preview-bg);
      color: var(--preview-text);
      margin: 0;
      padding: 20px;
    }
    
    .theme-preview-container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    .theme-header {
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--preview-border);
    }
    
    .theme-header h1 {
      margin: 0;
      color: var(--preview-accent);
    }
    
    .theme-section {
      margin-bottom: 48px;
    }
    
    .theme-section h2 {
      color: var(--preview-accent);
      margin-bottom: 16px;
    }
    
    .theme-page {
      margin-bottom: 24px;
    }
    
    .theme-page h3 {
      color: var(--preview-text);
      margin-bottom: 8px;
    }
    
    .theme-page p {
      margin: 8px 0;
    }
    
    .theme-theme-selector {
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .theme-theme-selector select {
      padding: 8px 12px;
      border: 1px solid var(--preview-border);
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
    }
    
    .theme-theme-selector option {
      background: var(--preview-bg);
      color: var(--preview-text);
    }
    
    .theme-theme-selector label {
      font-size: 12px;
      margin-right: 8px;
    }
  `;
  
  // Generate pages HTML
  const pagesHtml = pages.map((page: any) => `
    <div class="theme-page">
      <h3>${escapeHtml(page.title)}</h3>
      <div class="theme-content">${convertMarkdownToHtml(page.content)}</div>
    </div>
  `).join('\n');
  
  // Generate theme selector
  const themeSelector = `
    <div class="theme-theme-selector">
      <label for="theme-select">Theme:</label>
      <select id="theme-select" onchange="changeTheme(this.value)">
        ${Object.values(AVAILABLE_THEMES).map(t => 
          `<option value="${t.name}" ${name === t.name ? 'selected' : ''}>${t.label}</option>`
        ).join('\n')}
      </select>
    </div>
  `;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(project.name)} - Preview</title>
      <style>${themeStyles}</style>
    </head>
    <body>
      ${themeSelector}
      
      <div class="theme-preview-container">
        <div class="theme-header">
          <h1>${escapeHtml(project.name)}</h1>
          ${project.description ? `<p>${escapeHtml(project.description)}</p>` : ''}
        </div>
        
        ${pagesHtml}
      </div>
      
      <script>
        function changeTheme(themeName) {
          const theme = themes[themeName];
          if (!theme) return;
          
          document.documentElement.style.setProperty('--preview-bg', theme.colors.background);
          document.documentElement.style.setProperty('--preview-text', theme.colors.text);
          document.documentElement.style.setProperty('--preview-accent', theme.colors.accent);
          document.documentElement.style.setProperty('--preview-border', theme.colors.border);
          
          document.body.style.fontFamily = theme.typography.fontFamily;
          document.body.style.fontSize = theme.typography.fontSize;
          document.body.style.lineHeight = theme.typography.lineHeight;
        }
        
        const themes = ${JSON.stringify(AVAILABLE_THEMES, null, 2)};
      </script>
    </body>
    </html>
  `;
}

// Generate EPUB preview HTML
function generateEpubPreviewHtml(project: any, pages: any[], theme: PreviewTheme): string {
  const { colors, typography } = theme;
  
  const themeStyles = `
    body {
      font-family: ${typography.fontFamily};
      font-size: ${typography.fontSize};
      line-height: ${typography.lineHeight};
      background: ${colors.background};
      color: ${colors.text};
      padding: 20px;
    }
    
    h1 { color: ${colors.accent}; }
    
    .epub-page {
      margin-bottom: 32px;
      padding: 16px;
      border: 1px solid ${colors.border};
      border-radius: 4px;
    }
    
    .epub-page h2 {
      color: ${colors.accent};
      margin-top: 0;
    }
    
    .epub-page p {
      margin: 8px 0;
    }
  `;
  
  const pagesHtml = pages.map((page: any) => `
    <div class="epub-page">
      <h2>${escapeHtml(page.title)}</h2>
      <div class="epub-content">${convertMarkdownToHtml(page.content)}</div>
    </div>
  `).join('\n');
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(project.name)} - EPUB Preview</title>
      <style>${themeStyles}</style>
    </head>
    <body>
      <h1>${escapeHtml(project.name)}</h1>
      ${project.description ? `<p>${escapeHtml(project.description)}</p>` : ''}
      
      ${pagesHtml}
    </body>
    </html>
  `;
}

// Content conversion helpers
function escapeHtml(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// Live preview with change detection
export interface LivePreviewState {
  lastModified: string;
  contentHash: string;
  project: any;
  sections: any[];
}

let livePreviewState: LivePreviewState | null = null;

export function setLivePreviewState(state: LivePreviewState): void {
  livePreviewState = state;
}

export function getLivePreviewState(): LivePreviewState | null {
  return livePreviewState;
}

export async function refreshLivePreview(options: PreviewOptions): Promise<PreviewResult> {
  if (!livePreviewState) {
    throw createError({ statusCode: 400, message: 'No live preview state available' });
  }
  
  // Simulate live update
  return await previewContent({
    ...options,
    project: livePreviewState.project,
    sections: livePreviewState.sections,
  });
}

// Validate preview request
export function validatePreviewRequest(options: PreviewOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!options.projectSlug) {
    errors.push('Project slug is required');
  }
  
  if (options.format && !['web', 'pdf', 'epub'].includes(options.format)) {
    errors.push(`Unsupported preview format: ${options.format}`);
  }
  
  return { valid: errors.length === 0, errors };
}
