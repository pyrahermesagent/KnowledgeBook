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
  nitro: { alias },
  runtimeConfig: {
    // Overridable via NUXT_* environment variables (see .env.example)
    databasePath: '.data/knowledgebook.db',
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
      chainId: '1',
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
