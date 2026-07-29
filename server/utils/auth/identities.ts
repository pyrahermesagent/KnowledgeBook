// server/utils/auth/identities.ts
import type { Provider } from './types';

export interface IdentityRow {
  id: number;
  user_id: number;
  provider: Provider;
  subject: string;
  chain_id: string | null;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ResolveInput {
  provider: Provider;
  /** Canonical: the OAuth sub, or an address already through canonicalize(). */
  subject: string;
  chainId?: string | null;
  label?: string | null;
  /** Used only when creating a brand new account. */
  displayName?: string;
  email?: string | null;
  avatar?: string;
}

export interface ResolveResult {
  userId: number;
  /** True when this call attached the identity to an existing account. */
  linked: boolean;
  /** True when this call created the account. */
  created: boolean;
}

/** A readable account name for a wallet-only user: 0x1111…1111 */
function shortenSubject(subject: string): string {
  return subject.length > 12 ? `${subject.slice(0, 6)}…${subject.slice(-4)}` : subject;
}

/**
 * Map a proven identity onto an account, creating or linking as needed.
 *
 * currentUserId is the signed-in account, or null. Passing it is what makes
 * connecting a second wallet link rather than fork a new account.
 *
 * Throws 409 rather than reassigning an identity that belongs to someone else —
 * silently moving it would hand one person's projects to another.
 */
export function resolveIdentity(input: ResolveInput, currentUserId: number | null): ResolveResult {
  const db = useDb();

  const run = db.transaction((): ResolveResult => {
    const existing = db
      .prepare('SELECT id, user_id FROM user_identities WHERE provider = ? AND subject = ?')
      .get(input.provider, input.subject) as { id: number; user_id: number } | undefined;

    if (existing) {
      if (currentUserId !== null && currentUserId !== existing.user_id) {
        throw createError({
          statusCode: 409,
          message: 'This login method is linked to another account. Sign out first.',
        });
      }

      db.prepare("UPDATE user_identities SET last_used_at = datetime('now') WHERE id = ?").run(
        existing.id
      );
      return { userId: existing.user_id, linked: false, created: false };
    }

    let userId = currentUserId;
    let created = false;

    if (userId === null) {
      const row = db
        .prepare('INSERT INTO users (email, name, avatar) VALUES (?, ?, ?) RETURNING id')
        .get(
          input.email ?? null,
          input.displayName || shortenSubject(input.subject),
          input.avatar ?? ''
        ) as { id: number };
      userId = row.id;
      created = true;
    }

    db.prepare(
      `INSERT INTO user_identities (user_id, provider, subject, chain_id, label, last_used_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(userId, input.provider, input.subject, input.chainId ?? null, input.label ?? null);

    // A Google sign-in is how an account gets an email; a wallet never supplies
    // one, so this only fills a gap and never clears an existing value.
    if (!created && input.email) {
      db.prepare('UPDATE users SET email = COALESCE(email, ?) WHERE id = ?').run(
        input.email,
        userId
      );
    }

    return { userId, linked: !created, created };
  });

  return run();
}

export function listIdentities(userId: number): IdentityRow[] {
  return useDb()
    .prepare('SELECT * FROM user_identities WHERE user_id = ? ORDER BY created_at, id')
    .all(userId) as IdentityRow[];
}

/**
 * Detach a login method, refusing to leave an account unreachable.
 */
export function unlinkIdentity(userId: number, identityId: number): void {
  const db = useDb();

  // Ownership and the last-login-method guard both ride on the DELETE itself.
  // A check-then-delete left a window in which two tabs removing the account's
  // two remaining identities could each see a count of 2 and both delete,
  // leaving the account with no way to sign in.
  const { changes } = db
    .prepare(
      `DELETE FROM user_identities
       WHERE id = ? AND user_id = ?
         AND (SELECT COUNT(*) FROM user_identities WHERE user_id = ?) > 1`
    )
    .run(identityId, userId, userId);

  if (changes > 0) return;

  // Nothing was deleted, so work out which of the two guards refused: not
  // theirs / gone (404) or their last one (400).
  const identity = db
    .prepare('SELECT id FROM user_identities WHERE id = ? AND user_id = ?')
    .get(identityId, userId) as { id: number } | undefined;

  if (!identity) {
    throw createError({ statusCode: 404, message: 'Login method not found' });
  }

  throw createError({
    statusCode: 400,
    message: 'This is your last login method — you would not be able to sign in again.',
  });
}
