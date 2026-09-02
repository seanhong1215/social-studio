# Cloudflare 免費方案部署

## 1. 登入 Wrangler

```bash
npx wrangler login
```

## 2. 建立 D1

```bash
npx wrangler d1 create social-studio-demo-db
```

將輸出的 `database_id` 填入 `wrangler.jsonc`，再套用 migration：

```bash
npm run db:migrate:remote
```

## 3. 建立 R2

```bash
npx wrangler r2 bucket create social-studio-demo-media
```

R2 可能要求帳戶完成付款方式驗證。使用量在免費額度內仍為零費用；Cloudflare Dashboard 應開啟用量通知。

## 4. 建立 Queues

```bash
npx wrangler queues create social-studio-demo-content
npx wrangler queues create social-studio-demo-content-dlq
```

## 5. 選擇 AI 模式

公開 Demo 在 `wrangler.jsonc` 使用：

```json
"AI_PROVIDER": "demo"
```

確認免費 AI 額度及輸出品質後，再改成 `workers-ai`。

## 6. 部署

```bash
npm run deploy
```

正式部署前先套用 D1 migrations：

```bash
npm run db:migrate:remote
```

公開作品使用 `AI_PROVIDER=demo` 時，可從登入頁一鍵進入 Demo 帳戶。

## GitHub Actions

GitHub Actions 僅負責執行單元測試、建置及端對端測試，不持有 Cloudflare 部署權限。

Cloudflare 部署維持本機操作：先以 `npx wrangler login` 登入，再執行 `npm run deploy`。資料庫 schema 有異動時，部署前另執行 `npm run db:migrate:remote`。

## 維護節奏

- 每次 push：CI 執行 test/build/E2E；需要更新正式網站時再從已登入 Cloudflare 的本機部署。
- 每月：檢查 Cloudflare usage、Queue DLQ 與 Worker errors。
- 每季：更新 npm dependencies、演練 D1 export/import。
- 每半年：確認 Cloudflare 免費額度與模型 availability。
