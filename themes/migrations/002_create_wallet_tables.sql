-- Wallet users table for Web3 authentication
CREATE TABLE IF NOT EXISTS wallet_users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address  TEXT NOT NULL UNIQUE,
  chain_id        INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Wallet project members table for project access control
CREATE TABLE IF NOT EXISTS wallet_project_members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  role            TEXT NOT NULL DEFAULT 'member', -- 'admin' or 'member'
  UNIQUE (project_id, wallet_address)
);

-- Token-gated projects configuration
CREATE TABLE IF NOT EXISTS token_gated_projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  token_contract  TEXT NOT NULL,
  token_id        INTEGER, -- For ERC-721 NFTs
  min_balance     INTEGER, -- For ERC-20 tokens
  network         TEXT NOT NULL, -- 'ethereum', 'polygon', 'arbitrum', 'base'
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
