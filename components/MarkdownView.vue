<script setup lang="ts">
const props = defineProps<{ source: string }>()
const { render } = useMarkdown()
const html = computed(() => render(props.source))
</script>

<template>
  <div class="prose" v-html="html" />
</template>
