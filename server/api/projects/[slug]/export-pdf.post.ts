// PDF Export API Endpoint
// Exports a project as a PDF document

import { defineEventHandler, readBody, getRouterParam } from 'h3';
import { exportToPdf, getAvailableThemes, getThemeInfo } from '~/server/utils/pdf-export';
import { getProjectBySlug, useDb } from '#imports';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');
  if (!slug) {
    throw createError({
      statusCode: 400,
      message: 'Project slug is required',
    });
  }

  // Get project by slug
  const project = getProjectBySlug(slug);
  if (!project) {
    throw createError({
      statusCode: 404,
      message: 'Project not found',
    });
  }

  // Get request body
  const body = await readBody(event);
  const { theme, includeToc = true, pageSize, margin, headers, footer } = body;

  // Validate theme
  const availableThemes = getAvailableThemes();
  if (theme && !availableThemes.includes(theme)) {
    throw createError({
      statusCode: 400,
      message: `Invalid theme. Available themes: ${availableThemes.join(', ')}`,
    });
  }

  // Get sections and pages for the project
  const db = useDb();
  const sections = db
    .prepare('SELECT id, title, position FROM sections WHERE project_id = ? ORDER BY position, id')
    .all(project.id);

  // Get pages for each section
  const sectionsWithPages = sections.map((section: any) => {
    const pages = db
      .prepare('SELECT id, slug, title, content, position FROM pages WHERE project_id = ? AND section_id = ? ORDER BY position, id')
      .all(project.id, section.id);
    return { ...section, pages };
  });

  // Export to PDF
  try {
    const result = await exportToPdf(project, sectionsWithPages, {
      theme,
      includeToc,
      pageSize: (pageSize as any) || undefined,
      margin: margin || undefined,
      headers: headers || undefined,
      footer: footer || undefined,
    });

    return {
      success: true,
      message: 'PDF exported successfully',
      fileName: result.fileName,
      filePath: result.pdfPath,
      fileSize: result.fileSize,
      themes: availableThemes.map(t => ({ name: t, ...getThemeInfo(t) })),
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to export PDF',
      details: (error as Error).message,
    });
  }
});
