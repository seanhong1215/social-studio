import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspace, requireWorkspaceRoles } from '../middleware/auth'
import { resetDemoData } from '../services/demo-data'
import { enqueueDuePublications } from '../services/publisher'
import type { Bindings, Variables } from '../types'

const operations = new Hono<{ Bindings: Bindings; Variables: Variables }>()
operations.use('*', requireWorkspace)

operations.get('/reviews', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT v.id AS variantId, v.post_id AS postId, p.title AS postTitle, cc.id AS campaignId, cc.name AS campaignName,
      b.id AS brandId, b.name AS brandName, v.platform, v.status, v.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM review_comments rc WHERE rc.variant_id = v.id AND rc.resolved_at IS NULL) AS openCommentCount
    FROM content_variants v JOIN content_posts p ON p.id = v.post_id JOIN content_campaigns cc ON cc.id = p.campaign_id JOIN brands b ON b.id = cc.brand_id
    WHERE v.workspace_id = ? AND v.status IN ('in_review','changes_requested') ORDER BY v.updated_at
  `).bind(c.get('workspaceId')).all()
  return c.json({ data: result.results })
})

operations.get('/publish-jobs', async (c) => {
  const result = await c.env.DB.prepare(`SELECT pj.id, pj.variant_id AS variantId, p.id AS postId, p.title AS postTitle, v.platform, pj.status, pj.attempt, pj.error_code AS errorCode, pj.error_message AS errorMessage, pj.updated_at AS updatedAt FROM publish_jobs pj JOIN content_variants v ON v.id = pj.variant_id JOIN content_posts p ON p.id = v.post_id WHERE pj.workspace_id = ? ORDER BY pj.updated_at DESC LIMIT 50`)
    .bind(c.get('workspaceId')).all()
  return c.json({ data: result.results })
})

operations.post('/publish-jobs/:jobId/retry', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const job = await c.env.DB.prepare(`SELECT id, variant_id AS variantId FROM publish_jobs WHERE id = ? AND workspace_id = ? AND status = 'failed'`)
    .bind(c.req.param('jobId'), c.get('workspaceId')).first<{ id: string; variantId: string }>()
  if (!job) return c.json({ error: { code: 'INVALID_STATE', message: '此工作目前無法重試' } }, 409)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE publish_jobs SET status = 'queued', simulate_failure = 0, error_code = NULL, error_message = NULL, updated_at = ? WHERE id = ?`).bind(Date.now(), job.id),
    c.env.DB.prepare(`UPDATE content_variants SET status = 'publishing', updated_at = ? WHERE id = ?`).bind(Date.now(), job.variantId),
  ])
  await c.env.CONTENT_QUEUE.send({ type: 'publish', jobId: job.id, variantId: job.variantId })
  return c.json({ data: { id: job.id, status: 'queued' }, message: '已重新加入發布佇列' })
})

operations.post('/demo/run-publisher', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  if (c.env.AI_PROVIDER !== 'demo') return c.json({ error: { code: 'DEMO_ONLY', message: '只有 Demo 環境可以手動執行' } }, 403)
  await enqueueDuePublications(c.env)
  return c.json({ data: { triggered: true }, message: '已執行模擬發布排程器' })
})

operations.get('/analytics', async (c) => {
  const brandId = c.req.query('brandId'); const from = c.req.query('from') ?? '1970-01-01'; const to = c.req.query('to') ?? '2999-12-31'
  const rows = await c.env.DB.prepare(`
    SELECT ad.metric_date AS metricDate, v.platform, cc.brand_id AS brandId,
      SUM(ad.reach) AS reach, SUM(ad.impressions) AS impressions, SUM(ad.engagements) AS engagements,
      SUM(ad.clicks) AS clicks, SUM(ad.video_views) AS videoViews
    FROM analytics_daily ad JOIN content_variants v ON v.id = ad.variant_id JOIN content_posts p ON p.id = v.post_id JOIN content_campaigns cc ON cc.id = p.campaign_id
    WHERE ad.workspace_id = ? AND ad.metric_date BETWEEN ? AND ? AND (? IS NULL OR cc.brand_id = ?)
    GROUP BY ad.metric_date, v.platform, cc.brand_id ORDER BY ad.metric_date
  `).bind(c.get('workspaceId'), from, to, brandId ?? null, brandId ?? null).all<{ metricDate: string; platform: string; brandId: string; reach: number; impressions: number; engagements: number; clicks: number; videoViews: number }>()
  const totals = rows.results.reduce((acc, row) => ({ reach: acc.reach + row.reach, impressions: acc.impressions + row.impressions, engagements: acc.engagements + row.engagements, clicks: acc.clicks + row.clicks, videoViews: acc.videoViews + row.videoViews }), { reach: 0, impressions: 0, engagements: 0, clicks: 0, videoViews: 0 })
  return c.json({ data: { totals: { ...totals, engagementRate: totals.reach ? Number((totals.engagements / totals.reach * 100).toFixed(2)) : 0 }, series: rows.results } })
})

operations.get('/notifications', async (c) => {
  const result = await c.env.DB.prepare(`SELECT id, type, title, body, entity_type AS entityType, entity_id AS entityId, read_at AS readAt, created_at AS createdAt FROM notifications WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(c.get('workspaceId'), c.get('user').id).all()
  return c.json({ data: result.results })
})

operations.patch('/notifications/:id/read', async (c) => {
  const result = await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?`).bind(Date.now(), c.req.param('id'), c.get('workspaceId'), c.get('user').id).run()
  if (!result.meta.changes) return c.json({ error: { code: 'NOT_FOUND', message: '找不到通知' } }, 404)
  return c.json({ data: { id: c.req.param('id'), read: true } })
})

operations.post('/demo/reset', requireWorkspaceRoles('owner', 'admin'), async (c) => {
  if (c.env.AI_PROVIDER !== 'demo') return c.json({ error: { code: 'DEMO_ONLY', message: '只有 Demo 環境可以重置情境資料' } }, 403)
  const parsed = z.object({ confirm: z.literal('RESET') }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'CONFIRM_REQUIRED', message: '請確認重置操作' } }, 400)
  await resetDemoData(c.env, c.get('workspaceId'), c.get('user').id)
  return c.json({ data: { reset: true }, message: 'Demo 情境資料已重置' })
})

export default operations
