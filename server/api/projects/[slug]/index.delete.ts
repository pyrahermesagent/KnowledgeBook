export default defineEventHandler(async (event) => {
  const { project } = await requireOwnedProject(event)
  useDb().prepare('DELETE FROM projects WHERE id = ?').run(project.id)
  return { ok: true }
})
