import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { useDb, closeDb } from '#utils/db';
import { setRuntimeConfig } from './setup/nuxt-globals';

/**
 * Databases created by the July scaffold predate the theme columns. CREATE
 * TABLE IF NOT EXISTS never alters an existing table, so those columns must be
 * back-filled by ensureColumn — otherwise every theme or settings PATCH dies
 * with "no such column: bg_subtle" (500) on deployments whose data volume
 * outlives the code, while fresh dev databases work fine.
 */

const THEME_COLUMNS = [
  'font_family',
  'bg_color',
  'bg_subtle',
  'text_color',
  'text-muted',
  'border_color',
  'radius',
];

const tempDirs: string[] = [];

/** Create a database file with the original pre-theming schema. */
function createLegacyDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-legacy-'));
  tempDirs.push(dir);
  const path = join(dir, 'legacy.db');

  const legacy = new Database(path);
  legacy.exec(`
    CREATE TABLE users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id  TEXT NOT NULL UNIQUE,
      email      TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      avatar     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE projects (
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
    INSERT INTO users (google_id, email) VALUES ('g-1', 'owner@example.com');
    INSERT INTO projects (owner_id, slug, name) VALUES (1, 'dgx-spark', 'DGX Spark');
  `);
  legacy.close();

  return path;
}

afterEach(() => {
  closeDb();
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can hold the file briefly after close; a leaked temp dir is
      // not worth failing a test over.
    }
  }
});

describe('initSchema on a database created before theming', () => {
  it('back-fills every theme column', () => {
    const path = createLegacyDb();
    closeDb();
    setRuntimeConfig({ databasePath: path });

    const db = useDb();
    const columns = (db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map(
      (c) => c.name
    );

    for (const column of THEME_COLUMNS) {
      expect(columns, `projects.${column} missing after init`).toContain(column);
    }
  });

  it('lets the theme PATCH update run against the upgraded schema', () => {
    const path = createLegacyDb();
    closeDb();
    setRuntimeConfig({ databasePath: path });

    const db = useDb();
    // The exact statement theme.patch.ts prepares.
    const result = db
      .prepare(
        `
        UPDATE projects
        SET accent_color = ?, font_family = ?, bg_color = ?, bg_subtle = ?, text_color = ?, "text-muted" = ?, border_color = ?, radius = ?, updated_at = datetime('now')
        WHERE slug = ?
      `
      )
      .run(
        '#5b9bff',
        'Georgia, serif',
        '#0d1117',
        '#161b22',
        '#e6edf3',
        '#8b949e',
        '#30363d',
        8,
        'dgx-spark'
      );

    expect(result.changes).toBe(1);

    const row = db
      .prepare('SELECT bg_subtle, "text-muted" FROM projects WHERE slug = ?')
      .get('dgx-spark') as {
      bg_subtle: string;
      'text-muted': string;
    };
    expect(row.bg_subtle).toBe('#161b22');
    expect(row['text-muted']).toBe('#8b949e');
  });

  it('applies the schema defaults to pre-existing rows', () => {
    const path = createLegacyDb();
    closeDb();
    setRuntimeConfig({ databasePath: path });

    const db = useDb();
    const row = db.prepare('SELECT * FROM projects WHERE slug = ?').get('dgx-spark') as Record<
      string,
      unknown
    >;

    expect(row.bg_color).toBe('#ffffff');
    expect(row.bg_subtle).toBe('#f7f8fa');
    expect(row.text_color).toBe('#1f2430');
    expect(row['text-muted']).toBe('#6b7280');
    expect(row.border_color).toBe('#e5e8ec');
    expect(row.radius).toBe(8);
  });

  it('boots cleanly a second time (columns are not re-added)', () => {
    const path = createLegacyDb();
    closeDb();
    setRuntimeConfig({ databasePath: path });
    useDb();
    closeDb();

    expect(() => useDb()).not.toThrow();
  });
});
