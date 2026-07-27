// tests/auth-chain-solana.test.ts
import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { solanaAdapter } from '#utils/auth/chains/solana';

// Deterministic 32-byte seed — never used outside these tests.
const SEED = new Uint8Array(32).fill(7);
const PUBLIC_KEY = ed25519.getPublicKey(SEED);
const ADDRESS = base58.encode(PUBLIC_KEY);

const input = {
  address: ADDRESS,
  nonce: 'b'.repeat(64),
  issuedAt: '2026-07-27T10:00:00.000Z',
  domain: 'test.knowledgebook.app',
  uri: 'https://test.knowledgebook.app/login',
};

const sign = (message: string): string =>
  base58.encode(ed25519.sign(new TextEncoder().encode(message), SEED));

describe('solanaAdapter.canonicalize', () => {
  it('preserves case — lowercasing would be a different key entirely', () => {
    const canonical = solanaAdapter.canonicalize(ADDRESS);
    expect(canonical).toBe(ADDRESS);
    expect(canonical).not.toBe(ADDRESS.toLowerCase());
  });

  it('rejects an EVM address', () => {
    expect(() =>
      solanaAdapter.canonicalize('0x1111111111111111111111111111111111111111')
    ).toThrow();
  });

  it('rejects base58 that does not decode to 32 bytes', () => {
    expect(() => solanaAdapter.canonicalize('abc')).toThrow();
  });

  it('rejects characters outside the base58 alphabet', () => {
    expect(() => solanaAdapter.canonicalize('0OIl' + ADDRESS.slice(4))).toThrow();
  });
});

describe('solanaAdapter message round-trip', () => {
  it('parses back every field it wrote, case intact', () => {
    const parsed = solanaAdapter.parseMessage(solanaAdapter.buildMessage(input));

    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe(ADDRESS);
    expect(parsed!.domain).toBe(input.domain);
    expect(parsed!.nonce).toBe(input.nonce);
    expect(parsed!.issuedAt).toBe(input.issuedAt);
  });

  it('names the Solana ecosystem so a message cannot be routed to another adapter', () => {
    expect(solanaAdapter.buildMessage(input)).toContain('Solana account:');
  });

  it('returns null for a message we did not issue', () => {
    expect(solanaAdapter.parseMessage('hello world')).toBeNull();
  });

  it('returns null when the nonce is the wrong length', () => {
    const message = solanaAdapter.buildMessage(input).replace(input.nonce, 'b'.repeat(63));
    expect(solanaAdapter.parseMessage(message)).toBeNull();
  });

  it('returns null when the address is a valid-looking EVM address rather than base58', () => {
    const message = solanaAdapter
      .buildMessage(input)
      .replace(input.address, '0x1111111111111111111111111111111111111111');
    expect(solanaAdapter.parseMessage(message)).toBeNull();
  });
});

describe('solanaAdapter.verify', () => {
  it('accepts a signature from the address in the message', async () => {
    const message = solanaAdapter.buildMessage(input);
    await expect(solanaAdapter.verify(message, sign(message), ADDRESS)).resolves.toBe(true);
  });

  it('rejects a signature over different content', async () => {
    const message = solanaAdapter.buildMessage(input);
    await expect(solanaAdapter.verify(message, sign('other content'), ADDRESS)).resolves.toBe(
      false
    );
  });

  it('rejects a signature from a different key', async () => {
    const message = solanaAdapter.buildMessage(input);
    const otherSeed = new Uint8Array(32).fill(9);
    const signature = base58.encode(ed25519.sign(new TextEncoder().encode(message), otherSeed));

    await expect(solanaAdapter.verify(message, signature, ADDRESS)).resolves.toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    const message = solanaAdapter.buildMessage(input);
    await expect(solanaAdapter.verify(message, 'not-base58-!!', ADDRESS)).resolves.toBe(false);
  });
});
