import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { requireWorkspace, requireWorkspaceRoles } from '../middleware/auth'
import { PLATFORMS, type Bindings, type Platform, type Variables } from '../types'

const campaigns = new Hono<{ Bindings: Bindings; Variables: Variables }>()
type CampaignContext = Context<{ Bindings: Bindings; Variables: Variables }>
campaigns.use('*', requireWorkspace)

const platformSchema = z.enum(['facebook', 'instagram', 'x', 'threads', 'youtube', 'tiktok'])
const campaignSchema = z.object({
  brandId: z.string().min(1), name: z.string().trim().min(2).max(120), objective: z.string().trim().max(500).default(''),
  brief: z.string().trim().max(3000).default(''), startAt: z.number().int().positive().nullable().default(null), endAt: z.number().int().positive().nullable().default(null),
})
const postSchema = z.object({
  title: z.string().trim().min(2).max(120), brief: z.string().trim().max(3000).default(''),
  format: z.enum(['image', 'carousel', 'short_video']), platforms: z.array(platformSchema).min(1).max(6),
  assigneeId: z.string().nullable().default(null), dueAt: z.number().int().positive().nullable().default(null),
}).superRefine((value, ctx) => {
  if (value.platforms.includes('youtube') && value.format !== 'short_video') ctx.addIssue({ code: 'custom', message: 'YouTube 內容需使用短影音格式', path: ['platforms'] })
})

campaigns.get('/calendar', async (c) => {
  const brandId = c.req.query('brandId')
  const result = await c.env.DB.prepare(`
    SELECT v.id, v.post_id AS postId, p.title AS postTitle, p.format, cc.id AS campaignId, cc.name AS campaignName,
      cc.brand_id AS brandId, b.name AS brandName, v.platform, v.status, v.scheduled_at AS scheduledAt, v.published_at AS publishedAt
    FROM content_variants v JOIN content_posts p ON p.id = v.post_id
    JOIN content_campaigns cc ON cc.id = p.campaign_id JOIN brands b ON b.id = cc.brand_id
    WHERE v.workspace_id = ? AND v.scheduled_at IS NOT NULL AND (? IS NULL OR cc.brand_id = ?)
    ORDER BY v.scheduled_at
  `).bind(c.get('workspaceId'), brandId ?? null, brandId ?? null).all()
  return c.json({ data: result.results })
})

campaigns.get('/', async (c) => {
  const brandId = c.req.query('brandId')
  const result = await c.env.DB.prepare(`
    SELECT cc.id, cc.brand_id AS brandId, b.name AS brandName, cc.name, cc.objective, cc.brief, cc.status,
      cc.start_at AS startAt, cc.end_at AS endAt, cc.created_at AS createdAt, cc.updated_at AS updatedAt,
      COUNT(DISTINCT p.id) AS postCount,
      COUNT(DISTINCT CASE WHEN v.status IN ('in_review','changes_requested') THEN v.id END) AS reviewCount,
      COUNT(DISTINCT CASE WHEN v.status IN ('scheduled','publishing','failed') THEN v.id END) AS scheduledCount
    FROM content_campaigns cc JOIN brands b ON b.id = cc.brand_id
    LEFT JOIN content_posts p ON p.campaign_id = cc.id LEFT JOIN content_variants v ON v.post_id = p.id
    WHERE cc.workspace_id = ? AND (? IS NULL OR cc.brand_id = ?)
    GROUP BY cc.id ORDER BY cc.updated_at DESC LIMIT 100
  `).bind(c.get('workspaceId'), brandId ?? null, brandId ?? null).all()
  return c.json({ data: result.results })
})

campaigns.post('/', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const parsed = campaignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  const brand = await c.env.DB.prepare('SELECT id FROM brands WHERE id = ? AND workspace_id = ?').bind(parsed.data.brandId, c.get('workspaceId')).first()
  if (!brand) return c.json({ error: { code: 'NOT_FOUND', message: '找不到品牌' } }, 404)
  const id = crypto.randomUUID(); const now = Date.now()
  await c.env.DB.prepare(`INSERT INTO content_campaigns (id, workspace_id, brand_id, name, objective, brief, start_at, end_at, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
    .bind(id, c.get('workspaceId'), parsed.data.brandId, parsed.data.name, parsed.data.objective, parsed.data.brief, parsed.data.startAt, parsed.data.endAt, c.get('user').id, now, now).run()
  await audit(c.env.DB, c.get('user').id, 'campaign.created', 'campaign', id, c.get('workspaceId'))
  return c.json({ data: { id, ...parsed.data, status: 'active', createdAt: now, updatedAt: now } }, 201)
})

campaigns.get('/:id', async (c) => {
  const campaign = await c.env.DB.prepare(`SELECT cc.id, cc.brand_id AS brandId, b.name AS brandName, cc.name, cc.objective, cc.brief, cc.status, cc.start_at AS startAt, cc.end_at AS endAt, cc.created_at AS createdAt, cc.updated_at AS updatedAt FROM content_campaigns cc JOIN brands b ON b.id = cc.brand_id WHERE cc.id = ? AND cc.workspace_id = ?`)
    .bind(c.req.param('id'), c.get('workspaceId')).first()
  if (!campaign) return c.json({ error: { code: 'NOT_FOUND', message: '找不到企劃' } }, 404)
  const posts = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.brief, p.format, p.assignee_id AS assigneeId, u.display_name AS assigneeName, p.due_at AS dueAt,
      p.created_at AS createdAt, p.updated_at AS updatedAt, COUNT(v.id) AS variantCount,
      SUM(CASE WHEN v.status = 'published' THEN 1 ELSE 0 END) AS publishedCount,
      CASE
        WHEN COUNT(v.id) > 0 AND SUM(CASE WHEN v.status = 'published' THEN 1 ELSE 0 END) = COUNT(v.id) THEN 'published'
        WHEN SUM(CASE WHEN v.status = 'failed' THEN 1 ELSE 0 END) > 0 THEN 'failed'
        WHEN SUM(CASE WHEN v.status IN ('scheduled','publishing') THEN 1 ELSE 0 END) > 0 THEN 'scheduled'
        WHEN SUM(CASE WHEN v.status = 'changes_requested' THEN 1 ELSE 0 END) > 0 THEN 'changes_requested'
        WHEN SUM(CASE WHEN v.status = 'in_review' THEN 1 ELSE 0 END) > 0 THEN 'in_review'
        WHEN COUNT(v.id) > 0 AND SUM(CASE WHEN v.status = 'approved' THEN 1 ELSE 0 END) = COUNT(v.id) THEN 'approved'
        ELSE 'draft' END AS status
    FROM content_posts p LEFT JOIN users u ON u.id = p.assignee_id LEFT JOIN content_variants v ON v.post_id = p.id
    WHERE p.campaign_id = ? AND p.workspace_id = ? GROUP BY p.id ORDER BY p.created_at
  `).bind(c.req.param('id'), c.get('workspaceId')).all()
  return c.json({ data: { ...campaign, posts: posts.results } })
})

campaigns.patch('/:id', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const parsed = campaignSchema.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || Object.keys(parsed.data).length === 0) return invalid(c, parsed.success ? [] : parsed.error.issues)
  const current = await c.env.DB.prepare('SELECT brand_id AS brandId, name, objective, brief, start_at AS startAt, end_at AS endAt FROM content_campaigns WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), c.get('workspaceId')).first<Record<string, unknown>>()
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: '找不到企劃' } }, 404)
  const next = { ...current, ...parsed.data }
  await c.env.DB.prepare('UPDATE content_campaigns SET brand_id = ?, name = ?, objective = ?, brief = ?, start_at = ?, end_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
    .bind(next.brandId, next.name, next.objective, next.brief, next.startAt, next.endAt, Date.now(), c.req.param('id'), c.get('workspaceId')).run()
  return c.json({ data: { id: c.req.param('id'), ...next }, message: '企劃已更新' })
})

campaigns.post('/:id/ideas', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  if (!(await campaignExists(c.env.DB, c.req.param('id'), c.get('workspaceId')))) return c.json({ error: { code: 'NOT_FOUND', message: '找不到企劃' } }, 404)
  const jobId = crypto.randomUUID(); const now = Date.now()
  await c.env.DB.prepare(`INSERT INTO generation_jobs (id, workspace_id, campaign_id, kind, status, provider, requested_by, created_at, updated_at) VALUES (?, ?, ?, 'campaign_ideas', 'queued', ?, ?, ?, ?)`)
    .bind(jobId, c.get('workspaceId'), c.req.param('id'), c.env.AI_PROVIDER, c.get('user').id, now, now).run()
  await c.env.CONTENT_QUEUE.send({ jobId, campaignId: c.req.param('id'), kind: 'campaign_ideas', requestedBy: c.get('user').id })
  return c.json({ data: { jobId, status: 'queued' } }, 202)
})

campaigns.post('/:id/posts', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const parsed = postSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  if (!(await campaignExists(c.env.DB, c.req.param('id'), c.get('workspaceId')))) return c.json({ error: { code: 'NOT_FOUND', message: '找不到企劃' } }, 404)
  const id = crypto.randomUUID(); const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO content_posts (id, workspace_id, campaign_id, title, brief, format, assignee_id, due_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, c.get('workspaceId'), c.req.param('id'), parsed.data.title, parsed.data.brief, parsed.data.format, parsed.data.assigneeId, parsed.data.dueAt, c.get('user').id, now, now),
    ...parsed.data.platforms.map((platform) => c.env.DB.prepare(`INSERT INTO content_variants (id, workspace_id, post_id, platform, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), c.get('workspaceId'), id, platform, now)),
    c.env.DB.prepare('UPDATE content_campaigns SET updated_at = ? WHERE id = ?').bind(now, c.req.param('id')),
  ])
  return c.json({ data: { id, ...parsed.data, status: 'draft', createdAt: now } }, 201)
})

campaigns.get('/:id/posts/:postId', async (c) => {
  const post = await c.env.DB.prepare(`SELECT p.id, p.campaign_id AS campaignId, p.title, p.brief, p.format, p.assignee_id AS assigneeId, p.due_at AS dueAt, p.created_at AS createdAt, p.updated_at AS updatedAt FROM content_posts p JOIN content_campaigns cc ON cc.id = p.campaign_id WHERE p.id = ? AND p.campaign_id = ? AND p.workspace_id = ?`)
    .bind(c.req.param('postId'), c.req.param('id'), c.get('workspaceId')).first()
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: '找不到貼文' } }, 404)
  const [variants, assets, comments, jobs] = await Promise.all([
    c.env.DB.prepare(`SELECT id, platform, copywriting, hashtags, status, scheduled_at AS scheduledAt, published_at AS publishedAt, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt, updated_at AS updatedAt FROM content_variants WHERE post_id = ? AND workspace_id = ? ORDER BY platform`).bind(c.req.param('postId'), c.get('workspaceId')).all(),
    c.env.DB.prepare(`SELECT a.id, a.file_name AS fileName, a.mime_type AS mimeType, a.media_type AS mediaType, a.size, a.alt_text AS altText, pa.position, pa.is_cover AS isCover FROM post_assets pa JOIN media_assets a ON a.id = pa.asset_id WHERE pa.post_id = ? AND a.workspace_id = ? ORDER BY pa.position`).bind(c.req.param('postId'), c.get('workspaceId')).all(),
    c.env.DB.prepare(`SELECT rc.id, rc.variant_id AS variantId, rc.parent_id AS parentId, rc.body, rc.resolved_at AS resolvedAt, rc.author_id AS authorId, u.display_name AS authorName, rc.created_at AS createdAt FROM review_comments rc JOIN users u ON u.id = rc.author_id WHERE rc.post_id = ? AND rc.workspace_id = ? ORDER BY rc.created_at`).bind(c.req.param('postId'), c.get('workspaceId')).all(),
    c.env.DB.prepare(`SELECT id, kind, status, provider, error_message AS errorMessage, created_at AS createdAt, updated_at AS updatedAt FROM generation_jobs WHERE post_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT 5`).bind(c.req.param('postId'), c.get('workspaceId')).all(),
  ])
  return c.json({ data: { ...post, variants: variants.results, assets: assets.results, comments: comments.results, jobs: jobs.results } })
})

campaigns.patch('/:id/posts/:postId', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const parsed = postSchema.omit({ platforms: true }).partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || Object.keys(parsed.data).length === 0) return invalid(c, parsed.success ? [] : parsed.error.issues)
  const current = await c.env.DB.prepare('SELECT title, brief, format, assignee_id AS assigneeId, due_at AS dueAt FROM content_posts WHERE id = ? AND campaign_id = ? AND workspace_id = ?')
    .bind(c.req.param('postId'), c.req.param('id'), c.get('workspaceId')).first<Record<string, unknown>>()
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: '找不到貼文' } }, 404)
  const next = { ...current, ...parsed.data }
  await c.env.DB.prepare('UPDATE content_posts SET title = ?, brief = ?, format = ?, assignee_id = ?, due_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
    .bind(next.title, next.brief, next.format, next.assigneeId, next.dueAt, Date.now(), c.req.param('postId'), c.get('workspaceId')).run()
  return c.json({ data: { id: c.req.param('postId'), ...next }, message: '貼文已更新' })
})

campaigns.post('/:id/posts/:postId/assets', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const post = await c.env.DB.prepare(`SELECT p.id, p.format, cc.brand_id AS brandId FROM content_posts p JOIN content_campaigns cc ON cc.id = p.campaign_id WHERE p.id = ? AND p.campaign_id = ? AND p.workspace_id = ?`)
    .bind(c.req.param('postId'), c.req.param('id'), c.get('workspaceId')).first<{ id: string; format: string; brandId: string }>()
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: '找不到貼文' } }, 404)
  const body = await c.req.parseBody({ all: true }); const raw = body.files
  const files = (Array.isArray(raw) ? raw : [raw]).filter((item): item is File => item instanceof File)
  if (!files.length || files.length > 10) return c.json({ error: { code: 'INVALID_FILES', message: '請上傳 1 到 10 個素材' } }, 400)
  const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']); const videoTypes = new Set(['video/mp4', 'video/webm'])
  if (files.some((file) => (!imageTypes.has(file.type) && !videoTypes.has(file.type)) || (imageTypes.has(file.type) ? file.size > 10 * 1024 * 1024 : file.size > 50 * 1024 * 1024))) {
    return c.json({ error: { code: 'INVALID_FILES', message: '圖片限 JPG、PNG、WebP 10MB；影片限 MP4、WebM 50MB' } }, 400)
  }
  for (const file of files) {
    if (!(await hasValidSignature(file))) return c.json({ error: { code: 'INVALID_FILE_SIGNATURE', message: `「${file.name}」的檔案內容與格式不符` } }, 400)
  }
  if (post.format === 'short_video' && files.some((f) => !videoTypes.has(f.type))) return c.json({ error: { code: 'FORMAT_MISMATCH', message: '短影音貼文只能加入影片' } }, 400)
  if (post.format !== 'short_video' && files.some((f) => !imageTypes.has(f.type))) return c.json({ error: { code: 'FORMAT_MISMATCH', message: '圖片貼文只能加入圖片' } }, 400)
  const currentCount = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM post_assets WHERE post_id = ?').bind(post.id).first<{ count: number }>()
  const records = []
  for (const [offset, file] of files.entries()) {
    const id = crypto.randomUUID(); const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const key = `workspaces/${c.get('workspaceId')}/brands/${post.brandId}/${id}.${extension}`
    await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } })
    const now = Date.now(); const position = (currentCount?.count ?? 0) + offset
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO media_assets (id, workspace_id, brand_id, r2_key, file_name, mime_type, media_type, size, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, c.get('workspaceId'), post.brandId, key, file.name, file.type, videoTypes.has(file.type) ? 'video' : 'image', file.size, c.get('user').id, now),
      c.env.DB.prepare('INSERT INTO post_assets (post_id, asset_id, position, is_cover) VALUES (?, ?, ?, ?)').bind(post.id, id, position, position === 0 ? 1 : 0),
    ])
    records.push({ id, fileName: file.name, mimeType: file.type, size: file.size })
  }
  return c.json({ data: records }, 201)
})

campaigns.get('/:id/posts/:postId/assets/:assetId', async (c) => {
  const asset = await c.env.DB.prepare(`SELECT a.r2_key AS r2Key, a.mime_type AS mimeType FROM media_assets a JOIN post_assets pa ON pa.asset_id = a.id WHERE a.id = ? AND pa.post_id = ? AND a.workspace_id = ?`)
    .bind(c.req.param('assetId'), c.req.param('postId'), c.get('workspaceId')).first<{ r2Key: string; mimeType: string }>()
  if (!asset) return c.json({ error: { code: 'NOT_FOUND', message: '找不到素材' } }, 404)
  const object = await c.env.MEDIA.get(asset.r2Key)
  if (!object) return c.json({ error: { code: 'NOT_FOUND', message: '素材檔案不存在' } }, 404)
  return new Response(object.body, { headers: { 'Content-Type': asset.mimeType, 'Cache-Control': 'private, max-age=3600' } })
})

campaigns.post('/:id/posts/:postId/generate', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  if (!(await postExists(c.env.DB, c.req.param('postId'), c.req.param('id'), c.get('workspaceId')))) return c.json({ error: { code: 'NOT_FOUND', message: '找不到貼文' } }, 404)
  const jobId = crypto.randomUUID(); const now = Date.now()
  await c.env.DB.prepare(`INSERT INTO generation_jobs (id, workspace_id, campaign_id, post_id, kind, status, provider, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'platform_copy', 'queued', ?, ?, ?, ?)`)
    .bind(jobId, c.get('workspaceId'), c.req.param('id'), c.req.param('postId'), c.env.AI_PROVIDER, c.get('user').id, now, now).run()
  await c.env.CONTENT_QUEUE.send({ jobId, campaignId: c.req.param('id'), postId: c.req.param('postId'), kind: 'platform_copy', requestedBy: c.get('user').id })
  return c.json({ data: { jobId, status: 'queued' } }, 202)
})

campaigns.patch('/:id/posts/:postId/variants/:variantId', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const parsed = z.object({ copywriting: z.string().trim().min(1).max(5000), hashtags: z.array(z.string().trim().min(1).max(80)).max(20) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  const result = await c.env.DB.prepare(`UPDATE content_variants SET copywriting = ?, hashtags = ?, status = 'draft', reviewed_by = NULL, reviewed_at = NULL, updated_at = ? WHERE id = ? AND post_id = ? AND workspace_id = ?`)
    .bind(parsed.data.copywriting, JSON.stringify(parsed.data.hashtags), Date.now(), c.req.param('variantId'), c.req.param('postId'), c.get('workspaceId')).run()
  if (!result.meta.changes) return c.json({ error: { code: 'NOT_FOUND', message: '找不到平台版本' } }, 404)
  return c.json({ data: { id: c.req.param('variantId'), status: 'draft' }, message: '平台內容已儲存' })
})

campaigns.post('/:id/posts/:postId/submit-review', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const [empty, assetCount] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM content_variants WHERE post_id = ? AND workspace_id = ? AND trim(copywriting) = ''`).bind(c.req.param('postId'), c.get('workspaceId')).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM post_assets WHERE post_id = ?').bind(c.req.param('postId')).first<{ count: number }>(),
  ])
  if ((empty?.count ?? 0) > 0 || (assetCount?.count ?? 0) === 0) return c.json({ error: { code: 'POST_INCOMPLETE', message: '請完成所有平台文案並加入素材' } }, 400)
  await c.env.DB.prepare(`UPDATE content_variants SET status = 'in_review', updated_at = ? WHERE post_id = ? AND workspace_id = ? AND status IN ('draft','changes_requested')`)
    .bind(Date.now(), c.req.param('postId'), c.get('workspaceId')).run()
  await notifyReviewers(c.env.DB, c.get('workspaceId'), c.req.param('postId'))
  return c.json({ data: { postId: c.req.param('postId'), status: 'in_review' }, message: '已送出審核' })
})

campaigns.post('/:id/posts/:postId/variants/:variantId/approve', requireWorkspaceRoles('owner', 'admin', 'reviewer'), async (c) => {
  const result = await c.env.DB.prepare(`UPDATE content_variants SET status = 'approved', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND post_id = ? AND workspace_id = ? AND status = 'in_review'`)
    .bind(c.get('user').id, Date.now(), Date.now(), c.req.param('variantId'), c.req.param('postId'), c.get('workspaceId')).run()
  if (!result.meta.changes) return c.json({ error: { code: 'INVALID_STATE', message: '此版本目前無法核准' } }, 409)
  return c.json({ data: { id: c.req.param('variantId'), status: 'approved' }, message: '平台版本已核准' })
})

campaigns.post('/:id/posts/:postId/variants/:variantId/request-changes', requireWorkspaceRoles('owner', 'admin', 'reviewer'), async (c) => {
  const parsed = z.object({ comment: z.string().trim().min(2).max(2000) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  const now = Date.now(); const commentId = crypto.randomUUID()
  const result = await c.env.DB.prepare(`UPDATE content_variants SET status = 'changes_requested', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND post_id = ? AND workspace_id = ? AND status = 'in_review'`)
    .bind(c.get('user').id, now, now, c.req.param('variantId'), c.req.param('postId'), c.get('workspaceId')).run()
  if (!result.meta.changes) return c.json({ error: { code: 'INVALID_STATE', message: '此版本目前無法退回' } }, 409)
  await c.env.DB.prepare(`INSERT INTO review_comments (id, workspace_id, post_id, variant_id, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(commentId, c.get('workspaceId'), c.req.param('postId'), c.req.param('variantId'), parsed.data.comment, c.get('user').id, now).run()
  return c.json({ data: { id: c.req.param('variantId'), status: 'changes_requested', commentId }, message: '已退回修改' })
})

campaigns.post('/:id/posts/:postId/comments', requireWorkspaceRoles('owner', 'admin', 'editor', 'reviewer'), async (c) => {
  const parsed = z.object({ body: z.string().trim().min(1).max(2000), variantId: z.string().nullable().default(null), parentId: z.string().nullable().default(null) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  const id = crypto.randomUUID(); const now = Date.now()
  await c.env.DB.prepare(`INSERT INTO review_comments (id, workspace_id, post_id, variant_id, parent_id, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.get('workspaceId'), c.req.param('postId'), parsed.data.variantId, parsed.data.parentId, parsed.data.body, c.get('user').id, now).run()
  return c.json({ data: { id, ...parsed.data, authorId: c.get('user').id, createdAt: now } }, 201)
})

campaigns.patch('/:id/posts/:postId/comments/:commentId/resolve', requireWorkspaceRoles('owner', 'admin', 'editor', 'reviewer'), async (c) => {
  const result = await c.env.DB.prepare(`UPDATE review_comments SET resolved_at = ?, resolved_by = ? WHERE id = ? AND post_id = ? AND workspace_id = ?`)
    .bind(Date.now(), c.get('user').id, c.req.param('commentId'), c.req.param('postId'), c.get('workspaceId')).run()
  if (!result.meta.changes) return c.json({ error: { code: 'NOT_FOUND', message: '找不到留言' } }, 404)
  return c.json({ data: { id: c.req.param('commentId'), resolved: true } })
})

campaigns.post('/:id/posts/:postId/variants/:variantId/schedule', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const parsed = z.object({ scheduledAt: z.number().int().positive(), simulateFailure: z.boolean().default(false) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success || parsed.data.scheduledAt <= Date.now()) return c.json({ error: { code: 'INVALID_SCHEDULE', message: '發布時間必須晚於現在' } }, 400)
  const result = await c.env.DB.prepare(`UPDATE content_variants SET status = 'scheduled', scheduled_at = ?, updated_at = ? WHERE id = ? AND post_id = ? AND workspace_id = ? AND status IN ('approved','scheduled','failed')`)
    .bind(parsed.data.scheduledAt, Date.now(), c.req.param('variantId'), c.req.param('postId'), c.get('workspaceId')).run()
  if (!result.meta.changes) return c.json({ error: { code: 'APPROVAL_REQUIRED', message: '請先核准此平台版本' } }, 409)
  if (parsed.data.simulateFailure) {
    await c.env.DB.prepare(`INSERT OR REPLACE INTO publish_jobs (id, workspace_id, variant_id, idempotency_key, status, simulate_failure, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', 1, ?, ?)`)
      .bind(crypto.randomUUID(), c.get('workspaceId'), c.req.param('variantId'), `${c.req.param('variantId')}:${parsed.data.scheduledAt}`, Date.now(), Date.now()).run()
  }
  return c.json({ data: { id: c.req.param('variantId'), status: 'scheduled', scheduledAt: parsed.data.scheduledAt }, message: '已加入內容日曆' })
})

campaigns.delete('/:id', requireWorkspaceRoles('owner', 'admin'), async (c) => {
  const keys = await c.env.DB.prepare(`SELECT DISTINCT a.r2_key AS r2Key FROM media_assets a JOIN post_assets pa ON pa.asset_id = a.id JOIN content_posts p ON p.id = pa.post_id WHERE p.campaign_id = ? AND p.workspace_id = ?`)
    .bind(c.req.param('id'), c.get('workspaceId')).all<{ r2Key: string }>()
  if (keys.results.length) await c.env.MEDIA.delete(keys.results.map((item) => item.r2Key))
  const result = await c.env.DB.prepare('DELETE FROM content_campaigns WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), c.get('workspaceId')).run()
  if (!result.meta.changes) return c.json({ error: { code: 'NOT_FOUND', message: '找不到企劃' } }, 404)
  return c.json({ data: { id: c.req.param('id') }, message: '企劃已刪除' })
})

async function campaignExists(db: D1Database, id: string, workspaceId: string) { return Boolean(await db.prepare('SELECT id FROM content_campaigns WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first()) }
async function postExists(db: D1Database, postId: string, campaignId: string, workspaceId: string) { return Boolean(await db.prepare('SELECT id FROM content_posts WHERE id = ? AND campaign_id = ? AND workspace_id = ?').bind(postId, campaignId, workspaceId).first()) }
async function audit(db: D1Database, actorId: string, action: string, entityType: string, entityId: string, workspaceId: string) {
  await db.prepare(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify({ workspaceId }), Date.now()).run()
}
async function notifyReviewers(db: D1Database, workspaceId: string, postId: string) {
  const users = await db.prepare(`SELECT user_id AS userId FROM workspace_members WHERE workspace_id = ? AND role IN ('owner','admin','reviewer')`).bind(workspaceId).all<{ userId: string }>()
  const now = Date.now()
  if (users.results.length) await db.batch(users.results.map((item) => db.prepare(`INSERT INTO notifications (id, workspace_id, user_id, type, title, body, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'review_requested', '有新的內容待審核', '貼文已送出，請確認各平台版本。', 'post', ?, ?)`)
    .bind(crypto.randomUUID(), workspaceId, item.userId, postId, now)))
}
async function hasValidSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (file.type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (file.type === 'image/png') return bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
  if (file.type === 'image/webp') return textBytes(bytes, 0, 4) === 'RIFF' && textBytes(bytes, 8, 12) === 'WEBP'
  if (file.type === 'video/mp4') return textBytes(bytes, 4, 8) === 'ftyp'
  if (file.type === 'video/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  return false
}
function textBytes(bytes: Uint8Array, start: number, end: number) { return String.fromCharCode(...bytes.slice(start, end)) }
function invalid(c: CampaignContext, issues: unknown) { return c.json({ error: { code: 'INVALID_INPUT', message: '請確認輸入資料', issues } }, 400) }

export default campaigns
