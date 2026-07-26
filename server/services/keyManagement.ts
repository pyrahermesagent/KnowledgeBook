import crypto from 'node:crypto';
import { getEncryptionKey, wrapProjectKey, generateKeyId } from '#server/services/encryption';

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

  // No key provisioned yet: generate one and wrap it with the master secret.
  const db = useDb();
  const keyId = generateKeyId();
  const newKey = crypto.randomBytes(32);

  // wrapProjectKey stores the salt and IV alongside the ciphertext, so the key
  // can actually be recovered later.
  db.prepare(
    `
    INSERT INTO encryption_keys (project_id, key_id, encrypted_key, created_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(project_id) DO NOTHING
  `
  ).run(projectId, keyId, wrapProjectKey(projectId, newKey));

  // A concurrent request may have won the insert; re-read so both callers end
  // up with the key that was actually persisted.
  return getEncryptionKey(projectId);
}
