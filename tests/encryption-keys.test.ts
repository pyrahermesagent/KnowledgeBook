import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'node:crypto'
import {
  wrapProjectKey,
  unwrapProjectKey,
  getEncryptionKey,
  encrypt,
  decrypt,
  clearKeyCache,
} from '#server/services/encryption'
import { ensureProjectEncryptionKey } from '#server/services/keyManagement'
import { createTestDb, destroyTestDbs } from './setup/db'
import { setRuntimeConfig } from './setup/nuxt-globals'

const MASTER = 'test-master-secret-0123456789abcdef0123456789abcdef'

describe('project key wrapping', () => {
  beforeEach(() => {
    setRuntimeConfig({ encryptionMasterKey: MASTER })
    clearKeyCache()
  })

  it('round-trips a key', () => {
    const key = crypto.randomBytes(32)

    const recovered = unwrapProjectKey(7, wrapProjectKey(7, key))

    expect(recovered.equals(key)).toBe(true)
  })

  it('produces a different blob each time for the same key', () => {
    const key = crypto.randomBytes(32)

    // Random salt and IV per wrap, so the stored ciphertext never repeats.
    expect(wrapProjectKey(7, key)).not.toBe(wrapProjectKey(7, key))
  })

  it('refuses a key wrapped for a different project', () => {
    const wrapped = wrapProjectKey(7, crypto.randomBytes(32))

    expect(() => unwrapProjectKey(8, wrapped)).toThrow()
  })

  it('refuses a key wrapped under a different master secret', () => {
    const wrapped = wrapProjectKey(7, crypto.randomBytes(32))

    setRuntimeConfig({ encryptionMasterKey: 'a-completely-different-master-secret-value' })

    expect(() => unwrapProjectKey(7, wrapped)).toThrow()
  })

  it('detects a tampered ciphertext', () => {
    const wrapped = wrapProjectKey(7, crypto.randomBytes(32))
    const blob = Buffer.from(wrapped, 'base64')
    blob[blob.length - 20] ^= 0xff // flip a bit inside the ciphertext

    expect(() => unwrapProjectKey(7, blob.toString('base64'))).toThrow()
  })

  it('rejects a truncated blob instead of reading out of bounds', () => {
    expect(() => unwrapProjectKey(7, Buffer.alloc(8).toString('base64'))).toThrow(/malformed/i)
  })
})

describe('ensureProjectEncryptionKey', () => {
  beforeEach(() => {
    setRuntimeConfig({ encryptionMasterKey: MASTER })
    createTestDb()
    clearKeyCache()
  })

  afterAll(() => destroyTestDbs())

  function seedProject(id = 1) {
    const db = createTestDb()
    clearKeyCache()
    db.prepare("INSERT INTO users (google_id, email) VALUES ('g1', 'a@b.c')").run()
    db.prepare("INSERT INTO projects (owner_id, slug, name) VALUES (1, 'p', 'P')").run()
    return id
  }

  it('provisions a key and returns the same one on the next call', () => {
    const projectId = seedProject()

    const first = ensureProjectEncryptionKey(projectId)
    clearKeyCache() // force a re-read from the database
    const second = ensureProjectEncryptionKey(projectId)

    expect(first.equals(second)).toBe(true)
  })

  it('survives a cache clear, which the previous random-IV unwrap could not', () => {
    const projectId = seedProject()
    const key = ensureProjectEncryptionKey(projectId)
    const ciphertext = encrypt('secret content', key)

    clearKeyCache()
    const reloaded = getEncryptionKey(projectId)

    expect(decrypt(ciphertext.data, ciphertext.iv, reloaded)).toBe('secret content')
  })

  it('throws for a project with no provisioned key rather than inventing one', () => {
    seedProject()

    expect(() => getEncryptionKey(999)).toThrow(/No encryption key provisioned/)
  })

  it('does not derive the key from the project id alone', () => {
    const projectId = seedProject()
    const key = ensureProjectEncryptionKey(projectId)

    // The old scheme was pbkdf2(`project-secret-${id}`, `project-${id}`), which
    // anyone could recompute from the public row id.
    const guessable = crypto.pbkdf2Sync(
      `project-secret-${projectId}`,
      `project-${projectId}`,
      100000,
      32,
      'sha256'
    )

    expect(key.equals(guessable)).toBe(false)
  })
})

describe('content encryption', () => {
  it('round-trips content', () => {
    const key = crypto.randomBytes(32)
    const { data, iv } = encrypt('Hello, encrypted world', key)

    expect(decrypt(data, iv, key)).toBe('Hello, encrypted world')
  })

  it('fails to decrypt with the wrong key', () => {
    const { data, iv } = encrypt('Hello', crypto.randomBytes(32))

    expect(() => decrypt(data, iv, crypto.randomBytes(32))).toThrow()
  })

  it('detects tampered ciphertext via the GCM auth tag', () => {
    const key = crypto.randomBytes(32)
    const { data, iv } = encrypt('Hello', key)

    const bytes = Buffer.from(data, 'base64')
    bytes[0] ^= 0xff

    expect(() => decrypt(bytes.toString('base64'), iv, key)).toThrow()
  })
})
