import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto'
import { requireAuth } from '../middleware/auth'
import type { Bindings, Variables } from '../types'

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const credentialsSchema = z.object({
  email: z.string().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
})

auth.post('/demo', async (c) => {
  if (c.env.AI_PROVIDER !== 'demo') {
    return c.json({ error: { code: 'DEMO_DISABLED', message: 'Demo 帳戶未啟用' } }, 404)
  }

  const email = 'demo@social-studio.local'
  let user = await c.env.DB.prepare(`
    SELECT id, email, display_name AS displayName, role
    FROM users WHERE email = ? AND disabled = 0
  `).bind(email).first<{ id: string; email: string; displayName: string; role: 'editor' }>()

  if (!user) {
    const userId = crypto.randomUUID()
    const password = await hashPassword(randomToken(32))
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO users (id, email, display_name, password_hash, password_salt, role, created_at)
      VALUES (?, ?, 'Demo 體驗帳戶', ?, ?, 'editor', ?)
    `).bind(userId, email, password.hash, password.salt, Date.now()).run()
    user = await c.env.DB.prepare(`
      SELECT id, email, display_name AS displayName, role
      FROM users WHERE email = ? AND disabled = 0
    `).bind(email).first<{ id: string; email: string; displayName: string; role: 'editor' }>()
  }

  if (!user) return c.json({ error: { code: 'DEMO_UNAVAILABLE', message: '無法建立 Demo 帳戶' } }, 500)

  const token = randomToken()
  const now = Date.now()
  const expiresAt = now + 24 * 60 * 60 * 1000
  await c.env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), user.id, await sha256(token), expiresAt, now).run()
  setCookie(c, 'social_session', token, {
    httpOnly: true,
    secure: c.env.APP_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  })

  return c.json({ data: user })
})

auth.post('/login', async (c) => {
  const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' } }, 401)

  const user = await c.env.DB.prepare(`
    SELECT id, email, display_name AS displayName, password_hash AS passwordHash,
           password_salt AS passwordSalt, role
    FROM users WHERE email = ? AND disabled = 0
  `).bind(parsed.data.email).first<{
    id: string
    email: string
    displayName: string
    passwordHash: string
    passwordSalt: string
    role: string
  }>()

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash, user.passwordSalt))) {
    return c.json({ error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' } }, 401)
  }

  const token = randomToken()
  const now = Date.now()
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    c.env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), user.id, await sha256(token), expiresAt, now),
  ])

  setCookie(c, 'social_session', token, {
    httpOnly: true,
    secure: c.env.APP_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return c.json({ data: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } })
})

auth.get('/me', requireAuth, (c) => c.json({ data: c.get('user') }))

auth.post('/logout', requireAuth, async (c) => {
  const token = getCookieValue(c.req.header('Cookie'), 'social_session')
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  deleteCookie(c, 'social_session', { path: '/' })
  return c.json({ message: '已登出' })
})

function getCookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1)
}

export default auth
