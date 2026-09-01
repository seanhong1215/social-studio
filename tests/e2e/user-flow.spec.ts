import { expect, test } from '@playwright/test'
import path from 'node:path'

test('使用者可完成內容從企劃到發布的工作流', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('demo-login').click()
  await expect(page.getByRole('heading', { name: '早安，Demo 體驗帳戶' })).toBeVisible()

  await page.getByRole('button', { name: '內容企劃 0' }).click()
  await expect(page.getByRole('heading', { name: '內容企劃' })).toBeVisible()
  await page.getByTestId('create-campaign').click()
  await page.getByLabel('企劃名稱').fill('夏日新品社群企劃')
  await page.getByLabel('內容簡介').fill('以清爽、自然的語氣介紹夏季新品。')
  await page.getByTestId('campaign-submit').click()
  await expect(page.getByTestId('campaign-drawer')).toBeVisible()

  await page.getByTestId('asset-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.png'))
  await expect(page.getByRole('img', { name: 'sample.png' })).toBeVisible()
  await page.getByTestId('generate-button').click()
  await expect(page.getByText('Demo 文案已產生，請編輯並核准')).toBeVisible({ timeout: 20_000 })

  const editors = page.locator('.platform-editor')
  await expect(editors).toHaveCount(6)
  const firstEditor = editors.nth(0)
  await firstEditor.getByLabel('文案').fill('人工確認後的社群文案。')
  await firstEditor.getByRole('button', { name: '儲存此平台' }).click()
  await expect(page.getByText('平台文案已儲存')).toBeVisible()

  await page.getByRole('button', { name: '核准文案' }).click()
  await expect(page.getByText('六平台文案已核准')).toBeVisible()
  const scheduleDate = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const scheduleValue = new Date(scheduleDate.getTime() - scheduleDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  await page.getByLabel('發布日期與時間').fill(scheduleValue)
  await page.getByRole('button', { name: '加入日曆' }).click()
  await expect(page.getByText('已加入內容日曆')).toBeVisible()

  await page.getByRole('button', { name: '關閉' }).click()
  await page.getByRole('button', { name: '內容日曆' }).click()
  await expect(page.getByText('夏日新品社群企劃').first()).toBeVisible()
  await page.getByText('夏日新品社群企劃').first().click()
  await page.getByRole('button', { name: '標記發布' }).click()
  await expect(page.getByText('企劃已標記為發布完成')).toBeVisible()
})
