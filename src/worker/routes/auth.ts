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

auth.post('/bootstrap', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = credentialsSchema.extend({
    displayName: z.string().trim().min(2).max(80),
    token: z.string().min(1),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', issues: parsed.error.issues } }, 400)
  if (!c.env.BOOTSTRAP_TOKEN || parsed.data.token !== c.env.BOOTSTRAP_TOKEN) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Bootstrap token 無效' } }, 403)
  }

  const existing = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>()
  if ((existing?.count ?? 0) > 0) {
    return c.json({ error: { code: 'ALREADY_INITIALIZED', message: '系統已完成初始化' } }, 409)
  }

  const userId = crypto.randomUUID()
  const createdAt = Date.now()
  const password = await hashPassword(parsed.data.password)
  await c.env.DB.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, created_at)
    VALUES (?, ?, ?, ?, ?, 'admin', ?)
  `).bind(userId, parsed.data.email, parsed.data.displayName, password.hash, password.salt, createdAt).run()

  return c.json({ data: { id: userId, email: parsed.data.email }, message: '管理員建立完成' }, 201)
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
