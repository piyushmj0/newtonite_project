import { query } from './pool.js';
import dotenv from 'dotenv';

dotenv.config();

const SCHEMA = `
-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Team memberships with roles
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, user_id)
);

-- Work Items: the core entity
CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'pending_approval', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('customer_issue', 'engineering', 'payment', 'production_incident', 'compliance', 'operational', 'general')),
  
  -- Ownership
  created_by TEXT NOT NULL REFERENCES users(id),
  assignee_id TEXT REFERENCES users(id),
  team_id TEXT REFERENCES teams(id),
  
  version INTEGER NOT NULL DEFAULT 1,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  due_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
CREATE INDEX IF NOT EXISTS idx_work_items_assignee ON work_items(assignee_id);
CREATE INDEX IF NOT EXISTS idx_work_items_team ON work_items(team_id);
CREATE INDEX IF NOT EXISTS idx_work_items_created_by ON work_items(created_by);
CREATE INDEX IF NOT EXISTS idx_work_items_updated_at ON work_items(updated_at DESC);

-- Audit/Event log
CREATE TABLE IF NOT EXISTS work_item_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_work_item ON work_item_events(work_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user ON work_item_events(user_id);

-- Comments on work items
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_work_item ON comments(work_item_id, created_at ASC);

-- Idempotency keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+1 day'))
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- Approvals
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_work_item ON approvals(work_item_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
`;

async function migrate() {
  try {
    console.log('Running SQLite migrations...');
    // Split the schema by semicolon and run each statement
    const statements = SCHEMA.split(';').filter(s => s.trim().length > 0);
    for (const stmt of statements) {
      await query(stmt);
    }
    console.log('Migrations completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
