import { expect, test } from '@playwright/test'

test('手機版可瀏覽審核中心與開啟導覽', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('demo-login').click()
  await expect(page.getByRole('heading', { name: '總覽' })).toBeVisible()
  await page.getByRole('button', { name: '通知' }).click()
  await expect(page.getByText('通知', { exact: true })).toBeVisible()
  await page.locator('.mobile-menu').click()
  await expect(page.getByRole('link', { name: '審核中心' })).toBeVisible()
  await page.getByRole('link', { name: '審核中心' }).click()
  await expect(page.getByRole('heading', { name: '審核中心', level: 2 })).toBeVisible()
})
