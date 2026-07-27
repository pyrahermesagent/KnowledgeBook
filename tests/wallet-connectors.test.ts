// tests/wallet-connectors.test.ts
//
// The connector modules mostly wrap browser APIs (window.ethereum, injected
// Solana wallets, the polkadot.js extension) that aren't available under
// plain vitest — those paths are covered by the manual checklist in Task 17.
// What's pure and testable here is: the error normalizer each connector uses
// to turn a wallet's rejection into UserRejectedError, and Solana's signature
// result handling (wallets return either raw bytes or a wrapped object) plus
// its base58 encoding.
import { describe, it, expect } from 'vitest';
import { base58 } from '@scure/base';
import { UserRejectedError } from '../utils/wallets/types';
import { normalizeEip155Error } from '../utils/wallets/eip155';
import { normalizeSolanaError, encodeSolanaSignature } from '../utils/wallets/solana';
import { normalizePolkadotError } from '../utils/wallets/polkadot';

describe('normalizeEip155Error', () => {
  it('converts EIP-1193 code 4001 to UserRejectedError', () => {
    const result = normalizeEip155Error({ code: 4001, message: 'User rejected the request.' });
    expect(result).toBeInstanceOf(UserRejectedError);
  });

  it('passes an unrelated error through unchanged', () => {
    const original = new Error('network timeout');
    const result = normalizeEip155Error(original);
    expect(result).toBe(original);
    expect(result).not.toBeInstanceOf(UserRejectedError);
  });

  it('wraps a non-Error thrown value without crashing', () => {
    const result = normalizeEip155Error('boom');
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(UserRejectedError);
    expect(result.message).toBe('boom');
  });

  it('does not treat an unrelated numeric code as rejection', () => {
    const result = normalizeEip155Error({ code: -32603, message: 'Internal error' });
    expect(result).not.toBeInstanceOf(UserRejectedError);
  });
});

describe('normalizeSolanaError', () => {
  it('converts a "User rejected the request" message to UserRejectedError', () => {
    const result = normalizeSolanaError(new Error('User rejected the request.'));
    expect(result).toBeInstanceOf(UserRejectedError);
  });

  it('converts a "cancelled" message to UserRejectedError', () => {
    const result = normalizeSolanaError(new Error('The request was cancelled by the user.'));
    expect(result).toBeInstanceOf(UserRejectedError);
  });

  it('passes an unrelated error through unchanged', () => {
    const original = new Error('wallet is locked');
    const result = normalizeSolanaError(original);
    expect(result).toBe(original);
    expect(result).not.toBeInstanceOf(UserRejectedError);
  });

  it('wraps a non-Error thrown value without crashing', () => {
    const result = normalizeSolanaError({ weird: true });
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(UserRejectedError);
  });
});

describe('normalizePolkadotError', () => {
  it('converts a "Cancelled" message to UserRejectedError', () => {
    const result = normalizePolkadotError(new Error('Cancelled'));
    expect(result).toBeInstanceOf(UserRejectedError);
  });

  it('converts a "rejected" message to UserRejectedError', () => {
    const result = normalizePolkadotError(new Error('User rejected the signing request'));
    expect(result).toBeInstanceOf(UserRejectedError);
  });

  it('passes an unrelated error through unchanged', () => {
    const original = new Error('This wallet cannot sign plain messages.');
    const result = normalizePolkadotError(original);
    expect(result).toBe(original);
    expect(result).not.toBeInstanceOf(UserRejectedError);
  });

  it('wraps a non-Error thrown value without crashing', () => {
    const result = normalizePolkadotError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(UserRejectedError);
  });
});

describe('encodeSolanaSignature', () => {
  // Deterministic 64-byte stand-in for an ed25519 signature.
  const SIGNATURE_BYTES = new Uint8Array(64).fill(0).map((_, i) => i);

  it('encodes a raw Uint8Array and a { signature } wrapper identically', () => {
    const fromRaw = encodeSolanaSignature(SIGNATURE_BYTES);
    const fromWrapped = encodeSolanaSignature({ signature: SIGNATURE_BYTES });
    expect(fromRaw).toBe(fromWrapped);
  });

  it('round-trips through base58 back to the original bytes', () => {
    const encoded = encodeSolanaSignature(SIGNATURE_BYTES);
    const decoded = base58.decode(encoded);
    expect(decoded).toEqual(SIGNATURE_BYTES);
  });
});
