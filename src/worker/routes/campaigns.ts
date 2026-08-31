import { Hono } from 'hono'
import { z } from 'zod'
import { requireEditor } from '../middleware/auth'
import { PLATFORMS, type Bindings, type Variables } from '../types'

const campaigns = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const createCampaignSchema = z.object({
  title: z.string().trim().min(2).max(120),
  brief: z.string().trim().max(3000).default(''),
})

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
