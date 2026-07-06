// Owner: full page record for the editor.
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const id = Number(getRouterParam(event, 'id'))
  const page = useDb()
    .prepare('SELECT id, section_id, slug, title, content, position, updated_at FROM pages WHERE id = ? AND project_id = ?')
    .get(id, project.id)
  if (!page) throw createError({ statusCode: 404, message: 'Page not found' })
  return page
})
