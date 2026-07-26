import crypto from 'node:crypto';
import { LruCache } from '#utils/cache';

/**
 * Encryption service for KnowledgeBook
 * Provides AES-256-GCM encryption/decryption for page content
 */

const DEFAULT_ALGORITHM = 'aes-256-gcm';
const DEFAULT_KEY_LENGTH = 32; // 256 bits
const DEFAULT_IV_LENGTH = 12; // 96 bits recommended for GCM

// Key-wrapping parameters. The salt is random per project key and stored with
// the wrapped key, so two projects never derive the same wrapping key even
// though the master secret is shared.
const WRAP_SALT_LENGTH = 16;
const WRAP_AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA512
const PBKDF2_DIGEST = 'sha512';

// LRU cache for encryption keys (max 1000 entries)
const keyCache = new LruCache<number, EncryptionKey>(1000);

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
 * Resolve the master secret used to wrap project keys.
 *
 * This must come from the environment. Deriving it from the project ID (as an
 * earlier version did) gave no protection at all: anyone with the database
 * could recompute every project key from the public row ID.
 */
function getMasterSecret(): string {
  const config = useRuntimeConfig();
  const secret =
    config.encryptionMasterKey ||
    process.env.NUXT_ENCRYPTION_MASTER_KEY ||
    // The session password is already a mandatory high-entropy secret, so it is
    // a safe fallback for deployments that have not set a dedicated key yet.
    config.session?.password ||
    process.env.NUXT_SESSION_PASSWORD;

  if (!secret) {
    throw new Error(
      'No encryption master secret configured. Set NUXT_ENCRYPTION_MASTER_KEY before using page encryption.'
    );
  }

  return secret;
}

/**
 * Derive the key-wrapping key for a project from the master secret and a
 * per-key random salt. The project ID is mixed in so a wrapped key cannot be
 * moved between projects.
 */
function deriveWrappingKey(projectId: number, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    `${getMasterSecret()}:project-${projectId}`,
    salt,
    PBKDF2_ITERATIONS,
    DEFAULT_KEY_LENGTH,
    PBKDF2_DIGEST
  );
}

/**
 * Wrap a project key for storage.
 *
 * Layout: salt(16) || iv(12) || ciphertext || authTag(16), base64 encoded.
 * The IV is stored rather than regenerated at unwrap time — the previous code
 * decrypted with a fresh random IV, which could never reproduce the key.
 */
export function wrapProjectKey(projectId: number, key: Buffer): string {
  const salt = crypto.randomBytes(WRAP_SALT_LENGTH);
  const iv = crypto.randomBytes(DEFAULT_IV_LENGTH);
  const wrappingKey = deriveWrappingKey(projectId, salt);

  const cipher = crypto.createCipheriv(DEFAULT_ALGORITHM, wrappingKey, iv);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);

  return Buffer.concat([salt, iv, ciphertext, cipher.getAuthTag()]).toString('base64');
}

/**
 * Unwrap a stored project key. Throws if the blob is malformed or the master
 * secret does not match — callers must not fall back to a derived key, or they
 * would silently encrypt new content under a key that cannot read the old.
 */
export function unwrapProjectKey(projectId: number, wrapped: string): Buffer {
  const blob = Buffer.from(wrapped, 'base64');

  if (blob.length <= WRAP_SALT_LENGTH + DEFAULT_IV_LENGTH + WRAP_AUTH_TAG_LENGTH) {
    throw new Error('Stored encryption key is malformed');
  }

  const salt = blob.subarray(0, WRAP_SALT_LENGTH);
  const iv = blob.subarray(WRAP_SALT_LENGTH, WRAP_SALT_LENGTH + DEFAULT_IV_LENGTH);
  const authTag = blob.subarray(-WRAP_AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(WRAP_SALT_LENGTH + DEFAULT_IV_LENGTH, -WRAP_AUTH_TAG_LENGTH);

  const wrappingKey = deriveWrappingKey(projectId, salt);
  const decipher = crypto.createDecipheriv(DEFAULT_ALGORITHM, wrappingKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
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
    // No key provisioned yet. Callers that intend to encrypt should go through
    // ensureProjectEncryptionKey(); silently inventing one here would produce a
    // key that does not match anything already stored.
    throw new Error(`No encryption key provisioned for project ${projectId}`);
  }

  const key = unwrapProjectKey(projectId, keyRecord.encrypted_key);

  keyCache.set(projectId, {
    projectId,
    key,
    keyId: keyRecord.key_id,
    createdAt: Date.now(),
  });

  return key;
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
