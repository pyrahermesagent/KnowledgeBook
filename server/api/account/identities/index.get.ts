// server/api/account/identities/index.get.ts
import { listIdentities } from '#utils/auth/identities';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);

  return {
    identities: listIdentities(user.id).map((i) => ({
      id: i.id,
      provider: i.provider,
      subject: i.subject,
      chain_id: i.chain_id,
      label: i.label,
      created_at: i.created_at,
      last_used_at: i.last_used_at,
    })),
  };
});
