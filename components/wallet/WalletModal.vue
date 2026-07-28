<script setup lang="ts">
const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onKeydown);
    else window.removeEventListener('keydown', onKeydown);
  }
);

onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    v-if="isOpen"
    class="wallet-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="wallet-modal-title"
    @click.self="emit('close')"
  >
    <div class="wallet-modal">
      <div class="wallet-modal-header">
        <h3 id="wallet-modal-title">Sign in</h3>
        <button class="close-btn" type="button" aria-label="Close" @click="emit('close')">✕</button>
      </div>
      <div class="wallet-modal-body">
        <AuthSignInPanel />
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallet-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.wallet-modal {
  background: var(--bg);
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.wallet-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.wallet-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}
.wallet-modal-body {
  padding: 20px;
}
</style>
