// server/utils/auth/chains/index.ts
import type { ChainAdapter, WalletProvider } from '../types';
import { eip155Adapter } from './eip155';
import { solanaAdapter } from './solana';
import { polkadotAdapter } from './polkadot';

const ADAPTERS: Record<WalletProvider, ChainAdapter> = {
  eip155: eip155Adapter,
  solana: solanaAdapter,
  polkadot: polkadotAdapter,
};

/**
 * Throws a 400 for anything that is not a supported ecosystem.
 *
 * Object.hasOwn rather than a plain lookup: `ADAPTERS['constructor']` resolves
 * up the prototype chain and returns Object, so an inherited key used to slip
 * past the check and be handed back as if it were an adapter.
 */
export function getAdapter(provider: string): ChainAdapter {
  if (!Object.hasOwn(ADAPTERS, provider)) {
    throw createError({ statusCode: 400, message: `Unsupported wallet provider: ${provider}` });
  }
  return ADAPTERS[provider as WalletProvider];
}

export { eip155Adapter, solanaAdapter, polkadotAdapter };
