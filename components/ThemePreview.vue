<template>
  <div class="theme-preview">
    <div class="theme-header">
      <h2>Theme Preview</h2>
      <p class="muted">See how your theme settings look in action</p>
    </div>
    
    <div class="theme-grid">
      <div class="theme-card" :style="getCardStyle(--accent)">
        <h3>Accent Color</h3>
        <p class="muted">Used for buttons, links, and highlights</p>
        <div class="color-swatch" :style="{ backgroundColor: theme.accentColor }"></div>
      </div>
      
      <div class="theme-card" :style="getCardStyle(--bg)">
        <h3>Background</h3>
        <p class="muted">Main page background color</p>
        <div class="color-swatch" :style="{ backgroundColor: theme.bgColor }"></div>
      </div>
      
      <div class="theme-card" :style="getCardStyle(--text)">
        <h3>Text Color</h3>
        <p class="muted">Primary text color</p>
        <div class="color-swatch" :style="{ backgroundColor: theme.textColor }"></div>
      </div>
    </div>
    
    <div class="theme-controls">
      <h3>Font Settings</h3>
      <select v-model="theme.fontFamily" class="input" @change="applyTheme">
        <option value="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, sans-serif">
          System Sans (Default)
        </option>
        <option value="Georgia, serif">Georgia (Serif)</option>
        <option value="'Courier New', Courier, monospace">Courier (Mono)</option>
        <option value="Arial, sans-serif">Arial</option>
        <option value="'Times New Roman', Times, serif">Times New Roman</option>
        <option value="Verdana, sans-serif">Verdana</option>
        <option value="system-ui, -apple-system, sans-serif">System UI</option>
      </select>
    </div>
    
    <div class="theme-controls">
      <h3>Border Radius</h3>
      <input type="range" v-model.number="theme.radius" min="0" max="20" class="input" @input="applyTheme">
      <p class="muted">{{ theme.radius }}px</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

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

const localTheme = ref({ ...props.theme })

watch(localTheme, (newTheme) => {
  emit('update:theme', newTheme)
}, { deep: true })

function getCardStyle (colorVar: string) {
  return { [colorVar]: localTheme.value.accentColor }
}

function applyTheme () {
  // Theme is already applied via the watch
}
</script>

<style scoped>
.theme-preview { padding: 20px; }

.theme-header { margin-bottom: 24px; }
.theme-header h2 { margin: 0 0 8px; font-size: 22px; }
.theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }

.theme-card {
  padding: 20px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  text-align: center;
}
.theme-card h3 { margin: 0 0 8px; font-size: 16px; }
.theme-card .muted { margin: 0 0 12px; font-size: 13px; }
.color-swatch {
  width: 80px;
  height: 80px;
  margin: 0 auto;
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.theme-controls { margin-bottom: 24px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); }
.theme-controls h3 { margin: 0 0 12px; font-size: 16px; }
.theme-controls input[type="range"] { width: 100%; margin: 8px 0; }
</style>
