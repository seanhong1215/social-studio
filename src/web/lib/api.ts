export type User = { id: string; email: string; displayName: string; role: 'admin' | 'editor' | 'viewer' }
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer'
export type Workspace = { id: string; name: string; slug: string; timezone: string; role: WorkspaceRole; brandCount: number }
export type Brand = { id: string; name: string; industry: string; audience: string; tone: string; keywords: string; bannedTerms: string; defaultCta: string; primaryColor: string }
export type BrandInput = Omit<Partial<Brand>, 'keywords' | 'bannedTerms'> & { keywords?: string[]; bannedTerms?: string[] }
export type CampaignSummary = { id: string; brandId: string; brandName: string; name: string; objective: string; brief: string; status: string; startAt: number | null; endAt: number | null; createdAt: number; updatedAt: number; postCount: number; reviewCount: number; scheduledCount: number }
export type PostSummary = { id: string; title: string; brief: string; format: 'image' | 'carousel' | 'short_video'; assigneeId: string | null; assigneeName?: string; dueAt: number | null; status: string; variantCount: number; publishedCount: number; createdAt: number; updatedAt: number }
export type CampaignDetail = CampaignSummary & { posts: PostSummary[] }
export type Variant = { id: string; platform: string; copywriting: string; hashtags: string; status: string; scheduledAt: number | null; publishedAt: number | null; reviewedBy: string | null; reviewedAt: number | null; updatedAt: number }
export type Asset = { id: string; fileName: string; mimeType: string; mediaType: string; size: number; altText: string; position: number; isCover: boolean }
export type ReviewComment = { id: string; variantId: string | null; parentId: string | null; body: string; resolvedAt: number | null; authorId: string; authorName: string; createdAt: number }
export type PostDetail = { id: string; campaignId: string; title: string; brief: string; format: 'image' | 'carousel' | 'short_video'; assigneeId: string | null; dueAt: number | null; variants: Variant[]; assets: Asset[]; comments: ReviewComment[]; jobs: Array<{ id: string; kind: string; status: string; provider: string; errorMessage?: string }> }
export type Dashboard = { campaignCount: number; postCount: number; reviewCount: number; scheduledCount: number; failedCount: number; assetCount: number; unreadNotificationCount: number; aiProvider: string; upcoming: CalendarItem[] }
export type CalendarItem = { id: string; postId: string; postTitle: string; format: string; campaignId: string; campaignName: string; brandId: string; brandName: string; platform: string; status: string; scheduledAt: number; publishedAt: number | null }
export type ReviewItem = { variantId: string; postId: string; postTitle: string; campaignId: string; campaignName: string; brandId: string; brandName: string; platform: string; status: string; updatedAt: number; openCommentCount: number }
export type Analytics = { totals: { reach: number; impressions: number; engagements: number; clicks: number; videoViews: number; engagementRate: number }; series: Array<{ metricDate: string; platform: string; brandId: string; reach: number; impressions: number; engagements: number; clicks: number; videoViews: number }> }

let activeWorkspaceId = localStorage.getItem('social_workspace') ?? ''
export function setActiveWorkspace(id: string) { activeWorkspaceId = id }

type ApiEnvelope<T> = { data: T; message?: string }
export class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message) } }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (activeWorkspaceId) headers.set('X-Workspace-Id', activeWorkspaceId)
  const csrf = readCookie('social_csrf'); if (csrf && !['GET', 'HEAD'].includes(init?.method ?? 'GET')) headers.set('X-CSRF-Token', csrf)
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { credentials: 'include', ...init, headers })
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T> & { error?: { code?: string; message?: string } }
  if (!response.ok) throw new ApiError(response.status, body.error?.message ?? '請求失敗', body.error?.code)
  return body.data
}

export const api = {
  me: () => request<User>('/api/auth/me'),
  login: (email: string, password: string) => request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: { email: string; password: string; displayName: string; workspaceName: string; brandName: string }) => request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  demoLogin: () => request<User>('/api/auth/demo', { method: 'POST' }),
  logout: () => request<null>('/api/auth/logout', { method: 'POST' }),
  workspaces: () => request<Workspace[]>('/api/workspaces'),
  createWorkspace: (name: string, brandName: string) => request<{ id: string; brandId: string }>('/api/workspaces', { method: 'POST', body: JSON.stringify({ name, brandName }) }),
  acceptInvitation: (token: string) => request<{ workspaceId: string }>('/api/workspaces/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),
  members: () => request<Array<{ id: string; email: string; displayName: string; role: WorkspaceRole; joinedAt: number }>>('/api/workspaces/current/members'),
  invite: (email: string, role: Exclude<WorkspaceRole, 'owner'>) => request<{ token: string; invitePath: string; expiresAt: number }>('/api/workspaces/current/invitations', { method: 'POST', body: JSON.stringify({ email, role }) }),
  brands: () => request<Brand[]>('/api/workspaces/current/brands'),
  createBrand: (input: BrandInput & { name: string }) => request<Brand>('/api/workspaces/current/brands', { method: 'POST', body: JSON.stringify(input) }),
  updateBrand: (id: string, input: BrandInput) => request<Brand>(`/api/workspaces/current/brands/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  dashboard: () => request<Dashboard>('/api/dashboard'),
  campaigns: (brandId?: string) => request<CampaignSummary[]>(`/api/campaigns${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''}`),
  campaign: (id: string) => request<CampaignDetail>(`/api/campaigns/${id}`),
  createCampaign: (input: { brandId: string; name: string; objective?: string; brief?: string; startAt?: number | null; endAt?: number | null }) => request<CampaignSummary>('/api/campaigns', { method: 'POST', body: JSON.stringify(input) }),
  updateCampaign: (id: string, input: Partial<CampaignSummary>) => request(`/api/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  generateIdeas: (id: string) => request<{ jobId: string }>(`/api/campaigns/${id}/ideas`, { method: 'POST' }),
  createPost: (campaignId: string, input: { title: string; brief?: string; format: string; platforms: string[]; assigneeId?: string | null; dueAt?: number | null }) => request<PostSummary>(`/api/campaigns/${campaignId}/posts`, { method: 'POST', body: JSON.stringify(input) }),
  post: (campaignId: string, postId: string) => request<PostDetail>(`/api/campaigns/${campaignId}/posts/${postId}`),
  updatePost: (campaignId: string, postId: string, input: Partial<PostDetail>) => request(`/api/campaigns/${campaignId}/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  uploadAssets: (campaignId: string, postId: string, files: FileList) => { const form = new FormData(); Array.from(files).forEach((file) => form.append('files', file)); return request<Asset[]>(`/api/campaigns/${campaignId}/posts/${postId}/assets`, { method: 'POST', body: form }) },
  assetUrl: (campaignId: string, postId: string, assetId: string) => `/api/campaigns/${campaignId}/posts/${postId}/assets/${assetId}?workspaceId=${encodeURIComponent(activeWorkspaceId)}`,
  generatePost: (campaignId: string, postId: string) => request<{ jobId: string }>(`/api/campaigns/${campaignId}/posts/${postId}/generate`, { method: 'POST' }),
  updateVariant: (campaignId: string, postId: string, variantId: string, copywriting: string, hashtags: string[]) => request(`/api/campaigns/${campaignId}/posts/${postId}/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify({ copywriting, hashtags }) }),
  submitReview: (campaignId: string, postId: string) => request(`/api/campaigns/${campaignId}/posts/${postId}/submit-review`, { method: 'POST' }),
  approve: (campaignId: string, postId: string, variantId: string) => request(`/api/campaigns/${campaignId}/posts/${postId}/variants/${variantId}/approve`, { method: 'POST' }),
  requestChanges: (campaignId: string, postId: string, variantId: string, comment: string) => request(`/api/campaigns/${campaignId}/posts/${postId}/variants/${variantId}/request-changes`, { method: 'POST', body: JSON.stringify({ comment }) }),
  addComment: (campaignId: string, postId: string, body: string, variantId?: string | null) => request(`/api/campaigns/${campaignId}/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body, variantId: variantId ?? null, parentId: null }) }),
  resolveComment: (campaignId: string, postId: string, commentId: string) => request(`/api/campaigns/${campaignId}/posts/${postId}/comments/${commentId}/resolve`, { method: 'PATCH' }),
  schedule: (campaignId: string, postId: string, variantId: string, scheduledAt: number, simulateFailure = false) => request(`/api/campaigns/${campaignId}/posts/${postId}/variants/${variantId}/schedule`, { method: 'POST', body: JSON.stringify({ scheduledAt, simulateFailure }) }),
  calendar: (brandId?: string) => request<CalendarItem[]>(`/api/campaigns/calendar${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''}`),
  reviews: () => request<ReviewItem[]>('/api/operations/reviews'),
  publishJobs: () => request<Array<{ id: string; variantId: string; postId: string; postTitle: string; platform: string; status: string; attempt: number; errorMessage?: string; updatedAt: number }>>('/api/operations/publish-jobs'),
  retryPublish: (jobId: string) => request(`/api/operations/publish-jobs/${jobId}/retry`, { method: 'POST' }),
  runDemoPublisher: () => request('/api/operations/demo/run-publisher', { method: 'POST' }),
  analytics: (brandId?: string) => request<Analytics>(`/api/operations/analytics${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''}`),
  notifications: () => request<Array<{ id: string; title: string; body: string; readAt: number | null; createdAt: number }>>('/api/operations/notifications'),
  resetDemo: () => request('/api/operations/demo/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) }),
}

function readCookie(name: string) { return document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) }
