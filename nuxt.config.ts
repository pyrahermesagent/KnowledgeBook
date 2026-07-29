import { fileURLToPath } from 'node:url';

// Nuxt only ships #imports / #app / #build. The server code additionally uses
// #utils, #server and #types, so those are declared here — for Vite and for
// Nitro, which resolves server bundles separately.
const alias = {
  '#utils': fileURLToPath(new URL('./server/utils', import.meta.url)),
  '#server': fileURLToPath(new URL('./server', import.meta.url)),
  '#types': fileURLToPath(new URL('./types', import.meta.url)),
};

export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  modules: ['nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  alias,
  nitro: {
    alias,
    // Nitro defaults esbuild to es2019, which predates BigInt literals — the
    // `0n` in server/utils/token-validation.ts made the build warn that it
    // "may crash at run-time". The Dockerfile runs node:22, so target the
    // runtime we actually ship on.
    esbuild: { options: { target: 'es2022' } },
  },
  runtimeConfig: {
    // Overridable via NUXT_* environment variables (see .env.example)
    databasePath: '.data/knowledgebook.db',
    // nuxt-auth-utils already defaults the session cookie to SameSite=Lax; it is
    // pinned here because the auth model now depends on it. A wallet login POST
    // links the signing wallet to whatever session the request carries, so a
    // cross-site POST that arrived with the victim's cookie would permanently
    // attach an attacker's wallet to the victim's account. Lax is what stops the
    // cookie riding along — too load-bearing to leave as somebody's default.
    session: { cookie: { sameSite: 'lax' } },
    s3: {
      endpoint: '',
      region: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      publicUrl: '',
    },
    uploadsDir: '.data/uploads',
    // Web3 RPC URLs
    ethRpcUrl: '',
    polygonRpcUrl: '',
    arbitrumRpcUrl: '',
    baseRpcUrl: '',
    // Web3 sign-in settings. The domain and URI are bound into the EIP-4361
    // login message and re-checked server side, so they must match the origin
    // the app is actually served from.
    web3: {
      // Comma-separated EIP-155 chain ids accepted in a SIWE login message.
      // Identity is ecosystem-wide, so this only constrains which chain a user
      // may be connected to while signing — not who they are.
      evmChainIds: '1,10,137,8453,42161',
      appDomain: 'localhost:3000',
      appUri: 'http://localhost:3000/login',
    },
    // Master secret for project encryption keys. MUST be set in production —
    // key derivation falls back to a per-boot random value otherwise, which
    // makes previously encrypted content unreadable after a restart.
    encryptionMasterKey: '',
  },
  app: {
    head: {
      title: 'KnowledgeBook',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Create beautiful documentation and guides.' },
      ],
    },
  },
});
