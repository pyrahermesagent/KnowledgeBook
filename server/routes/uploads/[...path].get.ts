import { createReadStream, existsSync, statSync } from 'node:fs'
import { resolve, extname } from 'node:path'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4'
}

// Serves files from the local-disk upload fallback (dev / no S3 configured).
export default defineEventHandler((event) => {
  const base = resolve(useRuntimeConfig().uploadsDir)
  const path = resolve(base, getRouterParam(event, 'path')!)
  if (!path.startsWith(base) || !existsSync(path) || !statSync(path).isFile()) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  setHeader(event, 'Content-Type', MIME[extname(path).toLowerCase()] ?? 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return sendStream(event, createReadStream(path))
})
