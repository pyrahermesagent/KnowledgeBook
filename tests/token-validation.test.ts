import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateErc20Balance,
  validateErc721Ownership,
  getRpcUrl,
  toSupportedNetwork,
} from '#utils/token-validation';

const WALLET = '0x1111111111111111111111111111111111111111';
const CONTRACT = '0x2222222222222222222222222222222222222222';

/** Encode a value as a 32-byte hex word, the way an eth_call result looks. */
function word(value: bigint | string): string {
  const hex = typeof value === 'bigint' ? value.toString(16) : value.replace(/^0x/, '');
  return '0x' + hex.padStart(64, '0');
}

/** Capture the eth_call requests made so calldata can be asserted on. */
function mockRpc(responder: (method: string, params: any[]) => unknown) {
  const calls: { to: string; data: string }[] = [];

  const fetchMock = vi.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ to: body.params[0].to, data: body.params[0].data });
    const result = responder(body.method, body.params);
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: body.id, result }),
    };
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

describe('getRpcUrl', () => {
  it('resolves each supported network from runtime config', () => {
    expect(getRpcUrl('ethereum')).toBe('https://rpc.test/eth');
    expect(getRpcUrl('polygon')).toBe('https://rpc.test/polygon');
    expect(getRpcUrl('arbitrum')).toBe('https://rpc.test/arbitrum');
    expect(getRpcUrl('base')).toBe('https://rpc.test/base');
  });

  it('falls back to ethereum for an unknown network', () => {
    expect(getRpcUrl('dogecoin')).toBe('https://rpc.test/eth');
  });
});

describe('toSupportedNetwork', () => {
  it('passes through supported networks and defaults the rest', () => {
    expect(toSupportedNetwork('polygon')).toBe('polygon');
    expect(toSupportedNetwork('solana')).toBe('ethereum');
    expect(toSupportedNetwork(undefined)).toBe('ethereum');
  });
});

describe('validateErc721Ownership', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hex-encodes the token ID in the ownerOf calldata', async () => {
    const { calls } = mockRpc(() => word(BigInt(WALLET)));

    await validateErc721Ownership(CONTRACT, 42, 'ethereum');

    // 42 decimal is 0x2a. Encoding the decimal digits instead would query
    // token 0x42 (66), a different NFT entirely.
    expect(calls[0].data).toBe('0x6352211e' + '2a'.padStart(64, '0'));
  });

  it('handles token IDs beyond Number.MAX_SAFE_INTEGER', async () => {
    const { calls } = mockRpc(() => word(BigInt(WALLET)));
    const bigId = '123456789012345678901234567890';

    await validateErc721Ownership(CONTRACT, bigId, 'ethereum');

    expect(calls[0].data).toBe('0x6352211e' + BigInt(bigId).toString(16).padStart(64, '0'));
  });

  it('returns the owner address parsed from the response', async () => {
    mockRpc(() => word(BigInt(WALLET)));

    const owner = await validateErc721Ownership(CONTRACT, 1, 'ethereum');

    expect(owner).toBe(WALLET.toLowerCase());
  });

  it('rejects a malformed contract address before making a request', async () => {
    const { fetchMock } = mockRpc(() => word(0n));

    await expect(validateErc721Ownership('not-an-address', 1, 'ethereum')).rejects.toThrow(
      /Invalid NFT contract address/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates an RPC-level error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ error: { message: 'execution reverted' } }),
      }))
    );

    await expect(validateErc721Ownership(CONTRACT, 1, 'ethereum')).rejects.toThrow(
      'execution reverted'
    );
  });
});

describe('validateErc20Balance', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** balanceOf returns `balance`; decimals() returns `decimals`. */
  function mockToken(balance: bigint, decimals: number) {
    return mockRpc((_method, params) => {
      const data: string = params[0].data;
      if (data.startsWith('0x313ce567')) return word(BigInt(decimals));
      return word(balance);
    });
  }

  it('left-pads the wallet address into balanceOf calldata', async () => {
    const { calls } = mockToken(10n * 10n ** 18n, 18);

    await validateErc20Balance(WALLET, CONTRACT, 1, 'ethereum');

    expect(calls[0].data).toBe('0x70a08231' + WALLET.slice(2).padStart(64, '0'));
  });

  it('returns the scaled balance', async () => {
    mockToken(10n * 10n ** 18n, 18);

    await expect(validateErc20Balance(WALLET, CONTRACT, 10, 'ethereum')).resolves.toBe(10);
  });

  it('returns a short balance rather than throwing, so callers can tell a denial from an outage', async () => {
    mockToken(5n * 10n ** 18n, 18);

    await expect(validateErc20Balance(WALLET, CONTRACT, 10, 'ethereum')).resolves.toBe(5);
  });

  it('preserves a fractional balance instead of flooring it', async () => {
    // BigInt division would report 9.9 tokens as 9, silently changing the
    // outcome of the caller's comparison.
    mockToken(99n * 10n ** 17n, 18);

    await expect(validateErc20Balance(WALLET, CONTRACT, 10, 'ethereum')).resolves.toBeCloseTo(9.9);
  });

  it('throws when the RPC endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }))
    );

    await expect(validateErc20Balance(WALLET, CONTRACT, 10, 'ethereum')).rejects.toThrow(/502/);
  });

  it('honours a non-18 decimals value', async () => {
    // USDC-style 6 decimals: 25_000_000 base units is 25 tokens.
    mockToken(25_000_000n, 6);

    await expect(validateErc20Balance(WALLET, CONTRACT, 25, 'ethereum')).resolves.toBe(25);
  });

  it('rejects a malformed wallet address before making a request', async () => {
    const { fetchMock } = mockToken(0n, 18);

    await expect(validateErc20Balance('0xdeadbeef', CONTRACT, 1, 'ethereum')).rejects.toThrow(
      /Invalid wallet address/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
