/**
 * Minimal stand-ins for the Nuxt/Nitro auto-imports the server code relies on.
 *
 * Without these, importing anything under server/ throws ReferenceError under
 * plain vitest, which is why the original tests re-implemented the logic they
 * meant to cover instead of importing it. Registering them as globals lets the
 * tests exercise the real modules.
 */

export interface TestRuntimeConfig {
  databasePath: string
  ethRpcUrl: string
  polygonRpcUrl: string
  arbitrumRpcUrl: string
  baseRpcUrl: string
  encryptionMasterKey: string
  web3: { chainId: string; appDomain: string; appUri: string }
  session: { password: string }
}

const runtimeConfig: TestRuntimeConfig = {
  databasePath: ':memory:',
  ethRpcUrl: 'https://rpc.test/eth',
  polygonRpcUrl: 'https://rpc.test/polygon',
  arbitrumRpcUrl: 'https://rpc.test/arbitrum',
  baseRpcUrl: 'https://rpc.test/base',
  encryptionMasterKey: 'test-master-secret-0123456789abcdef0123456789abcdef',
  web3: {
    chainId: '1',
    appDomain: 'test.knowledgebook.app',
    appUri: 'https://test.knowledgebook.app/login',
  },
  session: { password: 'test-session-password-at-least-32-chars' },
}

/** Mutate the runtime config a test sees. */
export function setRuntimeConfig(patch: Partial<TestRuntimeConfig>): void {
  Object.assign(runtimeConfig, patch)
}

export function getTestRuntimeConfig(): TestRuntimeConfig {
  return runtimeConfig
}

/** Error shape matching h3's createError closely enough for assertions. */
export class TestHttpError extends Error {
  statusCode: number
  data?: unknown

  constructor(opts: { statusCode?: number; message?: string; data?: unknown }) {
    super(opts.message ?? 'Error')
    this.statusCode = opts.statusCode ?? 500
    this.data = opts.data
  }
}

const globals = globalThis as Record<string, unknown>

globals.useRuntimeConfig = () => runtimeConfig
// Bound lazily: server/utils/db.ts reads useRuntimeConfig() at call time, so
// the global above must already be installed before the module is imported.
globals.useDb = (...args: unknown[]) =>
  (globals.__useDbImpl as ((...a: unknown[]) => unknown))(...args)
globals.createError = (opts: { statusCode?: number; message?: string; data?: unknown }) =>
  new TestHttpError(opts)
globals.getRequestIP = (event: { ip?: string } | undefined) => event?.ip ?? '127.0.0.1'
globals.getRouterParam = (event: { params?: Record<string, string> } | undefined, key: string) =>
  event?.params?.[key]
