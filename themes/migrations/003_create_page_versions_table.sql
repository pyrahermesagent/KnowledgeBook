-- Migration 003: Add page_versions table for AI content tracking
-- Creates version history for pages with AI vs human edit distinction

CREATE TABLE IF NOT EXISTS page_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id         INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  title           TEXT NOT NULL,
  edited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_ai_edit      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create index for version lookups by page
CREATE INDEX IF NOT EXISTS idx_page_versions_page_id ON page_versions(page_id);

-- Create index for audit trail lookups
CREATE INDEX IF NOT EXISTS idx_page_versions_created_at ON page_versions(created_at);

-- Insert existing page content as version 1 for all current pages
INSERT INTO page_versions (page_id, content, title, edited_by_user_id, is_ai_edit, created_at)
SELECT id, content, title, NULL, FALSE, updated_at
FROM pages
WHERE NOT EXISTS (
  SELECT 1 FROM page_versions pv WHERE pv.page_id = pages.id
);

-- Create helper function to get latest version of a page
CREATE VIEW IF NOT EXISTS page_latest_version AS
SELECT pv.*, p.slug AS page_slug, p.project_id
FROM page_versions pv
JOIN pages p ON p.id = pv.page_id
WHERE pv.id = (
  SELECT MAX(pv2.id) FROM page_versions pv2 WHERE pv2.page_id = pv.page_id
);
