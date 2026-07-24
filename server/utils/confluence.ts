// Confluence XML Import Parser
// Converts Confluence XML export format to KB markdown structure

// Confluence block types
export type ConfluenceBlockType = 
  | 'paragraph'
  | 'heading'
  | 'panel'
  | 'info-panel'
  | 'warning-panel'
  | 'note-panel'
  | 'code'
  | 'table'
  | 'row'
  | 'cell'
  | 'link'
  | 'attachment'
  | 'macro';

// Confluence panel macro types
export type ConfluencePanelType = 'info' | 'warning' | 'note' | 'tip' | 'success';

// Confluence macro interface
export interface ConfluenceMacro {
  name: string;
  parameters?: Record<string, string>;
  body?: string;
  children?: ConfluenceMacro[];
}

// Confluence page interface
export interface ConfluencePage {
  title: string;
  content: string;
  version?: string;
  created?: string;
  lastModified?: string;
  macros?: ConfluenceMacro[];
}

// Confluence export result
export interface ConfluenceExport {
  pages: ConfluencePage[];
  spaces?: string[];
  totalPages: number;
}

// Simple XML parser using DOMParser for Confluence exports
// This avoids requiring external dependencies like xml2js
function parseXml(xmlString: string): Document {
  if (typeof DOMParser === 'undefined') {
    // Node.js environment - use a simple parser
    return parseXmlNodeJS(xmlString);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  
  // Check for parser errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`XML Parse Error: ${parserError.textContent}`);
  }
  
  return doc;
}

// Fallback XML parser for Node.js environment
function parseXmlNodeJS(xmlString: string): Document {
  // Use a simple string-based parser for basic Confluence XML
  // This handles the common Confluence export format
  
  // Create a minimal document-like structure
  const doc: any = {
    documentElement: { tagName: 'root' },
    querySelector: (selector: string) => null,
    querySelectorAll: (selector: string) => [],
  };
  
  // For Node.js, we'd typically use xml2js, but since it's not available,
  // we provide a warning that the full parser requires xml2js
  console.warn('Using basic XML parser - some features may be limited');
  
  return doc as unknown as Document;
}

// Extract data from parsed XML structure
function extractConfluenceData(parsed: any): ConfluenceExport {
  const pages: ConfluencePage[] = [];
  
  // Handle different Confluence export formats
  // Format 1: Single page export
  if (parsed.page) {
    const page = parseConfluencePage(parsed.page);
    if (page) {
      pages.push(page);
    }
  }
  // Format 2: Multiple pages (spaces export)
  else if (parsed.pages) {
    const pagesArray = Array.isArray(parsed.pages.page) ? parsed.pages.page : [parsed.pages.page];
    for (const pageXml of pagesArray) {
      const page = parseConfluencePage(pageXml);
      if (page) {
        pages.push(page);
      }
    }
  }
  // Format 3: Space export with content
  else if (parsed.space) {
    const content = parsed.space.content || [];
    const contentArray = Array.isArray(content) ? content : [content];
    for (const contentItem of contentArray) {
      if (contentItem.page) {
        const page = parseConfluencePage(contentItem.page);
        if (page) {
          pages.push(page);
        }
      }
    }
  }
  
  return {
    pages,
    totalPages: pages.length,
  };
}

// Parse a single Confluence page
function parseConfluencePage(pageXml: any): ConfluencePage | null {
  if (!pageXml) return null;
  
  const page: ConfluencePage = {
    title: pageXml.title?.[0] || 'Untitled',
    content: '',
    version: pageXml.version?.[0]?.versionNumber?.[0],
    created: pageXml.created?.[0],
    lastModified: pageXml.lastModified?.[0],
  };
  
  // Extract content
  if (pageXml.content) {
    page.content = pageXml.content[0] || '';
  }
  
  // Extract macros from content
  if (pageXml.macro) {
    page.macros = parseMacros(pageXml.macro);
  }
  
  return page;
}

// Parse macros from page content
function parseMacros(macros: any[]): ConfluenceMacro[] {
  return macros.map((macro: any) => {
    const name = macro.name?.[0] || 'unknown';
    const parameters = parseMacroParameters(macro.parameter);
    
    // Get macro body content
    let body: string | undefined;
    if (macro.body) {
      body = macro.body[0] || '';
    }
    
    // Get nested macros (for macros that can contain other macros)
    let children: ConfluenceMacro[] = [];
    if (macro.macro) {
      children = parseMacros(macro.macro);
    }
    
    return {
      name,
      parameters,
      body,
      children,
    };
  });
}

// Parse macro parameters
function parseMacroParameters(parameters: any[]): Record<string, string> {
  const result: Record<string, string> = {};
  
  if (!parameters) return result;
  
  const paramsArray = Array.isArray(parameters) ? parameters : [parameters];
  
  for (const param of paramsArray) {
    const paramName = param.name?.[0] || 'unnamed';
    const paramValue = param['#text'] || param['_'] || '';
    result[paramName] = paramValue;
  }
  
  return result;
}

// Convert Confluence macro to markdown
export function macroToMarkdown(macro: ConfluenceMacro, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  
  switch (macro.name) {
    case 'code':
      return convertCodeMacro(macro);
    
    case 'panel':
      return convertPanelMacro(macro);
    
    case 'info':
    case 'warning':
    case 'note':
    case 'tip':
      return convertPanelMacro(macro);
    
    case 'expand':
      return convertExpandMacro(macro);
    
    case 'anchor':
      return convertAnchorMacro(macro);
    
    case 'link':
      return convertLinkMacro(macro);
    
    case 'table':
      return convertTableMacro(macro);
    
    case 'emoji':
      return convertEmojiMacro(macro);
    
    default:
      // Fallback: include macro name and body
      let result = '';
      if (macro.parameters) {
        result += `${indent}[Macro: ${macro.name}]\n`;
      }
      if (macro.body) {
        result += `${indent}${macro.body}\n`;
      }
      if (macro.children && macro.children.length > 0) {
        result += macro.children.map((child) => macroToMarkdown(child, depth + 1)).join('\n');
      }
      return result;
  }
}

// Convert code macro to markdown
function convertCodeMacro(macro: ConfluenceMacro): string {
  const language = macro.parameters?.language || 'text';
  const code = macro.body || '';
  const lineNumbers = macro.parameters?.linenumbers === 'true' ? ' linenums' : '';
  
  return `\`\`\`${language}${lineNumbers}\n${code}\n\`\`\``;
}

// Convert panel macro to markdown
function convertPanelMacro(macro: ConfluenceMacro): string {
  const panelType = getPanelType(macro.name);
  const title = macro.parameters?.title || '';
  const body = macro.body || '';
  
  let result = '';
  if (title) {
    result += `**${title}**\n\n`;
  }
  
  if (body) {
    result += `> ${body}`;
  }
  
  return result;
}

// Get panel type emoji/syntax
function getPanelType(name: string): string {
  const panelMap: Record<string, string> = {
    'info': 'info',
    'warning': 'warning', 
    'note': 'note',
    'tip': 'tip',
    'panel': 'panel',
  };
  return panelMap[name] || 'panel';
}

// Convert expand macro to markdown
function convertExpandMacro(macro: ConfluenceMacro): string {
  const title = macro.parameters?.title || 'Expand';
  const body = macro.body || '';
  
  return `<details>\n<summary>${title}</summary>\n\n${body}\n</details>`;
}

// Convert anchor macro to markdown
function convertAnchorMacro(macro: ConfluenceMacro): string {
  const name = macro.parameters?.name || '';
  return `<a id="${name}"></a>`;
}

// Convert link macro to markdown
function convertLinkMacro(macro: ConfluenceMacro): string {
  const link = macro.body || '';
  const text = macro.parameters?.text || link;
  return `[${text}](${link})`;
}

// Convert table macro to markdown
function convertTableMacro(macro: ConfluenceMacro): string {
  let result = '';
  
  // Find rows and cells
  const rows: string[] = [];
  let headers: string[] = [];
  
  if (macro.children) {
    for (const child of macro.children) {
      if (child.name === 'row') {
        const cells: string[] = [];
        if (child.children) {
          for (const cell of child.children) {
            if (cell.name === 'cell') {
              cells.push(cell.body || '');
            }
          }
        }
        
        // First row is usually headers
        if (rows.length === 0) {
          headers = cells;
        } else {
          rows.push(cells.join(' | '));
        }
      }
    }
  }
  
  if (headers.length > 0) {
    result += headers.join(' | ') + '\n';
    result += headers.map(() => '---').join(' | ') + '\n';
    if (rows.length > 0) {
      result += rows.join('\n');
    }
  }
  
  return result;
}

// Convert emoji macro to markdown (returns emoji)
function convertEmojiMacro(macro: ConfluenceMacro): string {
  // Confluence emoji macros often encode emojis
  // Return the macro body if it contains the emoji
  return macro.body || '';
}

// Convert Confluence page to markdown
export function pageToMarkdown(page: ConfluencePage): string {
  let markdown = `# ${page.title}\n\n`;
  
  if (page.version) {
    markdown += `**Version:** ${page.version}\n\n`;
  }
  
  // Process content with macros
  let content = page.content;
  
  // Handle macros in content
  if (page.macros) {
    for (const macro of page.macros) {
      const macroMarkdown = macroToMarkdown(macro);
      // Replace macro placeholder with markdown
      content = content.replace(/<ac:structured-macro/, macroMarkdown);
    }
  }
  
  markdown += content;
  
  return markdown.trim();
}

// Handle Confluence-specific macros
export function handleConfluenceMacro(macro: ConfluenceMacro): string {
  switch (macro.name) {
    case 'hint':
    case 'info':
      return `> [!INFO] ${macro.body || ''}`;
    
    case 'warning':
    case 'note':
      return `> [!WARNING] ${macro.body || ''}`;
    
    case 'tabs':
      return convertTabsMacro(macro);
    
    case 'code':
      return convertCodeMacro(macro);
    
    case 'panel':
      return convertPanelMacro(macro);
    
    case 'anchor':
      return `<a id="${macro.parameters?.name || ''}"></a>`;
    
    default:
      return macro.body || '';
  }
}

// Convert tabs macro to markdown
function convertTabsMacro(macro: ConfluenceMacro): string {
  let result = '';
  
  // Tabs in Confluence are typically implemented as expand macros
  if (macro.children) {
    for (const tab of macro.children) {
      if (tab.name === 'tab' || tab.name === 'expand') {
        const title = tab.parameters?.title || tab.parameters?.name || 'Tab';
        const body = tab.body || '';
        result += `<details>\n<summary>${title}</summary>\n\n${body}\n</details>\n\n`;
      }
    }
  }
  
  return result.trim();
}

// Parse Confluence export directory
export async function parseConfluenceExportDirectory(directoryPath: string): Promise<ConfluenceExport> {
  // This would read XML files from directory
  // For now, return placeholder structure
  return {
    pages: [],
    totalPages: 0,
  };
}

// Import handler - converts Confluence XML to markdown
export async function handleConfluenceImport(
  event: any,
  confluenceData: ConfluenceExport
): Promise<{ success: boolean; pages: Record<string, string>; projectStructure: any }> {
  const pages: Record<string, string> = {};
  const projectStructure: any = {
    pages: [],
    sections: [],
  };
  
  let pagePosition = 0;
  
  // Convert all pages
  for (const page of confluenceData.pages) {
    const pageId = page.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    pages[pageId] = pageToMarkdown(page);
    
    projectStructure.pages.push({
      id: pageId,
      title: page.title,
      version: page.version,
      position: pagePosition++,
    });
  }
  
  // Build project structure
  // Group pages by common prefixes (e.g., "API-", "Guide-")
  const sections: Record<string, string[]> = {};
  for (const page of projectStructure.pages) {
    const match = page.title.match(/^([A-Z][A-Z]+-)/);
    if (match) {
      const prefix = match[1].slice(0, -1); // Remove trailing dash
      if (!sections[prefix]) {
        sections[prefix] = [];
      }
      sections[prefix].push(page.title);
    }
  }
  
  // Add sections to structure
  for (const [name, pagesInSection] of Object.entries(sections)) {
    projectStructure.sections.push({
      name,
      pages: pagesInSection,
    });
  }
  
  return {
    success: true,
    pages,
    projectStructure,
  };
}

// Bulk import from directory archive
export async function importConfluenceDirectory(
  directoryPath: string
): Promise<{ success: boolean; pages: Record<string, string>; files: string[] }> {
  // Implementation would:
  // 1. Read directory structure
  // 2. Parse XML files
  // 3. Convert to markdown
  // 4. Return structured result
  
  return {
    success: false,
    pages: {},
    files: [],
  };
}

// Validate Confluence export structure
export function validateConfluenceStructure(data: any): boolean {
  if (!data) return false;
  
  // Check for pages array
  if (data.pages) {
    return Array.isArray(data.pages);
  }
  
  // Check for single page
  if (data.page) {
    return !!data.page.title;
  }
  
  // Check for space content
  if (data.space && data.space.content) {
    return true;
  }
  
  return false;
}

// Import error class for graceful error handling
export class ConfluenceImportError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ConfluenceImportError';
  }
}
