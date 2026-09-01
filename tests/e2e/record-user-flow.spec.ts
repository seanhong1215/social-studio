import { expect, test, type Page } from '@playwright/test'

const frameDelay = 1_200
const demoImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64')

async function showStep(page: Page, label: string) {
  await page.evaluate((text) => {
    let badge = document.querySelector<HTMLDivElement>('#demo-step-badge')
    if (!badge) {
      badge = document.createElement('div')
      badge.id = 'demo-step-badge'
      Object.assign(badge.style, {
        position: 'fixed', left: '24px', bottom: '24px', zIndex: '9999',
        padding: '10px 16px', borderRadius: '999px', color: '#fff',
        background: 'rgba(16,24,32,.92)', font: '600 14px system-ui',
        boxShadow: '0 8px 30px rgba(0,0,0,.24)', pointerEvents: 'none',
      })
      document.body.appendChild(badge)
    }
    badge.textContent = text
  }, label)
  await page.waitForTimeout(frameDelay)
}

test('錄製 Social Studio 完整使用者流程', async ({ page }) => {
  test.setTimeout(120_000)
  const title = '夏日新品社群企劃'

  await page.goto('/')
  await showStep(page, '01｜登入 Social Studio')
  await page.getByTestId('demo-login').click()
  await expect(page.getByRole('heading', { name: '早安，Demo 體驗帳戶' })).toBeVisible()
  await showStep(page, '02｜查看工作空間總覽')

  await page.getByRole('button', { name: '內容企劃 0' }).click()
  await showStep(page, '03｜進入內容企劃')
  await page.getByTestId('create-campaign').click()
  await showStep(page, '04｜建立新的內容企劃')
  await page.getByLabel('企劃名稱').fill(title)
  await page.getByLabel('內容簡介').fill('以清爽、自然的語氣介紹夏季新品，面向重視生活質感的年輕族群。')
  await showStep(page, '05｜填寫企劃目標與受眾')
  const createResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/campaigns') && response.request().method() === 'POST')
  await page.getByTestId('campaign-submit').click()
  const createResponse = await createResponsePromise
  expect(createResponse.ok()).toBeTruthy()
  await expect(page.getByTestId('campaign-drawer')).toBeVisible({ timeout: 15_000 })

  await page.getByTestId('asset-input').setInputFiles({ name: 'summer-product.png', mimeType: 'image/png', buffer: demoImage })
  await expect(page.getByRole('img', { name: 'summer-product.png' })).toBeVisible()
  await showStep(page, '06｜上傳企劃圖片素材')
  await page.getByTestId('generate-button').click()
  await expect(page.getByText('Demo 文案已產生，請編輯並核准')).toBeVisible({ timeout: 20_000 })
  await showStep(page, '07｜生成六平台文案')

  const editors = page.locator('.platform-editor')
  await expect(editors).toHaveCount(6)
  const firstEditor = editors.nth(0)
  await firstEditor.getByLabel('文案').fill('夏日新品正式登場！以清爽設計與自然質感，陪你迎接每一個陽光時刻。')
  await firstEditor.getByLabel('Hashtags').fill('夏日新品 生活風格 SocialStudio')
  await showStep(page, '08｜人工編輯平台文案')
  await firstEditor.getByRole('button', { name: '儲存此平台' }).click()
  await expect(page.getByText('平台文案已儲存')).toBeVisible()

  await page.getByRole('button', { name: '核准文案' }).click()
  await expect(page.getByText('六平台文案已核准')).toBeVisible()
  await showStep(page, '09｜核准六平台內容')

  const scheduleDate = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const scheduleValue = new Date(scheduleDate.getTime() - scheduleDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  await page.getByLabel('發布日期與時間').fill(scheduleValue)
  await page.getByRole('button', { name: '加入日曆' }).click()
  await expect(page.getByText('已加入內容日曆')).toBeVisible()
  await showStep(page, '10｜設定發布時間')

  await page.getByRole('button', { name: '關閉' }).click()
  await page.getByRole('button', { name: '內容日曆' }).click()
  await expect(page.getByText(title).first()).toBeVisible()
  await showStep(page, '11｜在內容日曆查看排程')
  await page.getByText(title).first().click()
  await page.getByRole('button', { name: '標記發布' }).click()
  await expect(page.getByText('企劃已標記為發布完成')).toBeVisible()
  await showStep(page, '12｜完成發布工作流')

  await page.getByRole('button', { name: '關閉' }).click()
  await page.getByRole('button', { name: '設定' }).click()
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible()
  await showStep(page, '13｜確認帳戶與 AI Provider')
  await page.locator('.profile').click()
  await expect(page.getByRole('heading', { name: '登入工作空間' })).toBeVisible()
  await showStep(page, '14｜安全登出')
})
