# 舊資料遷移邊界

## 已確認來源

- 本機檔案：`D:\shang\技術開發\dev\技術學習\面試作品\資料庫\socialmedia.sql`
- 格式：MySQL SQL dump
- 已識別資料：系統使用者與角色、社群內容訂單、圖片與 QR code metadata、系統參數及操作日誌。

來源檔只作為本機遷移輸入，不複製進 repository，也不會在 CI 或 Cloudflare 部署期間讀取。

## 初始化階段的處理原則

目前先固定新的 D1 schema 與 migration 機制，不直接搬入舊資料。待專案架構確認後，再建立可重複執行的轉換工具，產生 D1 可接受的 SQL 或批次資料，而不是手動修改正式資料庫。

預計對應如下：

| 舊資料 | 新架構 | 處理方式 |
| --- | --- | --- |
| 使用者、角色 | `users` 與 RBAC | 保留必要欄位；舊密碼不可直接沿用，改為重設密碼 |
| 社群內容訂單 | `campaigns`、`platform_contents` | 依實際平台與狀態轉換，保留來源 ID 供追蹤 |
| 圖片 metadata | `assets` + R2 | 先確認原始圖片可讀，再上傳 R2 並建立新 object key |
| 系統參數 | Worker vars / secrets | 公開設定與敏感資料分離；secret 不寫入 SQL 或 Git |
| 操作日誌 | `audit_logs` 或冷儲存 | 只搬作品展示有價值且不含敏感資訊的紀錄 |

## 進入正式遷移前仍需確認

1. 歷史圖片的原始檔資料夾，或 SQL 中舊 S3 URL 目前仍可下載。
2. 哪些舊帳號與歷史訂單確實要保留；展示環境通常只需匿名化範例資料。
3. 架構調整完成後的最終 D1 schema 與狀態定義。

任何舊 API key、資料庫密碼、S3 憑證及 token 都不遷移；正式環境一律重新建立並存入 Cloudflare Secrets。
