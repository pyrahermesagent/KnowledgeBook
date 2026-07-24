import crypto from 'node:crypto';
import { LRUMap } from 'lru-map';

/**
 * Encryption service for KnowledgeBook
 * Provides AES-256-GCM encryption/decryption for page content
 */

const DEFAULT_ALGORITHM = 'aes-256-gcm';
const DEFAULT_KEY_LENGTH = 32; // 256 bits
const DEFAULT_IV_LENGTH = 12; // 96 bits recommended for GCM

// LRU cache for encryption keys (max 1000 entries)
const keyCache = new LRUMap<number, EncryptionKey>(1000);

/**
 * Cache entry for encryption key with rotation tracking
 */
interface EncryptionKey {
  projectId: number;
  key: Buffer;
  keyId: string;
  createdAt: number;
}

/**
 * Check if a cached key has been rotated (invalid)
 */
function isKeyRotated(key: EncryptionKey): boolean {
  const db = useDb();
  const latestKey = db
    .prepare(
      'SELECT key_id, updated_at FROM encryption_keys WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1'
    )
    .get(key.projectId) as { key_id: string; updated_at: string } | undefined;

  if (!latestKey) return true;

  // Check if key_id matches
  if (latestKey.key_id !== key.keyId) return true;

  // Check if key was rotated after cache entry
  const cacheDate = new Date(key.createdAt);
  const latestDate = new Date(latestKey.updated_at);

  return latestDate > cacheDate;
}

/**
 * Generate a unique key ID for encryption tracking
 */
export function generateKeyId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a new encryption key
 */
export function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(DEFAULT_KEY_LENGTH);
}

/**
 * Get encryption key from cache or fetch from database
 * Implements LRU caching with rotation validation
 */
export function getEncryptionKey(projectId: number): Buffer {
  // Check cache first
  if (keyCache.has(projectId)) {
    const cached = keyCache.get(projectId)!;
    // Verify cache is still valid (not rotated)
    if (!isKeyRotated(cached)) {
      return cached.key;
    }
  }

  // Fetch from database and cache
  const keyRecord = dbPrepare(
    'SELECT encrypted_key, key_id, created_at FROM encryption_keys WHERE project_id = ?'
  ).get(projectId) as { encrypted_key: string; key_id: string; created_at: string } | undefined;

  if (!keyRecord) {
    return generateProjectKey(projectId);
  }

  try {
    // Decrypt the stored key using project master secret
    const masterSecret = `project-secret-${projectId}`;
    const masterKey = crypto.pbkdf2Sync(masterSecret, `project-${projectId}`, 100000, 32, 'sha256');

    const encryptedKeyBuffer = Buffer.from(keyRecord.encrypted_key, 'base64');
    const authTag = encryptedKeyBuffer.subarray(-16);
    const encryptedData = encryptedKeyBuffer.subarray(0, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, crypto.randomBytes(12));
    decipher.setAuthTag(authTag);

    const key = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    // Cache the key
    keyCache.set(projectId, {
      projectId,
      key,
      keyId: keyRecord.key_id,
      createdAt: Date.now(),
    });

    return key;
  } catch (error) {
    console.error('Failed to decrypt encryption key:', error);
    return generateProjectKey(projectId);
  }
}

/**
 * Encrypt content with AES-256-GCM
 * Returns encrypted data, IV, and key ID
 */
export function encrypt(
  plaintext: string,
  key: Buffer
): { data: string; iv: string; keyId: string } {
  const iv = crypto.randomBytes(DEFAULT_IV_LENGTH);
  const cipher = crypto.createCipheriv(DEFAULT_ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const authTag = cipher.getAuthTag();

  return {
    data: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('hex'),
    keyId: generateKeyId(),
  };
}

/**
 * Decrypt content with AES-256-GCM
 */
export function decrypt(encryptedData: string, iv: string, key: Buffer): string {
  const ivBuffer = Buffer.from(iv, 'hex');
  const dataBuffer = Buffer.from(encryptedData, 'base64');

  // Extract auth tag (last 16 bytes for GCM)
  const authTag = dataBuffer.subarray(-16);
  const encryptedDataBuffer = dataBuffer.subarray(0, -16);

  const decipher = crypto.createDecipheriv(DEFAULT_ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedDataBuffer), decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Compute SHA-256 hash of content for integrity verification
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Verify content hasn't been tampered with
 */
export function verifyContentHash(content: string, expectedHash: string): boolean {
  return computeContentHash(content) === expectedHash;
}

/**
 * Clear encryption key cache (for testing/rotation)
 */
export function clearKeyCache(): void {
  keyCache.clear();
}

/**
 * Get cache statistics
 */
export function getKeyCacheStats(): { size: number; maxSize: number } {
  return {
    size: keyCache.size,
    maxSize: keyCache.maxSize,
  };
}

// Helper to use dbPrepare pattern
function dbPrepare(sql: string) {
  return useDb().prepare(sql);
}
