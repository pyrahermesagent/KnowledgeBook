// Unified Import API Endpoint
// Single endpoint for all import formats with auto-detection
// Supports: gitbook, markdown, html, csv, confluence, notion, pdf, epub

import { defineEventHandler, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody(event);
  
  // Validate request
  if (!body.content && !body.url && !body.uploadId) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Content, URL, or upload ID is required for import',
    };
  }
  
  // Build import options
  const options: any = {
    ownerId: user.id,
    projectSlug: body.projectSlug,
    projectName: body.projectName,
    format: body.format,
    url: body.url,
    content: body.content,
    file: body.file || undefined,
  };
  
  // Handle file upload from temporary storage
  if (body.uploadId) {
    // In a real implementation, fetch the uploaded file from storage
    // For now, this is a placeholder
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'File upload not yet implemented',
    };
  }
  
  // Validate request
  const { valid, errors } = validateImportRequest(options);
  if (!valid) {
    setResponseStatus(event, 400);
    return {
      success: false,
      errors,
    };
  }
  
  try {
    // Import content
    const result = await importContent(options);
    
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
