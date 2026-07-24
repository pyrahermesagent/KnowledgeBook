// Public: full project tree (used by both the public docs view and the editor).
export default defineEventHandler(async (event) => {
  const project = getProjectBySlug(getRouterParam(event, 'slug')!)
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' })

  const db = useDb()
  const sections = db
    .prepare('SELECT id, title, position FROM sections WHERE project_id = ? ORDER BY position, id')
    .all(project.id) as Array<{ id: number, title: string, position: number, pages: unknown[] }>
  const pages = db
    .prepare('SELECT id, section_id, slug, title, position, updated_at FROM pages WHERE project_id = ? ORDER BY position, id')
    .all(project.id) as Array<{ id: number, section_id: number | null, slug: string, title: string }>

  for (const section of sections) {
    section.pages = pages.filter(p => p.section_id === section.id)
  }

  const session = await getUserSession(event)
  const sessionUser = session.user as { id?: number, email?: string } | undefined
  const isAdmin = sessionUser?.id === project.owner_id
  const canEdit = isAdmin || (sessionUser?.email ? isProjectMember(project.id, sessionUser.email) : false)

  return {
    slug: project.slug,
    name: project.name,
    description: project.description,
    accentColor: project.accent_color,
    iconUrl: project.icon_url,
    fontFamily: project.font_family,
    bgColor: project.bg_color,
    bgSubtle: project.bg_subtle,
    textColor: project.text_color,
    textColorMuted: project["text-muted"],
    borderColor: project.border_color,
    radius: project.radius,
    isOwner: isAdmin,
    isAdmin,
    canEdit,
    sections
  }
})
