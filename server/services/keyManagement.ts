import crypto from 'node:crypto';
import { getEncryptionKey } from '#server/services/encryption';

/**
 * Backend Service: Project Key Management
 * Handles project-specific encryption key generation and retrieval
 * Uses LRU caching from encryption service for performance
 */

/**
 * Get project encryption key from cache
 * Falls back to generating a new key if not found
 */
export function getProjectEncryptionKey(projectId: number): Buffer | null {
  try {
    return getEncryptionKey(projectId);
  } catch (error) {
    console.error('Failed to get project encryption key from cache:', error);
    return null;
  }
}

/**
 * Ensure a project has an encryption key, create one if not
 * Uses caching to avoid redundant database writes
 */
export function ensureProjectEncryptionKey(projectId: number): Buffer {
  const key = getProjectEncryptionKey(projectId);
  if (key) return key;

  // Key not in cache, generate and store
  const db = useDb();
  const keyId = crypto.randomUUID();
  const newKey = crypto.randomBytes(32);

  // Encrypt and store
  const masterSecret = `project-secret-${projectId}`;
  const masterKey = crypto.pbkdf2Sync(masterSecret, `project-${projectId}`, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, crypto.randomBytes(12));
  const encryptedKey = Buffer.concat([cipher.update(newKey), cipher.final(), cipher.getAuthTag()]);

  db.prepare(
    `
    INSERT INTO encryption_keys (project_id, key_id, encrypted_key, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `
  ).run(projectId, keyId, encryptedKey.toString('base64'));

  return newKey;
}
