// server/api/account/identities/[id].delete.ts
import { unlinkIdentity } from '#utils/auth/identities';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, message: 'Invalid identity id' });
  }

  // Throws 404 when it is not theirs, 400 when it is their last one.
  unlinkIdentity(user.id, id);

  return { ok: true };
});
