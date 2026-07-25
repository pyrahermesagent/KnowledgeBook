/**
 * Test stand-in for Nuxt's virtual `#imports` module.
 *
 * Server modules import useRuntimeConfig from '#imports'; under vitest that
 * specifier is aliased here, and the implementation is the same global the
 * setup file installs.
 */
export function useRuntimeConfig(): any {
  return (globalThis as Record<string, any>).useRuntimeConfig();
}
