export default defineEventHandler(async (event) => {
  const { project } = await requireOwnedProject(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, position?: number }>(event)

  const db = useDb()
  const section = db.prepare('SELECT id, title, position FROM sections WHERE id = ? AND project_id = ?')
    .get(id, project.id) as { id: number, title: string, position: number } | undefined
  if (!section) throw createError({ statusCode: 404, message: 'Section not found' })

  const title = body.title !== undefined ? body.title.trim() : section.title
  if (!title) throw createError({ statusCode: 400, message: 'Section title cannot be empty' })
  db.prepare('UPDATE sections SET title = ?, position = ? WHERE id = ?')
    .run(title, body.position ?? section.position, id)
  return { ok: true }
})
