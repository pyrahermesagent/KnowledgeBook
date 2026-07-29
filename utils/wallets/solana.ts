// utils/wallets/solana.ts
import { base58 } from '@scure/base';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnection,
  type WalletConnector,
} from './types';

/** CAIP-2 namespace every Solana chain identifier starts with. */
const SOLANA_CHAIN_PREFIX = 'solana:';
const CONNECT_FEATURE = 'standard:connect';
const SIGN_MESSAGE_FEATURE = 'solana:signMessage';

/** The `standard:connect` feature object, as the Wallet Standard defines it. */
interface ConnectFeature {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>;
}

/** The `solana:signMessage` feature object. It takes and returns one entry per account. */
interface SignMessageFeature {
  signMessage(
    ...inputs: { account: WalletAccount; message: Uint8Array }[]
  ): Promise<readonly { signature: Uint8Array }[]>;
}

/**
 * A wallet that injects a bare object onto window instead of registering with
 * the Wallet Standard. These are usually class instances, so `connect` and
 * `signMessage` live on the prototype and both need `this` bound to the
 * provider — the provider object is therefore always kept by reference and
 * never copied.
 */
export interface InjectedSolanaProvider {
  icon?: string;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array } | Uint8Array>;
}

export interface InjectedSolanaWallet {
  id: string;
  name: string;
  /** The real injected object, not a copy of it. */
  provider: InjectedSolanaProvider;
}

type WindowLike = Record<string, any>;

/**
 * The named injected objects worth probing, and the display name to show for
 * each. The name is carried alongside the provider rather than merged into it:
 * spreading a provider (`{ name: 'Phantom', ...w.phantom.solana }`) copies only
 * own enumerable properties, which drops every prototype method and severs
 * `this` from the real wallet.
 */
const INJECTED_WALLETS: { id: string; name: string; find: (w: WindowLike) => unknown }[] = [
  { id: 'injected:phantom', name: 'Phantom', find: (w) => w.phantom?.solana },
  { id: 'injected:solflare', name: 'Solflare', find: (w) => w.solflare },
  { id: 'injected:backpack', name: 'Backpack', find: (w) => w.backpack },
];

/** window, or an empty object during SSR and under plain vitest. */
function browserWindow(): WindowLike {
  return (globalThis as { window?: WindowLike }).window ?? {};
}

function isInjectedProvider(value: unknown): value is InjectedSolanaProvider {
  // typeof on a property walks the prototype chain, so a class instance whose
  // methods are declared on its prototype passes.
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as InjectedSolanaProvider).connect === 'function' &&
    typeof (value as InjectedSolanaProvider).signMessage === 'function'
  );
}

/**
 * Registered Wallet Standard wallets that can sign a Solana message.
 *
 * Exported for tests.
 */
export function solanaStandardWallets(wallets: readonly Wallet[]): Wallet[] {
  return wallets.filter(
    (wallet) =>
      wallet.chains.some((chain) => chain.startsWith(SOLANA_CHAIN_PREFIX)) &&
      SIGN_MESSAGE_FEATURE in wallet.features
  );
}

/**
 * The injected-object fallback, for wallets that do not implement the Wallet
 * Standard. `window.solana` is the last resort, only when nothing named matched.
 *
 * Exported for tests.
 */
export function detectInjectedSolana(w: WindowLike): InjectedSolanaWallet[] {
  const found: InjectedSolanaWallet[] = [];

  for (const entry of INJECTED_WALLETS) {
    const provider = entry.find(w);
    if (isInjectedProvider(provider)) {
      found.push({ id: entry.id, name: entry.name, provider });
    }
  }

  if (!found.length && isInjectedProvider(w.solana)) {
    found.push({ id: 'injected:solana', name: 'Solana wallet', provider: w.solana });
  }

  return found;
}

/**
 * Every Solana wallet reachable in this browser.
 *
 * The Wallet Standard registry comes first — it is the discovery mechanism the
 * design chose, so any conforming extension shows up without being named. The
 * injected sniff then adds only wallets the registry did not already report,
 * since Phantom and Solflare appear in both.
 *
 * Exported so tests can exercise it without the client-only guard on discover().
 */
export function discoverSolanaWallets(): DetectedWallet[] {
  const standard = solanaStandardWallets(getWallets().get());
  const known = new Set(standard.map((wallet) => wallet.name.toLowerCase()));

  const injected = detectInjectedSolana(browserWindow()).filter(
    (wallet) => !known.has(wallet.name.toLowerCase())
  );

  return [
    ...standard.map((wallet) => ({ id: wallet.name, name: wallet.name, icon: wallet.icon })),
    ...injected.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      icon: wallet.provider.icon,
    })),
  ];
}

type ResolvedWallet =
  { kind: 'standard'; wallet: Wallet } | { kind: 'injected'; provider: InjectedSolanaProvider };

/**
 * A walletId from discovery back to the live object behind it. Standard wallets
 * are keyed by name, injected ones by their `injected:` id, so the two spaces
 * cannot collide.
 */
function resolveWallet(walletId: string): ResolvedWallet {
  const standard = solanaStandardWallets(getWallets().get()).find(
    (wallet) => wallet.name === walletId
  );
  if (standard) return { kind: 'standard', wallet: standard };

  const injected = detectInjectedSolana(browserWindow()).find((wallet) => wallet.id === walletId);
  if (injected) return { kind: 'injected', provider: injected.provider };

  throw new Error('Wallet not available. Is the extension still installed?');
}

/**
 * The account each standard wallet authorized, so signMessage can hand the same
 * one back without prompting for a second connection.
 */
const authorizedAccounts = new Map<string, WalletAccount>();

async function connectStandard(wallet: Wallet): Promise<WalletAccount> {
  const feature = wallet.features[CONNECT_FEATURE] as ConnectFeature | undefined;

  // Invoked as a method on the feature object so `this` binds to the wallet's
  // own implementation.
  const accounts = feature ? (await feature.connect()).accounts : wallet.accounts;

  const account = accounts[0];
  if (!account) throw new Error('No account was authorized in that wallet.');
  return account;
}

export const solanaConnector: WalletConnector = {
  provider: 'solana',
  label: 'Solana',
  installUrl: 'https://phantom.app/download',
  // Reading the Wallet Standard registry and sniffing window are both silent;
  // authorization only happens in connect().
  passiveDiscovery: true,

  async discover(): Promise<DetectedWallet[]> {
    if (!import.meta.client) return [];
    return discoverSolanaWallets();
  },

  async connect(walletId: string): Promise<WalletConnection> {
    const resolved = resolveWallet(walletId);

    try {
      if (resolved.kind === 'injected') {
        const { publicKey } = await resolved.provider.connect();
        return { address: publicKey.toString() };
      }

      const account = await connectStandard(resolved.wallet);
      authorizedAccounts.set(walletId, account);
      return { address: account.address };
    } catch (error) {
      throw normalizeSolanaError(error);
    }
  },

  async signMessage(walletId: string, address: string, message: string): Promise<string> {
    const resolved = resolveWallet(walletId);
    const bytes = new TextEncoder().encode(message);

    try {
      if (resolved.kind === 'injected') {
        const result = await resolved.provider.signMessage(bytes);
        return encodeSolanaSignature(result);
      }

      const feature = resolved.wallet.features[SIGN_MESSAGE_FEATURE] as
        SignMessageFeature | undefined;
      if (!feature) throw new Error('This wallet cannot sign plain messages.');

      // Prefer the wallet's own current account for this address; fall back to
      // whatever connect() authorized, which is the account the address came from.
      const account =
        resolved.wallet.accounts.find((a) => a.address === address) ??
        authorizedAccounts.get(walletId) ??
        resolved.wallet.accounts[0];
      if (!account) throw new Error('Wallet is no longer connected. Try connecting again.');

      const [result] = await feature.signMessage({ account, message: bytes });
      if (!result) throw new Error('The wallet returned no signature.');
      return encodeSolanaSignature(result);
    } catch (error) {
      throw normalizeSolanaError(error);
    }
  },
};

/** Wallets differ: some return the raw bytes, some wrap them in { signature }. */
export function encodeSolanaSignature(result: { signature: Uint8Array } | Uint8Array): string {
  const signature = result instanceof Uint8Array ? result : result.signature;
  return base58.encode(signature);
}

/** Solana wallets have no shared rejection code; they say so in the message. */
export function normalizeSolanaError(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (/reject|denied|cancel/i.test(message)) return new UserRejectedError();
  return error instanceof Error ? error : new Error(message);
}
