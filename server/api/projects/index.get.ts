export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return useDb()
    .prepare('SELECT slug, name, description, accent_color, icon_url, updated_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC')
    .all(user.id)
})
