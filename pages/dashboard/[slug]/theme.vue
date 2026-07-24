<template>
  <div class="theme-admin">
    <div class="theme-admin-header">
      <h2>Theme Settings</h2>
      <p class="muted">Customize the look and feel of your documentation project</p>
    </div>

    <div class="theme-form">
      <!-- Accent Color -->
      <div class="theme-form-group">
        <label>Accent Color</label>
        <div class="color-picker-row">
          <input
            v-model="theme.accentColor"
            type="color"
            class="color-input"
            title="Accent color for buttons, links, and highlights"
          >
          <input
            v-model="theme.accentColor"
            class="input input-color"
            placeholder="#346ddb"
            @blur="validateColor('accentColor', '#346ddb')"
          >
        </div>
        <p class="hint">Used for primary actions, links, and highlights</p>
      </div>

      <!-- Font Family -->
      <div class="theme-form-group">
        <label>Font Family</label>
        <select v-model="theme.fontFamily" class="input select-font">
          <option value="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, sans-serif">
            System Sans (Default)
          </option>
          <option value="Georgia, serif">Georgia (Serif)</option>
          <option value="'Courier New', Courier, monospace">Courier (Mono)</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="'Times New Roman', Times, serif">Times New Roman</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="system-ui, -apple-system, sans-serif">System UI</option>
          <option value="'Inter', -apple-system, BlinkMacSystemFont, sans-serif">Inter</option>
          <option value="'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif">Open Sans</option>
        </select>
        <p class="hint">Choose a font for your documentation</p>
      </div>

      <!-- Background Color -->
      <div class="theme-form-group">
        <label>Background Color</label>
        <div class="color-picker-row">
          <input
            v-model="theme.bgColor"
            type="color"
            class="color-input"
            title="Main background color"
          >
          <input
            v-model="theme.bgColor"
            class="input input-color"
            placeholder="#ffffff"
            @blur="validateColor('bgColor', '#ffffff')"
          >
        </div>
      </div>

      <!-- Text Color -->
      <div class="theme-form-group">
        <label>Text Color</label>
        <div class="color-picker-row">
          <input
            v-model="theme.textColor"
            type="color"
            class="color-input"
            title="Primary text color"
          >
          <input
            v-model="theme.textColor"
            class="input input-color"
            placeholder="#1f2430"
            @blur="validateColor('textColor', '#1f2430')"
          >
        </div>
      </div>

      <!-- Border Radius -->
      <div class="theme-form-group">
        <label>Border Radius</label>
        <div class="range-control">
          <input
            type="range"
            v-model.number="theme.radius"
            min="0"
            max="20"
            class="input input-range"
            title="Rounded corners radius"
          >
          <span class="range-value">{{ theme.radius }}px</span>
        </div>
        <p class="hint">Controls how rounded the corners are on buttons and cards</p>
      </div>
    </div>

    <div class="theme-preview-section">
      <h3>Live Preview</h3>
      <div class="theme-preview-box" :style="previewStyle">
        <div class="preview-card">
          <h4>Preview Card</h4>
          <p class="preview-text">This is how your theme will look to your readers.</p>
          <button class="btn btn-primary">Primary Button</button>
          <button class="btn">Secondary Button</button>
        </div>
        <div class="preview-text-block">
          <p class="preview-text">Example paragraph with <a href="#" class="preview-link">link</a> text.</p>
          <p class="preview-text muted">Muted text for secondary information.</p>
        </div>
      </div>
    </div>

    <div class="theme-actions">
      <button class="btn btn-primary" @click="saveTheme" :disabled="saving">
        {{ saving ? 'Saving...' : 'Save Theme' }}
      </button>
      <button class="btn" @click="resetTheme">Reset to Default</button>
    </div>

    <div v-if="saveMessage" class="save-message" :class="saveMessage.type">
      {{ saveMessage.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps<{
  theme: {
    accentColor: string
    fontFamily: string
    bgColor: string
    textColor: string
    borderColor: string
    radius: number
  }
}>()

const emit = defineEmits<{
  (e: 'update:theme', theme: typeof props.theme): void
}>()

const route = useRoute()
const slug = computed(() => route.params.slug as string)

const localTheme = ref({ ...props.theme })
const saving = ref(false)
const saveMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

watch(localTheme, (newTheme) => {
  emit('update:theme', newTheme)
}, { deep: true })

const previewStyle = computed(() => ({
  '--accent': localTheme.value.accentColor,
  '--accent-soft': colorMix(localTheme.value.accentColor, 'transparent', 12),
  '--bg': localTheme.value.bgColor,
  '--bg-subtle': colorMix(localTheme.value.accentColor, 'transparent', 12),
  '--border': localTheme.value.borderColor,
  '--text': localTheme.value.textColor,
  '--text-muted': colorMix(localTheme.value.textColor, '#000000', 40),
  '--radius': `${localTheme.value.radius}px`,
  '--font': localTheme.value.fontFamily
}))

function colorMix (color1: string, color2: string, percent: number) {
  // Simple color mixing approximation for CSS
  return `color-mix(in srgb, ${color1} ${percent}%, ${color2})`
}

function debounce (fn: () => void, delay: number) {
  let timer: number | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, delay)
  }
}

const debouncedSave = debounce(async () => {
  await saveTheme()
}, 500)

async function saveTheme () {
  saving.value = true
  saveMessage.value = null
  try {
    await $fetch(`/api/projects/${slug.value}/theme`, {
      method: 'PATCH',
      body: localTheme.value
    })
    saveMessage.value = { type: 'success', text: 'Theme saved successfully!' }
  } catch (e: any) {
    saveMessage.value = { type: 'error', text: e.data?.message ?? 'Failed to save theme' }
  } finally {
    saving.value = false
  }
}

function resetTheme () {
  localTheme.value = {
    accentColor: '#346ddb',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    bgColor: '#ffffff',
    textColor: '#1f2430',
    borderColor: '#e5e8ec',
    radius: 8
  }
  saveTheme()
}

function validateColor (field: string, defaultValue: string) {
  const value = localTheme.value[field as keyof typeof localTheme.value] as string
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    localTheme.value[field as keyof typeof localTheme.value] = defaultValue
  }
}

const { data: themeData, refresh: refreshTheme } = await useFetch(`/api/projects/${slug.value}/theme`)
onMounted(() => {
  if (themeData.value) {
    localTheme.value = themeData.value
  }
})
</script>

<style scoped>
.theme-admin { padding: 20px; max-width: 800px; margin: 0 auto; }

.theme-admin-header { margin-bottom: 32px; }
.theme-admin-header h2 { margin: 0 0 8px; font-size: 26px; }
.theme-admin-header .muted { margin: 0; font-size: 15px; }

.theme-form { background: var(--bg-subtle); padding: 24px; border-radius: var(--radius); margin-bottom: 32px; }

.theme-form-group { margin-bottom: 24px; }
.theme-form-group label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px; }
.theme-form-group .hint { margin: 4px 0 0; font-size: 13px; color: var(--text-muted); }

.color-picker-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.color-input { width: 60px; height: 40px; padding: 4px; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
.input-color { flex: 1; max-width: 180px; }

.range-control { display: flex; align-items: center; gap: 12px; }
.range-value { min-width: 50px; font-weight: 600; color: var(--text-muted); }

.theme-preview-section { margin-bottom: 32px; }
.theme-preview-section h3 { margin: 0 0 16px; font-size: 18px; }

.theme-preview-box {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  overflow: hidden;
}
.preview-card {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 2);
  padding: 24px;
  margin-bottom: 16px;
}
.preview-card h4 { margin: 0 0 8px; }
.preview-text { margin: 0 0 12px; color: var(--text); }
.preview-text.muted { color: var(--text-muted); }
.preview-link { color: var(--accent); text-decoration: none; }
.preview-link:hover { text-decoration: underline; }

.theme-actions { display: flex; gap: 12px; margin-bottom: 24px; }

.save-message { padding: 12px 16px; border-radius: var(--radius); margin-top: 16px; }
.save-message.success { background: #d1fae5; color: #065f46; border: 1px solid #34d399; }
.save-message.error { background: #fee2e2; color: #991b1b; border: 1px solid #f87171; }
</style>
