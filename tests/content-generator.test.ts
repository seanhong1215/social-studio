import { describe, expect, it } from 'vitest'
import { generatedContentSchema } from '../src/worker/services/content-generator'

const platforms = ['facebook', 'instagram', 'x', 'threads', 'youtube', 'tiktok']

describe('generated content schema', () => {
  it('accepts a complete six-platform response', () => {
    const response = Object.fromEntries(platforms.map((platform) => [platform, {
      copywriting: `${platform} content`,
      hashtags: ['social', platform],
    }]))
    expect(generatedContentSchema.parse(response)).toEqual(response)
  })

  it('rejects an incomplete response', () => {
    expect(() => generatedContentSchema.parse({ facebook: { copywriting: 'text', hashtags: [] } })).toThrow()
  })
})
