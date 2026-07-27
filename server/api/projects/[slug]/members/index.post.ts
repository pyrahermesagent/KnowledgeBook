import { getAdapter } from '#utils/auth/chains';
import { WALLET_PROVIDERS, type WalletProvider } from '#utils/auth/types';

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
    if (!identifier.includes('@')) {
      throw createError({ statusCode: 400, message: 'That is not a valid email address' });
    }
  } else if (WALLET_PROVIDERS.includes(kind as WalletProvider)) {
    // Canonicalize so an invite matches however the person encodes their
    // address when they sign in.
    identifier = getAdapter(kind).canonicalize(raw.trim());
  } else {
    throw createError({ statusCode: 400, message: `Unsupported member kind: ${kind}` });
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
