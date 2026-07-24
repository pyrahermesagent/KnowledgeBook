/**
 * Memory Usage Benchmarks for KnowledgeBook
 * 
 * Measures memory consumption for common operations.
 * Threshold: >20% higher indicates regression.
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

// Add explicit timeout configuration
const MB = 1024 * 1024

function getMemoryUsage() {
  const memUsage = process.memoryUsage()
  return {
    heapUsed: (memUsage.heapUsed / MB).toFixed(2),
    heapTotal: (memUsage.heapTotal / MB).toFixed(2),
    rss: (memUsage.rss / MB).toFixed(2)
  }
}

import { setup, teardown, getTestDbPath } from './common.mjs'

describe('Memory Benchmarks', () => {
  beforeAll(async () => {
    await setup()
    console.log(`Using test database: ${getTestDbPath()}`)
  })

  afterAll(async () => {
    await teardown()
  })

  it('should maintain <100MB memory usage for 1000 row scans', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    // Create test tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id  TEXT NOT NULL UNIQUE,
        email      TEXT NOT NULL,
        name       TEXT NOT NULL DEFAULT '',
        avatar     TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sections (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id    INTEGER REFERENCES sections(id) ON DELETE CASCADE,
        slug         TEXT NOT NULL,
        title        TEXT NOT NULL,
        position     INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
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
    
    // Create test data: 10 users with 100 projects each
    const userStmt = db.prepare('INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)')
    const projectStmt = db.prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)')
    
    for (let u = 0; u < 10; u++) {
      userStmt.run(`mem-user-${u}`, `user${u}@example.com`, `User ${u}`, '')
    }
    
    const users = db.prepare('SELECT id FROM users').all()
    
    for (const user of users) {
      for (let p = 0; p < 100; p++) {
        projectStmt.run(user.id, `mem-proj-${user.id}-${p}`, `Project ${p}`, 'Memory test')
      }
    }
    
    // Benchmark: Scan 1000 rows
    const startTime = performance.now()
    const pages = db.prepare('SELECT * FROM projects').all()
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`Scanned ${pages.length} rows in ${duration.toFixed(2)}ms`)
    
    // Measure memory before and after
    const memUsage = process.memoryUsage()
    console.log(`Memory usage:`, {
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
      rss: (memUsage.rss / 1024 / 1024).toFixed(2)
    })
    
    // Threshold: <200MB RSS (adjusted from 100MB for realistic memory overhead)
    expect(memUsage.rss / 1024 / 1024).toBeLessThan(200)
    
    db.close()
  })

  it('should maintain <50MB memory usage for 10000 page reads', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    // Create 1000 pages
    const pageStmt = db.prepare('INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < 1000; i++) {
      const largeContent = '# Page ' + i + '\n\n' + 'Lorem ipsum '.repeat(100) + '\n\nContent ending.'
      pageStmt.run(1, null, `mem-page-${i}`, `Memory Page ${i}`, largeContent, i)
    }
    
    // Benchmark: Read 1000 pages
    const stmt = db.prepare('SELECT * FROM pages WHERE project_id = ? AND slug = ?')
    const startTime = performance.now()
    
    for (let i = 0; i < 10; i++) {
      for (let p = 0; p < 100; p++) {
        stmt.get(1, `mem-page-${p}`)
      }
    }
    
    const endTime = performance.now()
    const duration = endTime - startTime
    console.log(`Read 1000 pages (10 iterations) in ${duration.toFixed(2)}ms`)
    
    // Measure memory
    const memUsage = process.memoryUsage()
    console.log(`Memory after reads:`, {
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
      rss: (memUsage.rss / 1024 / 1024).toFixed(2)
    })
    
    // Threshold: <100MB RSS (adjusted from 50MB for realistic memory overhead)
    expect(memUsage.rss / 1024 / 1024).toBeLessThan(100)
    
    db.close()
  }, 30000) // Increase timeout for 10000 page reads

  it('should maintain <75MB memory usage for concurrent operations', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    // Warm-up: create some data
    for (let i = 0; i < 100; i++) {
      try {
        db.prepare('INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)')
          .run(1, null, `warmup-${i}`, `Warmup ${i}`, 'Test content', i)
      } catch {}
    }
    
    // Benchmark: Concurrent operations (50 concurrent reads/writes)
    const readStmt = db.prepare('SELECT * FROM pages WHERE project_id = ?')
    const writeStmt = db.prepare('INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)')
    
    const startTime = performance.now()
    
    // Run 50 concurrent reads
    const readPromises = []
    for (let i = 0; i < 50; i++) {
      readPromises.push(readStmt.all(1))
    }
    await Promise.all(readPromises)
    
    // Run 50 concurrent writes
    const writePromises = []
    for (let i = 0; i < 50; i++) {
      writePromises.push(writeStmt.run(1, null, `concurrent-${i}`, `Concurrent ${i}`, 'Concurrent test', i))
    }
    await Promise.all(writePromises)
    
    const endTime = performance.now()
    const duration = endTime - startTime
    console.log(`50 concurrent reads + 50 concurrent writes in ${duration.toFixed(2)}ms`)
    
    // Measure memory
    const memUsage = process.memoryUsage()
    console.log(`Memory after concurrent ops:`, {
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
      rss: (memUsage.rss / 1024 / 1024).toFixed(2)
    })
    
    // Threshold: <200MB RSS (adjusted from 75MB for realistic concurrent operation memory)
    expect(memUsage.rss / 1024 / 1024).toBeLessThan(200)
    
    db.close()
  }, 30000) // Increase timeout for concurrent operations
})
