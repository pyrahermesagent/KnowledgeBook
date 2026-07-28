<script setup lang="ts">
import { LogOut } from '@lucide/vue';

const { loggedIn, user, clear } = useUserSession();
const showModal = ref(false);

async function signOut(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' });
  await clear();
  await navigateTo('/');
}
</script>

<template>
  <div class="connect-button">
    <button v-if="!loggedIn" class="btn btn-primary" type="button" @click="showModal = true">
      Sign in
    </button>
    <button v-else class="btn" type="button" @click="signOut">
      <LogOut :size="14" />
      Sign out{{ user?.name ? ` (${user.name})` : '' }}
    </button>

    <WalletModal :is-open="showModal" @close="showModal = false" />
  </div>
</template>

<style scoped>
.connect-button {
  display: inline-block;
}
</style>
