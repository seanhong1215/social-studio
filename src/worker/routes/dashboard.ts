import { Hono } from 'hono'
import type { Bindings, Variables } from '../types'

const dashboard = new Hono<{ Bindings: Bindings; Variables: Variables }>()

dashboard.get('/', async (c) => {
  const [campaigns, ready, assets, jobs] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM campaigns').first<{ count: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM campaigns WHERE status IN ('ready', 'scheduled')`).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM assets').first<{ count: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM ai_jobs WHERE status = 'processing' OR status = 'queued'`).first<{ count: number }>(),
  ])
  return c.json({
    data: {
      campaignCount: campaigns?.count ?? 0,
      readyCount: ready?.count ?? 0,
      assetCount: assets?.count ?? 0,
      activeJobCount: jobs?.count ?? 0,
      aiProvider: c.env.AI_PROVIDER,
    },
  })
})

export default dashboard
