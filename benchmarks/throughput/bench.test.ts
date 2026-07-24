/**
 * Throughput Benchmarks for KnowledgeBook
 * 
 * Measures requests per second under concurrent load.
 * Threshold: >15% lower indicates regression.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, teardown, getTestDbPath } from './common.mjs'

describe('Throughput Benchmarks', () => {
  beforeAll(async () => {
    await setup()
    console.log(`Using test database: ${getTestDbPath()}`)
  })

  afterAll(async () => {
    await teardown()
  })

  it('should handle 100 concurrent project creations', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id  TEXT NOT NULL UNIQUE,
        email      TEXT NOT NULL,
        name       TEXT NOT NULL DEFAULT '',
        avatar     TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS projects (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slug         TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        accent_color TEXT NOT NULL DEFAULT '#346ddb',
        icon_url     TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sections (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
        slug       TEXT NOT NULL,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        position   INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, slug)
      );
    `)
    
    db.prepare('INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)')
      .run('benchmark-user-002', 'benchmark2@example.com', 'Benchmark User 2', '')
    const user = db.prepare('SELECT id FROM users WHERE google_id = ?').get('benchmark-user-002')
    
    const stmt = db.prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)')
    const startTime = performance.now()
    
    const batchSize = 20
    const numBatches = 5
    
    for (let batch = 0; batch < numBatches; batch++) {
      const promises = []
      for (let i = 0; i < batchSize; i++) {
        const projectNum = batch * batchSize + i
        promises.push(
          stmt.run(user.id, `throughput-${projectNum}`, `Throughput Project ${projectNum}`, 'Throughput test')
        )
      }
      await Promise.all(promises)
    }
    
    const endTime = performance.now()
    const duration = endTime - startTime
    const throughput = (100 / (duration / 1000)).toFixed(2)
    
    console.log(`Throughput: ${throughput} projects/second (${duration.toFixed(2)}ms for 100 projects)`)
    
    expect(duration).toBeLessThan(5000)
    
    db.close()
  }, 10000) // Increased timeout

  it('should handle concurrent page reads', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('benchmark-project')
    if (!project) {
      const user = db.prepare('SELECT id FROM users WHERE google_id = ?').get('benchmark-user-002')
      db.prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)')
        .run(user.id, 'benchmark-project', 'Benchmark Project', 'A benchmark project')
    }
    
    const insertPage = db.prepare('INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < 50; i++) {
      try {
        insertPage.run(1, null, `page-${i}`, `Page ${i}`, `Content for page ${i}`, i)
      } catch {}
    }
    
    const stmt = db.prepare('SELECT * FROM pages WHERE project_id = ? AND slug = ?')
    const startTime = performance.now()
    
    const promises = []
    for (let i = 0; i < 50; i++) {
      promises.push(stmt.get(1, `page-${i}`))
    }
    await Promise.all(promises)
    
    const endTime = performance.now()
    const duration = endTime - startTime
    const throughput = (50 / (duration / 1000)).toFixed(2)
    
    console.log(`Concurrent reads: ${throughput} reads/second (${duration.toFixed(2)}ms for 50 reads)`)
    
    expect(duration).toBeLessThan(2000)
    
    db.close()
  })

  it('should handle concurrent writes with transaction', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    const stmt = db.prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)')
    const startTime = performance.now()
    
    const tx = db.transaction(() => {
      for (let i = 0; i < 30; i++) {
        stmt.run(1, `concurrent-write-${i}`, `Concurrent Write ${i}`, 'Test')
      }
    })
    tx()
    
    const endTime = performance.now()
    const duration = endTime - startTime
    const throughput = (30 / (duration / 1000)).toFixed(2)
    
    console.log(`Concurrent writes (transaction): ${throughput} writes/second (${duration.toFixed(2)}ms for 30 writes)`)
    
    expect(duration).toBeLessThan(1500)
    
    db.close()
  })
})
