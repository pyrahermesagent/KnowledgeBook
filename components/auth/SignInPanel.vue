<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';

const {
  connectors,
  detected,
  discovered,
  discovering,
  discover,
  discoverAll,
  signIn,
  pending,
  error,
} = useWalletAuth();
const { loggedIn } = useUserSession();

const open = ref<string | null>(null);

// `signIn` throws for any walletId that discovery hasn't surfaced yet — see
// composables/useWalletAuth.ts. Discovering and only ever rendering wallets
// pulled from `detected` keeps every click below valid.
//
// discoverAll() covers only the connectors whose discovery is passive. Polkadot
// is discovered in choose() instead: web3Enable() opens the extension's
// permission dialog, and this panel is on the public landing page — running it
// on mount popped that dialog at every visitor with the extension installed,
// before they had clicked anything.
onMounted(discoverAll);

async function choose(provider: string): Promise<void> {
  const next = open.value === provider ? null : provider;
  open.value = next;

  if (next && !discovered.value[next] && discovering.value !== next) {
    await discover(next);
  }
}

function walletsFor(provider: string) {
  return detected.value[provider] || [];
}

/** What the collapsed row says on its right-hand side. */
function statusFor(provider: string): string {
  if (discovering.value === provider) return 'checking…';
  if (!discovered.value[provider]) return 'connect';
  return String(walletsFor(provider).length || 'none detected');
}

async function pick(provider: string, walletId: string): Promise<void> {
  const success = await signIn(provider, walletId);

  // A declined wallet prompt returns false with `error` left untouched — an
  // ordinary cancel, so falling through here does nothing and the panel just
  // stays put for another attempt.
  //
  // The one exception: the server login can succeed while the client-side
  // session refresh that follows it fails, in which case `signIn` still
  // reports `false` and sets `error` even though the cookie is valid.
  // `loggedIn` reflects the real session, so it wins over the return value.
  if (success || (error.value !== null && loggedIn.value)) {
    await navigateTo('/dashboard');
  }
}
</script>

<template>
  <div class="signin">
    <a href="/api/auth/google" class="btn btn-primary signin-google">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81"
        />
      </svg>
      Continue with Google
    </a>

    <div class="signin-divider"><span>or connect a wallet</span></div>

    <p v-if="error" class="signin-error">{{ error }}</p>

    <div class="signin-chains">
      <div v-for="connector in connectors" :key="connector.provider" class="signin-chain">
        <button
          type="button"
          class="signin-chain-btn"
          :aria-expanded="open === connector.provider"
          @click="choose(connector.provider)"
        >
          <span>{{ connector.label }}</span>
          <span class="signin-chain-right">
            <span class="signin-count">{{ statusFor(connector.provider) }}</span>
            <ChevronDown
              :size="16"
              class="signin-chevron"
              :class="{ 'signin-chevron-open': open === connector.provider }"
            />
          </span>
        </button>

        <div v-if="open === connector.provider" class="signin-wallets">
          <p v-if="discovering === connector.provider" class="signin-discovering">
            Waiting for the extension…
          </p>

          <button
            v-for="wallet in walletsFor(connector.provider)"
            :key="wallet.id"
            type="button"
            class="signin-wallet"
            :disabled="pending !== null"
            @click="pick(connector.provider, wallet.id)"
          >
            <img v-if="wallet.icon" :src="wallet.icon" alt="" width="20" height="20" />
            <span>{{ wallet.name }}</span>
            <span
              v-if="pending === `${connector.provider}:${wallet.id}`"
              class="signin-wallet-pending"
            >
              signing…
            </span>
          </button>

          <a
            v-if="discovered[connector.provider] && !walletsFor(connector.provider).length"
            :href="connector.installUrl"
            target="_blank"
            rel="noopener"
            class="signin-install"
          >
            Install a {{ connector.label }} wallet →
          </a>
        </div>
      </div>
    </div>

    <p class="signin-note">
      Wallet sign-in uses browser extensions — it works in a desktop browser or your wallet app's
      built-in browser, but not a regular mobile browser like Safari or Chrome on your phone.
    </p>
  </div>
</template>

<style scoped>
.signin {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 380px;
  width: 100%;
}
/* .btn-lg is defined only in pages/index.vue's own scoped styles, so the
   Google button (now reused across the header and hero) sizes itself here
   instead of depending on it. */
.signin-google {
  padding: 12px 24px;
  font-size: 16px;
  justify-content: center;
}
.signin-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.signin-divider::before,
.signin-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
.signin-error {
  color: #b42318;
  font-size: 13px;
  margin: 0;
}
.signin-chains {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.signin-chain-btn {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.signin-chain-btn:hover {
  background: var(--bg-subtle);
}
.signin-chain-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.signin-count {
  font-size: 12px;
  color: var(--text-muted);
}
.signin-chevron {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform 0.15s;
}
.signin-chevron-open {
  transform: rotate(180deg);
}
.signin-wallets {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 0 8px;
}
.signin-wallet {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.signin-wallet:hover:not(:disabled) {
  background: var(--bg-subtle);
  border-color: var(--border);
}
.signin-wallet:disabled {
  opacity: 0.6;
  cursor: default;
}
.signin-wallet img {
  flex-shrink: 0;
}
.signin-wallet-pending {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}
.signin-install {
  display: block;
  font-size: 13px;
  color: var(--text-muted);
  padding: 8px 12px;
}
.signin-discovering {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  padding: 8px 12px;
}
.signin-note {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}
</style>
