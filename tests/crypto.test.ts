import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/worker/lib/crypto'

describe('password hashing', () => {
  it('accepts URL-safe Base64 salts', async () => {
    const result = await hashPassword('DemoPassword!2026', '-_8')

    expect(result.salt).toBe('-_8')
    await expect(verifyPassword('DemoPassword!2026', result.hash, result.salt)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', result.hash, result.salt)).resolves.toBe(false)
  })
})
