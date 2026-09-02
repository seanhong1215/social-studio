import type { Bindings } from '../types'

const DAY = 86_400_000
const platforms = ['facebook', 'instagram', 'threads'] as const

export async function ensureDemoData(env: Bindings, workspaceId: string, userId: string) {
  const analytics = await env.DB.prepare('SELECT id FROM analytics_daily WHERE workspace_id = ? LIMIT 1')
    .bind(workspaceId).first()
  if (!analytics) await seedDemoData(env.DB, workspaceId, userId)
}

export async function resetDemoData(env: Bindings, workspaceId: string, userId: string) {
  const keys = await env.DB.prepare('SELECT r2_key AS r2Key FROM media_assets WHERE workspace_id = ?')
    .bind(workspaceId).all<{ r2Key: string }>()
  if (keys.results.length) await env.MEDIA.delete(keys.results.map(({ r2Key }) => r2Key))
  await env.DB.prepare('DELETE FROM content_campaigns WHERE workspace_id = ?').bind(workspaceId).run()
  await env.DB.prepare('DELETE FROM media_assets WHERE workspace_id = ?').bind(workspaceId).run()
  await seedDemoData(env.DB, workspaceId, userId)
}

async function seedDemoData(db: D1Database, workspaceId: string, userId: string) {
  const brand = await db.prepare('SELECT id FROM brands WHERE workspace_id = ? ORDER BY created_at LIMIT 1')
    .bind(workspaceId).first<{ id: string }>()
  if (!brand) return

  const now = Date.now()
  const campaignId = `${workspaceId}-demo-performance`
  await db.prepare(`INSERT OR IGNORE INTO content_campaigns (id, workspace_id, brand_id, name, objective, brief, start_at, end_at, status, created_by, created_at, updated_at) VALUES (?, ?, ?, '秋季生活提案', '提升品牌互動與收藏', '以溫暖日常情境介紹秋季選物與使用方式。', ?, ?, 'active', ?, ?, ?)`)
    .bind(campaignId, workspaceId, brand.id, now - 7 * DAY, now + 21 * DAY, userId, now, now).run()

  const states = [
    { key: 'review', title: '秋日居家儀式感', status: 'in_review', offset: 1 },
    { key: 'scheduled', title: '三種質感收納方式', status: 'scheduled', offset: 2 },
    { key: 'published', title: '選物店的一天', status: 'published', offset: -7 },
  ] as const

  for (const state of states) {
    const postId = `${campaignId}-${state.key}`
    await db.prepare(`INSERT OR IGNORE INTO content_posts (id, workspace_id, campaign_id, title, brief, format, assignee_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'Demo 情境貼文', 'image', ?, ?, ?, ?)`)
      .bind(postId, workspaceId, campaignId, state.title, userId, userId, now, now).run()

    for (const [index, platform] of platforms.entries()) {
      const variantId = `${postId}-${platform}`
      const scheduledAt = state.status === 'scheduled' ? now + state.offset * DAY : state.status === 'published' ? now - 7 * DAY : null
      const publishedAt = state.status === 'published' ? now - 7 * DAY : null
      await db.prepare(`INSERT OR IGNORE INTO content_variants (id, workspace_id, post_id, platform, copywriting, hashtags, status, scheduled_at, published_at, updated_at) VALUES (?, ?, ?, ?, ?, '["日日選物","秋日生活"]', ?, ?, ?, ?)`)
        .bind(variantId, workspaceId, postId, platform, `${state.title}｜用一點簡單改變，讓每天更接近喜歡的樣子。`, state.status, scheduledAt, publishedAt, now).run()

      if (state.status === 'published') {
        for (let day = 6; day >= 0; day -= 1) {
          const metricDate = new Date(now - day * DAY).toISOString().slice(0, 10)
          const growth = 6 - day
          const reach = 720 + index * 210 + growth * 95
          const impressions = Math.round(reach * 1.34)
          const engagements = Math.round(reach * (0.058 + index * 0.008))
          const clicks = Math.round(engagements * 0.31)
          await db.prepare(`INSERT OR IGNORE INTO analytics_daily (id, workspace_id, variant_id, metric_date, reach, impressions, engagements, clicks, video_views) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`)
            .bind(`${variantId}-${metricDate}`, workspaceId, variantId, metricDate, reach, impressions, engagements, clicks).run()
        }
      }
    }
  }
}
