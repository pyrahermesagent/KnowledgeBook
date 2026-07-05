<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { user, clear } = useUserSession()
const { data: projects, refresh } = await useFetch('/api/projects')

const showCreate = ref(false)
const newName = ref('')
const newSlug = ref('')
const newDescription = ref('')
const slugTouched = ref(false)
const creating = ref(false)
const createError = ref('')

const showImport = ref(false)
const importUrl = ref('')
const importing = ref(false)
const importError = ref('')

watch(newName, (name) => {
  if (!slugTouched.value) newSlug.value = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
})

async function createProject () {
  creating.value = true
  createError.value = ''
  try {
    const { slug } = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: newName.value, slug: newSlug.value, description: newDescription.value }
    })
    await navigateTo(`/dashboard/${slug}`)
  } catch (e: any) {
    createError.value = e.data?.message ?? 'Failed to create project'
  } finally {
    creating.value = false
  }
}

async function importFromGitBook () {
  importing.value = true
  importError.value = ''
  try {
    const { slug } = await $fetch('/api/projects/import-gitbook', {
      method: 'POST',
      body: { url: importUrl.value }
    })
    await navigateTo(`/dashboard/${slug}`)
  } catch (e: any) {
    importError.value = e.data?.message ?? 'Import failed — check the URL and try again'
  } finally {
    importing.value = false
  }
}

async function logout () {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/')
}
</script>

<template>
  <div class="dash">
    <header class="dash-header">
      <NuxtLink to="/" class="brand">📖 KnowledgeBook</NuxtLink>
      <div class="user">
        <img v-if="user?.avatar" :src="user.avatar" alt="" class="avatar">
        <span class="muted">{{ user?.name || user?.email }}</span>
        <button class="btn btn-sm" @click="logout">Sign out</button>
      </div>
    </header>

    <main class="dash-main">
      <div class="dash-title">
        <h1>Your projects</h1>
        <div class="dash-actions">
          <button class="btn" @click="showImport = !showImport; showCreate = false">Import from GitBook</button>
          <button class="btn btn-primary" @click="showCreate = !showCreate; showImport = false">+ New project</button>
        </div>
      </div>

      <form v-if="showImport" class="create-card" @submit.prevent="importFromGitBook">
        <label>GitBook URL
          <input v-model="importUrl" class="input" type="url" placeholder="https://docs.example.com" required :disabled="importing">
        </label>
        <p class="muted import-hint">
          Paste the address of a published GitBook site. All of its sections and pages are imported
          into a new project as markdown.
        </p>
        <p v-if="importError" class="error">{{ importError }}</p>
        <button class="btn btn-primary" :disabled="importing">{{ importing ? 'Importing… this can take a minute' : 'Import documentation' }}</button>
      </form>

      <form v-if="showCreate" class="create-card" @submit.prevent="createProject">
        <label>Name
          <input v-model="newName" class="input" placeholder="My Product Docs" required>
        </label>
        <label>Link
          <div class="slug-row">
            <span class="muted">/</span>
            <input v-model="newSlug" class="input" placeholder="my-product-docs" @input="slugTouched = true">
          </div>
        </label>
        <label>Description
          <input v-model="newDescription" class="input" placeholder="What is this documentation about?">
        </label>
        <p v-if="createError" class="error">{{ createError }}</p>
        <button class="btn btn-primary" :disabled="creating">{{ creating ? 'Creating…' : 'Create project' }}</button>
      </form>

      <div v-if="projects?.length" class="grid">
        <NuxtLink v-for="p in projects" :key="p.slug" :to="`/dashboard/${p.slug}`" class="card" :style="{ '--accent': p.accent_color }">
          <div class="card-head">
            <ProjectIcon :name="p.name" :icon-url="p.icon_url" :size="36" />
            <div>
              <strong>{{ p.name }}</strong>
              <div class="muted card-slug">/{{ p.slug }}</div>
            </div>
          </div>
          <p class="muted card-desc">{{ p.description || 'No description yet.' }}</p>
        </NuxtLink>
      </div>
      <p v-else-if="!showCreate" class="muted empty">
        No projects yet — create your first documentation project to get started.
      </p>
    </main>
  </div>
</template>

<style scoped>
.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 32px;
  border-bottom: 1px solid var(--border);
}
.brand { font-weight: 700; color: var(--text); text-decoration: none !important; }
.user { display: flex; align-items: center; gap: 10px; }
.avatar { width: 28px; height: 28px; border-radius: 50%; }
.dash-main { max-width: 960px; margin: 0 auto; padding: 32px 24px; }
.dash-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.dash-title h1 { margin: 0; font-size: 26px; }
.dash-actions { display: flex; gap: 8px; }
.import-hint { margin: 0; font-size: 13px; }
.create-card {
  display: grid;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 28px;
  background: var(--bg-subtle);
}
.create-card label { display: grid; gap: 4px; font-size: 14px; font-weight: 500; }
.slug-row { display: flex; align-items: center; gap: 4px; }
.error { color: #c0392b; margin: 0; font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  color: var(--text);
  text-decoration: none !important;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.card:hover { border-color: var(--accent); box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.card-head { display: flex; gap: 12px; align-items: center; }
.card-slug { font-size: 13px; }
.card-desc { font-size: 14px; margin: 12px 0 0; }
.empty { text-align: center; padding: 64px 0; }
</style>
