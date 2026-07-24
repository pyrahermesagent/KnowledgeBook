/**
 * Page version history extension for db.ts
 * Adds version tracking to the base database schema
 */

export interface PageVersion {
  id: number
  page_id: number
  title: string
  content: string
  version: number
  author_id: number | null
  author_wallet: string | null
  created_at: string
}

export interface PageVersionSummary {
  page_id: number
  title: string
  version: number
  created_at: string
  author_name: string | null
  author_wallet: string | null
}

/**
 * Adds page version history table to the database
 * Should be called after the base schema initialization in db.ts
 */
export function extendDbWithVersioning (db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL,
      author_id INTEGER REFERENCES users(id),
      author_wallet TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_page_versions_page_id ON page_versions(page_id);
    CREATE INDEX IF NOT EXISTS idx_page_versions_version ON page_versions(version);
  `)
}

/**
 * Creates a new version of a page
 * Called when a page is updated
 */
export function createPageVersion (
  pageId: number,
  title: string,
  content: string,
  authorId?: number,
  authorWallet?: string
): PageVersion {
  const db = useDb()
  
  // Get current version number
  const current = db.prepare(`
    SELECT COALESCE(MAX(version), 0) as current_version
    FROM page_versions WHERE page_id = ?
  `).get(pageId) as { current_version: number }
  
  const newVersion = current.current_version + 1
  
  // Insert new version
  const result = db.prepare(`
    INSERT INTO page_versions (page_id, title, content, version, author_id, author_wallet)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(pageId, title, content, newVersion, authorId, authorWallet) as PageVersion
  
  return result
}

/**
 * Gets all versions for a page
 */
export function getPageVersions (pageId: number): PageVersionSummary[] {
  const db = useDb()
  
  const versions = db.prepare(`
    SELECT 
      pv.page_id,
      pv.title,
      pv.version,
      pv.created_at,
      u.name as author_name,
      pv.author_wallet
    FROM page_versions pv
    LEFT JOIN users u ON pv.author_id = u.id
    WHERE pv.page_id = ?
    ORDER BY pv.version DESC
  `).all(pageId) as PageVersionSummary[]
  
  return versions
}

/**
 * Gets a specific version of a page
 */
export function getPageVersion (pageId: number, version: number): PageVersion | undefined {
  const db = useDb()
  
  return db.prepare(`
    SELECT * FROM page_versions 
    WHERE page_id = ? AND version = ?
  `).get(pageId, version) as PageVersion | undefined
}

/**
 * Restores a page to a previous version
 * Returns the restored page content
 */
export function restorePageVersion (
  pageId: number,
  version: number
): { title: string; content: string } {
  const db = useDb()
  
  const versionData = db.prepare(`
    SELECT title, content FROM page_versions 
    WHERE page_id = ? AND version = ?
  `).get(pageId, version) as { title: string; content: string } | undefined
  
  if (!versionData) {
    throw new Error(`Version ${version} not found for page ${pageId}`)
  }
  
  // Update the current page with restored content
  db.prepare(`
    UPDATE pages SET 
      title = ?, 
      content = ?, 
      updated_at = datetime('now')
    WHERE id = ?
  `).run(versionData.title, versionData.content, pageId)
  
  return versionData
}

/**
 * Gets page version count
 */
export function getPageVersionCount (pageId: number): number {
  const db = useDb()
  
  return db.prepare(`
    SELECT COUNT(*) as count FROM page_versions WHERE page_id = ?
  `).get(pageId) as { count: number }
}

/**
 * Deletes all versions for a page (cascades from pages deletion)
 */
export function deletePageVersions (pageId: number): void {
  const db = useDb()
  db.prepare('DELETE FROM page_versions WHERE page_id = ?').run(pageId)
}

/**
 * Gets recent versions across all pages (for dashboard activity feed)
 */
export function getRecentPageVersions (limit: number = 20): PageVersionSummary[] {
  const db = useDb()
  
  return db.prepare(`
    SELECT 
      pv.page_id,
      pv.title,
      pv.version,
      pv.created_at,
      u.name as author_name,
      pv.author_wallet
    FROM page_versions pv
    LEFT JOIN users u ON pv.author_id = u.id
    ORDER BY pv.created_at DESC
    LIMIT ?
  `).all(limit) as PageVersionSummary[]
}

/**
 * Gets version diff between two versions
 */
export function getVersionDiff (
  pageId: number,
  versionFrom: number,
  versionTo: number
): { from: PageVersion; to: PageVersion } {
  const db = useDb()
  
  const fromVersion = db.prepare(`
    SELECT * FROM page_versions 
    WHERE page_id = ? AND version = ?
  `).get(pageId, versionFrom) as PageVersion | undefined
  
  const toVersion = db.prepare(`
    SELECT * FROM page_versions 
    WHERE page_id = ? AND version = ?
  `).get(pageId, versionTo) as PageVersion | undefined
  
  if (!fromVersion || !toVersion) {
    throw new Error('Version not found for diff')
  }
  
  return { from: fromVersion, to: toVersion }
}

/**
 * Checks if version history is enabled for a project
 */
export function isVersioningEnabled (projectId: number): boolean {
  const db = useDb()
  
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ?
  `).get(projectId) as { id: number } | undefined
  
  return !!project
}

/**
 * Enables versioning for a specific project
 * (Currently versioning is global, but this provides a hook for project-level control)
 */
export function enableProjectVersioning (projectId: number): void {
  // Versioning is enabled by default for all projects
  // This function exists as a placeholder for future project-level control
}

/**
 * Disables versioning for a specific project
 * (Currently versioning is global, but this provides a hook for project-level control)
 */
export function disableProjectVersioning (projectId: number): void {
  // Versioning is enabled by default for all projects
  // This function exists as a placeholder for future project-level control
}
