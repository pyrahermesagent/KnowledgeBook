import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { validateTokenAccess, addTokenGatedProject } from '#utils/token-gating';
import {
  validateNftProjectOwnership,
  addNftProjectOwnership,
  transferProjectOwnershipViaNft,
  getNftOwnedProjects,
} from '#utils/nft-ownership';
import { createTestDb, destroyTestDbs } from './setup/db';

const OWNER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x3333333333333333333333333333333333333333';
const CONTRACT = '0x2222222222222222222222222222222222222222';

function word(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

/** Stub eth_call: ownerOf -> owner, decimals -> 18, balanceOf -> balance. */
function mockChain(opts: { owner?: string; balance?: bigint } = {}) {
  const fetchMock = vi.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const data: string = body.params[0].data;

    let result: string;
    if (data.startsWith('0x6352211e')) {
      result = word(BigInt(opts.owner ?? OWNER));
    } else if (data.startsWith('0x313ce567')) {
      result = word(18n);
    } else {
      result = word(opts.balance ?? 0n);
    }

    return { ok: true, status: 200, json: async () => ({ result }) };
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function seedProjects(count = 2) {
  const db = createTestDb();
  db.prepare("INSERT INTO users (google_id, email) VALUES ('g1', 'a@b.c')").run();
  for (let i = 1; i <= count; i++) {
    db.prepare('INSERT INTO projects (owner_id, slug, name) VALUES (1, ?, ?)').run(
      `p${i}`,
      `P${i}`
    );
  }
  return db;
}

describe('validateTokenAccess', () => {
  beforeEach(() => seedProjects());
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => destroyTestDbs());

  it('allows access to a project that is not token-gated', async () => {
    const result = await validateTokenAccess(OWNER, 1);

    expect(result.hasAccess).toBe(true);
  });

  it('grants ERC-721 access to the token owner', async () => {
    addTokenGatedProject(1, CONTRACT, 'ethereum', 'erc721', 7);
    mockChain({ owner: OWNER });

    const result = await validateTokenAccess(OWNER, 1);

    expect(result.hasAccess).toBe(true);
  });

  it('denies ERC-721 access to a non-owner', async () => {
    addTokenGatedProject(1, CONTRACT, 'ethereum', 'erc721', 7);
    mockChain({ owner: OTHER });

    const result = await validateTokenAccess(OWNER, 1);

    expect(result.hasAccess).toBe(false);
    expect(result.reason).toMatch(/do not own/);
  });

  it('takes the ERC-721 branch when min_balance is SQL NULL', async () => {
    // SQLite returns null, not undefined, for the unset column. Branching on
    // `!== undefined` sent NFT-gated projects down the ERC-20 path and called
    // balanceOf on an ERC-721 contract.
    addTokenGatedProject(1, CONTRACT, 'ethereum', 'erc721', 7);
    const fetchMock = mockChain({ owner: OWNER });

    await validateTokenAccess(OWNER, 1);

    const selectors = fetchMock.mock.calls.map(([, init]: any) =>
      JSON.parse(init.body).params[0].data.slice(0, 10)
    );
    expect(selectors).toContain('0x6352211e'); // ownerOf
    expect(selectors).not.toContain('0x70a08231'); // balanceOf
  });

  it('grants ERC-20 access when the balance meets the minimum', async () => {
    addTokenGatedProject(1, CONTRACT, 'ethereum', 'erc20', 100);
    mockChain({ balance: 150n * 10n ** 18n });

    const result = await validateTokenAccess(OWNER, 1);

    expect(result.hasAccess).toBe(true);
  });

  it('denies ERC-20 access when the balance is short', async () => {
    addTokenGatedProject(1, CONTRACT, 'ethereum', 'erc20', 100);
    mockChain({ balance: 50n * 10n ** 18n });

    const result = await validateTokenAccess(OWNER, 1);

    expect(result.hasAccess).toBe(false);
    expect(result.reason).toMatch(/Insufficient balance/);
  });

  it('denies access rather than throwing when the RPC is unreachable', async () => {
    addTokenGatedProject(1, CONTRACT, 'ethereum', 'erc721', 7);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    const result = await validateTokenAccess(OWNER, 1);

    expect(result.hasAccess).toBe(false);
    expect(result.reason).toMatch(/unavailable/);
  });

  it('replaces the config when a project is re-gated', async () => {
    addTokenGatedProject(1, CONTRACT, 'ethereum', 'erc20', 100);
    addTokenGatedProject(1, CONTRACT, 'polygon', 'erc20', 5);
    mockChain({ balance: 10n * 10n ** 18n });

    const result = await validateTokenAccess(OWNER, 1);

    expect(result.hasAccess).toBe(true);
  });
});

describe('NFT project ownership', () => {
  beforeEach(() => seedProjects());
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => destroyTestDbs());

  it('confirms ownership when the chain agrees', async () => {
    addNftProjectOwnership(1, CONTRACT, 7, 'ethereum', OWNER);
    mockChain({ owner: OWNER });

    const { ownsProject, nft } = await validateNftProjectOwnership(1, OWNER);

    expect(ownsProject).toBe(true);
    expect(nft?.nft_token_id).toBe('7');
  });

  it('denies ownership when the chain reports another holder', async () => {
    addNftProjectOwnership(1, CONTRACT, 7, 'ethereum', OWNER);
    mockChain({ owner: OTHER });

    const { ownsProject } = await validateNftProjectOwnership(1, OWNER);

    expect(ownsProject).toBe(false);
  });

  it('reports no ownership record for an ungated project', async () => {
    const { ownsProject, nft } = await validateNftProjectOwnership(2, OWNER);

    expect(ownsProject).toBe(false);
    expect(nft).toBeNull();
  });

  it('stores large token IDs without precision loss', async () => {
    const bigId = '123456789012345678901234567890';
    addNftProjectOwnership(1, CONTRACT, bigId, 'ethereum', OWNER);
    mockChain({ owner: OWNER });

    const { nft } = await validateNftProjectOwnership(1, OWNER);

    expect(nft?.nft_token_id).toBe(bigId);
  });

  it('upserts rather than duplicating on re-registration', async () => {
    const db = createTestDb();
    db.prepare("INSERT INTO users (google_id, email) VALUES ('g1', 'a@b.c')").run();
    db.prepare("INSERT INTO projects (owner_id, slug, name) VALUES (1, 'p1', 'P1')").run();

    addNftProjectOwnership(1, CONTRACT, 7, 'ethereum', OWNER);
    addNftProjectOwnership(1, CONTRACT, 9, 'polygon', OTHER);

    const rows = db
      .prepare('SELECT * FROM nft_project_ownership WHERE project_id = 1')
      .all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].nft_token_id).toBe('9');
    expect(rows[0].network).toBe('polygon');
  });

  describe('transferProjectOwnershipViaNft', () => {
    it('refuses a transfer from a wallet that does not hold the NFT', async () => {
      addNftProjectOwnership(1, CONTRACT, 7, 'ethereum', OWNER);
      mockChain({ owner: OTHER });

      const result = await transferProjectOwnershipViaNft(1, OWNER, OTHER);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/do not own/);
    });

    it('moves the project and the ownership record together', async () => {
      const db = createTestDb();
      db.prepare("INSERT INTO users (google_id, email) VALUES ('g1', 'a@b.c')").run();
      db.prepare("INSERT INTO projects (owner_id, slug, name) VALUES (1, 'p1', 'P1')").run();
      addNftProjectOwnership(1, CONTRACT, 7, 'ethereum', OWNER);
      mockChain({ owner: OWNER });

      const result = await transferProjectOwnershipViaNft(1, OWNER, OTHER);

      expect(result.success).toBe(true);

      const project = db
        .prepare('SELECT owner_wallet_address FROM projects WHERE id = 1')
        .get() as any;
      expect(project.owner_wallet_address).toBe(OTHER.toLowerCase());

      // The ownership record must follow, or the old owner keeps showing up in
      // getNftOwnedProjects.
      expect(getNftOwnedProjects(OTHER)).toContain(1);
      expect(getNftOwnedProjects(OWNER)).not.toContain(1);
    });

    it('creates a wallet record for the recipient', async () => {
      const db = createTestDb();
      db.prepare("INSERT INTO users (google_id, email) VALUES ('g1', 'a@b.c')").run();
      db.prepare("INSERT INTO projects (owner_id, slug, name) VALUES (1, 'p1', 'P1')").run();
      addNftProjectOwnership(1, CONTRACT, 7, 'ethereum', OWNER);
      mockChain({ owner: OWNER });

      await transferProjectOwnershipViaNft(1, OWNER, OTHER);

      const wallet = db
        .prepare('SELECT 1 FROM wallet_users WHERE wallet_address = ?')
        .get(OTHER.toLowerCase());
      expect(wallet).toBeTruthy();
    });
  });
});
