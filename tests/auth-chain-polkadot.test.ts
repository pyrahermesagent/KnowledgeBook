// tests/auth-chain-polkadot.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import {
  cryptoWaitReady,
  sr25519PairFromSeed,
  sr25519Sign,
  ed25519PairFromSeed,
  ed25519Sign,
  encodeAddress,
} from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { polkadotAdapter } from '#utils/auth/chains/polkadot';

// Deterministic 32-byte seed — never used outside these tests.
const SEED = new Uint8Array(32).fill(3);
let pair: ReturnType<typeof sr25519PairFromSeed>;
let ADDRESS: string;

const input = () => ({
  address: ADDRESS,
  nonce: 'c'.repeat(64),
  issuedAt: '2026-07-27T10:00:00.000Z',
  domain: 'test.knowledgebook.app',
  uri: 'https://test.knowledgebook.app/login',
});

beforeAll(async () => {
  await cryptoWaitReady();
  pair = sr25519PairFromSeed(SEED);
  ADDRESS = encodeAddress(pair.publicKey, 42);
});

const enc = (s: string) => new TextEncoder().encode(s);

describe('polkadotAdapter.canonicalize', () => {
  it('normalizes every network prefix of one key to a single identity', () => {
    const polkadot = encodeAddress(pair.publicKey, 0);
    const kusama = encodeAddress(pair.publicKey, 2);
    const generic = encodeAddress(pair.publicKey, 42);

    // Three different strings, one key — all must resolve to the same subject.
    expect(polkadot).not.toBe(kusama);
    expect(polkadotAdapter.canonicalize(polkadot)).toBe(generic);
    expect(polkadotAdapter.canonicalize(kusama)).toBe(generic);
    expect(polkadotAdapter.canonicalize(generic)).toBe(generic);
  });

  it('rejects an EVM address', () => {
    expect(() =>
      polkadotAdapter.canonicalize('0x1111111111111111111111111111111111111111')
    ).toThrow();
  });

  it('rejects a corrupted SS58 checksum', () => {
    const broken = ADDRESS.slice(0, -1) + (ADDRESS.endsWith('A') ? 'B' : 'A');
    expect(() => polkadotAdapter.canonicalize(broken)).toThrow();
  });
});

describe('polkadotAdapter message round-trip', () => {
  it('parses back every field it wrote', () => {
    const parsed = polkadotAdapter.parseMessage(polkadotAdapter.buildMessage(input()));

    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe(ADDRESS);
    expect(parsed!.domain).toBe('test.knowledgebook.app');
    expect(parsed!.nonce).toBe('c'.repeat(64));
  });

  it('returns null for a message we did not issue', () => {
    expect(polkadotAdapter.parseMessage('hello world')).toBeNull();
  });

  it('returns null when the nonce is the wrong length', () => {
    const message = polkadotAdapter.buildMessage(input()).replace('c'.repeat(64), 'c'.repeat(63));
    expect(polkadotAdapter.parseMessage(message)).toBeNull();
  });

  it('returns null when the address is a valid-looking EVM address rather than SS58', () => {
    const message = polkadotAdapter
      .buildMessage(input())
      .replace(ADDRESS, '0x1111111111111111111111111111111111111111');
    expect(polkadotAdapter.parseMessage(message)).toBeNull();
  });
});

describe('polkadotAdapter.verify', () => {
  it('accepts a plain sr25519 signature', async () => {
    const message = polkadotAdapter.buildMessage(input());
    const signature = u8aToHex(sr25519Sign(enc(message), pair));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(true);
  });

  it('accepts a <Bytes>-wrapped signature from the polkadot.js extension', async () => {
    // The extension wraps payloads in <Bytes>…</Bytes> before signing so a dApp
    // cannot trick a user into signing a transaction. This case fails if the
    // adapter is ever switched to the low-level sr25519Verify primitive.
    const message = polkadotAdapter.buildMessage(input());
    const signature = u8aToHex(sr25519Sign(enc(`<Bytes>${message}</Bytes>`), pair));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(true);
  });

  it('accepts an ed25519 account', async () => {
    const edPair = ed25519PairFromSeed(new Uint8Array(32).fill(5));
    const edAddress = encodeAddress(edPair.publicKey, 42);
    const message = polkadotAdapter.buildMessage({ ...input(), address: edAddress });
    const signature = u8aToHex(ed25519Sign(enc(message), edPair));

    await expect(polkadotAdapter.verify(message, signature, edAddress)).resolves.toBe(true);
  });

  it('rejects a signature over different content', async () => {
    const message = polkadotAdapter.buildMessage(input());
    const signature = u8aToHex(sr25519Sign(enc('<Bytes>attacker message</Bytes>'), pair));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(false);
  });

  it('rejects a signature from a different key', async () => {
    const message = polkadotAdapter.buildMessage(input());
    const other = sr25519PairFromSeed(new Uint8Array(32).fill(8));
    const signature = u8aToHex(sr25519Sign(enc(message), other));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    const message = polkadotAdapter.buildMessage(input());
    await expect(polkadotAdapter.verify(message, '0xdeadbeef', ADDRESS)).resolves.toBe(false);
  });
});
