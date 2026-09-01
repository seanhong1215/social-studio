export type User = {
  id: string
  email: string
  displayName: string
  role: 'admin' | 'editor' | 'viewer'
}

export type CampaignSummary = {
  id: string
  title: string
  brief: string
  status: string
  createdAt: number
  updatedAt: number
  assetCount: number
  platformCount: number
}

export type CampaignDetail = CampaignSummary & {
  contents: Array<{
    id: string
    platform: string
    copywriting: string
    hashtags: string
    releaseAt: number | null
    status: string
  }>
  assets: Array<{ id: string; fileName: string; mimeType: string; size: number }>
  jobs: Array<{ id: string; status: string; provider: string; errorMessage?: string }>
}

export type DashboardStats = {
  campaignCount: number
  readyCount: number
  assetCount: number
  activeJobCount: number
  aiProvider: string
}

export type CalendarItem = {
  id: string
  campaignId: string
  campaignTitle: string
  platform: string
  copywriting: string
  releaseAt: number
  status: string
}

type ApiEnvelope<T> = { data: T; message?: string }

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: init?.body instanceof FormData
      ? init.headers
      : { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T> & { error?: { message?: string } }
  if (!response.ok) throw new ApiError(response.status, body.error?.message ?? '請求失敗')
  return body.data
}

export const api = {
  me: () => request<User>('/api/auth/me'),
  login: (email: string, password: string) => request<User>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  demoLogin: () => request<User>('/api/auth/demo', { method: 'POST' }),
  logout: () => request<never>('/api/auth/logout', { method: 'POST' }),
  stats: () => request<DashboardStats>('/api/dashboard'),
  campaigns: () => request<CampaignSummary[]>('/api/campaigns'),
  calendar: () => request<CalendarItem[]>('/api/campaigns/calendar'),
  campaign: (id: string) => request<CampaignDetail>(`/api/campaigns/${id}`),
  createCampaign: (title: string, brief: string) => request<CampaignSummary>('/api/campaigns', {
    method: 'POST', body: JSON.stringify({ title, brief }),
  }),
  uploadAssets: (campaignId: string, files: FileList) => {
    const form = new FormData()
    Array.from(files).forEach((file) => form.append('files', file))
    return request<Array<{ id: string }>>(`/api/campaigns/${campaignId}/assets`, { method: 'POST', body: form })
  },
  generate: (campaignId: string) => request<{ jobId: string; status: string }>(`/api/campaigns/${campaignId}/generate`, { method: 'POST' }),
  updateCampaign: (campaignId: string, input: { title?: string; brief?: string }) => request(`/api/campaigns/${campaignId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateContent: (campaignId: string, contentId: string, input: { copywriting: string; hashtags: string[] }) => request(`/api/campaigns/${campaignId}/contents/${contentId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  approveCampaign: (campaignId: string) => request(`/api/campaigns/${campaignId}/approve`, { method: 'POST' }),
  scheduleCampaign: (campaignId: string, releaseAt: number) => request(`/api/campaigns/${campaignId}/schedule`, { method: 'POST', body: JSON.stringify({ releaseAt }) }),
  publishCampaign: (campaignId: string) => request(`/api/campaigns/${campaignId}/publish`, { method: 'POST' }),
  deleteCampaign: (campaignId: string) => request(`/api/campaigns/${campaignId}`, { method: 'DELETE' }),
}
