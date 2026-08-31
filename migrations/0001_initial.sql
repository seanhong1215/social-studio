PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'viewer')),
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_email_uq ON users(email);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX sessions_token_hash_uq ON sessions(token_hash);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'ready', 'scheduled', 'published', 'failed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX campaigns_status_created_idx ON campaigns(status, created_at DESC);

CREATE TABLE platform_contents (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'x', 'threads', 'youtube', 'tiktok')),
  copywriting TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  release_at INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'scheduled', 'published', 'failed')),
  published_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX platform_contents_campaign_platform_uq ON platform_contents(campaign_id, platform);
CREATE INDEX platform_contents_schedule_idx ON platform_contents(status, release_at);

CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX assets_campaign_idx ON assets(campaign_id);

CREATE TABLE ai_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  provider TEXT NOT NULL,
  error_message TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ai_jobs_campaign_created_idx ON ai_jobs(campaign_id, created_at DESC);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
