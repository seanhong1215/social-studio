# 架構說明

## 系統邊界

```text
Vue SPA
  └─ Cloudflare Worker / Hono API
       ├─ D1：帳號、工作流程、審核、發布與成效
       ├─ R2：品牌與貼文素材
       ├─ Queue：AI 生成與模擬發布工作
       ├─ Cron：到期發布、成效快照與資料清理
       └─ Workers AI／Demo Provider
```

## 領域模型

```text
Workspace
  ├─ Membership / Invitation
  └─ Brand
       └─ Campaign
            └─ Post
                 ├─ Platform Variant
                 ├─ Assets
                 └─ Review Comments
```

Campaign 用於管理一段行銷計畫，Post 是其中可獨立製作與審核的內容，Platform Variant 則保存各社群平台自己的文案、狀態與排程。

## 權限

- `owner`：完整管理工作空間。
- `admin`：管理品牌、成員與所有內容。
- `editor`：建立、編輯、送審與排程內容。
- `reviewer`：留言、退回及核准內容。
- `viewer`：唯讀。

所有內容、R2 object 與 API 查詢都以 Workspace scope 隔離。

## 工作流程

1. 編輯者建立 Campaign 與多篇 Post。
2. AI 依品牌受眾、語氣、關鍵字與禁用詞產生提案及平台文案。
3. Post 送審後，各 Platform Variant 獨立核准或退回。
4. 核准版本可設定不同發布時間並顯示於內容日曆。
5. Cron 建立具冪等鍵的模擬發布工作，由 Queue 執行成功或可控失敗。
6. 發布成功後建立固定 seed 的成效快照，供品牌與平台報表使用。

## 安全與可靠性

- Session token 與邀請 token 只保存 SHA-256 hash。
- 密碼使用 PBKDF2-SHA256 及獨立 salt。
- Mutation API 使用 CSRF double-submit token。
- 登入依 IP 與 email 限制失敗次數。
- 素材驗證 MIME、大小與檔案 signature，並經授權 API 讀取。
- 發布 job 使用唯一 idempotency key，避免 Cron 重複執行。
- 重要操作寫入 audit log；錯誤訊息不包含憑證。

## 測試策略

- Vitest：密碼與 AI schema。
- Migration smoke：在隔離 D1 套用全部 migrations。
- Playwright Desktop：完整內容營運流程與產品導覽。
- Playwright Mobile：導覽、通知與審核中心。
- CI：PR 與 `master` 執行 test、build、E2E，通過後才部署。
