// Unified Export API Endpoint
// Single endpoint for all export formats with status tracking
// Supports: web, pdf, epub, zip, api

import { defineEventHandler, readBody } from 'h3';
import { createExportStatus, updateExportStatus } from '~/server/utils/export-pipeline';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody(event);
  
  // Validate request
  if (!body.projectSlug) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Project slug is required for export',
    };
  }
  
  if (!body.format) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Export format is required',
    };
  }
  
  // Validate format
  const validFormats = ['web', 'pdf', 'epub', 'zip', 'api'];
  if (!validFormats.includes(body.format)) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: `Invalid export format: ${body.format}. Valid formats: ${validFormats.join(', ')}`,
    };
  }
  
  // Create export status record
  const exportId = createExportStatus(body.projectSlug, body.format);
  
  try {
    // Get project and sections from database
    const db = useDb();
    
    const project = db.prepare(`
      SELECT * FROM projects WHERE slug = ? AND owner_id = ?
    `).get(body.projectSlug, user.id) as any;
    
    if (!project) {
      setResponseStatus(event, 404);
      return {
        success: false,
        error: 'Project not found',
      };
    }
    
    const sections = db.prepare(`
      SELECT s.*, json_group_array(json_object(
        'id', p.id, 'slug', p.slug, 'title', p.title, 
        'content', p.content, 'position', p.position
      )) as pages
      FROM sections s
      LEFT JOIN pages p ON s.id = p.section_id
      WHERE s.project_id = ? AND s.project_id = (
        SELECT id FROM projects WHERE slug = ? AND owner_id = ?
      )
      GROUP BY s.id
      ORDER BY s.position
    `).all(project.id) as any;
    
    // Export content
    const result = await exportContent({
      format: body.format,
      project,
      sections,
      theme: body.theme,
      includeToc: body.includeToc,
      pageSize: body.pageSize,
      margin: body.margin,
      outputDir: body.outputDir,
      includeAssets: body.includeAssets,
    });
    
    // Update export status
    updateExportStatus(exportId, {
      status: result.status as any,
      result,
    });
    
    return {
      success: result.success,
      exportId,
      ...result,
    };
  } catch (error) {
    updateExportStatus(exportId, {
      status: 'failed',
      error: (error as Error).message,
    });
    
    setResponseStatus(event, 500);
    return {
      success: false,
      error: 'Export failed',
      details: (error as Error).message,
    };
  }
});
