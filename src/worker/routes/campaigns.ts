import { Hono } from 'hono'
import { z } from 'zod'
import { requireEditor } from '../middleware/auth'
import { PLATFORMS, type Bindings, type Variables } from '../types'

const campaigns = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const createCampaignSchema = z.object({
  title: z.string().trim().min(2).max(120),
  brief: z.string().trim().max(3000).default(''),
})

const updateCampaignSchema = createCampaignSchema.partial().refine((value) => Object.keys(value).length > 0)
const updateContentSchema = z.object({
  copywriting: z.string().trim().min(1).max(5000),
  hashtags: z.array(z.string().trim().min(1).max(80)).max(20),
})
const scheduleSchema = z.object({ releaseAt: z.number().int().positive() })

campaigns.get('/', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 20, 1), 50)
  const result = await c.env.DB.prepare(`
    SELECT c.id, c.title, c.brief, c.status, c.created_at AS createdAt, c.updated_at AS updatedAt,
           COUNT(DISTINCT a.id) AS assetCount,
           COUNT(DISTINCT p.id) AS platformCount
    FROM campaigns c
    LEFT JOIN assets a ON a.campaign_id = c.id
    LEFT JOIN platform_contents p ON p.campaign_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT ?
  `).bind(limit).all()
  return c.json({ data: result.results })
})

campaigns.post('/', requireEditor, async (c) => {
  const parsed = createCampaignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', issues: parsed.error.issues } }, 400)

  const id = crypto.randomUUID()
  const now = Date.now()
  const user = c.get('user')
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO campaigns (id, title, brief, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `).bind(id, parsed.data.title, parsed.data.brief, user.id, now, now),
    ...PLATFORMS.map((platform) => c.env.DB.prepare(`
      INSERT INTO platform_contents (id, campaign_id, platform, updated_at) VALUES (?, ?, ?, ?)
    `).bind(crypto.randomUUID(), id, platform, now)),
    c.env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, created_at)
      VALUES (?, ?, 'campaign.created', 'campaign', ?, ?)
    `).bind(crypto.randomUUID(), user.id, id, now),
  ])

  return c.json({ data: { id, ...parsed.data, status: 'draft', createdAt: now } }, 201)
})

campaigns.get('/calendar', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT p.id, p.campaign_id AS campaignId, c.title AS campaignTitle, p.platform,
           p.copywriting, p.release_at AS releaseAt, p.status
    FROM platform_contents p
    JOIN campaigns c ON c.id = p.campaign_id
    WHERE p.release_at IS NOT NULL
    ORDER BY p.release_at ASC, c.title ASC, p.platform ASC
  `).all()
  return c.json({ data: result.results })
})

campaigns.get('/:id', async (c) => {
  const id = c.req.param('id')
  const campaign = await c.env.DB.prepare(`
    SELECT id, title, brief, status, created_at AS createdAt, updated_at AS updatedAt
    FROM campaigns WHERE id = ?
  `).bind(id).first()
  if (!campaign) return c.json({ error: { code: 'NOT_FOUND', message: '找不到此內容企劃' } }, 404)

  const [contents, assets, jobs] = await Promise.all([
    c.env.DB.prepare(`SELECT id, platform, copywriting, hashtags, release_at AS releaseAt, status, updated_at AS updatedAt FROM platform_contents WHERE campaign_id = ? ORDER BY platform`).bind(id).all(),
    c.env.DB.prepare(`SELECT id, file_name AS fileName, mime_type AS mimeType, size, created_at AS createdAt FROM assets WHERE campaign_id = ? ORDER BY created_at`).bind(id).all(),
    c.env.DB.prepare(`SELECT id, status, provider, error_message AS errorMessage, created_at AS createdAt, updated_at AS updatedAt FROM ai_jobs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 5`).bind(id).all(),
  ])
  return c.json({ data: { ...campaign, contents: contents.results, assets: assets.results, jobs: jobs.results } })
})

campaigns.patch('/:id', requireEditor, async (c) => {
  const parsed = updateCampaignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', issues: parsed.error.issues } }, 400)
  const campaign = await c.env.DB.prepare('SELECT id, title, brief FROM campaigns WHERE id = ?').bind(c.req.param('id')).first<{ id: string; title: string; brief: string }>()
  if (!campaign) return c.json({ error: { code: 'NOT_FOUND', message: '找不到此內容企劃' } }, 404)
  const next = { title: parsed.data.title ?? campaign.title, brief: parsed.data.brief ?? campaign.brief }
  await c.env.DB.prepare('UPDATE campaigns SET title = ?, brief = ?, updated_at = ? WHERE id = ?')
    .bind(next.title, next.brief, Date.now(), campaign.id).run()
  return c.json({ data: { ...campaign, ...next } })
})

campaigns.patch('/:id/contents/:contentId', requireEditor, async (c) => {
  const parsed = updateContentSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', issues: parsed.error.issues } }, 400)
  const now = Date.now()
  const result = await c.env.DB.prepare(`
    UPDATE platform_contents SET copywriting = ?, hashtags = ?, status = 'draft', updated_at = ?
    WHERE id = ? AND campaign_id = ?
  `).bind(parsed.data.copywriting, JSON.stringify(parsed.data.hashtags), now, c.req.param('contentId'), c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: { code: 'NOT_FOUND', message: '找不到平台文案' } }, 404)
  await c.env.DB.prepare(`UPDATE campaigns SET status = 'ready', updated_at = ? WHERE id = ?`).bind(now, c.req.param('id')).run()
  return c.json({ data: { id: c.req.param('contentId'), status: 'draft' }, message: '文案已儲存' })
})

campaigns.post('/:id/approve', requireEditor, async (c) => {
  const id = c.req.param('id')
  const incomplete = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM platform_contents WHERE campaign_id = ? AND copywriting = ''`).bind(id).first<{ count: number }>()
  if ((incomplete?.count ?? 0) > 0) return c.json({ error: { code: 'CONTENT_REQUIRED', message: '請先完成所有平台文案' } }, 400)
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE platform_contents SET status = 'approved', updated_at = ? WHERE campaign_id = ?`).bind(now, id),
    c.env.DB.prepare(`UPDATE campaigns SET status = 'ready', updated_at = ? WHERE id = ?`).bind(now, id),
  ])
  return c.json({ data: { id, status: 'approved' }, message: '六平台文案已核准' })
})

campaigns.post('/:id/schedule', requireEditor, async (c) => {
  const parsed = scheduleSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || parsed.data.releaseAt <= Date.now()) return c.json({ error: { code: 'INVALID_SCHEDULE', message: '發布時間必須晚於現在' } }, 400)
  const id = c.req.param('id')
  const unapproved = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM platform_contents WHERE campaign_id = ? AND status != 'approved'`).bind(id).first<{ count: number }>()
  if ((unapproved?.count ?? 0) > 0) return c.json({ error: { code: 'APPROVAL_REQUIRED', message: '請先核准所有平台文案' } }, 400)
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE platform_contents SET status = 'scheduled', release_at = ?, updated_at = ? WHERE campaign_id = ?`).bind(parsed.data.releaseAt, now, id),
    c.env.DB.prepare(`UPDATE campaigns SET status = 'scheduled', updated_at = ? WHERE id = ?`).bind(now, id),
  ])
  return c.json({ data: { id, status: 'scheduled', releaseAt: parsed.data.releaseAt }, message: '已加入內容日曆' })
})

campaigns.post('/:id/publish', requireEditor, async (c) => {
  const id = c.req.param('id')
  const scheduled = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM platform_contents WHERE campaign_id = ? AND status = 'scheduled'`).bind(id).first<{ count: number }>()
  if ((scheduled?.count ?? 0) === 0) return c.json({ error: { code: 'SCHEDULE_REQUIRED', message: '請先完成核准與排程' } }, 400)
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE platform_contents SET status = 'published', published_at = ?, updated_at = ? WHERE campaign_id = ?`).bind(now, now, id),
    c.env.DB.prepare(`UPDATE campaigns SET status = 'published', updated_at = ? WHERE id = ?`).bind(now, id),
  ])
  return c.json({ data: { id, status: 'published' }, message: '已標記為發布完成' })
})

campaigns.delete('/:id', requireEditor, async (c) => {
  const id = c.req.param('id')
  const assets = await c.env.DB.prepare('SELECT r2_key AS r2Key FROM assets WHERE campaign_id = ?').bind(id).all<{ r2Key: string }>()
  const keys = assets.results.map((asset) => asset.r2Key)
  if (keys.length) await c.env.MEDIA.delete(keys)
  const result = await c.env.DB.prepare('DELETE FROM campaigns WHERE id = ?').bind(id).run()
  if (!result.meta.changes) return c.json({ error: { code: 'NOT_FOUND', message: '找不到此內容企劃' } }, 404)
  return c.json({ data: { id }, message: '企劃與素材已刪除' })
})

campaigns.post('/:id/assets', requireEditor, async (c) => {
  const campaignId = c.req.param('id')
  const campaign = await c.env.DB.prepare('SELECT id FROM campaigns WHERE id = ?').bind(campaignId).first()
  if (!campaign) return c.json({ error: { code: 'NOT_FOUND', message: '找不到此內容企劃' } }, 404)

  const body = await c.req.parseBody({ all: true })
  const rawFiles = body.files
  const files = (Array.isArray(rawFiles) ? rawFiles : [rawFiles]).filter((item): item is File => item instanceof File)
  if (files.length === 0 || files.length > 6) {
    return c.json({ error: { code: 'INVALID_FILES', message: '請上傳 1 到 6 張圖片' } }, 400)
  }

  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
  if (files.some((file) => !allowed.has(file.type) || file.size > 5 * 1024 * 1024)) {
    return c.json({ error: { code: 'INVALID_FILES', message: '只接受 JPG、PNG、WebP，每張最多 5MB' } }, 400)
  }

  const now = Date.now()
  const records: Array<{ id: string; fileName: string; mimeType: string; size: number }> = []
  for (const file of files) {
    const id = crypto.randomUUID()
    const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const key = `campaigns/${campaignId}/${id}.${extension}`
    await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } })
    await c.env.DB.prepare(`
      INSERT INTO assets (id, campaign_id, r2_key, file_name, mime_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, campaignId, key, file.name, file.type, file.size, now).run()
    records.push({ id, fileName: file.name, mimeType: file.type, size: file.size })
  }
  return c.json({ data: records }, 201)
})

campaigns.get('/:campaignId/assets/:assetId', async (c) => {
  const asset = await c.env.DB.prepare('SELECT r2_key AS r2Key, mime_type AS mimeType FROM assets WHERE id = ? AND campaign_id = ?')
    .bind(c.req.param('assetId'), c.req.param('campaignId')).first<{ r2Key: string; mimeType: string }>()
  if (!asset) return c.json({ error: { code: 'NOT_FOUND', message: '找不到圖片' } }, 404)
  const object = await c.env.MEDIA.get(asset.r2Key)
  if (!object) return c.json({ error: { code: 'NOT_FOUND', message: '圖片檔案不存在' } }, 404)
  return new Response(object.body, { headers: { 'Content-Type': asset.mimeType, 'Cache-Control': 'private, max-age=3600' } })
})

campaigns.post('/:id/generate', requireEditor, async (c) => {
  const campaignId = c.req.param('id')
  const campaign = await c.env.DB.prepare('SELECT id FROM campaigns WHERE id = ?').bind(campaignId).first()
  if (!campaign) return c.json({ error: { code: 'NOT_FOUND', message: '找不到此內容企劃' } }, 404)
  const asset = await c.env.DB.prepare('SELECT id FROM assets WHERE campaign_id = ? LIMIT 1').bind(campaignId).first()
  if (!asset) return c.json({ error: { code: 'IMAGE_REQUIRED', message: '請先上傳至少一張圖片' } }, 400)

  const jobId = crypto.randomUUID()
  const now = Date.now()
  const user = c.get('user')
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO ai_jobs (id, campaign_id, status, provider, requested_by, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?, ?)`)
      .bind(jobId, campaignId, c.env.AI_PROVIDER, user.id, now, now),
    c.env.DB.prepare(`UPDATE campaigns SET status = 'generating', updated_at = ? WHERE id = ?`).bind(now, campaignId),
  ])
  await c.env.CONTENT_QUEUE.send({ jobId, campaignId, requestedBy: user.id })
  return c.json({ data: { jobId, status: 'queued' } }, 202)
})

export default campaigns
