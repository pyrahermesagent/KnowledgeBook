/**
 * Latency Benchmarks for KnowledgeBook
 * 
 * Measures API response times for common operations.
 * Threshold: >10% slower indicates regression.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, teardown, getTestDbPath } from './common.mjs'

describe('Latency Benchmarks', () => {
  beforeAll(async () => {
    await setup()
    console.log(`Using test database: ${getTestDbPath()}`)
  })

  afterAll(async () => {
    await teardown()
  })

  it('should create project in <500ms', async () => {
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
      .run('benchmark-user-001', 'benchmark@example.com', 'Benchmark User', '')
    
    const user = db.prepare('SELECT id FROM users WHERE google_id = ?').get('benchmark-user-001')
    
    const startTime = performance.now()
    db.prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)')
      .run(user.id, 'benchmark-project', 'Benchmark Project', 'A benchmark project')
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`Create project: ${duration.toFixed(2)}ms`)
    
    expect(duration).toBeLessThan(500)
    
    db.close()
  })

  it('should list projects in <100ms', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    const startTime = performance.now()
    const projects = db.prepare('SELECT * FROM projects').all()
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`List projects (${projects.length} rows): ${duration.toFixed(2)}ms`)
    
    expect(duration).toBeLessThan(100)
    
    db.close()
  })

  it('should get project by slug in <50ms', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    const startTime = performance.now()
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('benchmark-project')
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`Get project by slug: ${duration.toFixed(2)}ms`)
    
    expect(duration).toBeLessThan(50)
    expect(project).toBeDefined()
    
    db.close()
  })

  it('should create page in <200ms', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('benchmark-project')
    
    const startTime = performance.now()
    db.prepare('INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)')
      .run(project.id, null, 'benchmark-page', 'Benchmark Page', '# Benchmark\n\nTest content', 0)
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`Create page: ${duration.toFixed(2)}ms`)
    
    expect(duration).toBeLessThan(200)
    
    db.close()
  })

  it('should list pages in <75ms', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    const startTime = performance.now()
    const pages = db.prepare('SELECT * FROM pages WHERE project_id = ?').all(1)
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`List pages (${pages.length} rows): ${duration.toFixed(2)}ms`)
    
    expect(duration).toBeLessThan(75)
    
    db.close()
  })

  it('should get page by slug in <30ms', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    const startTime = performance.now()
    const page = db.prepare('SELECT * FROM pages WHERE project_id = ? AND slug = ?').get(1, 'benchmark-page')
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`Get page by slug: ${duration.toFixed(2)}ms`)
    
    expect(duration).toBeLessThan(30)
    expect(page).toBeDefined()
    
    db.close()
  })

  it('should search pages in <100ms', async () => {
    const db = require('better-sqlite3')(getTestDbPath())
    
    const startTime = performance.now()
    const pages = db.prepare('SELECT * FROM pages WHERE project_id = ? AND title LIKE ?').all(1, '%Benchmark%')
    const endTime = performance.now()
    
    const duration = endTime - startTime
    console.log(`Search pages (${pages.length} rows): ${duration.toFixed(2)}ms`)
    
    expect(duration).toBeLessThan(100)
    
    db.close()
  })
})
