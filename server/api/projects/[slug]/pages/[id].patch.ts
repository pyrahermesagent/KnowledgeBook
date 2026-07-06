// Owner: autosave endpoint — updates title/content/position/section of a page.
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, content?: string, position?: number, sectionId?: number | null }>(event)

  const db = useDb()
  const page = db.prepare('SELECT * FROM pages WHERE id = ? AND project_id = ?').get(id, project.id) as
    { id: number, section_id: number | null, title: string, content: string, position: number } | undefined
  if (!page) throw createError({ statusCode: 404, message: 'Page not found' })

  const title = body.title !== undefined ? body.title.trim() : page.title
  if (!title) throw createError({ statusCode: 400, message: 'Page title cannot be empty' })
  const sectionId = body.sectionId !== undefined ? body.sectionId : page.section_id
  if (sectionId != null && !db.prepare('SELECT 1 FROM sections WHERE id = ? AND project_id = ?').get(sectionId, project.id)) {
    throw createError({ statusCode: 404, message: 'Section not found' })
  }

  db.prepare(`
    UPDATE pages SET title = ?, content = ?, position = ?, section_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(title, body.content ?? page.content, body.position ?? page.position, sectionId, id)
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id)
  return { ok: true, savedAt: new Date().toISOString() }
})
