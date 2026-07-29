// tests/project-members-endpoint.test.ts
//
// Contract coverage for GET /api/projects/[slug]/members. Task 10 replaced
// this endpoint's { admin, members } response with a bare project_members
// array and its requireProjectAccess guard with requireProjectAdmin — nothing
// caught either regression because nothing exercised the endpoint directly.
// These tests pin both: the response shape the dashboard's Team panel reads,
// and that any project member (not just the admin) can load the roster.
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { createEvent } from 'h3';
import type { H3Event } from 'h3';
import membersGetHandler from '#server/api/projects/[slug]/members/index.get';
import { requireProjectAccess, requireProjectAdmin } from '#utils/auth';
import { resolveIdentity } from '#utils/auth/identities';
import { createTestDb, destroyTestDbs } from './setup/db';

const globals = globalThis as Record<string, unknown>;

// The endpoint module references requireProjectAccess (and, during the
// guard bite-check below, requireProjectAdmin) as bare identifiers — Nitro's
// build-time auto-import supplies those in the real app. Under plain vitest
// there is no build step, so both must be wired up as globals the same way
// tests/setup/nuxt-globals.ts does for useDb, createError, etc.
globals.requireProjectAccess = requireProjectAccess;
globals.requireProjectAdmin = requireProjectAdmin;

let db: ReturnType<typeof createTestDb>;
let projectSeq = 0;

/** Minimal node req/res pair good enough for h3 to build an event from. */
function createTestEvent(params: Record<string, string>): H3Event {
  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
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
  return event;
}

/** Stand in for the signed-in session #utils/auth's requireUser reads. */
function sessionAs(userId: number, email: string | null = null): void {
  globals.requireUserSession = async () => ({
    user: { id: userId, email, name: '', avatar: '' },
  });
}

function makeProject(ownerId: number): { id: number; slug: string } {
  const slug = `members-endpoint-${ownerId}-${projectSeq++}`;
  const row = db
    .prepare('INSERT INTO projects (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id')
    .get(ownerId, slug, 'Project') as { id: number };
  return { id: row.id, slug };
}

describe('GET /api/projects/[slug]/members', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    delete globals.requireUserSession;
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('returns the { admin, members } contract the dashboard Team panel reads', async () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'owner-1', email: 'owner1@corp.com' },
      null
    );
    const project = makeProject(owner.userId);
    sessionAs(owner.userId, 'owner1@corp.com');

    const result = (await membersGetHandler(createTestEvent({ slug: project.slug }))) as {
      admin: { email: string; name: string; avatar: string; role: string };
      members: unknown[];
    };

    expect(result).toHaveProperty('admin');
    expect(result).toHaveProperty('members');
    expect(Array.isArray(result.members)).toBe(true);
    expect(result.admin.email).toBe('owner1@corp.com');
    expect(result.admin.role).toBe('admin');
  });

  it('lists a wallet invite with its kind/identifier, resolved once that address has signed in', async () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'owner-2', email: 'owner2@corp.com' },
      null
    );
    const project = makeProject(owner.userId);
    const address = '0x3333333333333333333333333333333333333333';
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'eip155', ?)"
    ).run(project.id, address);

    // The invitee signs in with that wallet after the invite was issued.
    resolveIdentity({ provider: 'eip155', subject: address, displayName: 'Wallet Guy' }, null);

    sessionAs(owner.userId, 'owner2@corp.com');
    const result = (await membersGetHandler(createTestEvent({ slug: project.slug }))) as {
      members: { kind: string; identifier: string; name: string; pending: boolean }[];
    };

    const member = result.members.find((m) => m.identifier === address);
    expect(member).toBeDefined();
    expect(member!.kind).toBe('eip155');
    expect(member!.name).toBe('Wallet Guy');
    expect(member!.pending).toBe(false);
  });

  it('marks a wallet invite pending when that address has never signed in', async () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'owner-3', email: 'owner3@corp.com' },
      null
    );
    const project = makeProject(owner.userId);
    const address = '0x4444444444444444444444444444444444444444';
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'eip155', ?)"
    ).run(project.id, address);

    sessionAs(owner.userId, 'owner3@corp.com');
    const result = (await membersGetHandler(createTestEvent({ slug: project.slug }))) as {
      members: { identifier: string; pending: boolean; name: string }[];
    };

    const member = result.members.find((m) => m.identifier === address);
    expect(member).toBeDefined();
    expect(member!.pending).toBe(true);
    expect(member!.name).toBe('');
  });

  // Pins requireProjectAccess: a non-admin invited member can load the roster
  // they can see today. If the guard is ever swapped back to
  // requireProjectAdmin, this test fails — see the report for the bite-check.
  it('lets a non-admin project member load the roster', async () => {
    const owner = resolveIdentity(
      { provider: 'google', subject: 'owner-4', email: 'owner4@corp.com' },
      null
    );
    const project = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(project.id, 'guest4@corp.com');
    const guest = resolveIdentity(
      { provider: 'google', subject: 'guest-4', email: 'guest4@corp.com' },
      null
    );

    sessionAs(guest.userId, 'guest4@corp.com');

    await expect(
      membersGetHandler(createTestEvent({ slug: project.slug }))
    ).resolves.toHaveProperty('admin');
  });
});
