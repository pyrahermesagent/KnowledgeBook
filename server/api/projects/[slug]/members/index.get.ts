// Team roster: the admin (project owner) first, then invited members.
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event);
  const db = useDb();

  const admin = db
    .prepare('SELECT email, name, avatar FROM users WHERE id = ?')
    .get(project.owner_id) as { email: string | null; name: string; avatar: string } | undefined;

  // A member may not have signed in yet — join their account when one exists.
  // Email invites match on users.email; wallet invites match through the
  // identity table, so a member who signed in with a wallet still resolves.
  const members = db
    .prepare(
      `
    SELECT m.id, m.kind, m.identifier, m.added_at, u.name, u.avatar
    FROM project_members m
    LEFT JOIN users u ON u.id = (
      CASE WHEN m.kind = 'email'
        THEN (SELECT id FROM users WHERE lower(email) = m.identifier)
        ELSE (SELECT user_id FROM user_identities i
              WHERE i.provider = m.kind AND i.subject = m.identifier)
      END
    )
    WHERE m.project_id = ?
    ORDER BY m.added_at, m.id
  `
    )
    .all(project.id) as {
    id: number;
    kind: string;
    identifier: string;
    added_at: string;
    name: string | null;
    avatar: string | null;
  }[];

  return {
    admin: {
      email: admin?.email ?? '',
      name: admin?.name ?? '',
      avatar: admin?.avatar ?? '',
      role: 'admin',
    },
    members: members.map((m) => ({
      id: m.id,
      kind: m.kind,
      email: m.identifier,
      identifier: m.identifier,
      name: m.name ?? '',
      avatar: m.avatar ?? '',
      pending: m.name === null,
      role: 'member',
    })),
  };
});
