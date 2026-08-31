import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull().default('editor'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('users_email_uq').on(table.email)])

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
  index('sessions_user_idx').on(table.userId),
])

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  brief: text('brief').notNull().default(''),
  status: text('status', { enum: ['draft', 'generating', 'ready', 'scheduled', 'published', 'failed'] }).notNull().default('draft'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('campaigns_status_created_idx').on(table.status, table.createdAt)])

export const platformContents = sqliteTable('platform_contents', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  copywriting: text('copywriting').notNull().default(''),
  hashtags: text('hashtags').notNull().default('[]'),
  releaseAt: integer('release_at', { mode: 'timestamp_ms' }),
  status: text('status', { enum: ['draft', 'approved', 'scheduled', 'published', 'failed'] }).notNull().default('draft'),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('platform_contents_campaign_platform_uq').on(table.campaignId, table.platform),
  index('platform_contents_schedule_idx').on(table.status, table.releaseAt),
])

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('assets_campaign_idx').on(table.campaignId)])

export const aiJobs = sqliteTable('ai_jobs', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['queued', 'processing', 'completed', 'failed'] }).notNull().default('queued'),
  provider: text('provider').notNull(),
  errorMessage: text('error_message'),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('ai_jobs_campaign_created_idx').on(table.campaignId, table.createdAt)])

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('audit_logs_entity_idx').on(table.entityType, table.entityId, table.createdAt)])
