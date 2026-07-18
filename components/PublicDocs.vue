<script setup lang="ts">
import { ArrowLeft, ArrowRight, Pencil, Menu, X } from 'lucide-vue-next'

const props = defineProps<{ projectSlug: string, pageSlug?: string }>()

const { data: project, error } = await useFetch(`/api/projects/${props.projectSlug}`)
if (error.value || !project.value) {
  throw createError({ statusCode: 404, message: 'This documentation does not exist', fatal: true })
}

const navOpen = ref(false)
const allPages = computed(() => project.value!.sections.flatMap((s: any) => s.pages))
const activeSlug = computed(() => props.pageSlug ?? allPages.value[0]?.slug)

const { data: page, error: pageError } = await useFetch(
  () => `/api/projects/${props.projectSlug}/view/${activeSlug.value}`,
  { immediate: Boolean(activeSlug.value) }
)
if (props.pageSlug && pageError.value) {
  throw createError({ statusCode: 404, message: 'Page not found', fatal: true })
}

watch(activeSlug, () => { navOpen.value = false })

const activeIndex = computed(() => allPages.value.findIndex((p: any) => p.slug === activeSlug.value))
const prevPage = computed(() => allPages.value[activeIndex.value - 1])
const nextPage = computed(() => allPages.value[activeIndex.value + 1])

useHead({
  title: () => page.value ? `${page.value.title} · ${project.value!.name}` : project.value!.name,
  meta: [{ name: 'description', content: () => project.value?.description ?? '' }]
})
</script>

<template>
  <div class="docs" :style="{ '--accent': project!.accentColor }">
    <header class="docs-mobile-bar">
      <button class="nav-toggle" :title="navOpen ? 'Close navigation' : 'Open navigation'" @click="navOpen = !navOpen">
        <component :is="navOpen ? X : Menu" :size="20" />
      </button>
      <ProjectIcon :name="project!.name" :icon-url="project!.iconUrl" :size="26" />
      <strong class="docs-mobile-title">{{ project!.name }}</strong>
    </header>

    <div v-if="navOpen" class="nav-backdrop" @click="navOpen = false" />
    <aside class="docs-sidebar" :class="{ open: navOpen }">
      <NuxtLink :to="`/${project!.slug}`" class="docs-brand">
        <ProjectIcon :name="project!.name" :icon-url="project!.iconUrl" :size="34" />
        <div>
          <strong>{{ project!.name }}</strong>
          <div v-if="project!.description" class="muted docs-desc">{{ project!.description }}</div>
        </div>
      </NuxtLink>

      <nav class="docs-nav">
        <div v-for="section in project!.sections" :key="section.id" class="docs-section">
          <div v-if="section.pages.length" class="docs-section-title">{{ section.title }}</div>
          <NuxtLink
            v-for="p in section.pages"
            :key="p.id"
            :to="`/${project!.slug}/${p.slug}`"
            class="docs-link"
            :class="{ active: p.slug === activeSlug }"
          >
            {{ p.title }}
          </NuxtLink>
        </div>
      </nav>

      <div class="docs-footer">
        <NuxtLink v-if="project!.canEdit" :to="`/dashboard/${project!.slug}`" class="btn btn-sm">
          <Pencil :size="14" /> Edit
        </NuxtLink>
        <NuxtLink to="/" class="muted powered">Powered by KnowledgeBook</NuxtLink>
      </div>
    </aside>

    <main class="docs-main">
      <article v-if="page">
        <MarkdownView :source="page.content" />
        <div class="docs-pager">
          <NuxtLink v-if="prevPage" :to="`/${project!.slug}/${prevPage.slug}`" class="pager-link">
            <ArrowLeft :size="15" /> {{ prevPage.title }}
          </NuxtLink>
          <span v-else />
          <NuxtLink v-if="nextPage" :to="`/${project!.slug}/${nextPage.slug}`" class="pager-link next">
            {{ nextPage.title }} <ArrowRight :size="15" />
          </NuxtLink>
        </div>
        <p class="muted updated">Last updated {{ new Date(page.updated_at + 'Z').toLocaleDateString() }}</p>
      </article>
      <p v-else class="muted">This documentation has no pages yet.</p>
    </main>
  </div>
</template>

<style scoped>
.docs { display: flex; min-height: 100vh; min-height: 100dvh; }
.docs-mobile-bar, .nav-backdrop, .nav-toggle { display: none; }
.docs-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
}
.docs-brand {
  display: flex;
  gap: 10px;
  padding: 18px 16px;
  color: var(--text);
  text-decoration: none !important;
  border-bottom: 1px solid var(--border);
  align-items: center;
}
.docs-desc {
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.docs-nav { flex: 1; overflow-y: auto; padding: 12px 8px; }
.docs-section { margin-bottom: 16px; }
.docs-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 4px 10px;
}
.docs-link {
  display: block;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--text);
  text-decoration: none !important;
  font-size: 14px;
}
.docs-link:hover { background: var(--accent-soft); }
.docs-link.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.docs-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.powered { font-size: 11px; }
.docs-main { flex: 1; padding: 48px 56px; min-width: 0; }
.docs-pager {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 56px;
  max-width: 760px;
}
.pager-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 18px;
  text-decoration: none !important;
  font-weight: 500;
}
.pager-link:hover { border-color: var(--accent); }
.updated { font-size: 12px; margin-top: 24px; }

/* Image sizes - GitBook-inspired sizing */
.image-size-small {
  width: 150px;
  height: auto;
  display: block;
  margin: 0 auto 16px;
}
.image-size-medium {
  width: 300px;
  height: auto;
  display: block;
  margin: 0 auto 16px;
}
.image-size-large {
  width: 100%;
  max-width: 800px;
  height: auto;
  display: block;
  margin: 0 auto 16px;
}

@media (max-width: 760px) {
  .docs-mobile-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    position: sticky;
    top: 0;
    z-index: 21;
    padding: 10px 12px;
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
  }
  .docs-mobile-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    color: var(--text);
  }
  .nav-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 19;
    background: rgba(0, 0, 0, 0.35);
  }
  .docs { flex-direction: column; }
  .docs-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 20;
    max-width: 85vw;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
  }
  .docs-sidebar.open { transform: translateX(0); }
  .docs-main { padding: 24px 20px; }
  .docs-pager { flex-direction: column; }
  .pager-link.next { justify-content: flex-end; }
}
</style>
