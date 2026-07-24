// Preview API Endpoints
// Provides real-time preview functionality with theme switching

import { defineEventHandler, readBody, getRouterParam, getQuery } from 'h3';
import { previewContent, refreshLivePreview, getAvailableThemes, getTheme } from '~/server/utils/preview-pipeline';
import { createError } from '#imports';

// Get project preview
export const getProjectPreview = defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Project slug is required' });
  }
  
  const db = useDb();
  const project = db.prepare(`
    SELECT id, slug, name, description FROM projects WHERE slug = ?
  `).get(slug) as { id?: number } | undefined;
  
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }
  
  // Get query params for theme and mode
  const query = getQuery(event);
  const { theme, mode } = query;
  
  try {
    const result = await previewContent({
      project,
      sections: [],
      theme: theme?.toString() || 'default',
      previewMode: mode?.toString() as any || 'live',
    });
    
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Failed to generate preview', details: (error as Error).message });
  }
});

// Refresh preview endpoint
export const refreshProjectPreview = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { projectId, theme } = body;
  
  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Project ID is required' });
  }
  
  try {
    const result = await refreshLivePreview({ projectId, theme });
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Failed to refresh preview', details: (error as Error).message });
  }
});

// Get available themes for preview
export const getAvailablePreviewThemes = defineEventHandler(async () => {
  try {
    return getAvailableThemes();
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Failed to get preview themes', details: (error as Error).message });
  }
});

// Switch theme endpoint
export const switchPreviewTheme = defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { theme } = body;
    return getTheme(theme);
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Failed to switch theme', details: (error as Error).message });
  }
});

// Preview API route
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');
  
  switch (event.method) {
    case 'GET':
      if (slug) {
        return getProjectPreview(event);
      }
      return getAvailablePreviewThemes(event);
    
    case 'POST':
      if (slug) {
        return refreshProjectPreview(event);
      }
      return switchPreviewTheme(event);
    
    default:
      throw createError({ statusCode: 405, message: 'Method not allowed' });
  }
});
