import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { Bindings, Variables } from '../types'
import { sha256 } from '../lib/crypto'

export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const token = getCookie(c, 'social_session')
  if (!token) return c.json({ error: { code: 'UNAUTHORIZED', message: '請先登入' } }, 401)

  const tokenHash = await sha256(token)
  const session = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0
  `).bind(tokenHash, Date.now()).first<{
    id: string
    email: string
    displayName: string
    role: 'admin' | 'editor' | 'viewer'
  }>()

  if (!session) return c.json({ error: { code: 'UNAUTHORIZED', message: '登入已過期' } }, 401)
  c.set('user', session)
  await next()
})

export const requireEditor = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const user = c.get('user')
  if (user.role === 'viewer') {
    return c.json({ error: { code: 'FORBIDDEN', message: '此操作需要編輯權限' } }, 403)
  }
  await next()
})
