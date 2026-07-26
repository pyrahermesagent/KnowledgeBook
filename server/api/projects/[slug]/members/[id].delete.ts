// Any member (or the admin) can remove a member. The admin is not stored in
// project_members, so admin access can never be removed here.
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event);
  const id = Number(getRouterParam(event, 'id'));
  const result = useDb()
    .prepare('DELETE FROM project_members WHERE id = ? AND project_id = ?')
    .run(id, project.id);
  if (!result.changes) throw createError({ statusCode: 404, message: 'Member not found' });
  return { ok: true };
});
