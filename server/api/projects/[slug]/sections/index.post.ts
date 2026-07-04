export default defineEventHandler(async (event) => {
  const { project } = await requireOwnedProject(event)
  const body = await readBody<{ title?: string }>(event)
  const title = body.title?.trim()
  if (!title) throw createError({ statusCode: 400, message: 'Section title is required' })

  const db = useDb()
  const { max } = db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM sections WHERE project_id = ?')
    .get(project.id) as { max: number }
  const info = db.prepare('INSERT INTO sections (project_id, title, position) VALUES (?, ?, ?)')
    .run(project.id, title, max + 1)
  return { id: Number(info.lastInsertRowid) }
})
