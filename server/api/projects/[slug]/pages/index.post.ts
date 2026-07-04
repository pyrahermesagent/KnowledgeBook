export default defineEventHandler(async (event) => {
  const { project } = await requireOwnedProject(event)
  const body = await readBody<{ title?: string, sectionId?: number }>(event)
  const title = body.title?.trim()
  if (!title) throw createError({ statusCode: 400, message: 'Page title is required' })

  const db = useDb()
  if (body.sectionId != null) {
    const section = db.prepare('SELECT id FROM sections WHERE id = ? AND project_id = ?').get(body.sectionId, project.id)
    if (!section) throw createError({ statusCode: 404, message: 'Section not found' })
  }

  // Derive a slug from the title, adding -2, -3, ... until unique within the project.
  const base = slugify(title) || 'page'
  let slug = base
  for (let n = 2; db.prepare('SELECT 1 FROM pages WHERE project_id = ? AND slug = ?').get(project.id, slug); n++) {
    slug = `${base}-${n}`
  }

  const { max } = db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM pages WHERE project_id = ? AND section_id IS ?')
    .get(project.id, body.sectionId ?? null) as { max: number }
  const info = db.prepare('INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(project.id, body.sectionId ?? null, slug, title, `# ${title}\n`, max + 1)
  return { id: Number(info.lastInsertRowid), slug }
})
