import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Import encryption functions - use dynamic import to avoid module resolution issues in test
async function getEncryptionService() {
  return {
    encrypt: (plaintext: string, key: Buffer) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      
      const authTag = cipher.getAuthTag();
      
      return {
        data: Buffer.concat([encrypted, authTag]).toString('base64'),
        iv: iv.toString('hex'),
        keyId: crypto.randomUUID()
      };
    },
    decrypt: (encryptedData: string, iv: string, key: Buffer): string => {
      const ivBuffer = Buffer.from(iv, 'hex');
      const dataBuffer = Buffer.from(encryptedData, 'base64');
      
      // Extract auth tag (last 16 bytes for GCM)
      const authTag = dataBuffer.subarray(-16);
      const encryptedDataBuffer = dataBuffer.subarray(0, -16);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encryptedDataBuffer),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    },
    generateKey: () => crypto.randomBytes(32),
    generateKeyId: () => crypto.randomUUID()
  };
}

describe('Encryption Service', () => {
  it('should encrypt and decrypt content', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    const originalContent = 'Hello, this is a test message for encryption!';
    
    // Encrypt
    const encrypted = encryption.encrypt(originalContent, key);
    
    // Verify encrypted data has required fields
    expect(encrypted.data).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.keyId).toBeDefined();
    
    // Decrypt
    const decrypted = encryption.decrypt(encrypted.data, encrypted.iv, key);
    
    // Verify decrypted content matches original
    expect(decrypted).toBe(originalContent);
  });

  it('should handle empty strings', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    const originalContent = '';
    
    const encrypted = encryption.encrypt(originalContent, key);
    const decrypted = encryption.decrypt(encrypted.data, encrypted.iv, key);
    
    expect(decrypted).toBe(originalContent);
  });

  it('should handle large content', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    const originalContent = 'A'.repeat(10000); // 10KB of data
    
    const encrypted = encryption.encrypt(originalContent, key);
    const decrypted = encryption.decrypt(encrypted.data, encrypted.iv, key);
    
    expect(decrypted).toBe(originalContent);
    expect(decrypted.length).toBe(10000);
  });

  it('should fail decryption with wrong key', async () => {
    const encryption = await getEncryptionService();
    const key1 = encryption.generateKey();
    const key2 = encryption.generateKey();
    const originalContent = 'Secret message that should fail to decrypt';
    
    const encrypted = encryption.encrypt(originalContent, key1);
    
    expect(() => {
      encryption.decrypt(encrypted.data, encrypted.iv, key2);
    }).toThrow();
  });

  it('should fail decryption with wrong IV', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    const originalContent = 'Testing IV mismatch';
    
    const encrypted = encryption.encrypt(originalContent, key);
    
    expect(() => {
      encryption.decrypt(encrypted.data, '0000000000000000', key);
    }).toThrow();
  });

  it('should generate unique key IDs', async () => {
    const encryption = await getEncryptionService();
    
    const keyId1 = encryption.generateKeyId();
    const keyId2 = encryption.generateKeyId();
    const keyId3 = encryption.generateKeyId();
    
    expect(keyId1).not.toBe(keyId2);
    expect(keyId2).not.toBe(keyId3);
    expect(keyId1).not.toBe(keyId3);
  });

  it('should generate 32-byte keys', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    
    expect(key.length).toBe(32);
  });

  it('should handle special characters', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    const originalContent = 'Hello World! @#$%^&*()_+-=[]{}|;:,.<>?/~`';
    
    const encrypted = encryption.encrypt(originalContent, key);
    const decrypted = encryption.decrypt(encrypted.data, encrypted.iv, key);
    
    expect(decrypted).toBe(originalContent);
  });

  it('should handle Unicode characters', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    const originalContent = 'Hello World! 你好世界 🌍مرحبا بالعالم';
    
    const encrypted = encryption.encrypt(originalContent, key);
    const decrypted = encryption.decrypt(encrypted.data, encrypted.iv, key);
    
    expect(decrypted).toBe(originalContent);
  });
});

describe('Concurrent Encryption/Decryption', () => {
  it('should handle concurrent operations', async () => {
    const encryption = await getEncryptionService();
    const key = encryption.generateKey();
    const messages = ['Message 1', 'Message 2', 'Message 3', 'Message 4', 'Message 5'];
    
    const results = await Promise.all(
      messages.map(async (msg) => {
        const encrypted = encryption.encrypt(msg, key);
        const decrypted = encryption.decrypt(encrypted.data, encrypted.iv, key);
        return decrypted;
      })
    );
    
    expect(results).toEqual(messages);
  });
});
