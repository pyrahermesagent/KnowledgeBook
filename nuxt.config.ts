export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  modules: ['nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Overridable via NUXT_* environment variables (see .env.example)
    databasePath: '.data/knowledgebook.db',
    s3: {
      endpoint: '',
      region: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      publicUrl: ''
    },
    uploadsDir: '.data/uploads'
  },
  app: {
    head: {
      title: 'KnowledgeBook',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Create beautiful documentation and guides.' }
      ]
    }
  }
})
