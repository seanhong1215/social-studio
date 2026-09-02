import { Hono } from 'hono'
import { z } from 'zod'
import { randomToken, sha256 } from '../lib/crypto'
import { requireWorkspace, requireWorkspaceRoles } from '../middleware/auth'
import type { Bindings, Variables, WorkspaceRole } from '../types'

const workspaces = new Hono<{ Bindings: Bindings; Variables: Variables }>()
const roleSchema = z.enum(['admin', 'editor', 'reviewer', 'viewer'])
const workspaceSchema = z.object({ name: z.string().trim().min(2).max(100), brandName: z.string().trim().min(2).max(100) })
const brandSchema = z.object({
  name: z.string().trim().min(2).max(100),
  industry: z.string().trim().max(120).default(''),
  audience: z.string().trim().max(1000).default(''),
  tone: z.string().trim().max(500).default(''),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  bannedTerms: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  defaultCta: z.string().trim().max(300).default(''),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E9684A'),
})

workspaces.get('/', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT w.id, w.name, w.slug, w.timezone, m.role,
      (SELECT COUNT(*) FROM brands b WHERE b.workspace_id = w.id) AS brandCount
    FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ? ORDER BY w.created_at
  `).bind(c.get('user').id).all()
  return c.json({ data: result.results })
})

workspaces.post('/', async (c) => {
  const parsed = workspaceSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: '請確認工作空間資料', issues: parsed.error.issues } }, 400)
  const id = crypto.randomUUID()
  const brandId = crypto.randomUUID()
  const now = Date.now()
  const slug = `${parsed.data.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${id.slice(0, 6)}`
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO workspaces (id, name, slug, timezone, created_by, created_at, updated_at) VALUES (?, ?, ?, 'Asia/Taipei', ?, ?, ?)`)
      .bind(id, parsed.data.name, slug, c.get('user').id, now, now),
    c.env.DB.prepare(`INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`)
      .bind(id, c.get('user').id, now),
    c.env.DB.prepare(`INSERT INTO brands (id, workspace_id, name, tone, created_at, updated_at) VALUES (?, ?, ?, '專業、清楚、親切', ?, ?)`)
      .bind(brandId, id, parsed.data.brandName, now, now),
  ])
  return c.json({ data: { id, name: parsed.data.name, slug, role: 'owner', brandId } }, 201)
})

workspaces.post('/invitations/accept', async (c) => {
  const parsed = z.object({ token: z.string().min(20) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INVITATION', message: '邀請連結無效' } }, 400)
  const invitation = await c.env.DB.prepare(`SELECT id, workspace_id AS workspaceId, email, role FROM workspace_invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?`)
    .bind(await sha256(parsed.data.token), Date.now()).first<{ id: string; workspaceId: string; email: string; role: WorkspaceRole }>()
  if (!invitation || invitation.email.toLowerCase() !== c.get('user').email.toLowerCase()) {
    return c.json({ error: { code: 'INVALID_INVITATION', message: '邀請已失效或帳號不符' } }, 400)
  }
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .bind(invitation.workspaceId, c.get('user').id, invitation.role, now),
    c.env.DB.prepare('UPDATE workspace_invitations SET accepted_at = ? WHERE id = ?').bind(now, invitation.id),
  ])
  return c.json({ data: { workspaceId: invitation.workspaceId }, message: '已加入工作空間' })
})

workspaces.use('/current', requireWorkspace)
workspaces.use('/current/*', requireWorkspace)

workspaces.get('/current/members', async (c) => {
  const result = await c.env.DB.prepare(`SELECT u.id, u.email, u.display_name AS displayName, m.role, m.created_at AS joinedAt FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.created_at`)
    .bind(c.get('workspaceId')).all()
  return c.json({ data: result.results })
})

workspaces.post('/current/invitations', requireWorkspaceRoles('owner', 'admin'), async (c) => {
  const parsed = z.object({ email: z.string().email().transform((v) => v.toLowerCase()), role: roleSchema }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: '請確認邀請資料', issues: parsed.error.issues } }, 400)
  const token = randomToken(32)
  const now = Date.now()
  const id = crypto.randomUUID()
  await c.env.DB.prepare(`INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, expires_at, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.get('workspaceId'), parsed.data.email, parsed.data.role, await sha256(token), now + 7 * 24 * 60 * 60 * 1000, c.get('user').id, now).run()
  return c.json({ data: { id, token, invitePath: `/invite/${token}`, expiresAt: now + 7 * 24 * 60 * 60 * 1000 } }, 201)
})

workspaces.get('/current/brands', async (c) => {
  const result = await c.env.DB.prepare(`SELECT id, name, industry, audience, tone, keywords, banned_terms AS bannedTerms, default_cta AS defaultCta, primary_color AS primaryColor, created_at AS createdAt, updated_at AS updatedAt FROM brands WHERE workspace_id = ? ORDER BY created_at`)
    .bind(c.get('workspaceId')).all()
  return c.json({ data: result.results })
})

workspaces.post('/current/brands', requireWorkspaceRoles('owner', 'admin'), async (c) => {
  const parsed = brandSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: '請確認品牌資料', issues: parsed.error.issues } }, 400)
  const id = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.prepare(`INSERT INTO brands (id, workspace_id, name, industry, audience, tone, keywords, banned_terms, default_cta, primary_color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.get('workspaceId'), parsed.data.name, parsed.data.industry, parsed.data.audience, parsed.data.tone, JSON.stringify(parsed.data.keywords), JSON.stringify(parsed.data.bannedTerms), parsed.data.defaultCta, parsed.data.primaryColor, now, now).run()
  return c.json({ data: { id, ...parsed.data, createdAt: now, updatedAt: now } }, 201)
})

workspaces.patch('/current/brands/:brandId', requireWorkspaceRoles('owner', 'admin', 'editor'), async (c) => {
  const parsed = brandSchema.partial().refine((v) => Object.keys(v).length > 0).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: { code: 'INVALID_INPUT', message: '請確認品牌資料', issues: parsed.error.issues } }, 400)
  const current = await c.env.DB.prepare(`SELECT name, industry, audience, tone, keywords, banned_terms AS bannedTerms, default_cta AS defaultCta, primary_color AS primaryColor FROM brands WHERE id = ? AND workspace_id = ?`)
    .bind(c.req.param('brandId'), c.get('workspaceId')).first<Record<string, string>>()
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: '找不到品牌' } }, 404)
  const next = { ...current, ...parsed.data }
  await c.env.DB.prepare(`UPDATE brands SET name = ?, industry = ?, audience = ?, tone = ?, keywords = ?, banned_terms = ?, default_cta = ?, primary_color = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
    .bind(next.name, next.industry, next.audience, next.tone, Array.isArray(next.keywords) ? JSON.stringify(next.keywords) : next.keywords, Array.isArray(next.bannedTerms) ? JSON.stringify(next.bannedTerms) : next.bannedTerms, next.defaultCta, next.primaryColor, Date.now(), c.req.param('brandId'), c.get('workspaceId')).run()
  return c.json({ data: { id: c.req.param('brandId'), ...next }, message: '品牌設定已更新' })
})

export default workspaces
