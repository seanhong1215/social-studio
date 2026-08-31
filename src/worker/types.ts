export type Platform = 'facebook' | 'instagram' | 'x' | 'threads' | 'youtube' | 'tiktok'

export type Bindings = {
  DB: D1Database
  MEDIA: R2Bucket
  CONTENT_QUEUE: Queue<GenerateContentMessage>
  AI: Ai
  ASSETS: Fetcher
  APP_ENV: string
  AI_PROVIDER: 'workers-ai' | 'anthropic' | 'demo'
  ANTHROPIC_API_KEY?: string
  BOOTSTRAP_TOKEN?: string
}

export type Variables = {
  user: {
    id: string
    email: string
    displayName: string
    role: 'admin' | 'editor' | 'viewer'
  }
}

export type GenerateContentMessage = {
  jobId: string
  campaignId: string
  requestedBy: string
}

export const PLATFORMS: Platform[] = [
  'facebook',
  'instagram',
  'x',
  'threads',
  'youtube',
  'tiktok',
]
