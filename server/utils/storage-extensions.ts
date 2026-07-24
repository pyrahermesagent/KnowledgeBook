import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { useRuntimeConfig } from '#imports'

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
 * IPFS Storage Adapter
 * Stores files in IPFS via Pinata or infura IPFS gateway
 */
import type { ReadStream } from 'node:fs'

export interface IPFSResponse {
  cid: string
  path: string
  size: number
  mimeType: string
}

export interface IStorageAdapter {
  store(key: string, data: Buffer, contentType: string): Promise<string>
  retrieve(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
  getUrl(key: string): string
}

/**
 * IPFS storage adapter implementation
 * Uses Pinata IPFS gateway API for simplicity
 */
export class IPFSAdapter implements IStorageAdapter {
  private gatewayUrl: string
  private pinataApiKey: string
  private pinataSecretKey: string

  constructor(config: {
    gatewayUrl?: string
    pinataApiKey?: string
    pinataSecretKey?: string
  } = {}) {
    this.gatewayUrl = config.gatewayUrl || 'https://gateway.pinata.cloud'
    this.pinataApiKey = config.pinataApiKey || ''
    this.pinataSecretKey = config.pinataSecretKey || ''
  }

  private getHeaders (): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    }
    
    if (this.pinataApiKey && this.pinataSecretKey) {
      headers['Authorization'] = `Bearer ${this.pinataApiKey}:${this.pinataSecretKey}`
      headers['Content-Type'] = 'application/json'
    }
    
    return headers
  }

  async store (key: string, data: Buffer, contentType: string): Promise<string> {
    // Use Pinata's pinFileToIPFS API
    const url = `${this.gatewayUrl}/pinning/pinFileToIPFS`
    
    const formData = new FormData()
    // In Node.js, you'd need to create a Blob from Buffer
    const fileBlob = new Blob([data], { type: contentType })
    formData.append('file', fileBlob, key)
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: formData as any
      })
      
      if (!response.ok) {
        throw new Error(`IPFS store failed: ${response.statusText}`)
      }
      
      const result = await response.json()
      return `ipfs://${result.IpfsHash}`
    } catch (error) {
      console.error('IPFS store failed:', error)
      throw error
    }
  }

  async retrieve (key: string): Promise<Buffer> {
    // Extract CID from ipfs://CID or just use the key as CID
    const cid = key.replace('ipfs://', '').replace('ipfs/', '')
    const url = `${this.gatewayUrl}/ipfs/${cid}`
    
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`IPFS retrieve failed: ${response.statusText}`)
      }
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      console.error('IPFS retrieve failed:', error)
      throw error
    }
  }

  async delete (key: string): Promise<void> {
    const cid = key.replace('ipfs://', '').replace('ipfs/', '')
    const url = `${this.gatewayUrl}/pinning/unpin/${cid}`
    
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`IPFS delete failed: ${response.statusText}`)
      }
    } catch (error) {
      console.error('IPFS delete failed:', error)
      throw error
    }
  }

  async list (prefix?: string): Promise<string[]> {
    // Pinata doesn't have a simple list API - this would need pagination
    return []
  }

  getUrl (key: string): string {
    const cid = key.replace('ipfs://', '').replace('ipfs/', '')
    return `${this.gatewayUrl}/ipfs/${cid}`
  }
}

/**
 * Filecoin storage adapter (optional - for archival)
 * Uses Estuary or Filecoin CLI for integration
 */
export class FilecoinAdapter implements IStorageAdapter {
  async store (key: string, data: Buffer, contentType: string): Promise<string> {
    // Filecoin storage would use Estuary or similar API
    // For now, return a placeholder
    return `filecoin://placeholder/${Date.now()}`
  }

  async retrieve (key: string): Promise<Buffer> {
    return Buffer.from([])
  }

  async delete (key: string): Promise<void> {
    // No-op for placeholder
  }

  async list (prefix?: string): Promise<string[]> {
    return []
  }

  getUrl (key: string): string {
    return key
  }
}

/**
 * Arweave storage adapter (permanent storage)
 */
export class ArweaveAdapter implements IStorageAdapter {
  async store (key: string, data: Buffer, contentType: string): Promise<string> {
    // Arweave would use arweave-js library
    // For now, return a placeholder
    return `arweave://placeholder/${Date.now()}`
  }

  async retrieve (key: string): Promise<Buffer> {
    return Buffer.from([])
  }

  async delete (key: string): Promise<void> {
    // Arweave is immutable - can't delete
  }

  async list (prefix?: string): Promise<string[]> {
    return []
  }

  getUrl (key: string): string {
    return key
  }
}

/**
 * Updated storeFile function with storage adapter support
 * Tries IPFS first, falls back to S3, then local
 */
export async function storeFileWithAdapter (key: string, data: Buffer, contentType: string): Promise<string> {
  // Try IPFS first
  const ipfs = new IPFSAdapter({
    gatewayUrl: useRuntimeConfig().ipfs?.gatewayUrl,
    pinataApiKey: useRuntimeConfig().ipfs?.pinataApiKey,
    pinataSecretKey: useRuntimeConfig().ipfs?.pinataSecretKey
  })
  
  try {
    const ipfsUrl = await ipfs.store(key, data, contentType)
    return ipfsUrl
  } catch (error) {
    console.log('IPFS store failed, falling back to S3:', error)
  }
  
  // Fallback to S3
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
  
  // Final fallback to local
  const base = resolve(useRuntimeConfig().uploadsDir)
  const path = resolve(base, key)
  if (!path.startsWith(base)) throw createError({ statusCode: 400, message: 'Invalid file key' })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  return `/uploads/${key}`
}
