export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string, slug?: string, description?: string }>(event)
  const name = body.name?.trim()
  if (!name) throw createError({ statusCode: 400, message: 'Project name is required' })

  const slug = slugify(body.slug?.trim() || name)
  if (!slug) throw createError({ statusCode: 400, message: 'Could not derive a valid link from that name' })
  if (RESERVED_SLUGS.has(slug)) throw createError({ statusCode: 400, message: `"${slug}" is a reserved link` })
  if (getProjectBySlug(slug)) throw createError({ statusCode: 409, message: `The link /${slug} is already taken` })

  const db = useDb()
  const info = db
    .prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)')
    .run(user.id, slug, name, body.description?.trim() ?? '')

  // Every project starts with a "Getting started" section and an intro page.
  const projectId = Number(info.lastInsertRowid)
  const section = db.prepare('INSERT INTO sections (project_id, title, position) VALUES (?, ?, 0)')
    .run(projectId, 'Getting started')
  db.prepare('INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, 0)')
    .run(projectId, Number(section.lastInsertRowid), 'introduction', 'Introduction',
      `# ${name}\n\nWelcome to your new documentation. Select this page in the editor and start writing — everything is **markdown**.\n`)

  return { slug }
})
