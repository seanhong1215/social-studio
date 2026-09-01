import { z } from 'zod'
import { PLATFORMS, type Bindings, type GenerateContentMessage, type Platform } from '../types'

const generatedPlatformSchema = z.object({ copywriting: z.string().min(1).max(5000), hashtags: z.array(z.string().min(1).max(80)).max(20) })
const generatedContentSchema = z.object(Object.fromEntries(PLATFORMS.map((platform) => [platform, generatedPlatformSchema])) as Record<Platform, typeof generatedPlatformSchema>)
const ideaSchema = z.array(z.object({ title: z.string().min(2).max(120), brief: z.string().max(1000), format: z.enum(['image', 'carousel', 'short_video']) })).min(1).max(5)
type GeneratedContent = z.infer<typeof generatedContentSchema>

export async function processGenerationJob(env: Bindings, message: GenerateContentMessage): Promise<void> {
  await env.DB.prepare(`UPDATE generation_jobs SET status = 'processing', updated_at = ? WHERE id = ?`).bind(Date.now(), message.jobId).run()
  try {
    if (message.kind === 'campaign_ideas') await generateIdeas(env, message)
    else await generatePlatformCopy(env, message)
    await env.DB.prepare(`UPDATE generation_jobs SET status = 'completed', updated_at = ? WHERE id = ?`).bind(Date.now(), message.jobId).run()
  } catch (error) {
    const summary = error instanceof Error ? error.message.slice(0, 500) : 'Unknown generation error'
    await env.DB.prepare(`UPDATE generation_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`).bind(summary, Date.now(), message.jobId).run()
    throw error
  }
}

async function generateIdeas(env: Bindings, message: GenerateContentMessage) {
  if (!message.campaignId) throw new Error('Campaign id is required')
  const campaign = await env.DB.prepare(`SELECT cc.id, cc.workspace_id AS workspaceId, cc.name, cc.objective, cc.brief, cc.brand_id AS brandId, b.name AS brandName, b.audience, b.tone, b.keywords, b.default_cta AS defaultCta FROM content_campaigns cc JOIN brands b ON b.id = cc.brand_id WHERE cc.id = ?`)
    .bind(message.campaignId).first<{ id: string; workspaceId: string; name: string; objective: string; brief: string; brandId: string; brandName: string; audience: string; tone: string; keywords: string; defaultCta: string }>()
  if (!campaign) throw new Error('Campaign not found')
  const ideas = env.AI_PROVIDER === 'demo' ? demoIdeas(campaign.name) : await workerIdeas(env, campaign)
  const now = Date.now()
  const statements: D1PreparedStatement[] = []
  for (const idea of ideas) {
    const postId = crypto.randomUUID()
    const platforms: Platform[] = idea.format === 'short_video' ? ['instagram', 'tiktok', 'youtube'] : ['facebook', 'instagram', 'threads']
    statements.push(env.DB.prepare(`INSERT INTO content_posts (id, workspace_id, campaign_id, title, brief, format, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(postId, campaign.workspaceId, campaign.id, idea.title, idea.brief, idea.format, message.requestedBy, now, now))
    for (const platform of platforms) statements.push(env.DB.prepare(`INSERT INTO content_variants (id, workspace_id, post_id, platform, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), campaign.workspaceId, postId, platform, now))
  }
  statements.push(env.DB.prepare('UPDATE content_campaigns SET updated_at = ? WHERE id = ?').bind(now, campaign.id))
  await env.DB.batch(statements)
}

async function generatePlatformCopy(env: Bindings, message: GenerateContentMessage) {
  if (!message.postId) throw new Error('Post id is required')
  const post = await env.DB.prepare(`SELECT p.id, p.workspace_id AS workspaceId, p.title, p.brief, p.format, cc.name AS campaignName, b.name AS brandName, b.audience, b.tone, b.keywords, b.banned_terms AS bannedTerms, b.default_cta AS defaultCta FROM content_posts p JOIN content_campaigns cc ON cc.id = p.campaign_id JOIN brands b ON b.id = cc.brand_id WHERE p.id = ?`)
    .bind(message.postId).first<{ id: string; workspaceId: string; title: string; brief: string; format: string; campaignName: string; brandName: string; audience: string; tone: string; keywords: string; bannedTerms: string; defaultCta: string }>()
  if (!post) throw new Error('Post not found')
  const content = env.AI_PROVIDER === 'demo' ? createDemoContent(post.title, post.brief, post.brandName) : await generateWithWorkersAI(env, post)
  const variants = await env.DB.prepare('SELECT platform FROM content_variants WHERE post_id = ?').bind(post.id).all<{ platform: Platform }>()
  const now = Date.now()
  await env.DB.batch(variants.results.map(({ platform }) => env.DB.prepare(`UPDATE content_variants SET copywriting = ?, hashtags = ?, status = 'draft', updated_at = ? WHERE post_id = ? AND platform = ?`)
    .bind(content[platform].copywriting, JSON.stringify(content[platform].hashtags), now, post.id, platform)))
}

async function workerIdeas(env: Bindings, campaign: { name: string; objective: string; brief: string; brandName: string; audience: string; tone: string }) {
  const prompt = `你是台灣品牌內容策略師。為以下企劃提出 3 篇可執行貼文，使用繁體中文。品牌：${campaign.brandName}；受眾：${campaign.audience}；語氣：${campaign.tone}；企劃：${campaign.name}；目標：${campaign.objective}；簡介：${campaign.brief}。只回傳 JSON 陣列，每筆含 title、brief、format，format 只能是 image、carousel、short_video。`
  const ai = env.AI as unknown as { run(model: string, input: Record<string, unknown>): Promise<unknown> }
  const result = await ai.run('@cf/meta/llama-3.1-8b-instruct-fast', { prompt })
  return ideaSchema.parse(parseAiJson(result))
}

async function generateWithWorkersAI(env: Bindings, post: { id: string; title: string; brief: string; brandName: string; audience: string; tone: string; keywords: string; bannedTerms: string; defaultCta: string }): Promise<GeneratedContent> {
  const asset = await env.DB.prepare(`SELECT a.r2_key AS r2Key, a.media_type AS mediaType FROM media_assets a JOIN post_assets pa ON pa.asset_id = a.id WHERE pa.post_id = ? ORDER BY pa.position LIMIT 1`)
    .bind(post.id).first<{ r2Key: string; mediaType: string }>()
  const prompt = [
    '你是台灣品牌的資深社群內容策略師。為六個平台建立繁體中文文案，只回傳合法 JSON。',
    `品牌：${post.brandName}`, `受眾：${post.audience}`, `語氣：${post.tone}`, `貼文：${post.title}`, `簡介：${post.brief}`,
    `品牌關鍵字：${post.keywords}`, `禁用詞：${post.bannedTerms}`, `CTA：${post.defaultCta}`,
    '每個平台必須包含 copywriting 與 hashtags，平台鍵為 facebook、instagram、x、threads、youtube、tiktok。',
  ].join('\n')
  const ai = env.AI as unknown as { run(model: string, input: Record<string, unknown>): Promise<unknown> }
  if (asset?.mediaType === 'image') {
    const object = await env.MEDIA.get(asset.r2Key); if (!object) throw new Error('R2 object not found')
    const image = Array.from(new Uint8Array(await object.arrayBuffer()))
    return generatedContentSchema.parse(parseAiJson(await ai.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt, image })))
  }
  return generatedContentSchema.parse(parseAiJson(await ai.run('@cf/meta/llama-3.1-8b-instruct-fast', { prompt })))
}

function parseAiJson(result: unknown) {
  const raw = typeof result === 'string' ? result : (result as { response?: string }).response ?? JSON.stringify(result)
  return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim())
}
function demoIdeas(name: string) { return ideaSchema.parse([
  { title: `${name}｜品牌故事開場`, brief: '用一個生活情境帶出企劃核心價值與受眾共鳴。', format: 'image' },
  { title: `${name}｜三個實用亮點`, brief: '以輪播逐頁拆解重點，最後加入清楚的互動 CTA。', format: 'carousel' },
  { title: `${name}｜30 秒幕後短片`, brief: '用快速節奏呈現準備過程、細節與完成畫面。', format: 'short_video' },
]) }
function createDemoContent(title: string, brief: string, brand: string): GeneratedContent {
  const descriptions: Record<Platform, string> = {
    facebook: `${brand} 想和你分享「${title}」。${brief || '從日常需求出發，把值得留下的細節說清楚。'}\n\n你最在意哪一點？歡迎留言告訴我們。`,
    instagram: `${title} ✨\n\n${brief || '把今天的靈感，留在這個畫面裡。'}\n\n收藏起來，下一次需要時就能找到。`,
    x: `${title}：把複雜的事整理成真正能行動的一步。`,
    threads: `最近正在準備「${title}」。如果是你，會先從哪個部分開始？`,
    youtube: `${title}｜用短短一分鐘看懂這次內容的重點、做法與幕後想法。`,
    tiktok: `${title} 👀 30 秒帶你看完重點，最後一幕別錯過。`,
  }
  return Object.fromEntries(PLATFORMS.map((platform) => [platform, { copywriting: descriptions[platform], hashtags: [brand.replace(/\s+/g, ''), '內容企劃', platform === 'x' ? 'X' : platform] }])) as GeneratedContent
}

export { generatedContentSchema, ideaSchema }
