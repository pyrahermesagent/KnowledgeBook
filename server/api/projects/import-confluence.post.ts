// Confluence XML Import API Endpoint
// Handles importing Atlassian Confluence spaces via XML export

import { defineEventHandler, readBody } from 'h3';
import { parseConfluenceExportDirectory, handleConfluenceImport, ConfluenceImportError, validateConfluenceStructure } from '~/server/utils/confluence';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

// Validate Confluence export structure
function validateConfluenceStructureExternal(data: any): boolean {
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

// Parse Confluence XML content
function parseConfluenceXmlContent(xmlString: string) {
  return parseConfluenceXml(xmlString);
}

// Parse Confluence export file
function parseConfluenceExportFile(filePath: string): any {
  const content = readFileSync(filePath, 'utf8');
  return parseConfluenceXml(content);
}

// Parse Confluence export directory
function parseConfluenceExportDirectory(exportPath: string): any {
  const pages: any[] = [];
  let root: any = null;
  
  // Find all XML files in directory
  const xmlFiles = getXmlFiles(exportPath);
  
  for (const xmlFile of xmlFiles) {
    const xmlPath = join(exportPath, xmlFile);
    try {
      const content = readFileSync(xmlPath, 'utf8');
      const parsed = parseConfluenceXmlContent(content);
      
      // Add parsed pages
      if (parsed.pages) {
        pages.push(...parsed.pages);
      }
      
      // Try to find root page (usually has 'root' in path or name)
      if (xmlFile.toLowerCase().includes('root')) {
        const rootXml = readFileSync(xmlPath, 'utf8');
        root = parseConfluenceXmlContent(rootXml);
      }
    } catch (error) {
      // Skip files that can't be parsed
      console.warn(`Failed to parse ${xmlFile}: ${(error as Error).message}`);
    }
  }
  
  // If no explicit root found, use first page
  if (!root && pages.length > 0) {
    root = {
      pages: [pages[0]],
    };
  }
  
  return {
    pages,
    root,
    files: xmlFiles,
  };
}

// Get all XML files from directory
function getXmlFiles(directoryPath: string): string[] {
  const fs = require('fs');
  const path = require('path');
  
  const result: string[] = [];
  
  function scan(dir: string) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (file.toLowerCase().endsWith('.xml')) {
        result.push(fullPath);
      }
    }
  }
  
  scan(directoryPath);
  return result;
}

// Import Confluence XML
export const importConfluence = defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  // Handle different import methods
  let confluenceData: any;
  
  if (body.xmlData) {
    // Direct XML import
    try {
      confluenceData = parseConfluenceXmlContent(body.xmlData);
    } catch (error) {
      setResponseStatus(event, 400);
      return {
        success: false,
        error: 'Failed to parse Confluence XML',
        details: (error as Error).message,
      };
    }
  } else if (body.directoryPath) {
    // Import from directory
    try {
      confluenceData = parseConfluenceExportDirectory(body.directoryPath);
    } catch (error) {
      setResponseStatus(event, 400);
      return {
        success: false,
        error: 'Failed to parse Confluence export directory',
        details: (error as Error).message,
      };
    }
  } else if (body.uploadId) {
    // Import from uploaded file (from temporary storage)
    const uploadPath = join(tmpdir(), `confluence-import-${body.uploadId}`);
    
    try {
      confluenceData = parseConfluenceExportDirectory(uploadPath);
      rmSync(uploadPath, { recursive: true, force: true });
    } catch (error) {
      setResponseStatus(event, 400);
      return {
        success: false,
        error: 'Failed to parse uploaded Confluence export',
        details: (error as Error).message,
      };
    }
  } else if (body.file) {
    // Import from uploaded file (base64 or path)
    try {
      if (body.file.startsWith('<?xml') || body.file.startsWith('<page')) {
        // Direct XML string
        confluenceData = parseConfluenceXmlContent(body.file);
      } else {
        // Assume it's a path
        confluenceData = parseConfluenceExportFile(body.file);
      }
    } catch (error) {
      setResponseStatus(event, 400);
      return {
        success: false,
        error: 'Failed to parse Confluence file',
        details: (error as Error).message,
      };
    }
  } else {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Invalid request. Provide xmlData, directoryPath, uploadId, or file.',
    };
  }
  
  // Validate structure
  if (!validateConfluenceStructureExternal(confluenceData)) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Invalid Confluence export format',
      details: 'Expected pages, page, or space content',
    };
  }
  
  try {
    // Import pages
    const result = await handleConfluenceImport(event, confluenceData);
    
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    setResponseStatus(event, 500);
    return {
      success: false,
      error: 'Import failed',
      details: (error as Error).message,
    };
  }
});

// Bulk import handler for directory archives
export const bulkImportConfluence = defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  if (!body.directoryPath && !body.uploadId) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Invalid request. Provide directoryPath or uploadId.',
    };
  }
  
  let confluenceData: any;
  const uploadPath = body.uploadId 
    ? join(tmpdir(), `confluence-import-${body.uploadId}`)
    : body.directoryPath;
  
  try {
    confluenceData = parseConfluenceExportDirectory(uploadPath);
  } catch (error) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Failed to parse Confluence export',
      details: (error as Error).message,
    };
  }
  
  if (!validateConfluenceStructureExternal(confluenceData)) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Invalid Confluence export format',
    };
  }
  
  try {
    const result = await handleConfluenceImport(event, confluenceData);
    
    // Clean up upload if from temporary storage
    if (body.uploadId && existsSync(uploadPath)) {
      rmSync(uploadPath, { recursive: true, force: true });
    }
    
    return {
      success: true,
      ...result,
      filesCount: confluenceData.files?.length || 0,
    };
  } catch (error) {
    setResponseStatus(event, 500);
    return {
      success: false,
      error: 'Bulk import failed',
      details: (error as Error).message,
    };
  }
});

// Import error handler for graceful error reporting
export const handleImportError = defineEventHandler(async (event, error: Error) => {
  setResponseStatus(event, 400);
  return {
    success: false,
    error: 'Import failed',
    details: error.message,
  };
});

// Supported import endpoints
export default {
  POST: defineEventHandler(async (event) => {
    // Route to appropriate handler based on content
    const body = await readBody(event);
    
    if (body.bulk) {
      return bulkImportConfluence(event);
    }
    return importConfluence(event);
  }),
};
