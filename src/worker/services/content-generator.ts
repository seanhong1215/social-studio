import { z } from 'zod'
import { PLATFORMS, type Bindings, type GenerateContentMessage, type Platform } from '../types'

const generatedPlatformSchema = z.object({
  copywriting: z.string().min(1).max(5000),
  hashtags: z.array(z.string().min(1).max(80)).max(20),
})

const generatedContentSchema = z.object(Object.fromEntries(
  PLATFORMS.map((platform) => [platform, generatedPlatformSchema]),
) as Record<Platform, typeof generatedPlatformSchema>)

type GeneratedContent = z.infer<typeof generatedContentSchema>

export async function processGenerationJob(env: Bindings, message: GenerateContentMessage): Promise<void> {
  const now = Date.now()
  await env.DB.prepare(`UPDATE ai_jobs SET status = 'processing', updated_at = ? WHERE id = ?`).bind(now, message.jobId).run()

  try {
    const campaign = await env.DB.prepare('SELECT title, brief FROM campaigns WHERE id = ?')
      .bind(message.campaignId).first<{ title: string; brief: string }>()
    if (!campaign) throw new Error('Campaign not found')

    const asset = await env.DB.prepare('SELECT r2_key AS r2Key FROM assets WHERE campaign_id = ? ORDER BY created_at LIMIT 1')
      .bind(message.campaignId).first<{ r2Key: string }>()
    if (!asset) throw new Error('Campaign image not found')

    const content = env.AI_PROVIDER === 'demo'
      ? createDemoContent(campaign.title, campaign.brief)
      : await generateWithWorkersAI(env, campaign, asset.r2Key)

    const completedAt = Date.now()
    await env.DB.batch([
      ...PLATFORMS.map((platform) => env.DB.prepare(`
        UPDATE platform_contents
        SET copywriting = ?, hashtags = ?, status = 'draft', updated_at = ?
        WHERE campaign_id = ? AND platform = ?
      `).bind(
        content[platform].copywriting,
        JSON.stringify(content[platform].hashtags),
        completedAt,
        message.campaignId,
        platform,
      )),
      env.DB.prepare(`UPDATE ai_jobs SET status = 'completed', updated_at = ? WHERE id = ?`).bind(completedAt, message.jobId),
      env.DB.prepare(`UPDATE campaigns SET status = 'ready', updated_at = ? WHERE id = ?`).bind(completedAt, message.campaignId),
      env.DB.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
        VALUES (?, ?, 'ai.completed', 'campaign', ?, ?, ?)
      `).bind(crypto.randomUUID(), message.requestedBy, message.campaignId, JSON.stringify({ provider: env.AI_PROVIDER }), completedAt),
    ])
  } catch (error) {
    const failedAt = Date.now()
    const messageText = error instanceof Error ? error.message.slice(0, 500) : 'Unknown generation error'
    await env.DB.batch([
      env.DB.prepare(`UPDATE ai_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`).bind(messageText, failedAt, message.jobId),
      env.DB.prepare(`UPDATE campaigns SET status = 'failed', updated_at = ? WHERE id = ?`).bind(failedAt, message.campaignId),
    ])
    throw error
  }
}

async function generateWithWorkersAI(
  env: Bindings,
  campaign: { title: string; brief: string },
  r2Key: string,
): Promise<GeneratedContent> {
  const object = await env.MEDIA.get(r2Key)
  if (!object) throw new Error('R2 object not found')
  const image = Array.from(new Uint8Array(await object.arrayBuffer()))
  const prompt = [
    '你是台灣品牌的資深社群內容策略師。請分析圖片，為六個平台建立繁體中文文案。',
    `企劃名稱：${campaign.title}`,
    `內容簡介：${campaign.brief || '未提供，請依圖片判斷'}`,
    '每個平台都必須包含 copywriting 與 hashtags。文案要符合平台語氣，不要捏造圖片看不出的事實。',
    '只回傳合法 JSON，不要使用 Markdown code fence。',
  ].join('\n')

  const ai = env.AI as unknown as {
    run(model: string, input: Record<string, unknown>): Promise<unknown>
  }
  const result = await ai.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt, image })
  const raw = typeof result === 'string'
    ? result
    : (result as { response?: string }).response ?? JSON.stringify(result)
  const json = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim())
  return generatedContentSchema.parse(json)
}

function createDemoContent(title: string, brief: string): GeneratedContent {
  const descriptions: Record<Platform, string> = {
    facebook: `一起看看「${title}」背後的靈感。${brief || '從一張圖片開始，把值得分享的故事說得更完整。'}`,
    instagram: `${title} ✨\n\n把今天的靈感，留在這個畫面裡。`,
    x: `${title}：一張圖，也能開啟一段好對話。`,
    threads: `最近正在準備「${title}」，你第一眼注意到圖片裡的什麼？`,
    youtube: `${title}｜內容亮點與完整故事，帶你快速掌握這次企劃。`,
    tiktok: `${title} 👀 這個畫面你會停下來看嗎？`,
  }
  return Object.fromEntries(PLATFORMS.map((platform) => [platform, {
    copywriting: descriptions[platform],
    hashtags: ['社群內容', 'AI文案', platform === 'x' ? 'X' : platform],
  }])) as GeneratedContent
}

export { generatedContentSchema }
