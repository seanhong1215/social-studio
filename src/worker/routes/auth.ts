import { Hono, type Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto'
import { requireAuth, requireCsrf } from '../middleware/auth'
import { ensureDemoData } from '../services/demo-data'
import type { Bindings, Variables } from '../types'

type AppEnv = { Bindings: Bindings; Variables: Variables }
type AppContext = Context<AppEnv>
const auth = new Hono<AppEnv>()

const credentialsSchema = z.object({
  email: z.string().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
})
const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2).max(80),
  workspaceName: z.string().trim().min(2).max(100),
  brandName: z.string().trim().min(2).max(100),
})

auth.post('/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: '請確認註冊資料', issues: parsed.error.issues } }, 400)
  if (await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(parsed.data.email).first()) {
    return c.json({ error: { code: 'EMAIL_EXISTS', message: '此電子郵件已註冊' } }, 409)
  }

  const userId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const brandId = crypto.randomUUID()
  const now = Date.now()
  const password = await hashPassword(parsed.data.password)
  const slug = `${slugify(parsed.data.workspaceName)}-${workspaceId.slice(0, 6)}`
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO users (id, email, display_name, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?, 'admin', ?)`)
      .bind(userId, parsed.data.email, parsed.data.displayName, password.hash, password.salt, now),
    c.env.DB.prepare(`INSERT INTO workspaces (id, name, slug, timezone, created_by, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Taipei', ?, ?, ?)`)
      .bind(workspaceId, parsed.data.workspaceName, slug, userId, now, now),
    c.env.DB.prepare(`INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`)
      .bind(workspaceId, userId, now),
    c.env.DB.prepare(`INSERT INTO brands (id, workspace_id, name, tone, created_at, updated_at) VALUES (?, ?, ?, '專業、清楚、親切', ?, ?)`)
      .bind(brandId, workspaceId, parsed.data.brandName, now, now),
  ])
  const user = { id: userId, email: parsed.data.email, displayName: parsed.data.displayName, role: 'admin' as const }
  await createSession(c, userId, 7)
  return c.json({ data: user }, 201)
})

auth.post('/demo', async (c) => {
  if (c.env.AI_PROVIDER !== 'demo') return c.json({ error: { code: 'DEMO_DISABLED', message: 'Demo 帳戶未啟用' } }, 404)
  const email = 'demo@social-studio.local'
  let user = await findUser(c.env.DB, email)
  if (!user) {
    const userId = crypto.randomUUID()
    const password = await hashPassword(randomToken(32))
    await c.env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, display_name, password_hash, password_salt, role, created_at) VALUES (?, ?, 'Demo 體驗帳戶', ?, ?, 'admin', ?)`)
      .bind(userId, email, password.hash, password.salt, Date.now()).run()
    user = await findUser(c.env.DB, email)
  }
  if (!user) return c.json({ error: { code: 'DEMO_UNAVAILABLE', message: '無法建立 Demo 帳戶' } }, 500)
  const workspaceId = await ensureDemoWorkspace(c.env.DB, user.id)
  await ensureDemoData(c.env, workspaceId, user.id)
  await createSession(c, user.id, 1)
  return c.json({ data: user })
})

auth.post('/login', async (c) => {
  const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalidCredentials(c)
  const rateKey = await sha256(`${c.req.header('CF-Connecting-IP') ?? 'local'}:${parsed.data.email}`)
  const cutoff = Date.now() - 15 * 60 * 1000
  const attempts = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM auth_rate_limits WHERE key_hash = ? AND attempted_at > ?').bind(rateKey, cutoff).first<{ count: number }>()
  if ((attempts?.count ?? 0) >= 5) return c.json({ error: { code: 'RATE_LIMITED', message: '登入嘗試過多，請稍後再試' } }, 429)

  const user = await c.env.DB.prepare(`SELECT id, email, display_name AS displayName, password_hash AS passwordHash, password_salt AS passwordSalt, role FROM users WHERE email = ? AND disabled = 0`)
    .bind(parsed.data.email).first<{ id: string; email: string; displayName: string; passwordHash: string; passwordSalt: string; role: 'admin' | 'editor' | 'viewer' }>()
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash, user.passwordSalt))) {
    await c.env.DB.prepare('INSERT INTO auth_rate_limits (key_hash, attempted_at) VALUES (?, ?)').bind(rateKey, Date.now()).run()
    return invalidCredentials(c)
  }
  await c.env.DB.prepare('DELETE FROM auth_rate_limits WHERE key_hash = ?').bind(rateKey).run()
  await createSession(c, user.id, 7)
  return c.json({ data: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } })
})

auth.get('/me', requireAuth, (c) => c.json({ data: c.get('user') }))
auth.post('/logout', requireAuth, requireCsrf, async (c) => {
  const token = getCookieValue(c.req.header('Cookie'), 'social_session')
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  deleteCookie(c, 'social_session', { path: '/' })
  deleteCookie(c, 'social_csrf', { path: '/' })
  return c.json({ data: null, message: '已登出' })
})

async function createSession(c: AppContext, userId: string, days: number) {
  const token = randomToken()
  const csrf = randomToken(24)
  const now = Date.now()
  const maxAge = days * 24 * 60 * 60
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    c.env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, await sha256(token), now + maxAge * 1000, now),
  ])
  const secure = c.env.APP_ENV === 'production'
  setCookie(c, 'social_session', token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge })
  setCookie(c, 'social_csrf', csrf, { httpOnly: false, secure, sameSite: 'Lax', path: '/', maxAge })
}

async function findUser(db: D1Database, email: string) {
  return db.prepare('SELECT id, email, display_name AS displayName, role FROM users WHERE email = ? AND disabled = 0')
    .bind(email).first<{ id: string; email: string; displayName: string; role: 'admin' | 'editor' | 'viewer' }>()
}

async function ensureDemoWorkspace(db: D1Database, userId: string) {
  const existing = await db.prepare('SELECT workspace_id AS workspaceId FROM workspace_members WHERE user_id = ? LIMIT 1')
    .bind(userId).first<{ workspaceId: string }>()
  if (existing) return existing.workspaceId
  const now = Date.now()
  await db.batch([
    db.prepare(`INSERT INTO workspaces (id, name, slug, timezone, created_by, created_at, updated_at) VALUES ('demo-workspace', '橙光內容工作室', 'demo-studio', 'Asia/Taipei', ?, ?, ?)`)
      .bind(userId, now, now),
    db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES ('demo-workspace', ?, 'owner', ?)`).bind(userId, now),
    db.prepare(`INSERT INTO brands (id, workspace_id, name, industry, audience, tone, keywords, default_cta, created_at, updated_at) VALUES ('demo-brand', 'demo-workspace', '日日選物', '生活選品', '重視質感與永續生活的 25–40 歲消費者', '溫暖、真誠、具生活感', '["質感生活","永續選物"]', '探索更多生活靈感', ?, ?)`).bind(now, now),
  ])
  return 'demo-workspace'
}

function invalidCredentials(c: AppContext) { return c.json({ error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' } }, 401) }
function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'workspace' }
function getCookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1)
}

export default auth
