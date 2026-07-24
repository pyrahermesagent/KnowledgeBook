// Sync API Endpoints
// Provides content synchronization with conflict resolution

import { defineEventHandler, readBody, getRouterParam } from 'h3';
import { syncContent, resolveContentConflict, getProjectConflicts, getSyncHistory, getSyncStats } from '~/server/utils/content-sync';

// Sync content endpoint
export const syncProjectContent = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { projectId, contentId, content, version } = body;
  
  if (!projectId || !contentId || !content) {
    throw createError({ statusCode: 400, message: 'projectId, contentId, and content are required' });
  }
  
  try {
    const result = await syncContent({
      projectId,
      contentId,
      userId: (event.context.user?.id as number) || 1, // Default to 1 if no user
      content,
      version: version || 0,
    });
    
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Sync failed', details: (error as Error).message });
  }
});

// Resolve conflict endpoint
export const resolveSyncConflict = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { conflictId, resolution } = body;
  
  if (!conflictId) {
    throw createError({ statusCode: 400, message: 'Conflict ID is required' });
  }
  
  try {
    const result = await resolveContentConflict(event, {
      conflictId,
      resolution: resolution || '',
      resolvedBy: (event.context.user?.id as number) || 1,
    });
    
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Conflict resolution failed', details: (error as Error).message });
  }
});

// Get project conflicts endpoint
export const getProjectSyncConflicts = defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');
  
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Project slug is required' });
  }
  
  try {
    const result = await getProjectConflicts(event);
    return result;
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Failed to get conflicts', details: (error as Error).message });
  }
});

// Get sync history endpoint
export const getProjectSyncHistory = defineEventHandler(async (event) => {
  const contentId = getRouterParam(event, 'contentId');
  
  if (!contentId) {
    throw createError({ statusCode: 400, message: 'Content ID is required' });
  }
  
  try {
    const result = await getSyncHistory(event);
    return result;
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Failed to get sync history', details: (error as Error).message });
  }
});

// Get sync stats endpoint
export const getProjectSyncStats = defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');
  
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Project slug is required' });
  }
  
  try {
    const result = await getSyncStats(event);
    return result;
  } catch (error) {
    throw createError({ statusCode: 500, message: 'Failed to get sync stats', details: (error as Error).message });
  }
});

// Sync API route
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');
  const contentId = getRouterParam(event, 'contentId');
  
  switch (event.method) {
    case 'POST':
      if (contentId) {
        return resolveSyncConflict(event);
      }
      return syncProjectContent(event);
    
    case 'GET':
      if (slug) {
        return getProjectSyncConflicts(event);
      }
      return getProjectSyncHistory(event);
    
    default:
      throw createError({ statusCode: 405, message: 'Method not allowed' });
  }
});
