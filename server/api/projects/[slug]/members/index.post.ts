import { getAdapter } from '#utils/auth/chains';
import { WALLET_PROVIDERS, type WalletProvider } from '#utils/auth/types';

/**
 * Same shape the endpoint used before member kinds existed. `identifier.includes('@')`
 * replaced it during the rewrite, which accepted the literal string "@" as a member.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * True when this identifier is the project admin.
 *
 * The admin already has full access and is rendered separately from the member
 * list, so adding them produces a person who appears twice in the roster. For a
 * wallet kind that means an address whose identity resolves to the owner's
 * account — the same person reached by a different login method.
 */
function isProjectAdmin(ownerId: number, kind: string, identifier: string): boolean {
  const db = useDb();

  if (kind === 'email') {
    const owner = db.prepare('SELECT email FROM users WHERE id = ?').get(ownerId) as
      { email: string | null } | undefined;
    return Boolean(owner?.email) && normalizeEmail(owner!.email!) === identifier;
  }

  const identity = db
    .prepare('SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?')
    .get(kind, identifier) as { user_id: number } | undefined;
  return identity?.user_id === ownerId;
}

export default defineEventHandler(async (event) => {
  // requireProjectAccess, not Admin: any member manages members in this product
  // ("Everyone below can edit this project and manage members" — the panel's own
  // copy), and that is what this endpoint enforced before this plan touched it.
  const { project } = await requireProjectAccess(event);
  const body = await readBody<{ kind?: string; identifier?: string; email?: string }>(event);

  // `email` stays accepted so an existing client keeps working.
  const kind = body.kind ?? 'email';
  const raw = body.identifier ?? body.email;

  if (!raw?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'An email address or wallet address is required',
    });
  }

  let identifier: string;
  if (kind === 'email') {
    identifier = normalizeEmail(raw);
    if (!EMAIL_PATTERN.test(identifier)) {
      throw createError({ statusCode: 400, message: 'That is not a valid email address' });
    }
  } else if (WALLET_PROVIDERS.includes(kind as WalletProvider)) {
    // Canonicalize so an invite matches however the person encodes their
    // address when they sign in.
    identifier = getAdapter(kind).canonicalize(raw.trim());
  } else {
    throw createError({ statusCode: 400, message: `Unsupported member kind: ${kind}` });
  }

  if (isProjectAdmin(project.owner_id, kind, identifier)) {
    throw createError({
      statusCode: 400,
      message: 'That person is the project admin and already has access',
    });
  }

  try {
    useDb()
      .prepare('INSERT INTO project_members (project_id, kind, identifier) VALUES (?, ?, ?)')
      .run(project.id, kind, identifier);
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      throw createError({ statusCode: 409, message: 'That person is already a member' });
    }
    throw error;
  }

  return { ok: true, kind, identifier };
});
