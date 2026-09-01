export type Platform = 'facebook' | 'instagram' | 'x' | 'threads' | 'youtube' | 'tiktok'
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer'
export type ContentFormat = 'image' | 'carousel' | 'short_video'

export type Bindings = {
  DB: D1Database
  MEDIA: R2Bucket
  CONTENT_QUEUE: Queue<WorkerMessage>
  AI: Ai
  ASSETS: Fetcher
  APP_ENV: string
  AI_PROVIDER: 'workers-ai' | 'anthropic' | 'demo'
  ANTHROPIC_API_KEY?: string
}

export type Variables = {
  user: {
    id: string
    email: string
    displayName: string
    role: 'admin' | 'editor' | 'viewer'
  }
  workspaceId: string
  workspaceRole: WorkspaceRole
}

export type GenerateContentMessage = {
  type?: 'generation'
  jobId: string
  campaignId?: string
  postId?: string
  kind?: 'campaign_ideas' | 'platform_copy'
  requestedBy: string
}

export type PublishMessage = {
  type: 'publish'
  jobId: string
  variantId: string
}

export type WorkerMessage = GenerateContentMessage | PublishMessage

export const PLATFORMS: Platform[] = [
  'facebook',
  'instagram',
  'x',
  'threads',
  'youtube',
  'tiktok',
]
