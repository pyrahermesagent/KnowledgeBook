<script setup lang="ts">
const props = defineProps<{ source: string }>();
const { renderSegments } = useMarkdown();
const segments = computed(() => renderSegments(props.source));
</script>

<template>
  <div class="prose">
    <template v-for="(segment, index) in segments" :key="index">
      <CodeBlock v-if="segment.kind === 'code'" :code="segment.code" :lang="segment.lang" />
      <div v-else class="prose-html" v-html="segment.html" />
    </template>
  </div>
</template>
