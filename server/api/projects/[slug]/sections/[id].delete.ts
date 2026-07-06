export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const id = Number(getRouterParam(event, 'id'))
  const info = useDb().prepare('DELETE FROM sections WHERE id = ? AND project_id = ?').run(id, project.id)
  if (info.changes === 0) throw createError({ statusCode: 404, message: 'Section not found' })
  return { ok: true }
})
