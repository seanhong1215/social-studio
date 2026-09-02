import { Hono } from 'hono'
import { requireWorkspace } from '../middleware/auth'
import type { Bindings, Variables } from '../types'

const dashboard = new Hono<{ Bindings: Bindings; Variables: Variables }>()
dashboard.use('*', requireWorkspace)

dashboard.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const [campaigns, posts, reviews, scheduled, failed, assets, notifications] = await Promise.all([
    count(c.env.DB, 'SELECT COUNT(*) AS count FROM content_campaigns WHERE workspace_id = ?', workspaceId),
    count(c.env.DB, 'SELECT COUNT(*) AS count FROM content_posts WHERE workspace_id = ?', workspaceId),
    count(c.env.DB, `SELECT COUNT(*) AS count FROM content_variants WHERE workspace_id = ? AND status IN ('in_review','changes_requested')`, workspaceId),
    count(c.env.DB, `SELECT COUNT(*) AS count FROM content_variants WHERE workspace_id = ? AND status IN ('scheduled','publishing')`, workspaceId),
    count(c.env.DB, `SELECT COUNT(*) AS count FROM content_variants WHERE workspace_id = ? AND status = 'failed'`, workspaceId),
    count(c.env.DB, 'SELECT COUNT(*) AS count FROM media_assets WHERE workspace_id = ?', workspaceId),
    count(c.env.DB, 'SELECT COUNT(*) AS count FROM notifications WHERE workspace_id = ? AND user_id = ? AND read_at IS NULL', workspaceId, c.get('user').id),
  ])
  const upcoming = await c.env.DB.prepare(`SELECT v.id, v.post_id AS postId, p.title, v.platform, v.status, v.scheduled_at AS scheduledAt FROM content_variants v JOIN content_posts p ON p.id = v.post_id WHERE v.workspace_id = ? AND v.status IN ('scheduled','publishing','failed') ORDER BY v.scheduled_at LIMIT 6`).bind(workspaceId).all()
  return c.json({ data: { campaignCount: campaigns, postCount: posts, reviewCount: reviews, scheduledCount: scheduled, failedCount: failed, assetCount: assets, unreadNotificationCount: notifications, aiProvider: c.env.AI_PROVIDER, upcoming: upcoming.results } })
})

async function count(db: D1Database, sql: string, ...values: unknown[]) { return (await db.prepare(sql).bind(...values).first<{ count: number }>())?.count ?? 0 }
export default dashboard
