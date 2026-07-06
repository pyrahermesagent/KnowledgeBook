// Team roster: the admin (project owner) first, then invited members.
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const db = useDb()

  const admin = db.prepare('SELECT email, name, avatar FROM users WHERE id = ?')
    .get(project.owner_id) as { email: string, name: string, avatar: string } | undefined

  // A member may not have signed in yet — join their account info when it exists.
  const members = db.prepare(`
    SELECT m.id, m.email, m.added_at, u.name, u.avatar
    FROM project_members m
    LEFT JOIN users u ON lower(u.email) = m.email
    WHERE m.project_id = ?
    ORDER BY m.added_at, m.id
  `).all(project.id) as { id: number, email: string, added_at: string, name: string | null, avatar: string | null }[]

  return {
    admin: { email: admin?.email ?? '', name: admin?.name ?? '', avatar: admin?.avatar ?? '', role: 'admin' },
    members: members.map(m => ({
      id: m.id,
      email: m.email,
      name: m.name ?? '',
      avatar: m.avatar ?? '',
      pending: m.name === null,
      role: 'member'
    }))
  }
})
