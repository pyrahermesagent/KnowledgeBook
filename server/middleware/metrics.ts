import type { H3Event } from 'h3';

/**
 * Metrics collection middleware
 * Tracks request duration and encryption-related metrics
 *
 * Metrics tracked:
 * - request_duration_ms: Request duration histogram
 * - encrypted_requests: Count of encrypted content requests
 * - decryption_duration_ms: Encryption/decryption operation duration
 * - cache_hits: Cache hit/miss ratio
 */

interface Metrics {
  requestDuration: number[];
  encryptedRequests: number;
  decryptionDuration: number[];
  cacheHits: number;
  cacheMisses: number;
}

const metrics: Metrics = {
  requestDuration: [],
  encryptedRequests: 0,
  decryptionDuration: [],
  cacheHits: 0,
  cacheMisses: 0,
};

/**
 * Metrics middleware - collects performance data
 */
export default defineEventHandler(async (event: H3Event): Promise<void> => {
  const start = performance.now();

  // Add encryption tracking
  const isEncryptionEndpoint =
    event.path.includes('encryption') ||
    event.path.includes('encrypt') ||
    event.path.includes('decrypt');

  if (isEncryptionEndpoint) {
    metrics.encryptedRequests++;
  }

  // Add cache hit/miss tracking
  const cacheStatus = getHeader(event, 'x-cache');
  if (cacheStatus === 'HIT') {
    metrics.cacheHits++;
  } else if (cacheStatus === 'MISS') {
    metrics.cacheMisses++;
  }

  try {
    await next();
  } finally {
    const duration = performance.now() - start;

    // Store request duration
    metrics.requestDuration.push(duration);

    // Trim long arrays to prevent memory leaks
    if (metrics.requestDuration.length > 1000) {
      metrics.requestDuration.shift();
    }
  }
});

/**
 * Get metrics for monitoring
 */
export function getMetrics(): {
  avgRequestDuration: number;
  encryptedRequests: number;
  cacheHitRate: number;
  metricsWindow: number;
} {
  const avgRequestDuration =
    metrics.requestDuration.length > 0
      ? metrics.requestDuration.reduce((a, b) => a + b, 0) / metrics.requestDuration.length
      : 0;

  const totalCache = metrics.cacheHits + metrics.cacheMisses;
  const cacheHitRate = totalCache > 0 ? metrics.cacheHits / totalCache : 0;

  return {
    avgRequestDuration,
    encryptedRequests: metrics.encryptedRequests,
    cacheHitRate,
    metricsWindow: metrics.requestDuration.length,
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  Object.assign(metrics, {
    requestDuration: [],
    encryptedRequests: 0,
    decryptionDuration: [],
    cacheHits: 0,
    cacheMisses: 0,
  });
}

/**
 * Metrics collection helper for encryption operations
 */
export function recordDecryptionDuration(duration: number): void {
  metrics.decryptionDuration.push(duration);

  // Trim to prevent memory leaks
  if (metrics.decryptionDuration.length > 1000) {
    metrics.decryptionDuration.shift();
  }
}

/**
 * Get decryption operation metrics
 */
export function getDecryptionMetrics(): {
  avgDuration: number;
  count: number;
} {
  const avgDuration =
    metrics.decryptionDuration.length > 0
      ? metrics.decryptionDuration.reduce((a, b) => a + b, 0) / metrics.decryptionDuration.length
      : 0;

  return {
    avgDuration,
    count: metrics.decryptionDuration.length,
  };
}
