export default defineEventHandler(async (event) => {
  const { project } = await requireOwnedProject(event)
  const id = Number(getRouterParam(event, 'id'))
  const info = useDb().prepare('DELETE FROM pages WHERE id = ? AND project_id = ?').run(id, project.id)
  if (info.changes === 0) throw createError({ statusCode: 404, message: 'Page not found' })
  return { ok: true }
})
