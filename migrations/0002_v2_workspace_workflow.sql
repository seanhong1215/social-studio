PRAGMA foreign_keys = ON;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX workspaces_slug_uq ON workspaces(slug);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'reviewer', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id);

CREATE TABLE workspace_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'reviewer', 'viewer')),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX workspace_invitations_token_uq ON workspace_invitations(token_hash);
CREATE INDEX workspace_invitations_workspace_idx ON workspace_invitations(workspace_id, created_at);

CREATE TABLE brands (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '[]',
  banned_terms TEXT NOT NULL DEFAULT '[]',
  default_cta TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#E9684A',
  logo_r2_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX brands_workspace_idx ON brands(workspace_id, created_at);

CREATE TABLE content_campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',
  start_at INTEGER,
  end_at INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX content_campaigns_brand_idx ON content_campaigns(workspace_id, brand_id, updated_at DESC);

CREATE TABLE content_posts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES content_campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL CHECK (format IN ('image', 'carousel', 'short_video')),
  assignee_id TEXT REFERENCES users(id),
  due_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX content_posts_campaign_idx ON content_posts(campaign_id, updated_at DESC);

CREATE TABLE content_variants (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'x', 'threads', 'youtube', 'tiktok')),
  copywriting TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at INTEGER,
  published_at INTEGER,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX content_variants_post_platform_uq ON content_variants(post_id, platform);
CREATE INDEX content_variants_schedule_idx ON content_variants(workspace_id, status, scheduled_at);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  size INTEGER NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX media_assets_brand_idx ON media_assets(workspace_id, brand_id, created_at DESC);

CREATE TABLE post_assets (
  post_id TEXT NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  is_cover INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, asset_id)
);

CREATE TABLE review_comments (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES content_variants(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES review_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT REFERENCES users(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX review_comments_post_idx ON review_comments(post_id, created_at);

CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES content_campaigns(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES content_posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('campaign_ideas', 'platform_copy')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  provider TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'v2',
  error_message TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX generation_jobs_workspace_idx ON generation_jobs(workspace_id, created_at DESC);

CREATE TABLE publish_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES content_variants(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  simulate_failure INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX publish_jobs_idempotency_uq ON publish_jobs(idempotency_key);
CREATE INDEX publish_jobs_workspace_idx ON publish_jobs(workspace_id, status, created_at DESC);

CREATE TABLE analytics_daily (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES content_variants(id) ON DELETE CASCADE,
  metric_date TEXT NOT NULL,
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  video_views INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX analytics_daily_variant_date_uq ON analytics_daily(variant_id, metric_date);
CREATE INDEX analytics_daily_workspace_date_idx ON analytics_daily(workspace_id, metric_date);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX notifications_user_idx ON notifications(workspace_id, user_id, read_at, created_at DESC);

CREATE TABLE auth_rate_limits (
  key_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX auth_rate_limits_key_idx ON auth_rate_limits(key_hash, attempted_at);

-- Backfill V1 into a default workspace when legacy users exist.
INSERT INTO workspaces (id, name, slug, timezone, created_by, created_at, updated_at)
SELECT 'legacy-workspace', 'Social Studio 工作空間', 'social-studio', 'Asia/Taipei', id, created_at, created_at
FROM users ORDER BY created_at LIMIT 1;

INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
SELECT 'legacy-workspace', id,
  CASE
    WHEN id = (SELECT id FROM users ORDER BY created_at LIMIT 1) THEN 'owner'
    WHEN role = 'admin' THEN 'admin'
    WHEN role = 'viewer' THEN 'viewer'
    ELSE 'editor'
  END,
  created_at
FROM users
WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = 'legacy-workspace');

INSERT INTO brands (id, workspace_id, name, industry, audience, tone, keywords, banned_terms, default_cta, primary_color, created_at, updated_at)
SELECT 'legacy-brand', 'legacy-workspace', '預設品牌', '', '', '專業、清楚、親切', '[]', '[]', '', '#E9684A', created_at, created_at
FROM users WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = 'legacy-workspace') ORDER BY created_at LIMIT 1;

INSERT INTO content_campaigns (id, workspace_id, brand_id, name, objective, brief, status, created_by, created_at, updated_at)
SELECT id, 'legacy-workspace', 'legacy-brand', title, '', brief,
  CASE WHEN status = 'published' THEN 'completed' ELSE 'active' END,
  created_by, created_at, updated_at
FROM campaigns
WHERE EXISTS (SELECT 1 FROM brands WHERE id = 'legacy-brand');

INSERT INTO content_posts (id, workspace_id, campaign_id, title, brief, format, created_by, created_at, updated_at)
SELECT 'legacy-post-' || id, 'legacy-workspace', id, title, brief,
  CASE WHEN EXISTS (SELECT 1 FROM assets a WHERE a.campaign_id = campaigns.id AND a.mime_type LIKE 'video/%') THEN 'short_video'
       WHEN (SELECT COUNT(*) FROM assets a WHERE a.campaign_id = campaigns.id) > 1 THEN 'carousel'
       ELSE 'image' END,
  created_by, created_at, updated_at
FROM campaigns
WHERE EXISTS (SELECT 1 FROM content_campaigns cc WHERE cc.id = campaigns.id);

INSERT INTO content_variants (id, workspace_id, post_id, platform, copywriting, hashtags, status, scheduled_at, published_at, updated_at)
SELECT id, 'legacy-workspace', 'legacy-post-' || campaign_id, platform, copywriting, hashtags,
  CASE status
    WHEN 'draft' THEN 'draft'
    WHEN 'approved' THEN 'approved'
    WHEN 'scheduled' THEN 'scheduled'
    WHEN 'published' THEN 'published'
    WHEN 'failed' THEN 'failed'
    ELSE 'draft'
  END,
  release_at, published_at, updated_at
FROM platform_contents
WHERE EXISTS (SELECT 1 FROM content_posts p WHERE p.id = 'legacy-post-' || platform_contents.campaign_id);

INSERT INTO media_assets (id, workspace_id, brand_id, r2_key, file_name, mime_type, media_type, size, alt_text, created_by, created_at)
SELECT a.id, 'legacy-workspace', 'legacy-brand', a.r2_key, a.file_name, a.mime_type,
  CASE WHEN a.mime_type LIKE 'video/%' THEN 'video' ELSE 'image' END,
  a.size, '', c.created_by, a.created_at
FROM assets a JOIN campaigns c ON c.id = a.campaign_id
WHERE EXISTS (SELECT 1 FROM brands WHERE id = 'legacy-brand');

INSERT INTO post_assets (post_id, asset_id, position, is_cover)
SELECT 'legacy-post-' || campaign_id, id,
  ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY created_at) - 1,
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY created_at) = 1 THEN 1 ELSE 0 END
FROM assets
WHERE EXISTS (SELECT 1 FROM content_posts p WHERE p.id = 'legacy-post-' || assets.campaign_id);
