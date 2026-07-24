// Cache utilities for MCP server performance optimization
// Implements in-memory LRU caching with configurable TTL

interface CacheEntry {
  value: string;
  timestamp: number;
  ttl: number;
}

const CACHE_TTL = 60 * 1000; // 60 seconds default TTL
const MAX_CACHE_SIZE = 1000;

export class Cache {
  private store: Map<string, CacheEntry>;
  private maxSize: number;

  constructor(maxSize: number = MAX_CACHE_SIZE) {
    this.store = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   */
  get(key: string): string | null {
    const entry = this.store.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }
    
    // Move to end (most recently used)
    this.store.delete(key);
    this.store.set(key, entry);
    
    return entry.value;
  }

  /**
   * Set a value in cache with optional TTL
   */
  set(key: string, value: string, ttl: number = CACHE_TTL): void {
    // If key exists, delete it first to update order
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    
    // Evict oldest entries if at capacity
    while (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    
    this.store.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.store.size;
  }
}

// Global cache instances for different purposes
export const pageCache = new Cache(500); // Cache for page content
export const searchCache = new Cache(100); // Cache for search results
export const projectCache = new Cache(100); // Cache for project structures

/**
 * Cache key generators
 */
export function generatePageCacheKey(project: string, page: string): string {
  return `page:${project}:${page}`;
}

export function generateSearchCacheKey(query: string, project?: string): string {
  return `search:${project || 'all'}:${query}`;
}

export function generateProjectCacheKey(project: string): string {
  return `project:${project}`;
}

/**
 * Cache-aware search function wrapper
 */
export async function cachedSearch(
  searchFn: () => Promise<{ results: string[]; query: string }>,
  query: string,
  project?: string
): Promise<{ results: string[]; query: string }> {
  const cacheKey = generateSearchCacheKey(query, project);
  const cached = searchCache.get(cacheKey);
  
  if (cached) {
    const { results, query: cachedQuery } = JSON.parse(cached);
    return { results, query: cachedQuery };
  }
  
  const result = await searchFn();
  searchCache.set(cacheKey, JSON.stringify(result));
  
  return result;
}

/**
 * Cache-aware page fetch wrapper
 */
export async function cachedPage(
  fetchFn: () => Promise<{ content: string; title: string }>,
  project: string,
  page: string
): Promise<{ content: string; title: string }> {
  const cacheKey = generatePageCacheKey(project, page);
  const cached = pageCache.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const result = await fetchFn();
  pageCache.set(cacheKey, JSON.stringify(result));
  
  return result;
}

/**
 * Clear related cache entries when content changes
 */
export function invalidatePageCache(project: string, page?: string): void {
  if (page) {
    pageCache.delete(generatePageCacheKey(project, page));
  } else {
    // Clear all pages for project
    for (const key of pageCache.store.keys()) {
      if (key.startsWith(`page:${project}:`)) {
        pageCache.delete(key);
      }
    }
  }
}

export function invalidateSearchCache(project?: string): void {
  if (project) {
    for (const key of searchCache.store.keys()) {
      if (key.startsWith(`search:${project}:`)) {
        searchCache.delete(key);
      }
    }
  } else {
    searchCache.clear();
  }
}

// Performance metrics tracking
export const performanceMetrics = {
  toolCalls: new Map<string, { count: number; totalTime: number }>(),
  
  startTimer(tool: string): number {
    return Date.now();
  },
  
  endTimer(tool: string, startTime: number): void {
    const duration = Date.now() - startTime;
    const existing = this.toolCalls.get(tool) || { count: 0, totalTime: 0 };
    this.toolCalls.set(tool, {
      count: existing.count + 1,
      totalTime: existing.totalTime + duration,
    });
  },
  
  getAverageDuration(tool: string): number {
    const metrics = this.toolCalls.get(tool);
    if (!metrics || metrics.count === 0) return 0;
    return metrics.totalTime / metrics.count;
  },
  
  reset(): void {
    this.toolCalls.clear();
  }
};
