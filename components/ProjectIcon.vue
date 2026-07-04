<script setup lang="ts">
const props = defineProps<{ name: string, iconUrl?: string, size?: number }>()
const px = computed(() => `${props.size ?? 32}px`)
const letter = computed(() => (props.name?.trim()[0] ?? '?').toUpperCase())
</script>

<template>
  <img v-if="iconUrl" :src="iconUrl" :alt="name" class="project-icon" :style="{ width: px, height: px }">
  <span v-else class="project-icon project-icon-letter" :style="{ width: px, height: px }">{{ letter }}</span>
</template>

<style scoped>
.project-icon {
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}
.project-icon-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  font-size: 0.9em;
}
</style>
