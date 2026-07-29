// tests/mcp.test.ts
//
// This file used to build its own SQLite schema by hand — including a
// `users(google_id ...)` column and a `project_members(email ...)` table that
// no longer exist — seed it, and then assert things about those private
// tables. It never imported server/routes/mcp.ts, so every assertion held no
// matter what the MCP endpoint did, and it was the last place in the repo still
// describing google_id as a column.
//
// Rewritten to exercise the real lookup and structure-rendering the read tools
// (get_project, get_page) actually call, against a real database built by the
// app's own initSchema/migrations via createTestDb(). Write-path authorization
// lives in tests/mcp-write-access.test.ts; the search SQL in
// tests/mcp-search.test.ts.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getProjectBySlugSafe, projectStructure } from '#server/routes/mcp';
import type { ProjectRow } from '#utils/auth';
import { createTestDb, destroyTestDbs } from './setup/db';

let db: ReturnType<typeof createTestDb>;

function seed(): ProjectRow {
  const user = db
    .prepare('INSERT INTO users (email, name) VALUES (?, ?) RETURNING id')
    .get('test@example.com', 'Test User') as { id: number };

  const project = db
    .prepare(
      'INSERT INTO projects (owner_id, slug, name, description) VALUES (?, ?, ?, ?) RETURNING *'
    )
    .get(user.id, 'test-project', 'Test Project', 'A test documentation project') as ProjectRow;

  const section = db
    .prepare('INSERT INTO sections (project_id, title, position) VALUES (?, ?, ?) RETURNING id')
    .get(project.id, 'Getting Started', 0) as { id: number };

  const insertPage = db.prepare(
    'INSERT INTO pages (project_id, section_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertPage.run(project.id, null, 'index', 'Home', '# Welcome\n\nThis is the home page.', 0);
  insertPage.run(
    project.id,
    section.id,
    'setup',
    'Setup Guide',
    '## Installation\n\nFollow these steps to set up the project.',
    1
  );

  return project;
}

describe('MCP project lookup', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('returns the project for a valid slug', () => {
    seed();
    const project = getProjectBySlugSafe('test-project');

    expect(project).toBeDefined();
    expect(project!.name).toBe('Test Project');
  });

  it('returns undefined for a slug no project has', () => {
    seed();
    expect(getProjectBySlugSafe('non-existent')).toBeUndefined();
  });

  it('trims whitespace off the slug an MCP client sent', () => {
    seed();
    expect(getProjectBySlugSafe('  test-project  ')).toBeDefined();
  });
});

describe('MCP project structure', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('renders the project header, its description, and the page slugs a client needs next', () => {
    const structure = projectStructure(seed());

    expect(structure).toContain('# Test Project (project: test-project)');
    expect(structure).toContain('A test documentation project');
    // The slug, not just the title: get_page is called with the slug, so a
    // structure that printed only titles would be unusable.
    expect(structure).toContain('- Home (page: index)');
    expect(structure).toContain('- Setup Guide (page: setup)');
  });

  it('nests a sectioned page under its section heading and leaves root pages above it', () => {
    const structure = projectStructure(seed());
    const lines = structure.split('\n');

    const rootPage = lines.findIndex((l) => l.includes('(page: index)'));
    const heading = lines.findIndex((l) => l === '## Getting Started');
    const sectionedPage = lines.findIndex((l) => l.includes('(page: setup)'));

    expect(rootPage).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(rootPage);
    expect(sectionedPage).toBeGreaterThan(heading);
  });

  it('handles a project with no pages at all', () => {
    const user = db
      .prepare('INSERT INTO users (email, name) VALUES (?, ?) RETURNING id')
      .get('empty@example.com', 'Empty') as { id: number };
    const project = db
      .prepare('INSERT INTO projects (owner_id, slug, name) VALUES (?, ?, ?) RETURNING *')
      .get(user.id, 'empty-project', 'Empty Project') as ProjectRow;

    const structure = projectStructure(project);
    expect(structure).toContain('# Empty Project (project: empty-project)');
    expect(structure).not.toContain('(page:');
  });

  it('only lists the requested project, not every project on the instance', () => {
    const mine = seed();

    const other = db
      .prepare('INSERT INTO users (email, name) VALUES (?, ?) RETURNING id')
      .get('other@example.com', 'Other') as { id: number };
    const otherProject = db
      .prepare('INSERT INTO projects (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id')
      .get(other.id, 'other-project', 'Other Project') as { id: number };
    db.prepare(
      'INSERT INTO pages (project_id, slug, title, content, position) VALUES (?, ?, ?, ?, ?)'
    ).run(otherProject.id, 'secret', 'Secret Page', 'nope', 0);

    expect(projectStructure(mine)).not.toContain('Secret Page');
  });
});
