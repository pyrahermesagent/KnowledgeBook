<template>
  <div class="theme-toggle">
    <button
      class="btn btn-ghost"
      :aria-label="`Theme: ${activeTheme.name}`"
      @click="toggleTheme"
    >
      <span class="icon">{{ themeIcon }}</span>
      <span class="label">{{ activeTheme.name }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useThemeManager } from '~/composables/useThemeManager';

const { activeTheme, toggleTheme, themes } = useThemeManager();

// Get theme icon based on current theme
const themeIcon = computed(() => {
  const type = activeTheme.value.type;
  if (type === 'dark') return '🌙';
  if (type === 'auto') return '☀️';
  return '☀️';
});

// Get theme name label (with system indicator for auto)
const themeLabel = computed(() => {
  const type = activeTheme.value.type;
  if (type === 'auto') {
    return 'Auto (System)';
  }
  return activeTheme.value.name;
});

// Define emits for parent components
const emit = defineEmits<{
  (e: 'theme-change', themeId: string): void;
}>();
</script>

<style scoped>
.theme-toggle {
  display: inline-block;
}

.theme-toggle .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.theme-toggle .icon {
  font-size: 1.2em;
}

.theme-toggle .label {
  font-size: 0.85em;
}
</style>
