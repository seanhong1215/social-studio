# 架構說明

## 系統邊界

```text
Browser
  │
  ▼
Cloudflare Worker
  ├── Static Assets: React SPA
  ├── Hono API
  ├── D1 binding
  ├── R2 binding
  ├── Queue producer / consumer
  └── Workers AI binding
```

所有應用元件位於同一個 Cloudflare account，避免跨供應商憑證、網路延遲與免費方案維護成本。

## 資料模型

- `users` / `sessions`：身分與 Session。
- `campaigns`：內容企劃主體。
- `platform_contents`：每個企劃的多平台內容；新增平台不需增加欄位。
- `assets`：R2 object metadata。
- `ai_jobs`：Queue 工作狀態，避免把外部 AI 呼叫放在 HTTP request transaction。
- `audit_logs`：重要操作稽核。

## AI 工作流

1. API 建立 `ai_jobs`，狀態為 `queued`。
2. 將只含 ID 的小型訊息放入 Queue，圖片不進 Queue。
3. Consumer 從 R2 讀取第一張圖片。
4. Workers AI Vision 產生六平台 JSON。
5. Zod 驗證完整 response。
6. D1 batch 原子更新六筆平台內容、Campaign 與 Job。
7. 失敗時保留錯誤摘要並由 Queue retry。

## 免費方案保護

- 圖片限制每張 5MB、每次最多 6 張。
- Queue 訊息只放 ID，保持在單一 64KB operation。
- 公開展示可以使用 `AI_PROVIDER=demo`。
- D1 查詢欄位都有對應 indexes，避免不必要的 row scans。
- R2 物件透過已登入 API 讀取，不公開 bucket。

## 安全設計

- Session token 只存 SHA-256 hash。
- Cookie 使用 HttpOnly、SameSite=Lax，production 使用 Secure。
- 密碼使用 Web Crypto PBKDF2-SHA256 與獨立 salt。
- 第一位管理員只能透過 Worker secret 中的 Bootstrap Token 建立一次。
- 所有 Campaign 與 R2 API 需要有效 Session。
- API 使用 Hono secure headers。

正式公開前仍應加入登入 rate limit、CSRF token、TOTP/passkey 與完整使用者管理。
