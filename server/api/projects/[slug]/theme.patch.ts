// Update theme settings for a project
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const body = await readBody<{
    accentColor?: string, fontFamily?: string, bgColor?: string, bgSubtle?: string, 
    textColor?: string, textColorMuted?: string, borderColor?: string, radius?: number
  }>(event)

  const accent = body.accentColor !== undefined ? body.accentColor.trim() : project.accent_color
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) throw createError({ statusCode: 400, message: 'Accent color must be a hex color like #346ddb' })
  const radius = body.radius !== undefined ? body.radius : project.radius
  if (typeof radius !== 'number' || radius < 0 || radius > 20) {
    throw createError({ statusCode: 400, message: 'Radius must be a number between 0 and 20' })
  }

  useDb().prepare(`
    UPDATE projects
    SET accent_color = ?, font_family = ?, bg_color = ?, bg_subtle = ?, text_color = ?, "text-muted" = ?, border_color = ?, radius = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    accent,
    body.fontFamily !== undefined ? body.fontFamily.trim() : project.font_family,
    body.bgColor !== undefined ? body.bgColor.trim() : project.bg_color,
    body.bgSubtle !== undefined ? body.bgSubtle.trim() : project.bg_subtle,
    body.textColor !== undefined ? body.textColor.trim() : project.text_color,
    body.textColorMuted !== undefined ? body.textColorMuted.trim() : project["text-muted"],
    body.borderColor !== undefined ? body.borderColor.trim() : project.border_color,
    radius,
    project.id
  )
  return { ok: true }
})
