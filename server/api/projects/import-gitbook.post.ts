export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ url?: string }>(event)
  const url = body.url?.trim()
  if (!url) throw createError({ statusCode: 400, message: 'GitBook URL is required' })
  return await importGitBookProject(user.id, url)
})
