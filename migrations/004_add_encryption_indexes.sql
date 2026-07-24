-- Migration: Add Database Indexes for Encryption Optimization
-- Improves query performance for encrypted content operations

-- ============================================================================ 
-- Encryption-related indexes 
-- ============================================================================

-- Index for pages encryption queries
CREATE INDEX IF NOT EXISTS idx_pages_encrypted ON pages (project_id, is_encrypted);

-- Index for project encryption key lookups  
CREATE INDEX IF NOT EXISTS idx_project_keys_project ON encryption_keys (project_id);

-- Index for user access to encryption keys
CREATE INDEX IF NOT EXISTS idx_user_encryption_access_user ON user_encryption_access (user_id, project_id);

-- Index for revoked access checks
CREATE INDEX IF NOT EXISTS idx_user_encryption_access_revoked ON user_encryption_access (revoked_at);

-- Index for key rotation tracking
CREATE INDEX IF NOT EXISTS idx_encryption_keys_updated ON encryption_keys (updated_at);

-- ============================================================================ 
-- Additional optimization indexes (general) 
-- ============================================================================

-- Project slug lookup
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);

-- User email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Page slug lookup per project
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages (project_id, slug);

-- Section position ordering
CREATE INDEX IF NOT EXISTS idx_sections_order ON sections (project_id, position);

-- Page views analytics indexes
CREATE INDEX IF NOT EXISTS idx_page_views_timestamp ON page_views (view_timestamp);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views (session_id);

-- Content generation sessions status
CREATE INDEX IF NOT EXISTS idx_content_generation_status ON content_generation_sessions (status, created_at);

-- ============================================================================ 
-- Composite indexes for common query patterns 
-- ============================================================================

-- Project pages with encryption status
CREATE INDEX IF NOT EXISTS idx_pages_project_encrypted ON pages (project_id, is_encrypted, id);

-- User project access with wallet
CREATE INDEX IF NOT EXISTS idx_wallet_project_access ON wallet_project_members (wallet_address, project_id);

-- Token-gated project access
CREATE INDEX IF NOT EXISTS idx_token_gated_project ON token_gated_projects (project_id, token_contract);

-- Page view user tracking
CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views (visitor_id, project_id, view_timestamp);

-- ============================================================================ 
-- Cleanup old indexes if they exist (optional) 
-- ============================================================================

-- DROP INDEX IF EXISTS idx_pages_encrypted_old;
-- DROP INDEX IF EXISTS idx_encryption_keys_old;
