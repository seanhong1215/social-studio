# Social Studio

AI-powered multi-platform social content workspace，使用 Cloudflare 原生服務重新設計。

一張圖片可以產生 Facebook、Instagram、X、Threads、YouTube 與 TikTok 六個平台的獨立文案與 hashtags。第一版包含 Demo 一鍵登入、Session、RBAC 基礎、企劃管理、R2 圖片上傳、Queue 非同步生成、Workers AI 及 audit log。

## 架構

- Vue 3 + TypeScript：前端 SPA
- Hono：Cloudflare Worker API
- D1 + Drizzle schema：關聯資料
- R2：圖片素材
- Queues：AI 生成工作
- Workers AI：圖片理解與文案生成
- Cron Triggers：Session 與 audit log 清理
- GitHub Actions：測試、建置與部署

不再需要 JVM、Docker、MySQL、Redis、RabbitMQ、Nacos 或 AWS S3。

## 本機開始

需求：Node.js 20+。

```bash
npm install
npm run dev:worker
```

再開另一個終端啟動 Vue：

```bash
npm run dev
```

`npm run dev:worker` 會自動使用本機的 `development` 與 `demo` 設定。開啟登入頁後，可直接點擊「一鍵進入 Demo」。

## 使用者流程

目前可完整操作：

```text
Demo 登入
  → 建立與修改企劃
  → 上傳圖片素材
  → 生成六平台文案
  → 逐平台編輯與儲存
  → 核准六平台內容
  → 設定發布日期
  → 在內容日曆查看排程
  → 標記發布完成
```

企劃列表支援搜尋與狀態篩選；刪除企劃時會一併移除 D1 關聯資料及 R2 圖片。`AI_PROVIDER=demo` 產生的是清楚標示的模板文案；`workers-ai` 才會使用 Cloudflare Workers AI 分析圖片。發布功能目前記錄內部工作流狀態，尚未串接 Facebook、Instagram 等平台 OAuth。

## 驗證

```bash
npm run test
npm run build
npm audit --omit=dev
```

完整使用者流程會啟動隔離的本機 D1、R2 與 Queue，依序驗證 Demo 登入、企劃建立、素材上傳、文案生成與編輯、核准、排程、日曆及發布狀態：

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright 每次執行都會錄影，結果放在 `artifacts/e2e/`；CI 亦會保存可下載的 E2E artifact。測試使用 `wrangler.e2e.jsonc` 與獨立的 `.wrangler/state/e2e`，不會接觸開發或正式資料。

面試展示版錄影會在 14 個關鍵步驟各停留約 1.2 秒：

```bash
npm run demo:record
```

成功影片整理於 `artifacts/social-studio-user-flow.webm`。

## 舊資料庫

已盤點本機來源 `資料庫/socialmedia.sql`，它是 MySQL dump，包含既有帳號、社群訂單、圖片 metadata、參數與日誌。初始化階段不直接匯入 D1，以免在資料模型仍要調整時反覆重做 migration；欄位對應、密碼與圖片處理原則見 [資料遷移說明](docs/DATA_MIGRATION.md)。

## 部署

請依照 [Cloudflare 部署指南](docs/DEPLOYMENT.md) 建立 D1、R2、Queues 與 secrets，再執行：

```bash
npm run deploy
```

架構決策與資料模型請參考 [架構文件](docs/ARCHITECTURE.md)。

## AI 模式

`AI_PROVIDER` 支援：

- `workers-ai`：正式 Cloudflare Workers AI Vision 流程。
- `demo`：不消耗 AI 額度的確定性範例內容，適合公開作品。
- `anthropic`：預留 adapter 名稱，第一版尚未啟用。

## 第一版範圍

已完成：

- Cloudflare-native 專案骨架
- D1 migration 與正規化資料模型
- 安全 Session Cookie 與 Demo 一鍵登入
- Campaign CRUD 基礎與六平台內容紀錄
- R2 圖片上傳與授權讀取
- Queue + Workers AI 非同步生成
- Demo AI fallback
- 響應式登入頁、Dashboard、Campaign drawer
- 企劃搜尋、文案編輯、核准、排程、內容日曆與發布狀態
- GitHub Actions CI/CD

後續里程碑：

- 使用者管理及完整 RBAC UI
- 平台文案版本歷史
- 真實社群平台 OAuth 與發布 adapters
- MySQL 至 D1 的可重複資料轉換工具
