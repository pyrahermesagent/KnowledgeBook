import { describe, it, expect } from 'vitest';
import { buildCorsHeaders } from '../server/routes/mcp';

/**
 * h3 hands every value in the object straight to ServerResponse.setHeader, and
 * Node throws on an undefined one. Emitting the allow-origin key with no
 * allowlisted origin therefore took down the whole endpoint with a 500 rather
 * than just omitting a CORS header.
 */
describe('MCP CORS headers', () => {
  it('never yields an undefined header value', () => {
    const cases: Array<[string | null | undefined, string[]]> = [
      [null, []],
      [undefined, []],
      ['https://evil.test', []],
      ['https://evil.test', ['https://good.test']],
      [null, ['https://good.test']],
    ];

    for (const [origin, allowed] of cases) {
      const headers = buildCorsHeaders(origin, allowed);
      for (const [name, value] of Object.entries(headers)) {
        expect(value, `${name} for origin ${String(origin)}`).toBeTypeOf('string');
      }
    }
  });

  it('omits allow-origin when no Origin header is sent', () => {
    const headers = buildCorsHeaders(null, ['https://good.test']);
    expect(headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('omits allow-origin for an origin that is not allowlisted', () => {
    const headers = buildCorsHeaders('https://evil.test', ['https://good.test']);
    expect(headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('echoes an allowlisted origin', () => {
    const headers = buildCorsHeaders('https://good.test', ['https://good.test']);
    expect(headers['access-control-allow-origin']).toBe('https://good.test');
  });

  it('always advertises the methods and headers the transport needs', () => {
    const headers = buildCorsHeaders(null, []);
    expect(headers['access-control-allow-methods']).toContain('POST');
    expect(headers['access-control-allow-headers']).toContain('mcp-session-id');
    expect(headers['access-control-expose-headers']).toContain('mcp-session-id');
  });

  it('varies on Origin so caches do not cross origins', () => {
    expect(buildCorsHeaders('https://good.test', ['https://good.test']).vary).toBe('Origin');
  });
});
