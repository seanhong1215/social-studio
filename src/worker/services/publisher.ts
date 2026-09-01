import type { Bindings, PublishMessage } from '../types'

export async function enqueueDuePublications(env: Bindings): Promise<void> {
  const due = await env.DB.prepare(`SELECT id, workspace_id AS workspaceId, scheduled_at AS scheduledAt FROM content_variants WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 50`)
    .bind(Date.now()).all<{ id: string; workspaceId: string; scheduledAt: number }>()
  for (const variant of due.results) {
    const key = `${variant.id}:${variant.scheduledAt}`
    let job = await env.DB.prepare('SELECT id FROM publish_jobs WHERE idempotency_key = ?').bind(key).first<{ id: string }>()
    if (!job) {
      const id = crypto.randomUUID(); const now = Date.now()
      await env.DB.prepare(`INSERT OR IGNORE INTO publish_jobs (id, workspace_id, variant_id, idempotency_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', ?, ?)`)
        .bind(id, variant.workspaceId, variant.id, key, now, now).run()
      job = await env.DB.prepare('SELECT id FROM publish_jobs WHERE idempotency_key = ?').bind(key).first<{ id: string }>()
    }
    if (job) await env.CONTENT_QUEUE.send({ type: 'publish', jobId: job.id, variantId: variant.id })
  }
}

export async function processPublishJob(env: Bindings, message: PublishMessage): Promise<void> {
  const job = await env.DB.prepare(`SELECT id, workspace_id AS workspaceId, variant_id AS variantId, status, attempt, simulate_failure AS simulateFailure FROM publish_jobs WHERE id = ?`)
    .bind(message.jobId).first<{ id: string; workspaceId: string; variantId: string; status: string; attempt: number; simulateFailure: number }>()
  if (!job || job.status === 'completed') return
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(`UPDATE publish_jobs SET status = 'processing', attempt = attempt + 1, updated_at = ? WHERE id = ?`).bind(now, job.id),
    env.DB.prepare(`UPDATE content_variants SET status = 'publishing', updated_at = ? WHERE id = ? AND workspace_id = ?`).bind(now, job.variantId, job.workspaceId),
  ])
  if (job.simulateFailure && job.attempt === 0) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE publish_jobs SET status = 'failed', error_code = 'SIMULATED_PLATFORM_TIMEOUT', error_message = '模擬平台回應逾時，請稍後重試', updated_at = ? WHERE id = ?`).bind(Date.now(), job.id),
      env.DB.prepare(`UPDATE content_variants SET status = 'failed', updated_at = ? WHERE id = ?`).bind(Date.now(), job.variantId),
    ])
    await notifyWorkspace(env.DB, job.workspaceId, '發布失敗', '模擬平台回應逾時，可在發布中心重新執行。', 'publish_job', job.id)
    return
  }
  const publishedAt = Date.now()
  await env.DB.batch([
    env.DB.prepare(`UPDATE publish_jobs SET status = 'completed', error_code = NULL, error_message = NULL, updated_at = ? WHERE id = ?`).bind(publishedAt, job.id),
    env.DB.prepare(`UPDATE content_variants SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?`).bind(publishedAt, publishedAt, job.variantId),
  ])
  await upsertAnalytics(env.DB, job.workspaceId, job.variantId, new Date(publishedAt))
  await notifyWorkspace(env.DB, job.workspaceId, '內容已發布', '排程內容已完成模擬發布。', 'variant', job.variantId)
}

export async function growPublishedAnalytics(env: Bindings): Promise<void> {
  const published = await env.DB.prepare(`SELECT id, workspace_id AS workspaceId FROM content_variants WHERE status = 'published' AND published_at IS NOT NULL`).all<{ id: string; workspaceId: string }>()
  const date = new Date()
  for (const variant of published.results) await upsertAnalytics(env.DB, variant.workspaceId, variant.id, date)
}

async function upsertAnalytics(db: D1Database, workspaceId: string, variantId: string, date: Date) {
  const metricDate = date.toISOString().slice(0, 10)
  const seed = hash(`${variantId}:${metricDate}`)
  const reach = 180 + seed % 1800
  const impressions = Math.round(reach * (1.12 + (seed % 35) / 100))
  const engagements = Math.round(reach * (0.035 + (seed % 60) / 1000))
  const clicks = Math.round(engagements * (0.18 + (seed % 25) / 100))
  const videoViews = seed % 3 === 0 ? Math.round(reach * 0.72) : 0
  await db.prepare(`INSERT INTO analytics_daily (id, workspace_id, variant_id, metric_date, reach, impressions, engagements, clicks, video_views) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(variant_id, metric_date) DO UPDATE SET reach = excluded.reach, impressions = excluded.impressions, engagements = excluded.engagements, clicks = excluded.clicks, video_views = excluded.video_views`)
    .bind(crypto.randomUUID(), workspaceId, variantId, metricDate, reach, impressions, engagements, clicks, videoViews).run()
}

async function notifyWorkspace(db: D1Database, workspaceId: string, title: string, body: string, entityType: string, entityId: string) {
  const members = await db.prepare('SELECT user_id AS userId FROM workspace_members WHERE workspace_id = ?').bind(workspaceId).all<{ userId: string }>()
  const now = Date.now()
  if (members.results.length) await db.batch(members.results.map(({ userId }) => db.prepare(`INSERT INTO notifications (id, workspace_id, user_id, type, title, body, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'publishing', ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), workspaceId, userId, title, body, entityType, entityId, now)))
}
function hash(value: string) { let result = 2166136261; for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619); return result >>> 0 }
