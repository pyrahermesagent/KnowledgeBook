// composables/useWalletAuth.ts
import { eip155Connector } from '../utils/wallets/eip155';
import { solanaConnector } from '../utils/wallets/solana';
import { polkadotConnector } from '../utils/wallets/polkadot';
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnector,
} from '../utils/wallets/types';

const CONNECTORS: WalletConnector[] = [eip155Connector, solanaConnector, polkadotConnector];

/**
 * True when a wallet-login failure is the server rejecting a challenge that
 * aged out between issue and signature (`Login challenge expired, please
 * retry` — see server/utils/auth/verify.ts), rather than some other failure.
 *
 * Pulled out as its own export so the retry-once decision in `signIn` is
 * unit-testable without a DOM or Nuxt runtime: the message lives at
 * `data.message` on a parsed $fetch error, or plain `message` otherwise.
 */
export function isExpiredChallengeError(e: unknown): boolean {
  const err = e as { data?: { message?: unknown }; message?: unknown } | null | undefined;
  const message = err?.data?.message ?? err?.message ?? '';
  return typeof message === 'string' && /expired/i.test(message);
}

/**
 * Drives the same four steps for every ecosystem — connect, fetch the message
 * the server composed, sign it, post it back — and leaves everything
 * chain-specific to the connectors.
 */
export function useWalletAuth() {
  const detected = ref<Record<string, DetectedWallet[]>>({});
  /** Which providers have finished a discovery pass, so "none detected" is honest. */
  const discovered = ref<Record<string, boolean>>({});
  const discovering = ref<string | null>(null);
  const pending = ref<string | null>(null);
  const error = ref<string | null>(null);
  const { fetch: refreshSession } = useUserSession();

  async function discover(provider: string): Promise<void> {
    const connector = CONNECTORS.find((c) => c.provider === provider);
    if (!connector) return;

    discovering.value = provider;
    try {
      detected.value = { ...detected.value, [provider]: await connector.discover() };
      discovered.value = { ...discovered.value, [provider]: true };
    } finally {
      if (discovering.value === provider) discovering.value = null;
    }
  }

  /**
   * Discovery for every connector whose discover() is passive.
   *
   * Polkadot's is not — web3Enable() opens the extension's permission dialog —
   * so it is left out and must be triggered by the user asking for it, or every
   * visitor to the public landing page gets a popup before clicking anything.
   */
  async function discoverAll(): Promise<void> {
    await Promise.all(
      CONNECTORS.filter((c) => c.passiveDiscovery).map((c) => discover(c.provider))
    );
  }

  /**
   * Signs in with `walletId` from `provider`'s connector.
   *
   * `walletId` must come from a `discover()`/`discoverAll()` call that has
   * already resolved. The connectors cache what discovery found (the
   * EIP-6963 `providers` map, Polkadot's `accountCache`) and `connect`/
   * `signMessage` only recognize ids drawn from that cache — a walletId that
   * was never surfaced by `discover()` throws a plain Error instead of
   * connecting. The UI satisfies this by calling `discoverAll()` on mount for
   * the passive connectors, calling `discover(provider)` when the user opens a
   * non-passive one, and only ever rendering wallets pulled from `detected`;
   * any future caller must do the same.
   */
  async function signIn(provider: string, walletId: string): Promise<boolean> {
    const connector = CONNECTORS.find((c) => c.provider === provider);
    if (!connector) return false;

    pending.value = `${provider}:${walletId}`;
    error.value = null;

    try {
      const connection = await connector.connect(walletId);

      const signAndPost = async () => {
        const { message } = await $fetch<{ message: string }>('/api/auth/wallet/login-message', {
          method: 'POST',
          body: {
            provider,
            address: connection.address,
            chainId: connection.chainId ? Number(connection.chainId.split(':')[1]) : undefined,
          },
        });

        const signature = await connector.signMessage(walletId, connection.address, message);

        await $fetch('/api/auth/wallet/login', {
          method: 'POST',
          body: {
            provider,
            message,
            signature,
            chainId: connection.chainId,
            label: detected.value[provider]?.find((w) => w.id === walletId)?.name,
          },
        });
      };

      try {
        await signAndPost();
      } catch (e: any) {
        // A challenge that aged out between issue and signature is worth one
        // silent retry — the user did nothing wrong. If the retry's own
        // challenge is also expired, isExpiredChallengeError is not
        // consulted again: the error just propagates to the outer catch.
        if (isExpiredChallengeError(e)) {
          await signAndPost();
        } else {
          throw e;
        }
      }

      await refreshSession();
      return true;
    } catch (e: any) {
      // Declining the prompt is a choice, not a failure — no error message,
      // no toast.
      if (e instanceof UserRejectedError) return false;

      error.value = e?.data?.message ?? e?.message ?? 'Wallet sign-in failed';
      return false;
    } finally {
      pending.value = null;
    }
  }

  return {
    connectors: CONNECTORS,
    detected,
    discovered,
    discovering,
    discover,
    discoverAll,
    signIn,
    pending,
    error,
  };
}
