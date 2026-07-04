<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <PublicDocs :project-slug="route.params.project as string" />
</template>
