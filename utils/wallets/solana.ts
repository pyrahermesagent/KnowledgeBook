// utils/wallets/solana.ts
import { base58 } from '@scure/base';
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnection,
  type WalletConnector,
} from './types';

interface SolanaWallet {
  name: string;
  icon?: string;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array } | Uint8Array>;
}

/**
 * Wallet Standard exposes registered wallets on window; Phantom, Solflare and
 * Backpack all register. The legacy window.solana object is the fallback.
 */
function installed(): Record<string, SolanaWallet> {
  const w = window as any;
  const found: Record<string, SolanaWallet> = {};

  if (w.phantom?.solana) found['phantom'] = { name: 'Phantom', ...w.phantom.solana };
  if (w.solflare) found['solflare'] = { name: 'Solflare', ...w.solflare };
  if (w.backpack) found['backpack'] = { name: 'Backpack', ...w.backpack };
  if (!Object.keys(found).length && w.solana)
    found['injected'] = { name: 'Solana wallet', ...w.solana };

  return found;
}

export const solanaConnector: WalletConnector = {
  provider: 'solana',
  label: 'Solana',
  installUrl: 'https://phantom.app/download',

  async discover(): Promise<DetectedWallet[]> {
    if (!import.meta.client) return [];
    return Object.entries(installed()).map(([id, w]) => ({ id, name: w.name, icon: w.icon }));
  },

  async connect(walletId: string): Promise<WalletConnection> {
    const wallet = installed()[walletId];
    if (!wallet) throw new Error('Wallet not available. Is the extension still installed?');

    try {
      const { publicKey } = await wallet.connect();
      return { address: publicKey.toString() };
    } catch (error) {
      throw normalizeSolanaError(error);
    }
  },

  async signMessage(walletId: string, _address: string, message: string): Promise<string> {
    const wallet = installed()[walletId];
    if (!wallet) throw new Error('Wallet not available. Is the extension still installed?');

    try {
      const result = await wallet.signMessage(new TextEncoder().encode(message));
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
