<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const slug = route.params.slug as string

const { data: project, refresh: refreshTree, error } = await useFetch(`/api/projects/${slug}`)
if (error.value) throw createError({ statusCode: 404, message: 'Project not found' })

interface PageStub { id: number, slug: string, title: string }

// ---------- current page + autosave ----------
const currentPageId = ref<number | null>(null)
const pageTitle = ref('')
const pageContent = ref('')
const saveState = ref<'saved' | 'saving' | 'dirty' | 'error'>('saved')
const showPreview = ref(true)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let loading = false

const firstPage = computed<PageStub | null>(() =>
  (project.value?.sections.flatMap((s: any) => s.pages)[0] as PageStub) ?? null)

async function openPage (id: number) {
  if (saveTimer) { clearTimeout(saveTimer); await saveNow() }
  loading = true
  const page = await $fetch<any>(`/api/projects/${slug}/pages/${id}`)
  currentPageId.value = page.id
  pageTitle.value = page.title
  pageContent.value = page.content
  saveState.value = 'saved'
  await nextTick()
  loading = false
}

watch([pageTitle, pageContent], () => {
  if (loading || currentPageId.value == null) return
  saveState.value = 'dirty'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 900)
})

async function saveNow () {
  saveTimer = null
  if (currentPageId.value == null || saveState.value === 'saved') return
  const id = currentPageId.value
  saveState.value = 'saving'
  try {
    await $fetch(`/api/projects/${slug}/pages/${id}`, {
      method: 'PATCH',
      body: { title: pageTitle.value, content: pageContent.value }
    })
    if (saveState.value === 'saving') saveState.value = 'saved'
    const stub = project.value?.sections.flatMap((s: any) => s.pages).find((p: PageStub) => p.id === id)
    if (stub) stub.title = pageTitle.value
  } catch {
    saveState.value = 'error'
  }
}

// Flush pending edits when the tab closes.
onMounted(() => window.addEventListener('beforeunload', saveNow))
onBeforeUnmount(() => { window.removeEventListener('beforeunload', saveNow); saveNow() })

// ---------- sections & pages ----------
async function addSection () {
  const title = prompt('Section title')?.trim()
  if (!title) return
  await $fetch(`/api/projects/${slug}/sections`, { method: 'POST', body: { title } })
  await refreshTree()
}

async function renameSection (section: any) {
  const title = prompt('Section title', section.title)?.trim()
  if (!title || title === section.title) return
  await $fetch(`/api/projects/${slug}/sections/${section.id}`, { method: 'PATCH', body: { title } })
  await refreshTree()
}

async function deleteSection (section: any) {
  if (!confirm(`Delete section "${section.title}" and all its pages?`)) return
  await $fetch(`/api/projects/${slug}/sections/${section.id}`, { method: 'DELETE' })
  if (section.pages.some((p: PageStub) => p.id === currentPageId.value)) currentPageId.value = null
  await refreshTree()
}

async function addPage (sectionId: number) {
  const title = prompt('Page title')?.trim()
  if (!title) return
  const { id } = await $fetch<any>(`/api/projects/${slug}/pages`, { method: 'POST', body: { title, sectionId } })
  await refreshTree()
  await openPage(id)
}

async function deletePage (page: PageStub) {
  if (!confirm(`Delete page "${page.title}"?`)) return
  await $fetch(`/api/projects/${slug}/pages/${page.id}`, { method: 'DELETE' })
  if (currentPageId.value === page.id) currentPageId.value = null
  await refreshTree()
}

async function movePage (section: any, index: number, delta: number) {
  const other = section.pages[index + delta]
  if (!other) return
  const page = section.pages[index]
  await Promise.all([
    $fetch(`/api/projects/${slug}/pages/${page.id}`, { method: 'PATCH', body: { position: index + delta } }),
    $fetch(`/api/projects/${slug}/pages/${other.id}`, { method: 'PATCH', body: { position: index } })
  ])
  await refreshTree()
}

// ---------- uploads ----------
const editorEl = ref<HTMLTextAreaElement>()
const uploading = ref(false)

async function uploadFile (file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await $fetch<{ url: string }>(`/api/projects/${slug}/upload`, { method: 'POST', body: form })
  return res.url
}

async function insertUpload (event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  try {
    const url = await uploadFile(file)
    const snippet = file.type.startsWith('image/') ? `![${file.name}](${url})` : `[${file.name}](${url})`
    const el = editorEl.value
    if (el) {
      const pos = el.selectionStart ?? pageContent.value.length
      pageContent.value = pageContent.value.slice(0, pos) + snippet + pageContent.value.slice(pos)
    } else {
      pageContent.value += `\n${snippet}`
    }
  } catch (e: any) {
    alert(e.data?.message ?? 'Upload failed')
  } finally {
    uploading.value = false
  }
}

// ---------- settings ----------
const showSettings = ref(false)
const settings = reactive({ name: '', description: '', accentColor: '#346ddb', iconUrl: '' })
const savingSettings = ref(false)

function openSettings () {
  settings.name = project.value!.name
  settings.description = project.value!.description
  settings.accentColor = project.value!.accentColor
  settings.iconUrl = project.value!.iconUrl
  showSettings.value = true
}

async function uploadIcon (event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  settings.iconUrl = await uploadFile(file)
}

async function saveSettings () {
  savingSettings.value = true
  try {
    await $fetch(`/api/projects/${slug}`, { method: 'PATCH', body: { ...settings } })
    showSettings.value = false
    await refreshTree()
  } catch (e: any) {
    alert(e.data?.message ?? 'Failed to save settings')
  } finally {
    savingSettings.value = false
  }
}

async function deleteProject () {
  if (!confirm(`Delete project "${project.value?.name}" permanently? This cannot be undone.`)) return
  await $fetch(`/api/projects/${slug}`, { method: 'DELETE' })
  await navigateTo('/dashboard')
}

// Open the first page initially (client only — content fetch requires the session).
onMounted(() => { if (firstPage.value) openPage(firstPage.value.id) })

const saveLabel = computed(() => ({
  saved: 'Saved', saving: 'Saving…', dirty: 'Unsaved changes…', error: 'Save failed — retrying on next edit'
}[saveState.value]))

useHead({ title: () => `${project.value?.name ?? 'Editor'} · KnowledgeBook` })
</script>

<template>
  <div v-if="project" class="editor" :style="{ '--accent': project.accentColor }">
    <aside class="editor-sidebar">
      <div class="sidebar-top">
        <NuxtLink to="/dashboard" class="btn btn-ghost btn-sm">← Projects</NuxtLink>
      </div>
      <div class="sidebar-project">
        <ProjectIcon :name="project.name" :icon-url="project.iconUrl" :size="34" />
        <div class="sidebar-project-name">
          <strong>{{ project.name }}</strong>
          <NuxtLink :to="`/${project.slug}`" target="_blank" class="muted view-link">/{{ project.slug }} ↗</NuxtLink>
        </div>
      </div>

      <nav class="sidebar-tree">
        <div v-for="section in project.sections" :key="section.id" class="tree-section">
          <div class="tree-section-title">
            <span>{{ section.title }}</span>
            <span class="tree-actions">
              <button class="icon-btn" title="Add page" @click="addPage(section.id)">＋</button>
              <button class="icon-btn" title="Rename section" @click="renameSection(section)">✎</button>
              <button class="icon-btn" title="Delete section" @click="deleteSection(section)">🗑</button>
            </span>
          </div>
          <div
            v-for="(page, i) in section.pages"
            :key="page.id"
            class="tree-page"
            :class="{ active: page.id === currentPageId }"
          >
            <button class="tree-page-title" @click="openPage(page.id)">{{ page.title }}</button>
            <span class="tree-actions">
              <button class="icon-btn" title="Move up" :disabled="i === 0" @click="movePage(section, i, -1)">↑</button>
              <button class="icon-btn" title="Move down" :disabled="i === section.pages.length - 1" @click="movePage(section, i, 1)">↓</button>
              <button class="icon-btn" title="Delete page" @click="deletePage(page)">🗑</button>
            </span>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm add-section" @click="addSection">+ Add section</button>
      </nav>

      <div class="sidebar-bottom">
        <button class="btn btn-sm" @click="openSettings">⚙ Project settings</button>
      </div>
    </aside>

    <main class="editor-main">
      <template v-if="currentPageId != null">
        <div class="editor-toolbar">
          <input v-model="pageTitle" class="input title-input" placeholder="Page title">
          <label class="btn btn-sm upload-btn">
            {{ uploading ? 'Uploading…' : '📎 Insert image / file' }}
            <input type="file" hidden :disabled="uploading" @change="insertUpload">
          </label>
          <button class="btn btn-sm" @click="showPreview = !showPreview">
            {{ showPreview ? 'Hide preview' : 'Show preview' }}
          </button>
          <span class="muted save-state" :class="saveState">{{ saveLabel }}</span>
        </div>
        <div class="editor-panes" :class="{ single: !showPreview }">
          <textarea
            ref="editorEl"
            v-model="pageContent"
            class="editor-textarea"
            placeholder="Write markdown here…"
            spellcheck="false"
          />
          <div v-if="showPreview" class="editor-preview">
            <MarkdownView :source="pageContent" />
          </div>
        </div>
      </template>
      <div v-else class="editor-empty muted">
        Select a page on the left, or create one to start writing.
      </div>
    </main>

    <div v-if="showSettings" class="modal-backdrop" @click.self="showSettings = false">
      <div class="modal">
        <h2>Project settings</h2>
        <label>Name
          <input v-model="settings.name" class="input">
        </label>
        <label>Description
          <textarea v-model="settings.description" class="input" rows="2" />
        </label>
        <label>Accent color
          <span class="color-row">
            <input v-model="settings.accentColor" type="color" class="color-input">
            <input v-model="settings.accentColor" class="input" style="max-width: 120px">
          </span>
        </label>
        <label>Icon
          <span class="color-row">
            <ProjectIcon :name="settings.name" :icon-url="settings.iconUrl" :size="40" />
            <label class="btn btn-sm">
              Upload icon
              <input type="file" accept="image/*" hidden @change="uploadIcon">
            </label>
            <button v-if="settings.iconUrl" class="btn btn-sm" @click="settings.iconUrl = ''">Remove</button>
          </span>
        </label>
        <div class="modal-actions">
          <button class="btn btn-danger" @click="deleteProject">Delete project</button>
          <span style="flex: 1" />
          <button class="btn" @click="showSettings = false">Cancel</button>
          <button class="btn btn-primary" :disabled="savingSettings" @click="saveSettings">
            {{ savingSettings ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor { display: flex; height: 100vh; }
.editor-sidebar {
  width: var(--sidebar-width);
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-top { padding: 10px 12px 0; }
.sidebar-project { display: flex; gap: 10px; align-items: center; padding: 12px 16px; }
.sidebar-project-name { display: grid; line-height: 1.3; }
.view-link { font-size: 12px; }
.sidebar-tree { flex: 1; overflow-y: auto; padding: 8px; }
.tree-section { margin-bottom: 14px; }
.tree-section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 4px 8px;
}
.tree-page {
  display: flex;
  align-items: center;
  border-radius: 6px;
}
.tree-page.active { background: var(--accent-soft); }
.tree-page.active .tree-page-title { color: var(--accent); font-weight: 600; }
.tree-page-title {
  flex: 1;
  text-align: left;
  background: none;
  border: none;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-actions { display: none; gap: 2px; }
.tree-page:hover .tree-actions, .tree-section-title:hover .tree-actions { display: inline-flex; }
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--text-muted);
  border-radius: 4px;
}
.icon-btn:hover:not(:disabled) { background: var(--border); color: var(--text); }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.add-section { margin: 4px 8px; }
.sidebar-bottom { padding: 12px; border-top: 1px solid var(--border); }

.editor-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.editor-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}
.title-input { max-width: 340px; font-weight: 600; }
.upload-btn { cursor: pointer; }
.save-state { margin-left: auto; font-size: 13px; white-space: nowrap; }
.save-state.saved { color: #27ae60; }
.save-state.error { color: #c0392b; }
.editor-panes { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
.editor-panes.single { grid-template-columns: 1fr; }
.editor-textarea {
  border: none;
  outline: none;
  resize: none;
  padding: 24px;
  font-family: var(--mono);
  font-size: 14px;
  line-height: 1.7;
  background: var(--bg);
}
.editor-preview { border-left: 1px solid var(--border); padding: 24px; overflow-y: auto; }
.editor-empty { flex: 1; display: flex; align-items: center; justify-content: center; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.modal {
  background: var(--bg);
  border-radius: var(--radius);
  padding: 24px;
  width: min(460px, 92vw);
  display: grid;
  gap: 14px;
}
.modal h2 { margin: 0; }
.modal label { display: grid; gap: 4px; font-size: 14px; font-weight: 500; }
.color-row { display: flex; align-items: center; gap: 10px; }
.color-input { width: 44px; height: 34px; padding: 2px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); cursor: pointer; }
.modal-actions { display: flex; gap: 8px; margin-top: 8px; }
</style>
