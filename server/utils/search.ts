/**
 * SQLite FTS5 full-text search implementation
 * Provides search functionality for pages across all projects
 */

/**
 * Enables FTS5 full-text search in SQLite
 * Must be called after database initialization
 */
export function enableFts5Search (db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      title,
      content,
      content_rowid = 'id'
    );
    
    CREATE TRIGGER IF NOT EXISTS pages_fts_insert 
    AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
    
    CREATE TRIGGER IF NOT EXISTS pages_fts_update 
    AFTER UPDATE ON pages BEGIN
      UPDATE pages_fts SET title = new.title, content = new.content WHERE rowid = old.rowid;
    END;
    
    CREATE TRIGGER IF NOT EXISTS pages_fts_delete 
    AFTER DELETE ON pages BEGIN
      DELETE FROM pages_fts WHERE rowid = old.rowid;
    END;
  `)
}

/**
 * Searches pages using FTS5
 */
export function searchPages (
  query: string,
  projectId?: number,
  limit: number = 50
): SearchResults {
  const db = useDb()
  
  let whereClause = 'WHERE pages_fts MATCH ?'
  let params: (string | number)[] = [query]
  
  if (projectId) {
    whereClause += ' AND pages.project_id = ?'
    params.push(projectId)
  }
  
  const sql = `
    SELECT 
      pages.id, pages.project_id, pages.slug, pages.title,
      pages.content, pages.updated_at, projects.slug as project_slug
    FROM pages_fts
    JOIN pages ON pages_fts.rowid = pages.id
    JOIN projects ON pages.project_id = projects.id
    ${whereClause}
    ORDER BY rank
    LIMIT ?
  `
  
  params.push(limit)
  
  const results = db.prepare(sql).all(...params) as any[]
  
  return {
    query, total: results.length, limit, offset: 0,
    results: results.map(r => ({
      id: r.id, projectId: r.project_id, projectSlug: r.project_slug,
      pageSlug: r.slug, title: r.title, content: r.content, updatedAt: r.updated_at
    }))
  }
}

/**
 * Searches with snippet generation
 */
export function searchPagesWithSnippets (
  query: string,
  projectId?: number,
  limit: number = 50,
  snippetLength: number = 100
): SearchResults {
  const db = useDb()
  
  const whereClause = projectId 
    ? 'WHERE pages_fts MATCH ? AND pages.project_id = ?' 
    : 'WHERE pages_fts MATCH ?'
  
  const sql = `
    SELECT 
      pages.id, pages.project_id, pages.slug, pages.title,
      pages.content, pages.updated_at, projects.slug as project_slug,
      snippet(pages_fts, '...', '[', ']', 1, ${snippetLength}) as snippet
    FROM pages_fts
    JOIN pages ON pages_fts.rowid = pages.id
    JOIN projects ON pages.project_id = projects.id
    ${whereClause}
    ORDER BY rank
    LIMIT ?
  `
  
  const params = projectId ? [query, projectId, limit] : [query, limit]
  const results = db.prepare(sql).all(...params) as any[]
  
  return {
    query, total: results.length, limit, offset: 0,
    results: results.map(r => ({
      id: r.id, projectId: r.project_id, projectSlug: r.project_slug,
      pageSlug: r.slug, title: r.title, content: r.content,
      snippet: r.snippet, updatedAt: r.updated_at
    }))
  }
}

/**
 * Get search statistics
 */
export function getSearchStats (): { totalPagesIndexed: number } {
  const db = useDb()
  const ftsCount = db.prepare('SELECT COUNT(*) as count FROM pages_fts').get() as { count: number }
  return { totalPagesIndexed: ftsCount.count }
}
