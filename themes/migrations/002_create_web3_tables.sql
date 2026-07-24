-- Web3 Authentication Tables Migration
-- Creates wallet_users, wallet_project_members, and token_gated_projects tables

-- Wallet users table (extends users for Web3 authentication)
CREATE TABLE IF NOT EXISTS wallet_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Project membership with wallets
CREATE TABLE IF NOT EXISTS wallet_project_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, wallet_address)
);

-- Token-gated project configuration
CREATE TABLE IF NOT EXISTS token_gated_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  token_contract TEXT NOT NULL,
  token_id INTEGER, -- For ERC-721
  min_balance INTEGER, -- For ERC-20
  network TEXT NOT NULL CHECK (network IN ('ethereum', 'polygon', 'arbitrum', 'base')) DEFAULT 'ethereum',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_users_address ON wallet_users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_project_members_project ON wallet_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_wallet_project_members_wallet ON wallet_project_members(wallet_address);
CREATE INDEX IF NOT EXISTS idx_token_gated_projects_project ON token_gated_projects(project_id);
