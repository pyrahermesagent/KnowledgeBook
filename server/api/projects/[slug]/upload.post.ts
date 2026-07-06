import { randomUUID } from 'node:crypto'

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

// Owner: upload an image/file; stored in Hetzner Object Storage (or local disk in dev).
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.data?.length)
  if (!file) throw createError({ statusCode: 400, message: 'No file provided' })
  if (file.data.length > MAX_SIZE) throw createError({ statusCode: 413, message: 'File is larger than 20 MB' })

  const original = (file.filename ?? 'file').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
  const key = `projects/${project.slug}/${randomUUID().slice(0, 8)}-${original}`
  const url = await storeFile(key, file.data, file.type ?? 'application/octet-stream')
  return { url, name: file.filename ?? original, size: file.data.length }
})
