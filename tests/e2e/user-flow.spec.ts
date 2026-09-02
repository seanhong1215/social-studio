import { expect, test } from '@playwright/test'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64')

test('使用者可完成 V2 內容營運主流程', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/login')
  await page.getByTestId('demo-login').click()
  await expect(page.getByRole('heading', { name: /讓好內容不只被看見/ })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Demo 體驗帳戶')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('overview-cover-desktop.png'), fullPage: true })

  await page.getByRole('link', { name: '內容企劃' }).click()
  await page.getByTestId('create-campaign').click()
  await page.getByLabel('企劃名稱').fill('夏日品牌內容計畫')
  await page.getByLabel('企劃目標').fill('提升品牌收藏與互動')
  await page.getByLabel('內容簡介').fill('面向重視生活質感的年輕族群。')
  const createCampaignResponse = page.waitForResponse((response) => response.url().endsWith('/api/campaigns') && response.request().method() === 'POST')
  await page.locator('form.modal').getByRole('button', { name: '建立企劃' }).click()
  const campaignResponse = await createCampaignResponse
  if (!campaignResponse.ok()) throw new Error(`建立企劃失敗 ${campaignResponse.status()}: ${await campaignResponse.text()}`)
  await expect(page.getByRole('heading', { name: '夏日品牌內容計畫' })).toBeVisible()

  await page.getByRole('button', { name: '新增貼文' }).click()
  await page.getByLabel('貼文主題').fill('夏日新品正式登場')
  await page.getByLabel('內容簡介').fill('以清爽設計陪伴每一個陽光時刻。')
  await page.locator('form.modal').getByRole('button', { name: '建立貼文' }).click()
  await expect(page.getByRole('heading', { name: '夏日新品正式登場' })).toBeVisible()

  await page.getByTestId('asset-input').setInputFiles({ name: 'summer.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('img', { name: 'summer.png' })).toBeVisible()
  await page.getByRole('button', { name: 'AI 生成文案' }).click()
  await expect(page.getByText('平台文案已產生')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: '送出審核' }).click()
  await expect(page.getByText('已送出團隊審核')).toBeVisible()
  const approveButtons = page.getByRole('button', { name: '核准', exact: true })
  await expect(approveButtons).toHaveCount(3)
  for (const remaining of [2, 1, 0]) {
    await approveButtons.first().click()
    await expect(approveButtons).toHaveCount(remaining)
  }

  // Generate the wall-clock value inside the browser's configured timezone.
  const value = await page.evaluate(() => {
    const schedule = new Date(Date.now() + 5 * 60_000)
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${schedule.getFullYear()}-${pad(schedule.getMonth() + 1)}-${pad(schedule.getDate())}T${pad(schedule.getHours())}:${pad(schedule.getMinutes())}`
  })
  await page.getByLabel('發布時間').first().fill(value)
  await page.getByRole('button', { name: '加入排程' }).first().click()
  await expect(page.getByText('平台版本已排程')).toBeVisible()

  await page.getByRole('link', { name: '內容日曆' }).click()
  await expect(page.getByText('夏日新品正式登場').first()).toBeVisible()
  await page.getByRole('link', { name: '成效分析' }).click()
  await expect(page.getByRole('heading', { name: '成效分析', level: 2 })).toBeVisible()
})
