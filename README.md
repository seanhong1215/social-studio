# Social Studio

以 Cloudflare 為核心的 AI 社群內容工作台，可管理企劃、上傳素材、產生多平台文案並追蹤審核與發布狀態。

## 技術架構

- Vue 3 + TypeScript + Vite
- Hono + Cloudflare Workers
- D1 + Drizzle ORM
- R2、Queues、Workers AI
- Vitest + Playwright

## 本機開發

需要 Node.js 20 以上版本。

```bash
npm install
npm run dev:worker
```

另開終端啟動前端：

```bash
npm run dev
```

本機 Worker 預設使用 `development` 環境與 Demo AI。

## 驗證

```bash
npm test
npm run build
```

端對端測試：

```bash
npx playwright install chromium
npm run test:e2e
```

錄製展示流程：

```bash
npm run demo:record
```

## AI 模式

- `demo`：使用固定模板，適合本機展示與測試。
- `workers-ai`：使用 Cloudflare Workers AI 分析素材並產生內容。

## 部署

依照 [Cloudflare 部署指南](docs/DEPLOYMENT.md) 建立所需資源與 Secrets，再執行：

```bash
npm run deploy
```

系統設計請參閱 [架構說明](docs/ARCHITECTURE.md)。

## 目前範圍

- Demo 登入與 Session 驗證
- 企劃建立、搜尋、篩選與刪除
- 素材上傳與多平台文案生成
- 文案編輯、核准、排程與發布狀態追蹤
- GitHub Actions CI/CD
