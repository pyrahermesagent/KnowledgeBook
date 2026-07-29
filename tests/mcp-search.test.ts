import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, destroyTestDbs } from './setup/db';
import { searchLikeCondition, buildSearchPattern } from '#server/routes/mcp';

/**
 * The MCP search tools build a LIKE query with an explicit ESCAPE character.
 * SQLite validates that argument while evaluating the LIKE rather than while
 * preparing the statement, so a two-character escape prepared cleanly and only
 * blew up once a row was actually compared — meaning search worked on an empty
 * instance and failed with "ESCAPE expression must be a single character" as
 * soon as the instance had any documentation in it.
 */
describe('MCP search SQL', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeAll(() => {
    db = createTestDb();
    const userId = db
      .prepare(`INSERT INTO users (email, name) VALUES (?,?) RETURNING id`)
      .get('search@test.dev', 'Search') as { id: number };
    const projectId = db
      .prepare(`INSERT INTO projects (owner_id, slug, name) VALUES (?,?,?) RETURNING id`)
      .get(userId.id, 'demo', 'Demo') as { id: number };

    const insertPage = db.prepare(
      `INSERT INTO pages (project_id, slug, title, content, position) VALUES (?,?,?,?,?)`
    );
    insertPage.run(projectId.id, 'home', 'Home', 'Some guidance about setup.', 0);
    insertPage.run(projectId.id, 'rates', 'Rates', 'Discounts of 50% apply here.', 1);
    insertPage.run(projectId.id, 'naming', 'Naming', 'Use snake_case for columns.', 2);
    insertPage.run(projectId.id, 'other', 'Other', 'Nothing relevant at all.', 3);
  });

  afterAll(() => {
    destroyTestDbs();
  });

  function search(term: string): string[] {
    const pattern = buildSearchPattern(term);
    return (
      db
        .prepare(
          `SELECT pg.slug AS page
           FROM pages pg JOIN projects p ON p.id = pg.project_id
           WHERE ${searchLikeCondition()}
           ORDER BY pg.slug`
        )
        .all(pattern, pattern) as { page: string }[]
    ).map((row) => row.page);
  }

  it('uses a single-character escape', () => {
    // Pull the quoted escape argument back out of the generated SQL.
    const escapes = [...searchLikeCondition().matchAll(/ESCAPE\s+'(.*?)'/g)].map((m) => m[1]);
    expect(escapes.length).toBeGreaterThan(0);
    for (const escape of escapes) {
      expect(escape).toHaveLength(1);
    }
  });

  it('matches page content without throwing', () => {
    expect(search('guidance')).toEqual(['home']);
  });

  it('matches page titles', () => {
    expect(search('Rates')).toEqual(['rates']);
  });

  it('returns nothing for a term that is absent', () => {
    expect(search('nonexistentterm')).toEqual([]);
  });

  it('treats % as a literal instead of a wildcard', () => {
    // Were the escaping broken, this would match every page.
    expect(search('50%')).toEqual(['rates']);
  });

  it('treats _ as a literal instead of a single-character wildcard', () => {
    expect(search('snake_case')).toEqual(['naming']);
  });

  it('does not match every row on a bare wildcard character', () => {
    expect(search('%')).toEqual(['rates']);
  });
});
