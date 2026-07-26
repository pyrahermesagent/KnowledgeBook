import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createEvent } from 'h3';
import type { H3Event } from 'h3';
import contentCacheMiddleware from '#server/middleware/content-cache';

/**
 * Regression coverage for server/middleware/content-cache.ts.
 *
 * Nitro middleware runs on every request, so an undefined identifier in it is
 * not a dormant bug — it is a 500 on each matching route. This one called
 * `useAuth(event)`, which the app never defines (every other call site uses
 * nuxt-auth-utils' `getUserSession`), so every page-view API request died with
 * "useAuth is not defined" and the public docs viewer rendered an error.
 */

const globals = globalThis as Record<string, unknown>;

function createTestEvent(path: string): { event: H3Event; headers: Record<string, string> } {
  const headers: Record<string, string> = {};

  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: path,
    headers: {} as Record<string, string>,
  });

  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headersSent: false,
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
    getHeaders: () => headers,
    removeHeader: () => {},
    writeHead: () => {},
    write: () => true,
    end: () => {},
  });

  return { event: createEvent(req as never, res as never), headers };
}

/** In-memory stand-in for Nitro's useStorage(). */
function installStorage(): Map<string, unknown> {
  const store = new Map<string, unknown>();
  globals.useStorage = () => ({
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: unknown) => void store.set(key, value),
    getKeys: async (prefix: string) =>
      [...store.keys()].filter((k) => k.startsWith(prefix.replace(/\*$/, ''))),
  });
  return store;
}

describe('content cache middleware', () => {
  let store: Map<string, unknown>;

  beforeEach(() => {
    store = installStorage();
    globals.getUserSession = async () => ({});
  });

  afterEach(() => {
    delete globals.useStorage;
    delete globals.getUserSession;
  });

  it('passes through a path it does not cache', async () => {
    const { event } = createTestEvent('/');
    await expect(Promise.resolve(contentCacheMiddleware(event))).resolves.toBeUndefined();
  });

  it('does not throw on a page-view request from an anonymous visitor', async () => {
    const { event } = createTestEvent('/api/projects/demo/view/home');
    await expect(Promise.resolve(contentCacheMiddleware(event))).resolves.toBeUndefined();
  });

  it('does not throw when the session helper returns no user', async () => {
    globals.getUserSession = async () => ({ user: undefined });
    const { event } = createTestEvent('/api/projects/demo/view/home');
    await expect(Promise.resolve(contentCacheMiddleware(event))).resolves.toBeUndefined();
  });

  it('marks a cache miss for a signed-in reader', async () => {
    globals.getUserSession = async () => ({ user: { id: 7, email: 'a@b.dev' } });
    const { event, headers } = createTestEvent('/api/projects/demo/view/home');

    await expect(Promise.resolve(contentCacheMiddleware(event))).resolves.toBeUndefined();
    expect(headers['x-cache']).toBe('MISS');
  });

  it('serves a fresh cache entry as a hit', async () => {
    globals.getUserSession = async () => ({ user: { id: 7, email: 'a@b.dev' } });
    store.set('content:demo:7', { content: 'cached body', timestamp: Date.now(), userId: 7 });

    const { event, headers } = createTestEvent('/api/projects/demo/view/home');
    const result = await contentCacheMiddleware(event);

    expect(result).toBe('cached body');
    expect(headers['x-cache']).toBe('HIT');
  });

  it('ignores a stale cache entry', async () => {
    globals.getUserSession = async () => ({ user: { id: 7, email: 'a@b.dev' } });
    store.set('content:demo:7', {
      content: 'stale body',
      // Older than the 5 minute TTL.
      timestamp: Date.now() - 301_000,
      userId: 7,
    });

    const { event, headers } = createTestEvent('/api/projects/demo/view/home');

    await expect(Promise.resolve(contentCacheMiddleware(event))).resolves.toBeUndefined();
    expect(headers['x-cache']).toBe('MISS');
  });
});
