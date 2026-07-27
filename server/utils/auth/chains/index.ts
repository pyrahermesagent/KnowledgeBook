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

/** Throws a 400 for anything that is not a supported ecosystem. */
export function getAdapter(provider: string): ChainAdapter {
  const adapter = ADAPTERS[provider as WalletProvider];
  if (!adapter) {
    throw createError({ statusCode: 400, message: `Unsupported wallet provider: ${provider}` });
  }
  return adapter;
}

export { eip155Adapter, solanaAdapter, polkadotAdapter };
