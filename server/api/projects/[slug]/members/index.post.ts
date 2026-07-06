// Any member (or the admin) can invite another person by their Google email.
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const body = await readBody<{ email?: string }>(event)
  const email = normalizeEmail(body.email ?? '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, message: 'Enter a valid email address, e.g. name@gmail.com' })
  }

  const db = useDb()
  const owner = db.prepare('SELECT email FROM users WHERE id = ?').get(project.owner_id) as { email: string } | undefined
  if (owner && normalizeEmail(owner.email) === email) {
    throw createError({ statusCode: 400, message: 'That person is the project admin and already has access' })
  }
  if (isProjectMember(project.id, email)) {
    throw createError({ statusCode: 409, message: 'That person is already a member of this project' })
  }

  const info = db.prepare('INSERT INTO project_members (project_id, email) VALUES (?, ?)').run(project.id, email)
  return { id: Number(info.lastInsertRowid), email }
})
