import { type H3Event } from 'h3';
import {
  encrypt,
  decrypt,
  computeContentHash,
  getEncryptionKey,
} from '#server/services/encryption';
import crypto from 'node:crypto';

/**
 * Encrypt page content and store in database
 * Uses LRU-cached encryption key for performance
 */
export async function encryptPageContent(
  event: H3Event,
  pageId: number,
  content: string
): Promise<void> {
  const db = useDb();

  // Get page project
  const page = db.prepare('SELECT project_id FROM pages WHERE id = ?').get(pageId) as
    { project_id: number } | undefined;
  if (!page) throw new Error('Page not found');

  const projectId = page.project_id;

  // Get encryption key from cache (or generate and store)
  const projectKey = getEncryptionKey(projectId);

  // Encrypt content
  const encrypted = encrypt(content, projectKey);

  // Compute content hash for integrity verification
  const contentHash = computeContentHash(content);

  // Store encrypted content in database
  db.prepare(
    `
    UPDATE pages 
    SET encrypted_content = ?, 
        encryption_iv = ?, 
        encryption_key_id = ?, 
        is_encrypted = 1,
        content_hash = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(encrypted.data, encrypted.iv, encrypted.keyId, contentHash, pageId);
}

/**
 * Decrypt page content for authorized access
 * Uses LRU-cached encryption key for performance
 */
export function decryptPageContent(page: {
  id: number;
  encrypted_content: string | null;
  encryption_iv: string | null;
  encryption_key_id: string | null;
  content: string;
  is_encrypted: boolean;
}): string {
  // Return plaintext if not encrypted
  if (!page.is_encrypted || !page.encrypted_content || !page.encryption_iv) {
    return page.content;
  }

  try {
    // Get project ID from page
    const db = useDb();
    const project = db.prepare('SELECT project_id FROM pages WHERE id = ?').get(page.id) as
      { project_id: number } | undefined;
    if (!project) throw new Error('Page not found');

    // Get project key from cache
    const projectKey = getEncryptionKey(project.project_id);

    // Decrypt content
    return decrypt(page.encrypted_content, page.encryption_iv, projectKey);
  } catch (error) {
    console.error('Failed to decrypt page content:', error);
    throw new Error('Unable to decrypt page content');
  }
}

/**
 * Generate project-specific encryption key
 */
function generateProjectKey(projectId: number): Buffer {
  return crypto.pbkdf2Sync(
    `project-secret-${projectId}`,
    `project-${projectId}`,
    100000,
    32,
    'sha256'
  );
}
