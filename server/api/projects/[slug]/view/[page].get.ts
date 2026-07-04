// Public: markdown content of a single page, addressed by its slug.
export default defineEventHandler(async (event) => {
  const project = getProjectBySlug(getRouterParam(event, 'slug')!)
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' })
  const page = useDb()
    .prepare('SELECT slug, title, content, updated_at FROM pages WHERE project_id = ? AND slug = ?')
    .get(project.id, getRouterParam(event, 'page'))
  if (!page) throw createError({ statusCode: 404, message: 'Page not found' })
  return page
})
