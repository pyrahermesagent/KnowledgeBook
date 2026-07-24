import type { H3Event } from 'h3';

/**
 * Decrypted content cache middleware
 * Caches decrypted page content to reduce encryption overhead
 *
 * Cache key format: content:{projectSlug}:{userId}
 * Default TTL: 5 minutes (300 seconds)
 */

interface CacheEntry {
  content: string;
  timestamp: number;
  userId: number;
}

const CACHE_TTL = 300; // 5 minutes in seconds

/**
 * Check if cache entry is expired
 */
function isCacheExpired(entry: CacheEntry | null): boolean {
  if (!entry) return true;
  return Date.now() - entry.timestamp > CACHE_TTL * 1000;
}

/**
 * Get cache key for project content
 */
function getCacheKey(projectSlug: string, userId: number): string {
  return `content:${projectSlug}:${userId}`;
}

/**
 * Content cache middleware
 * Checks cache before fetching decrypted content
 * Falls back to database fetch if cache miss
 */
export default defineEventHandler(async (event: H3Event): Promise<any> | void => {
  const path = event.path;

  // Only cache page view endpoints
  if (!path.startsWith('/api/projects/') || !path.includes('/view/')) {
    return;
  }

  // Check if user is authenticated
  const user = await useAuth(event).user;
  if (!user) {
    return;
  }

  // Extract project slug from path
  const pathParts = path.split('/');
  const projectSlugIndex = pathParts.indexOf('projects') + 1;
  if (projectSlugIndex >= pathParts.length) {
    return;
  }

  const projectSlug = pathParts[projectSlugIndex];

  // Check cache
  const cacheKey = getCacheKey(projectSlug, user.id);
  const cached = await useStorage().getItem<CacheEntry>(cacheKey);

  if (cached && !isCacheExpired(cached)) {
    // Return cached content
    setResponseHeaders(event, {
      'x-cache': 'HIT',
      'Cache-Control': `max-age=${CACHE_TTL}`,
    });
    return cached.content;
  }

  // Cache miss - continue with request, content will be encrypted on output
  // and we'll cache the result
  setResponseHeaders(event, {
    'x-cache': 'MISS',
  });

  // Add response hook to cache the result
  event.res.on('finish', () => {
    // Only cache successful responses
    if (event.res.statusCode === 200) {
      // Note: This is a simplified implementation
      // In production, you'd want to intercept the response body
    }
  });
});

/**
 * Manually cache page content for a project
 */
export async function cachePageContent(
  projectSlug: string,
  userId: number,
  content: string
): Promise<void> {
  const cacheKey = getCacheKey(projectSlug, userId);

  await useStorage().setItem(
    cacheKey,
    {
      content,
      timestamp: Date.now(),
      userId,
    },
    {
      maxAge: CACHE_TTL,
    }
  );
}

/**
 * Invalidate cache for a project
 */
export async function invalidateProjectCache(projectSlug: string, userId?: number): Promise<void> {
  const cacheKeyPrefix = `content:${projectSlug}`;

  if (userId) {
    // Invalidate specific user's cache
    await useStorage().setItem(getCacheKey(projectSlug, userId), null);
  } else {
    // Invalidate all users' cache for project
    const keys = await useStorage().getKeys(`${cacheKeyPrefix}*`);
    for (const key of keys) {
      await useStorage().setItem(key, null);
    }
  }
}
