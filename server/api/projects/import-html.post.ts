// HTML/CMS Import API Endpoint
// Handles importing static HTML sites and CMS exports (WordPress, MediaWiki)

import { defineEventHandler, readBody } from 'h3';
import {
  importHtmlContent,
  importHtmlDirectory,
  ImportResult,
  ImportOptions,
} from '~/server/utils/html-import';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

// Validate HTML content
function validateHtmlContent(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  const lower = content.toLowerCase().trim();
  return lower.startsWith('<html') || lower.startsWith('<!doctype') || lower.startsWith('<!doctype') || lower.includes('<body');
}

// Parse directory of HTML files
function parseHtmlDirectory(exportPath: string): { files: string[]; pages: any[] } {
  const files: string[] = [];
  const pages: any[] = [];
  
  // Read all HTML files in directory
  const htmlFiles = readdirSync(exportPath, { recursive: true })
    .filter((file: string) => file.endsWith('.html') || file.endsWith('.htm'))
    .map((file: string) => join(exportPath, file));
  
  for (const filePath of htmlFiles) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const relPath = filePath.replace(exportPath + '/', '');
      
      files.push(relPath);
      
      // Extract page title from file
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch ? titleMatch[1] : h1Match ? h1Match[1] : relPath;
      
      pages.push({
        file: relPath,
        title,
        content,
      });
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  return { files, pages };
}

// Import HTML content handler
export const importHtml = defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  // Handle different import methods
  let result: ImportResult;
  
  if (body.content) {
    // Direct HTML content import
    const options: ImportOptions = {
      baseUrl: body.baseUrl,
      extractImages: body.extractImages !== false, // default to true
      preserveStructure: body.preserveStructure || false,
    };
    
    result = await importHtmlContent(body.content, options);
  } else if (body.directoryPath) {
    // Import from directory
    if (!existsSync(body.directoryPath)) {
      setResponseStatus(event, 400);
      return {
        success: false,
        error: 'Directory not found',
        details: body.directoryPath,
      };
    }
    
    const dirResult = parseHtmlDirectory(body.directoryPath);
    result = await importHtmlDirectory(body.directoryPath, dirResult.files);
    result.files = dirResult.files;
  } else if (body.uploadId) {
    // Import from uploaded file/directory
    const uploadPath = body.isFile
      ? join(tmpdir(), `html-import-${body.uploadId}.html`)
      : join(tmpdir(), `html-import-${body.uploadId}`);
    
    if (!existsSync(uploadPath)) {
      setResponseStatus(event, 400);
      return {
        success: false,
        error: 'Upload not found',
        details: uploadPath,
      };
    }
    
    if (body.isFile) {
      const content = readFileSync(uploadPath, 'utf8');
      const options: ImportOptions = {
        baseUrl: body.baseUrl,
        extractImages: body.extractImages !== false,
        preserveStructure: body.preserveStructure || false,
      };
      result = await importHtmlContent(content, options);
    } else {
      const dirResult = parseHtmlDirectory(uploadPath);
      result = await importHtmlDirectory(uploadPath, dirResult.files);
      result.files = dirResult.files;
    }
    
    // Clean up upload
    if (body.isFile) {
      rmSync(uploadPath);
    } else {
      rmSync(uploadPath, { recursive: true, force: true });
    }
  } else if (body.url) {
    // Import from URL (would require fetch in actual implementation)
    // For now, this is a placeholder
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'URL import not yet implemented',
      details: 'Please use direct content, directory, or file upload instead',
    };
  } else {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Invalid request',
      details: 'Provide content, directoryPath, uploadId, or url',
    };
  }
  
  // Validate result
  if (!result.success) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Import failed',
      details: result.errors.join(', '),
      warnings: result.warnings,
    };
  }
  
  // Success
  return {
    success: true,
    ...result,
    pageCount: Object.keys(result.pages).length,
  };
});

// Bulk import handler for directory archives
export const bulkImportHtml = defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  if (!body.directoryPath && !body.uploadId) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Invalid request',
      details: 'Provide directoryPath or uploadId',
    };
  }
  
  const uploadPath = body.uploadId
    ? join(tmpdir(), `html-import-${body.uploadId}`)
    : body.directoryPath;
  
  if (!existsSync(uploadPath)) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Directory not found',
      details: uploadPath,
    };
  }
  
  const dirResult = parseHtmlDirectory(uploadPath);
  const result = await importHtmlDirectory(uploadPath, dirResult.files);
  result.files = dirResult.files;
  
  // Clean up upload if from temporary storage
  if (body.uploadId && existsSync(uploadPath)) {
    rmSync(uploadPath, { recursive: true, force: true });
  }
  
  if (!result.success) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Bulk import failed',
      details: result.errors.join(', '),
    };
  }
  
  return {
    success: true,
    ...result,
    pageCount: Object.keys(result.pages).length,
    filesCount: result.files?.length || 0,
  };
});

// Supported import endpoints
export default {
  POST: defineEventHandler(async (event) => {
    const body = await readBody(event);
    
    if (body.bulk) {
      return bulkImportHtml(event);
    }
    return importHtml(event);
  }),
};
