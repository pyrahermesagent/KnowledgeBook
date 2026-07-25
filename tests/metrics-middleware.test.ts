import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createEvent } from 'h3';
import type { H3Event } from 'h3';
import metricsMiddleware, { getMetrics, resetMetrics } from '#server/middleware/metrics';

/**
 * Regression coverage for server/middleware/metrics.ts.
 *
 * Nitro server middleware runs on every request, including the SSR entry for
 * `/`. A middleware that throws therefore turns the whole site into a 500,
 * which is what took down the Lighthouse job in .github/workflows/audit.yml:
 * `curl -sSf http://localhost:3000` failed on the 500 and the readiness loop
 * reported "Server did not become ready within 60s".
 */

/** Minimal node req/res pair good enough for h3 to build an event from. */
function createTestEvent(path = '/'): { event: H3Event; finish: () => void } {
  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: path,
    headers: {} as Record<string, string>,
  });

  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headersSent: false,
    setHeader: () => {},
    getHeader: () => undefined,
    getHeaders: () => ({}),
    removeHeader: () => {},
    writeHead: () => {},
    write: () => true,
    end: () => {},
  });

  const event = createEvent(req as never, res as never);

  // Nitro closes the response once the downstream handler has replied.
  return { event, finish: () => res.emit('close') };
}

describe('metrics middleware', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('passes the request through instead of throwing', async () => {
    const { event } = createTestEvent('/');

    // h3 event handlers receive only the event — there is no Connect-style
    // `next` callback to call. Awaiting one throws ReferenceError and every
    // request 500s. Returning undefined is what hands the request on.
    await expect(Promise.resolve(metricsMiddleware(event))).resolves.toBeUndefined();
  });

  it('records request duration once the response completes', async () => {
    const { event, finish } = createTestEvent('/');

    await metricsMiddleware(event);
    expect(getMetrics().metricsWindow).toBe(0);

    finish();

    const metrics = getMetrics();
    expect(metrics.metricsWindow).toBe(1);
    expect(metrics.avgRequestDuration).toBeGreaterThanOrEqual(0);
  });

  it('counts requests to encryption endpoints', async () => {
    const { event, finish } = createTestEvent('/api/projects/demo/decrypt');

    await metricsMiddleware(event);
    finish();

    expect(getMetrics().encryptedRequests).toBe(1);
  });

  it('does not count plain page requests as encrypted', async () => {
    const { event, finish } = createTestEvent('/');

    await metricsMiddleware(event);
    finish();

    expect(getMetrics().encryptedRequests).toBe(0);
  });
});
