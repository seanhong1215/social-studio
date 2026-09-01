import { expect, test } from '@playwright/test'

test('錄製 Social Studio V2 產品導覽', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/login')
  await page.getByTestId('demo-login').click()
  await expect(page.getByRole('heading', { name: '早安，Demo 體驗帳戶' })).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByRole('link', { name: '內容企劃' }).click(); await page.waitForTimeout(1200)
  await page.getByRole('link', { name: '審核中心' }).click(); await page.waitForTimeout(1200)
  await page.getByRole('link', { name: '內容日曆' }).click(); await page.waitForTimeout(1200)
  await page.getByRole('link', { name: '成效分析' }).click(); await page.waitForTimeout(1200)
  await page.getByRole('link', { name: '設定' }).click(); await page.waitForTimeout(1200)
})
