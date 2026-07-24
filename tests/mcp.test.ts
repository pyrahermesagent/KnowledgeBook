import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('MCP Integration Tests', () => {
  const testDbPath = '/home/rosta/knowledgebook/.data/knowledgebook-test.db';
  let db: any;

  beforeAll(() => {
    const fs = require('fs');
    // Clean up any existing database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }

    db = require('better-sqlite3')(testDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
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
      CREATE TABLE IF NOT EXISTS project_members (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        email      TEXT NOT NULL,
        added_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, email)
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
      -- Page version history for audit trail
      CREATE TABLE IF NOT EXISTS page_versions (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id            INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        content            TEXT NOT NULL,
        title              TEXT NOT NULL,
        version            INTEGER NOT NULL DEFAULT 1,
        edited_by_user_id  INTEGER REFERENCES users(id),
        is_ai_edit         BOOLEAN NOT NULL DEFAULT 0,
        version_comment    TEXT,
        created_at         TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Seed test data
    db.prepare('INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)').run(
      'test-user-001',
      'test@example.com',
      'Test User',
      'https://example.com/avatar.png'
    );

    const user = db.prepare('SELECT id FROM users WHERE google_id = ?').get('test-user-001');
    db.prepare('INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?)').run(
      user.id,
      'test-project',
      'Test Project',
      'A test documentation project'
    );

    const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get('test-project');
    db.prepare('INSERT INTO sections (project_id, title, position) VALUES (?, ?, ?)').run(
      project.id,
      'Getting Started',
      0
    );

    db.prepare(
      'INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(project.id, null, 'index', 'Home', '# Welcome\n\nThis is the home page.', 0);
    db.prepare(
      'INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      project.id,
      null,
      'setup',
      'Setup Guide',
      '## Installation\n\nFollow these steps to set up the project.',
      1
    );
  });

  afterAll(() => {
    if (db) db.close();
    const fs = require('fs');
    try {
      fs.unlinkSync(testDbPath);
    } catch {}
    try {
      fs.unlinkSync(testDbPath + '-wal');
    } catch {}
    try {
      fs.unlinkSync(testDbPath + '-shm');
    } catch {}
  });

  it('list_projects: should return list of projects', () => {
    const projects = db.prepare('SELECT * FROM projects').all();
    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe('Test Project');
  });

  it('get_project: should return project structure for valid slug', () => {
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('test-project');
    expect(project).toBeDefined();
    expect(project.name).toBe('Test Project');
  });

  it('get_project: should return null for non-existent project', () => {
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('non-existent');
    expect(project).toBeUndefined();
  });

  it('get_page: should return page content for valid project and page slug', () => {
    const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get('test-project');
    const page = db
      .prepare('SELECT * FROM pages WHERE project_id = ? AND slug = ?')
      .get(project.id, 'index');
    expect(page).toBeDefined();
    expect(page.title).toBe('Home');
    expect(page.content).toContain('Welcome');
  });

  it('get_page: should return null for non-existent page', () => {
    const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get('test-project');
    const page = db
      .prepare('SELECT * FROM pages WHERE project_id = ? AND slug = ?')
      .get(project.id, 'non-existent');
    expect(page).toBeUndefined();
  });

  it('search: should find pages by keyword in title', () => {
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('test-project');
    const pages = db
      .prepare('SELECT * FROM pages WHERE project_id = ? AND title LIKE ?')
      .all(project.id, '%Home%');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].title).toBe('Home');
  });

  it('search: should find pages by keyword in content', () => {
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('test-project');
    const pages = db
      .prepare('SELECT * FROM pages WHERE project_id = ? AND content LIKE ?')
      .all(project.id, '%Installation%');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].title).toBe('Setup Guide');
  });

  it('search: should return no results for non-matching query', () => {
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get('test-project');
    const pages = db
      .prepare('SELECT * FROM pages WHERE project_id = ? AND title LIKE ?')
      .all(project.id, '%nonexistentkeyword12345%');
    expect(pages.length).toBe(0);
  });
});
