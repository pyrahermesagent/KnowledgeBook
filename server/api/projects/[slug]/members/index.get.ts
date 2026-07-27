export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAdmin(event);

  return useDb()
    .prepare(
      'SELECT id, kind, identifier, role, added_at FROM project_members WHERE project_id = ? ORDER BY added_at'
    )
    .all(project.id) as {
    id: number;
    kind: string;
    identifier: string;
    role: string;
    added_at: string;
  }[];
});
