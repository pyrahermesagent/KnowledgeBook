// Unified Preview API Endpoint
// Single endpoint for all preview formats with theme switching
// Supports: web, pdf, epub

import { defineEventHandler, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody(event);
  
  // Validate request
  if (!body.projectSlug) {
    setResponseStatus(event, 400);
    return {
      success: false,
      error: 'Project slug is required for preview',
    };
  }
  
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
  
  // Generate preview
  const result = await previewContent({
    format: body.format || 'web',
    project,
    sections,
    theme: body.theme,
  });
  
  return {
    success: result.success,
    ...result,
  };
});
