import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import authRoutes from './routes/auth'
import campaignRoutes from './routes/campaigns'
import dashboardRoutes from './routes/dashboard'
import { requireAuth } from './middleware/auth'
import { processGenerationJob } from './services/content-generator'
import type { Bindings, GenerateContentMessage, Variables } from './types'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', logger())
app.use('*', secureHeaders())

app.get('/api/health', (c) => c.json({ status: 'ok', runtime: 'cloudflare-workers' }))
app.route('/api/auth', authRoutes)

app.use('/api/dashboard', requireAuth)
app.use('/api/dashboard/*', requireAuth)
app.use('/api/campaigns', requireAuth)
app.use('/api/campaigns/*', requireAuth)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/campaigns', campaignRoutes)

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '找不到資源' } }, 404))
app.onError((error, c) => {
  console.error('Unhandled request error', error)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '系統暫時無法處理請求' } }, 500)
})

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<GenerateContentMessage>, env: Bindings): Promise<void> {
    for (const message of batch.messages) {
      await processGenerationJob(env, message.body)
      message.ack()
    }
  },
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()),
      env.DB.prepare(`DELETE FROM audit_logs WHERE created_at < ?`).bind(Date.now() - 180 * 24 * 60 * 60 * 1000),
    ]).then(() => undefined))
  },
} satisfies ExportedHandler<Bindings, GenerateContentMessage>
