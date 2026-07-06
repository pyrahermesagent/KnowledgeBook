// Owner: update project settings (name, description, accent color, icon).
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const body = await readBody<{ name?: string, description?: string, accentColor?: string, iconUrl?: string }>(event)

  const name = body.name !== undefined ? body.name.trim() : project.name
  if (!name) throw createError({ statusCode: 400, message: 'Project name cannot be empty' })
  const accent = body.accentColor !== undefined ? body.accentColor.trim() : project.accent_color
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) throw createError({ statusCode: 400, message: 'Accent color must be a hex color like #346ddb' })

  useDb().prepare(`
    UPDATE projects
    SET name = ?, description = ?, accent_color = ?, icon_url = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name,
    body.description !== undefined ? body.description.trim() : project.description,
    accent,
    body.iconUrl !== undefined ? body.iconUrl : project.icon_url,
    project.id
  )
  return { ok: true }
})
