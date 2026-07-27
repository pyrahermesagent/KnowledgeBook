/** Every way an account can be logged into. */
export type Provider = 'google' | 'eip155' | 'solana' | 'polkadot';

/** The providers that sign a challenge message. */
export type WalletProvider = Exclude<Provider, 'google'>;

export const WALLET_PROVIDERS: readonly WalletProvider[] = ['eip155', 'solana', 'polkadot'];

/** How long a login challenge stays valid before it must be reissued. */
export const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * The challenge held in the session between /login-message and /login.
 *
 * provider and address are part of the challenge — not just the nonce — so a
 * challenge issued for one ecosystem cannot be spent on a message built for
 * another.
 */
export interface StoredNonce {
  value: string;
  issuedAt: number;
  provider: WalletProvider;
  /** Canonical form, as produced by the adapter's canonicalize(). */
  address: string;
}

/** Everything an adapter needs to compose the message a wallet will sign. */
export interface MessageInput {
  address: string;
  nonce: string;
  issuedAt: string;
  domain: string;
  uri: string;
  /** eip155 only; ignored by the other adapters. */
  chainId?: number;
}

/** The fields the server must re-check, read back out of a signed message. */
export interface ParsedMessage {
  address: string;
  domain: string;
  nonce: string;
  issuedAt: string;
  /** Present for eip155 only. */
  chainId?: number;
}

/**
 * Per-ecosystem message format and signature check.
 *
 * Everything security-critical that is NOT ecosystem-specific — nonce lookup,
 * TTL, replay, domain, chain allowlist — lives in verify.ts, once.
 */
export interface ChainAdapter {
  provider: WalletProvider;
  /** Validate and normalize an address, or throw a 400. */
  canonicalize(address: string): string;
  buildMessage(input: MessageInput): string;
  /** Null when the message is not one we issued. */
  parseMessage(message: string): ParsedMessage | null;
  /** address is always the one parsed out of the message. */
  verify(message: string, signature: string, address: string): Promise<boolean>;
}
