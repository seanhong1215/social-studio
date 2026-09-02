import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { Bindings, Variables, WorkspaceRole } from '../types'
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

export const requireCsrf = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
  const cookie = getCookie(c, 'social_csrf')
  const header = c.req.header('X-CSRF-Token')
  if (!cookie || !header || cookie !== header) {
    return c.json({ error: { code: 'CSRF_INVALID', message: '安全驗證已失效，請重新整理後再試' } }, 403)
  }
  await next()
})

export const requireWorkspace = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const workspaceId = c.req.header('X-Workspace-Id') || c.req.query('workspaceId')
  if (!workspaceId) return c.json({ error: { code: 'WORKSPACE_REQUIRED', message: '請先選擇工作空間' } }, 400)
  const member = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .bind(workspaceId, c.get('user').id).first<{ role: WorkspaceRole }>()
  if (!member) return c.json({ error: { code: 'NOT_FOUND', message: '找不到工作空間' } }, 404)
  c.set('workspaceId', workspaceId)
  c.set('workspaceRole', member.role)
  await next()
})

export function requireWorkspaceRoles(...roles: WorkspaceRole[]) {
  return createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
    const role = c.get('workspaceRole')
    if (!role || !roles.includes(role)) return c.json({ error: { code: 'FORBIDDEN', message: '目前角色沒有此操作權限' } }, 403)
    await next()
  })
}
