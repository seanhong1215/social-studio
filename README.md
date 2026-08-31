# Social Studio

AI-powered multi-platform social content workspace，使用 Cloudflare 原生服務重新設計。

一張圖片可以產生 Facebook、Instagram、X、Threads、YouTube 與 TikTok 六個平台的獨立文案與 hashtags。第一版包含管理員初始化、Session 登入、RBAC 基礎、企劃管理、R2 圖片上傳、Queue 非同步生成、Workers AI 及 audit log。

## 架構

- React 19 + TypeScript：前端 SPA
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
npx wrangler d1 migrations apply social-studio-db --local
npm run dev
```

完整的本機 Worker 環境可使用：

```bash
npm run build
npx wrangler dev
```

第一次使用前，在 `.dev.vars` 設定：

```dotenv
APP_ENV=development
AI_PROVIDER=demo
BOOTSTRAP_TOKEN=change-this-local-token
```

開啟登入頁，選擇「第一次使用？初始化管理員」，輸入 Bootstrap Token 建立唯一的第一位管理員。完成初始化後應輪替或移除 `BOOTSTRAP_TOKEN`。

## 驗證

```bash
npm run test
npm run build
npm audit --omit=dev
```

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
- 安全 Session Cookie 與第一位管理員初始化
- Campaign CRUD 基礎與六平台內容紀錄
- R2 圖片上傳與授權讀取
- Queue + Workers AI 非同步生成
- Demo AI fallback
- 響應式登入頁、Dashboard、Campaign drawer
- GitHub Actions CI/CD

後續里程碑：

- 使用者管理及完整 RBAC UI
- 平台文案編輯、審核及版本歷史
- 真實社群平台 OAuth 與發布 adapters
- MySQL 舊資料轉換工具
- Playwright E2E 與 Cloudflare integration tests
