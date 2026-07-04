import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let s3: S3Client | null = null

function s3Config () {
  return useRuntimeConfig().s3
}

export function s3Enabled (): boolean {
  const cfg = s3Config()
  return Boolean(cfg.endpoint && cfg.bucket && cfg.accessKey && cfg.secretKey)
}

function useS3 (): S3Client {
  if (s3) return s3
  const cfg = s3Config()
  s3 = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region || 'auto',
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey }
  })
  return s3
}

function s3PublicUrl (key: string): string {
  const cfg = s3Config()
  if (cfg.publicUrl) return `${cfg.publicUrl.replace(/\/$/, '')}/${key}`
  const host = new URL(cfg.endpoint).host
  return `https://${cfg.bucket}.${host}/${key}`
}

/**
 * Stores a file in Hetzner Object Storage (S3 compatible) when configured,
 * otherwise on local disk under uploadsDir (served by /uploads/**).
 * Returns the public URL of the stored object.
 */
export async function storeFile (key: string, data: Buffer, contentType: string): Promise<string> {
  if (s3Enabled()) {
    await useS3().send(new PutObjectCommand({
      Bucket: s3Config().bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      ACL: 'public-read'
    }))
    return s3PublicUrl(key)
  }
  const base = resolve(useRuntimeConfig().uploadsDir)
  const path = resolve(base, key)
  if (!path.startsWith(base)) throw createError({ statusCode: 400, message: 'Invalid file key' })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  return `/uploads/${key}`
}
