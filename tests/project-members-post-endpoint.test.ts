// tests/project-members-post-endpoint.test.ts
//
// Contract coverage for POST /api/projects/[slug]/members. Task 10 also
// switched this endpoint's guard from requireProjectAccess to
// requireProjectAdmin, restricting who can invite to admins-only — a third
// instance of the same plan defect the GET endpoint had (see
// tests/project-members-endpoint.test.ts). Nothing exercised this endpoint
// directly either, so nothing caught it. These tests pin the restored guard
// and the wallet-invite canonicalization path.
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { createEvent } from 'h3';
import type { H3Event } from 'h3';
import { getAddress } from 'viem';
import membersPostHandler from '#server/api/projects/[slug]/members/index.post';
import { requireProjectAccess, requireProjectAdmin, normalizeEmail } from '#utils/auth';
import { resolveIdentity } from '#utils/auth/identities';
import { createTestDb, destroyTestDbs } from './setup/db';

const globals = globalThis as Record<string, unknown>;

// The endpoint module references requireProjectAccess (and, during the guard
// bite-check below, requireProjectAdmin) and normalizeEmail as bare
// identifiers — Nitro's build-time auto-import supplies those in the real
// app. Under plain vitest there is no build step, so they must be wired up as
// globals, the same way tests/setup/nuxt-globals.ts does for useDb,
// createError, etc. (see tests/project-members-endpoint.test.ts for the same
// pattern against the sibling GET endpoint).
globals.requireProjectAccess = requireProjectAccess;
globals.requireProjectAdmin = requireProjectAdmin;
globals.normalizeEmail = normalizeEmail;

let db: ReturnType<typeof createTestDb>;
let projectSeq = 0;

/** Minimal node req/res pair good enough for h3 to build an event from. */
function createTestEvent(params: Record<string, string>, body: unknown): H3Event {
  const req = Object.assign(new EventEmitter(), {
    method: 'POST',
    url: '/',
    headers: {} as Record<string, string>,
  });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headersSent: false,
    setHeader: () => {},
    getHeader: () => undefined,
    getHeaders: () => ({}),
    removeHeader: () => {},
    writeHead: () => {},
    write: () => true,
    end: () => {},
  });
  const event = createEvent(req as never, res as never);
  // The test harness's getRouterParam stub (tests/setup/nuxt-globals.ts) reads
  // event.params directly rather than h3's real event.context.params.
  (event as unknown as { params: Record<string, string> }).params = params;
  // readBody is stubbed below to read this instead of parsing a real stream.
  (event as unknown as { _body: unknown })._body = body;
  return event;
}

globals.readBody = async (event: { _body?: unknown }) => event._body ?? {};

/** Stand in for the signed-in session #utils/auth's requireUser reads. */
function sessionAs(userId: number, email: string | null = null): void {
  globals.requireUserSession = async () => ({
    user: { id: userId, email, name: '', avatar: '' },
  });
}

function makeProject(ownerId: number): { id: number; slug: string } {
  const slug = `members-post-endpoint-${ownerId}-${projectSeq++}`;
  const row = db
    .prepare('INSERT INTO projects (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id')
    .get(ownerId, slug, 'Project') as { id: number };
  return { id: row.id, slug };
}

describe('POST /api/projects/[slug]/members', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    delete globals.requireUserSession;
  });

  afterAll(() => {
    destroyTestDbs();
  });

  // Pins requireProjectAccess: a non-admin invited member can invite someone
  // else, same as today. If the guard is ever swapped back to
  // requireProjectAdmin, this test fails — see the report for the bite-check.
  it('lets a non-admin project member invite someone', async () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'post-owner-1', email: 'postowner1@corp.com' },
      null
    );
    const project = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(project.id, 'postguest1@corp.com');
    const guest = resolveIdentity(
      { provider: 'google', subject: 'post-guest-1', email: 'postguest1@corp.com' },
      null
    );

    sessionAs(guest.userId, 'postguest1@corp.com');

    const result = (await membersPostHandler(
      createTestEvent({ slug: project.slug }, { email: 'invitee@corp.com' })
    )) as { ok: boolean; kind: string; identifier: string };

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('email');
    expect(result.identifier).toBe('invitee@corp.com');

    const row = db
      .prepare("SELECT identifier FROM project_members WHERE project_id = ? AND kind = 'email'")
      .all(project.id) as { identifier: string }[];
    expect(row.map((r) => r.identifier)).toContain('invitee@corp.com');
  });

  it('stores a wallet invite canonicalized regardless of the checksummed casing posted', async () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'post-owner-2', email: 'postowner2@corp.com' },
      null
    );
    const project = makeProject(owner.userId);
    sessionAs(owner.userId, 'postowner2@corp.com');

    // A properly EIP-55 checksummed (mixed-case) address — not just an
    // arbitrarily mixed-case string, since a bad checksum is itself invalid.
    const checksummed = getAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
    expect(checksummed).not.toBe(checksummed.toLowerCase()); // sanity: genuinely mixed case

    const result = (await membersPostHandler(
      createTestEvent({ slug: project.slug }, { kind: 'eip155', identifier: checksummed })
    )) as { ok: boolean; kind: string; identifier: string };

    expect(result.kind).toBe('eip155');
    expect(result.identifier).toBe(checksummed.toLowerCase());

    const row = db
      .prepare("SELECT identifier FROM project_members WHERE project_id = ? AND kind = 'eip155'")
      .get(project.id) as { identifier: string } | undefined;
    expect(row?.identifier).toBe(checksummed.toLowerCase());
  });

  // The rewrite weakened email validation to `identifier.includes('@')`, which
  // accepted the literal string "@" — and every other shape below — as a member.
  describe('email validation', () => {
    it.each(['@', 'a@b', 'no-at-sign.com', '@corp.com', 'user@', 'us er@corp.com', 'a@@b.com'])(
      'rejects %j as an email address',
      async (candidate) => {
        const owner = resolveIdentity(
          { provider: 'google', subject: `post-owner-email-${candidate}`, email: 'o@corp.com' },
          null
        );
        const project = makeProject(owner.userId);
        sessionAs(owner.userId, 'o@corp.com');

        await expect(
          membersPostHandler(createTestEvent({ slug: project.slug }, { email: candidate }))
        ).rejects.toMatchObject({ statusCode: 400 });

        const rows = db
          .prepare('SELECT COUNT(*) AS n FROM project_members WHERE project_id = ?')
          .get(project.id) as { n: number };
        expect(rows.n).toBe(0);
      }
    );

    it('still accepts an ordinary address', async () => {
      const owner = resolveIdentity(
        { provider: 'google', subject: 'post-owner-email-ok', email: 'ok-owner@corp.com' },
        null
      );
      const project = makeProject(owner.userId);
      sessionAs(owner.userId, 'ok-owner@corp.com');

      const result = (await membersPostHandler(
        createTestEvent({ slug: project.slug }, { email: 'Someone.Else+tag@Corp.co.uk' })
      )) as { identifier: string };

      expect(result.identifier).toBe('someone.else+tag@corp.co.uk');
    });
  });

  // The base endpoint refused to invite the project admin, who already has
  // access and is rendered separately from the member list. Dropping that check
  // let the owner be added as a member and appear twice in the roster.
  describe('inviting the project admin', () => {
    it('refuses the admin by email', async () => {
      const owner = resolveIdentity(
        { provider: 'google', subject: 'post-owner-self', email: 'selfowner@corp.com' },
        null
      );
      const project = makeProject(owner.userId);
      sessionAs(owner.userId, 'selfowner@corp.com');

      await expect(
        membersPostHandler(createTestEvent({ slug: project.slug }, { email: 'SelfOwner@corp.com' }))
      ).rejects.toMatchObject({ statusCode: 400, message: /project admin/i });

      const rows = db
        .prepare('SELECT COUNT(*) AS n FROM project_members WHERE project_id = ?')
        .get(project.id) as { n: number };
      expect(rows.n).toBe(0);
    });

    it('refuses a wallet address that resolves to the admin', async () => {
      // Same person, reached by a different login method: the address belongs
      // to an identity linked to the owner's account.
      const owner = resolveIdentity(
        { provider: 'google', subject: 'post-owner-wallet-self', email: 'walletowner@corp.com' },
        null
      );
      const address = '0x2222222222222222222222222222222222222222';
      resolveIdentity({ provider: 'eip155', subject: address }, owner.userId);

      const project = makeProject(owner.userId);
      sessionAs(owner.userId, 'walletowner@corp.com');

      await expect(
        membersPostHandler(
          createTestEvent({ slug: project.slug }, { kind: 'eip155', identifier: address })
        )
      ).rejects.toMatchObject({ statusCode: 400, message: /project admin/i });
    });

    it('still allows inviting a wallet that belongs to somebody else', async () => {
      const owner = resolveIdentity(
        { provider: 'google', subject: 'post-owner-wallet-other', email: 'otherowner@corp.com' },
        null
      );
      const address = '0x5555555555555555555555555555555555555555';
      resolveIdentity({ provider: 'eip155', subject: address }, null); // a different account

      const project = makeProject(owner.userId);
      sessionAs(owner.userId, 'otherowner@corp.com');

      const result = (await membersPostHandler(
        createTestEvent({ slug: project.slug }, { kind: 'eip155', identifier: address })
      )) as { ok: boolean };
      expect(result.ok).toBe(true);
    });

    it('still allows inviting an unseen wallet address', async () => {
      const owner = resolveIdentity(
        { provider: 'google', subject: 'post-owner-wallet-new', email: 'newowner@corp.com' },
        null
      );
      const project = makeProject(owner.userId);
      sessionAs(owner.userId, 'newowner@corp.com');

      const result = (await membersPostHandler(
        createTestEvent(
          { slug: project.slug },
          { kind: 'eip155', identifier: '0x6666666666666666666666666666666666666666' }
        )
      )) as { ok: boolean };
      expect(result.ok).toBe(true);
    });

    it('does not confuse an emailless admin with an invite that has no match', async () => {
      // A wallet-only owner has users.email = NULL; the admin check must not
      // treat that as matching an ordinary email invite.
      const owner = resolveIdentity(
        { provider: 'eip155', subject: '0x1010101010101010101010101010101010101010' },
        null
      );
      const project = makeProject(owner.userId);
      sessionAs(owner.userId, null);

      const result = (await membersPostHandler(
        createTestEvent({ slug: project.slug }, { email: 'guest@corp.com' })
      )) as { ok: boolean };
      expect(result.ok).toBe(true);
    });
  });
});
