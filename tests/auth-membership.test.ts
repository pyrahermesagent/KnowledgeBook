// tests/auth-membership.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isProjectMember } from '#utils/auth';
import { resolveIdentity } from '#utils/auth/identities';
import { createTestDb, destroyTestDbs } from './setup/db';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

afterAll(() => {
  destroyTestDbs();
});

// A counter, not just Date.now(), because two calls for the same owner in the
// same test (see "scopes membership to the project it was granted on") can
// land in the same millisecond and collide on the slug's UNIQUE constraint.
let projectSeq = 0;

function makeProject(ownerId: number): number {
  const row = db
    .prepare('INSERT INTO projects (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id')
    .get(ownerId, `p-${ownerId}-${Date.now()}-${projectSeq++}`, 'Project') as { id: number };
  return row.id;
}

describe('isProjectMember', () => {
  it('matches an email invite issued before the person ever signed in', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(projectId, 'later@corp.com');

    // They sign in for the first time, and the invite resolves.
    const invitee = resolveIdentity(
      { provider: 'google', subject: 'later', email: 'later@corp.com' },
      null
    );

    expect(isProjectMember(projectId, invitee.userId, 'later@corp.com')).toBe(true);
  });

  it('matches a wallet invite against a linked identity', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    const address = '0x1111111111111111111111111111111111111111';
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'eip155', ?)"
    ).run(projectId, address);

    const invitee = resolveIdentity({ provider: 'eip155', subject: address }, null);

    expect(isProjectMember(projectId, invitee.userId, null)).toBe(true);
  });

  it('matches a wallet invite for an account that linked the wallet second', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    const address = 'SoLaNaAddress11111111111111111111111111111';
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'solana', ?)"
    ).run(projectId, address);

    const invitee = resolveIdentity({ provider: 'google', subject: 'invitee' }, null);
    resolveIdentity({ provider: 'solana', subject: address }, invitee.userId);

    expect(isProjectMember(projectId, invitee.userId, null)).toBe(true);
  });

  it('does not match a stranger', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    const stranger = resolveIdentity({ provider: 'google', subject: 'stranger' }, null);

    expect(isProjectMember(projectId, stranger.userId, 'stranger@corp.com')).toBe(false);
  });

  it('does not match a wallet invite whose identifier happens to equal the email being checked', () => {
    // A wallet invite's identifier is an address, not an email, but nothing in
    // storage stops the two strings coinciding. The kind check is what keeps
    // an email lookup from wandering into a wallet row by string luck.
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'eip155', ?)"
    ).run(projectId, 'collide@corp.com');

    const stranger = resolveIdentity(
      { provider: 'google', subject: 'collider', email: 'collide@corp.com' },
      null
    );

    expect(isProjectMember(projectId, stranger.userId, 'collide@corp.com')).toBe(false);
  });

  it('does not let a null email match an email invite', () => {
    // A wallet-only account has no email. SQL comparison against NULL must not
    // be allowed to match a row by accident.
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(projectId, 'someone@corp.com');

    const walletUser = resolveIdentity(
      { provider: 'eip155', subject: '0x2222222222222222222222222222222222222222' },
      null
    );

    expect(isProjectMember(projectId, walletUser.userId, null)).toBe(false);
  });

  it('scopes membership to the project it was granted on', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectA = makeProject(owner.userId);
    const projectB = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(projectA, 'guest@corp.com');
    const guest = resolveIdentity(
      { provider: 'google', subject: 'guest', email: 'guest@corp.com' },
      null
    );

    expect(isProjectMember(projectA, guest.userId, 'guest@corp.com')).toBe(true);
    expect(isProjectMember(projectB, guest.userId, 'guest@corp.com')).toBe(false);
  });
});
