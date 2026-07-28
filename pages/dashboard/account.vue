<!-- pages/dashboard/account.vue -->
<script setup lang="ts">
import { ArrowLeft, Trash2 } from '@lucide/vue';

definePageMeta({ middleware: 'auth' });
useHead({ title: 'Account · KnowledgeBook' });

interface Identity {
  id: number;
  provider: string;
  subject: string;
  chain_id: string | null;
  label: string | null;
}

const { data, refresh } = await useFetch<{ identities: Identity[] }>('/api/account/identities');
const { connectors, detected, discoverAll, signIn, pending, error } = useWalletAuth();
const message = ref<string | null>(null);
const removing = ref<number | null>(null);

// `signIn` throws for any walletId that discovery hasn't surfaced yet — see
// composables/useWalletAuth.ts. Discovering on mount and only ever rendering
// wallets pulled from `detected` keeps every click below valid.
onMounted(discoverAll);

const LABELS: Record<string, string> = {
  google: 'Google',
  eip155: 'Ethereum',
  solana: 'Solana',
  polkadot: 'Polkadot',
};

/** 0x1111…1111 — full addresses are unreadable in a list. */
function shorten(subject: string): string {
  return subject.length > 16 ? `${subject.slice(0, 8)}…${subject.slice(-6)}` : subject;
}

async function link(provider: string, walletId: string) {
  message.value = null;
  const before = new Set((data.value?.identities ?? []).map((i) => i.id));

  // A session is already present, so the server links this wallet to the
  // current account rather than creating a new one.
  const success = await signIn(provider, walletId);
  await refresh();
  if (success) return;

  // A declined wallet prompt returns false with `error` left null — an
  // ordinary cancel, show nothing. A genuine failure (e.g. this wallet is
  // already linked to a different account, a 409) sets `error` and is worth
  // surfacing.
  //
  // The one exception: refreshSession() can throw *after* the server-side
  // link already succeeded (see composables/useWalletAuth.ts), in which case
  // signIn still reports false and sets `error` even though the identity was
  // created. The identity list just got refreshed above, so trust it over
  // the return value: if a new identity showed up, the link worked.
  const linked = (data.value?.identities ?? []).some((i) => !before.has(i.id));
  if (!linked) message.value = error.value;
}

async function unlink(id: number) {
  message.value = null;
  removing.value = id;
  try {
    await $fetch(`/api/account/identities/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (e: any) {
    // The Remove button is already disabled once one identity remains, but a
    // second tab can remove one first — the 400 the server would then return
    // is still handled here rather than assumed away.
    message.value = e?.data?.message ?? 'Could not remove that login method';
  } finally {
    removing.value = null;
  }
}
</script>

<template>
  <div class="account">
    <NuxtLink to="/dashboard" class="btn btn-ghost btn-sm back-link">
      <ArrowLeft :size="15" /> Dashboard
    </NuxtLink>

    <h1>Login methods</h1>
    <p class="muted">Any of these signs you into the same account.</p>

    <p v-if="message" class="account-error">{{ message }}</p>

    <ul class="identity-list">
      <li v-for="identity in data?.identities || []" :key="identity.id">
        <div>
          <strong>{{ LABELS[identity.provider] || identity.provider }}</strong>
          <span class="muted">
            {{ identity.label ? `${identity.label} · ` : '' }}{{ shorten(identity.subject) }}
          </span>
        </div>
        <button
          class="btn btn-sm btn-danger"
          :disabled="(data?.identities?.length ?? 0) <= 1 || removing !== null"
          :title="
            (data?.identities?.length ?? 0) <= 1
              ? 'This is your only way to sign in'
              : 'Remove this login method'
          "
          @click="unlink(identity.id)"
        >
          <Trash2 :size="13" /> {{ removing === identity.id ? 'Removing…' : 'Remove' }}
        </button>
      </li>
    </ul>

    <h2>Link another wallet</h2>
    <p class="muted">Connect an additional wallet to sign into this same account with it too.</p>

    <div v-for="connector in connectors" :key="connector.provider" class="link-group">
      <span class="link-label">{{ connector.label }}</span>
      <button
        v-for="wallet in detected[connector.provider] || []"
        :key="wallet.id"
        type="button"
        class="btn btn-sm"
        :disabled="pending !== null"
        @click="link(connector.provider, wallet.id)"
      >
        {{ pending === `${connector.provider}:${wallet.id}` ? 'Signing…' : wallet.name }}
      </button>
      <a
        v-if="!(detected[connector.provider] || []).length"
        :href="connector.installUrl"
        target="_blank"
        rel="noopener"
        class="muted install-link"
      >
        none detected — install →
      </a>
    </div>

    <p class="reach-note">
      Wallet linking uses browser extensions — it works in a desktop browser or your wallet app's
      built-in browser, but not a regular mobile browser like Safari or Chrome on your phone.
    </p>
  </div>
</template>

<style scoped>
.account {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 16px;
}
.back-link {
  margin-bottom: 20px;
}
h1 {
  margin: 0 0 4px;
}
h2 {
  margin: 0 0 4px;
  font-size: 18px;
}
.account-error {
  color: #b42318;
  font-size: 14px;
}
.identity-list {
  list-style: none;
  padding: 0;
  margin: 16px 0 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.identity-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.identity-list .muted {
  display: block;
  font-size: 13px;
}
.link-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.link-label {
  min-width: 90px;
  font-weight: 500;
}
.install-link {
  font-size: 13px;
}
.reach-note {
  margin-top: 24px;
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .account {
    padding: 20px 16px;
  }
}
</style>
