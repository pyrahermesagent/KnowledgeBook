<template>
  <div :class="`theme-${activeTheme.id}`">
    <NuxtPage />
    <div class="theme-toggle-wrapper">
      <ThemeToggle />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useThemeManager } from '~/composables/useThemeManager';

const { applyTheme, activeTheme } = useThemeManager();

// Apply theme on mount
onMounted(() => {
  applyTheme();
});
</script>

<style scoped>
.theme-toggle-wrapper {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
}
</style>
