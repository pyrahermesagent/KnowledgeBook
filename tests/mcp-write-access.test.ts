// tests/mcp-write-access.test.ts
//
// Real coverage for the MCP write-authorization check.
//
// The write tools (create_page, update_page, create_section) all gate on
// hasProjectWriteAccess in server/routes/mcp.ts, which was rewired during this
// branch from a direct `project_members WHERE email = ?` lookup to the
// identity-aware isProjectMember. Nothing verified it: tests/mcp.test.ts built
// its own tables and never imported the route, so a revert to the email-only
// query passed the entire suite. These tests run the real function against a
// real database.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { hasProjectWriteAccess } from '#server/routes/mcp';
import { isProjectMember } from '#utils/auth';
import { resolveIdentity } from '#utils/auth/identities';
import { createTestDb, destroyTestDbs } from './setup/db';

const globals = globalThis as Record<string, unknown>;

// server/routes/mcp.ts calls isProjectMember as a bare identifier — Nitro's
// build-time auto-import supplies it in the real app, and there is no build
// step under plain vitest. Same wiring tests/project-members-endpoint.test.ts
// does for requireProjectAccess.
globals.isProjectMember = isProjectMember;

let db: ReturnType<typeof createTestDb>;
let projectSeq = 0;

function makeProject(ownerId: number): number {
  const slug = `mcp-write-${ownerId}-${projectSeq++}`;
  const row = db
    .prepare('INSERT INTO projects (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id')
    .get(ownerId, slug, 'Project') as { id: number };
  return row.id;
}

function addMember(projectId: number, kind: string, identifier: string): void {
  db.prepare('INSERT INTO project_members (project_id, kind, identifier) VALUES (?, ?, ?)').run(
    projectId,
    kind,
    identifier
  );
}

describe('MCP hasProjectWriteAccess', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('grants write access to the project owner', () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'mcp-owner-1', email: 'mcpowner1@corp.com' },
      null
    );
    const projectId = makeProject(owner.userId);

    expect(hasProjectWriteAccess(projectId, owner.userId, 'mcpowner1@corp.com')).toBe(true);
  });

  it('grants write access to an email-invited member', () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'mcp-owner-2', email: 'mcpowner2@corp.com' },
      null
    );
    const projectId = makeProject(owner.userId);
    addMember(projectId, 'email', 'mcpguest2@corp.com');

    const guest = resolveIdentity(
      { provider: 'google', subject: 'mcp-guest-2', email: 'mcpguest2@corp.com' },
      null
    );

    expect(hasProjectWriteAccess(projectId, guest.userId, 'mcpguest2@corp.com')).toBe(true);
  });

  it('grants write access to a wallet-invited member', () => {
    // The one this branch actually changed. An email-only membership query
    // returns false here: this account has no email at all, and the membership
    // row is keyed by a wallet address rather than an address column that
    // query ever reads.
    const owner = resolveIdentity(
      { provider: 'google', subject: 'mcp-owner-3', email: 'mcpowner3@corp.com' },
      null
    );
    const projectId = makeProject(owner.userId);

    const address = '0x7777777777777777777777777777777777777777';
    addMember(projectId, 'eip155', address);

    const invitee = resolveIdentity(
      { provider: 'eip155', subject: address, displayName: 'Wallet Member' },
      null
    );
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(invitee.userId) as {
      email: string | null;
    };
    expect(user.email).toBeNull(); // wallet-only account: nothing for an email match to hit

    expect(hasProjectWriteAccess(projectId, invitee.userId, null)).toBe(true);
  });

  it('grants write access to a Polkadot-invited member', () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'mcp-owner-4', email: 'mcpowner4@corp.com' },
      null
    );
    const projectId = makeProject(owner.userId);

    const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
    addMember(projectId, 'polkadot', address);

    const invitee = resolveIdentity({ provider: 'polkadot', subject: address }, null);

    expect(hasProjectWriteAccess(projectId, invitee.userId, null)).toBe(true);
  });

  it('refuses a signed-in account that is neither owner nor member', () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'mcp-owner-5', email: 'mcpowner5@corp.com' },
      null
    );
    const projectId = makeProject(owner.userId);
    addMember(projectId, 'email', 'somebodyelse@corp.com');

    const outsider = resolveIdentity(
      { provider: 'google', subject: 'mcp-outsider-5', email: 'outsider5@corp.com' },
      null
    );

    expect(hasProjectWriteAccess(projectId, outsider.userId, 'outsider5@corp.com')).toBe(false);
  });

  it('refuses a wallet account whose address was invited to a different project', () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'mcp-owner-6', email: 'mcpowner6@corp.com' },
      null
    );
    const invited = makeProject(owner.userId);
    const other = makeProject(owner.userId);

    const address = '0x8888888888888888888888888888888888888888';
    addMember(invited, 'eip155', address);
    const invitee = resolveIdentity({ provider: 'eip155', subject: address }, null);

    expect(hasProjectWriteAccess(invited, invitee.userId, null)).toBe(true);
    expect(hasProjectWriteAccess(other, invitee.userId, null)).toBe(false);
  });

  it('refuses an unauthenticated-style call with no email and no identities', () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'mcp-owner-7', email: 'mcpowner7@corp.com' },
      null
    );
    const projectId = makeProject(owner.userId);
    addMember(projectId, 'email', 'invited7@corp.com');

    // A user id that owns nothing and matches nothing. A membership check that
    // let a null email match a null-ish identifier would wrongly pass here.
    const stranger = db
      .prepare("INSERT INTO users (email, name) VALUES (NULL, 'Nobody') RETURNING id")
      .get() as { id: number };

    expect(hasProjectWriteAccess(projectId, stranger.id, null)).toBe(false);
  });
});
