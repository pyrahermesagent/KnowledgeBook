<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <PublicDocs
    :project-slug="route.params.project as string"
    :page-slug="route.params.page as string"
  />
</template>
