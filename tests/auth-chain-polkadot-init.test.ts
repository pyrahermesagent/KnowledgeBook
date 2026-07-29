// tests/auth-chain-polkadot-init.test.ts
//
// initPolkadotCrypto memoises cryptoWaitReady() so concurrent logins share one
// WASM initialisation. It used to memoise rejections too: a single transient
// failure cached a permanently rejected promise, and every Polkadot login for
// the rest of the process lifetime re-awaited it. Separately, verify() awaited
// the init outside its try, so that failure escaped as a 500 instead of the
// clean `false` the eip155 and solana adapters return.
//
// cryptoWaitReady is mocked here (and only here — tests/auth-chain-polkadot.ts
// uses the real one) so init can be made to fail on demand. vi.resetModules()
// before each test gives every case a fresh module with an empty memo.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const cryptoWaitReady = vi.hoisted(() => vi.fn());

vi.mock('@polkadot/util-crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@polkadot/util-crypto')>();
  return { ...actual, cryptoWaitReady };
});

type PolkadotModule = typeof import('#utils/auth/chains/polkadot');

async function freshModule(): Promise<PolkadotModule> {
  return await import('#utils/auth/chains/polkadot');
}

beforeEach(() => {
  vi.resetModules();
  cryptoWaitReady.mockReset();
});

describe('initPolkadotCrypto', () => {
  it('memoises a successful initialisation', async () => {
    cryptoWaitReady.mockResolvedValue(true);
    const { initPolkadotCrypto } = await freshModule();

    await expect(initPolkadotCrypto()).resolves.toBe(true);
    await expect(initPolkadotCrypto()).resolves.toBe(true);

    expect(cryptoWaitReady).toHaveBeenCalledTimes(1);
  });

  it('does not poison the next call after a rejected initialisation', async () => {
    cryptoWaitReady.mockRejectedValueOnce(new Error('wasm init failed'));
    cryptoWaitReady.mockResolvedValue(true);
    const { initPolkadotCrypto } = await freshModule();

    await expect(initPolkadotCrypto()).rejects.toThrow('wasm init failed');

    // The retry must re-run cryptoWaitReady rather than re-await the cached
    // rejection — otherwise one transient failure disables Polkadot login for
    // the whole process.
    await expect(initPolkadotCrypto()).resolves.toBe(true);
    expect(cryptoWaitReady).toHaveBeenCalledTimes(2);
  });

  it('shares one initialisation between concurrent callers', async () => {
    cryptoWaitReady.mockResolvedValue(true);
    const { initPolkadotCrypto } = await freshModule();

    await Promise.all([initPolkadotCrypto(), initPolkadotCrypto(), initPolkadotCrypto()]);

    expect(cryptoWaitReady).toHaveBeenCalledTimes(1);
  });
});

describe('polkadotAdapter.verify when crypto init fails', () => {
  const MESSAGE = 'test.knowledgebook.app wants you to sign in with your Polkadot account:';
  const ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

  it('returns false rather than throwing', async () => {
    cryptoWaitReady.mockRejectedValue(new Error('wasm init failed'));
    const { polkadotAdapter } = await freshModule();

    // A 500 here would leak an internal failure to the login endpoint; the
    // other two chain adapters both fail closed.
    await expect(polkadotAdapter.verify(MESSAGE, '0xdeadbeef', ADDRESS)).resolves.toBe(false);
  });

  it('verifies normally again once initialisation recovers', async () => {
    cryptoWaitReady.mockRejectedValueOnce(new Error('wasm init failed'));
    cryptoWaitReady.mockResolvedValue(true);
    const { polkadotAdapter } = await freshModule();

    await expect(polkadotAdapter.verify(MESSAGE, '0xdeadbeef', ADDRESS)).resolves.toBe(false);

    // Still false — the signature is garbage — but reached through a real
    // signatureVerify call this time, not a cached init rejection.
    await expect(polkadotAdapter.verify(MESSAGE, '0xdeadbeef', ADDRESS)).resolves.toBe(false);
    expect(cryptoWaitReady).toHaveBeenCalledTimes(2);
  });
});
