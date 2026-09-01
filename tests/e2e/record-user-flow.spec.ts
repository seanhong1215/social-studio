import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { GIFEncoder, applyPalette, quantize } = require('gifenc')
const { PNG } = require('pngjs') as typeof import('pngjs')

test.use({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 })

function createDemoImage() {
  const image = new PNG({ width: 800, height: 800 })
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      const glow = Math.max(0, 1 - Math.hypot(x - 520, y - 260) / 520)
      image.data[offset] = 232 + Math.round(glow * 23)
      image.data[offset + 1] = 104 + Math.round(glow * 78)
      image.data[offset + 2] = 74 + Math.round(glow * 84)
      image.data[offset + 3] = 255
    }
  }
  return PNG.sync.write(image)
}

test('錄製 Social Studio V2 完整使用者流程 GIF', async ({ page }) => {
  test.setTimeout(120_000)
  const gif = GIFEncoder({ initialCapacity: 8 * 1024 * 1024 })
  let frameCount = 0

  async function capture(delay = 1400) {
    const screenshot = await page.screenshot({ type: 'png' })
    const image = PNG.sync.read(screenshot)
    const palette = quantize(image.data, 128, { format: 'rgb444' })
    const indexed = applyPalette(image.data, palette, 'rgb444')
    gif.writeFrame(indexed, image.width, image.height, {
      palette,
      delay,
      repeat: frameCount === 0 ? 0 : undefined,
    })
    frameCount += 1
  }

  await page.goto('/login')
  await expect(page.getByTestId('demo-login')).toBeVisible()
  await capture(1800)

  await page.getByTestId('demo-login').click()
  await expect(page.getByRole('heading', { name: '早安，Demo 體驗帳戶' })).toBeVisible()
  await capture(1800)

  await page.getByRole('link', { name: '內容企劃' }).click()
  await expect(page.getByRole('heading', { name: '內容企劃', level: 2 })).toBeVisible()
  await capture(1200)

  await page.getByTestId('create-campaign').click()
  await page.getByLabel('企劃名稱').fill('夏日品牌內容計畫')
  await page.getByLabel('企劃目標').fill('提升品牌收藏與互動')
  await page.getByLabel('內容簡介').fill('面向重視生活質感的年輕族群，規劃跨平台新品內容。')
  await capture(1800)
  await page.locator('form.modal').getByRole('button', { name: '建立企劃' }).click()
  await expect(page.getByRole('heading', { name: '夏日品牌內容計畫' })).toBeVisible()
  await capture(1600)

  await page.getByRole('button', { name: '新增貼文' }).click()
  await page.getByLabel('貼文主題').fill('夏日新品正式登場')
  await page.getByLabel('內容簡介').fill('以清爽設計陪伴每一個陽光時刻。')
  await capture(1600)
  await page.locator('form.modal').getByRole('button', { name: '建立貼文' }).click()
  await expect(page.getByRole('heading', { name: '夏日新品正式登場' })).toBeVisible()
  await capture(1400)

  await page.getByTestId('asset-input').setInputFiles({
    name: 'summer-campaign.png',
    mimeType: 'image/png',
    buffer: createDemoImage(),
  })
  await expect(page.getByRole('img', { name: 'summer-campaign.png' })).toBeVisible()
  await capture(1600)

  await page.getByRole('button', { name: 'AI 生成文案' }).click()
  await expect(page.getByText('平台文案已產生')).toBeVisible({ timeout: 20_000 })
  await capture(2000)

  await page.getByRole('button', { name: '送出審核' }).click()
  await expect(page.getByText('已送出團隊審核')).toBeVisible()
  await capture(1600)

  const editorUrl = page.url()
  await page.getByRole('link', { name: '審核中心' }).click()
  const reviewItems = page.getByText('夏日新品正式登場')
  await expect(reviewItems).toHaveCount(3)
  await expect(reviewItems.first()).toBeVisible()
  await capture(1800)
  await page.goto(editorUrl)

  const approveButtons = page.getByRole('button', { name: '核准', exact: true })
  await expect(approveButtons).toHaveCount(3)
  for (const remaining of [2, 1, 0]) {
    await approveButtons.first().click()
    await expect(approveButtons).toHaveCount(remaining)
  }
  await capture(1600)

  const schedule = new Date(Date.now() + 60_000)
  const value = new Date(schedule.getTime() - schedule.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  await page.getByLabel('發布時間').first().fill(value)
  await capture(1400)
  await page.getByRole('button', { name: '加入排程' }).first().click()
  await expect(page.getByText('平台版本已排程')).toBeVisible()

  await page.getByRole('link', { name: '內容日曆' }).click()
  await expect(page.getByText('夏日新品正式登場').first()).toBeVisible()
  await capture(2000)

  await page.getByRole('link', { name: '成效分析' }).click()
  await expect(page.getByRole('heading', { name: '成效分析', level: 2 })).toBeVisible()
  await capture(2200)

  gif.finish()
  const outputDirectory = resolve(process.cwd(), 'docs', 'assets')
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(resolve(outputDirectory, 'social-studio-v2-demo.gif'), gif.bytes())
  expect(frameCount).toBe(15)
})
