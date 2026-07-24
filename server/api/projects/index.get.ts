export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return useDb()
    .prepare(
      `
      SELECT p.slug, p.name, p.description, p.accent_color, p.icon_url, p.font_family, p.bg_color, p.bg_subtle, p.text_color, p."text-muted", p.border_color, p.radius, p.updated_at,
             CASE WHEN p.owner_id = @id THEN 'admin' ELSE 'member' END AS role
      FROM projects p
      WHERE p.owner_id = @id
         OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.email = @email)
      ORDER BY p.updated_at DESC
    `
    )
    .all({ id: user.id, email: normalizeEmail(user.email) });
});
