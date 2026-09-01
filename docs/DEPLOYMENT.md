# Cloudflare 免費方案部署

## 1. 登入 Wrangler

```bash
npx wrangler login
```

## 2. 建立 D1

```bash
npx wrangler d1 create social-studio-db
```

將輸出的 `database_id` 填入 `wrangler.jsonc`，再套用 migration：

```bash
npm run db:migrate:remote
```

## 3. 建立 R2

```bash
npx wrangler r2 bucket create social-studio-media
```

R2 可能要求帳戶完成付款方式驗證。使用量在免費額度內仍為零費用；Cloudflare Dashboard 應開啟用量通知。

## 4. 建立 Queues

```bash
npx wrangler queues create social-content-generation
npx wrangler queues create social-content-generation-dlq
```

## 5. 選擇 AI 模式

公開 Demo 建議先在 `wrangler.jsonc` 使用：

```json
"AI_PROVIDER": "demo"
```

確認免費 AI 額度及輸出品質後，再改成 `workers-ai`。

## 6. 部署

```bash
npm run deploy
```

公開作品使用 `AI_PROVIDER=demo` 時，可從登入頁一鍵進入 Demo 帳戶。

## GitHub Actions

在 GitHub repository 的 `Settings > Secrets and variables > Actions` 設定：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

`main` branch 通過 test 與 build 後會執行 `wrangler deploy`。首次正式部署前，仍需手動建立 D1、R2、Queues 及套用 migration。

## 維護節奏

- 每次 push：CI 執行 test/build。
- 每月：檢查 Cloudflare usage、Queue DLQ 與 Worker errors。
- 每季：更新 npm dependencies、演練 D1 export/import。
- 每半年：確認 Cloudflare 免費額度與模型 availability。
