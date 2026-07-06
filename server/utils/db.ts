import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let db: Database.Database | null = null

export function useDb (): Database.Database {
  if (db) return db
  const path = resolve(useRuntimeConfig().databasePath)
  mkdirSync(dirname(path), { recursive: true })
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
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
  `)
  return db
}
