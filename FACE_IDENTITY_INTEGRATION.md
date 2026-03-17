# 人臉辨識身份服務 — 整合指南

> 版本: 1.0.0 | 適用對象: 需要對接人臉辨識登入的任何軟體開發者（或 LLM）

## 1. 系統架構

```
每台教室 PC 上運行的 Face Recognition Client
├── Webcam 人臉辨識（持續運行）
└── Local Identity API (http://127.0.0.1:5050)
        ↑
        │  本機存取（127.0.0.1 only）
        │
    ┌───┴───────────────────────────┐
    │  任何需要身份驗證的軟體        │
    │  ├── 瀏覽器 Web App (JS SDK)  │
    │  ├── 桌面程式 (Python SDK)    │
    │  ├── CLI 工具 (HTTP GET)      │
    │  └── 任何能發 HTTP 的程式      │
    └───────────────────────────────┘

Token 驗證（可選，安全模式）:
  你的 App 後端 ──POST token──→ Face Server (http://{TEACHER_PC}:5000/api/v1/identity/verify)
```

**重要觀念：**
- Identity API 只監聽 `127.0.0.1`（僅限本機），無法從其他電腦存取
- 人臉辨識在背景持續運行，你的 App 只需要「問一下誰在用這台電腦」
- 不需要自己處理攝影機或人臉辨識邏輯

---

## 2. API 規格

Base URL: `http://127.0.0.1:5050`

### GET /identity

取得目前坐在這台電腦前的學生身份。

**回應（已登入）：**
```json
{
  "logged_in": true,
  "student_id": "S20240001",
  "name": "王小明",
  "confidence": 0.92,
  "login_time": 1710000000.0,
  "pc_number": 3
}
```

**回應（未登入 / 無人）：**
```json
{
  "logged_in": false,
  "pc_number": 3
}
```

### GET /identity/token

取得 HMAC-SHA256 簽名的身份 token。用於你的 App 後端做安全驗證。Token 有效期 5 分鐘。

```json
{
  "payload": {
    "student_id": "S20240001",
    "name": "王小明",
    "pc_number": 3,
    "confidence": 0.92,
    "issued_at": 1710000000.0,
    "expires_at": 1710000300.0
  },
  "signature": "a1b2c3d4..."
}
```

未登入時回傳 `401`。

### GET /identity/stream

**SSE (Server-Sent Events)** 即時事件串流。建立連線後，每當學生登入或登出會即時推送。

事件類型：
- `connected` — 連線成功
- `login` — 學生登入（data 包含 student_id, name, confidence, pc_number, timestamp）
- `logout` — 學生登出（data 包含 student_id, pc_number, timestamp）

每 30 秒自動發送 keepalive。

### GET /status

```json
{
  "status": "recognized",
  "pc_number": 3,
  "has_student": true
}
```
status 值: `idle`（無人）| `recognized`（已辨識）| `cooldown`（冷卻中）

### GET /health

```json
{
  "ok": true,
  "version": "1.0.0",
  "pc_number": 3
}
```

### POST /callback/register

註冊本地 webhook，Identity API 會在事件發生時 POST 到你指定的 URL。

**Request:**
```json
{
  "url": "http://localhost:8080/face-hook",
  "events": ["login", "logout"]
}
```

**Response:**
```json
{
  "id": "a1b2c3d4e5f6",
  "url": "http://localhost:8080/face-hook",
  "events": ["login", "logout"]
}
```

事件發生時，你的 URL 會收到 POST：
```json
{
  "event": "login",
  "student_id": "S20240001",
  "name": "王小明",
  "confidence": 0.92,
  "pc_number": 3,
  "timestamp": 1710000000.0
}
```

### POST /callback/remove

```json
{ "id": "a1b2c3d4e5f6" }
```

---

## 3. Token 驗證 API（Server 端）

你的 App 後端收到 token 後，轉發到人臉辨識 Server 驗證真偽。

### POST http://{FACE_SERVER}:5000/api/v1/identity/verify

**Request:** 直接轉發前端拿到的 token
```json
{
  "payload": { "student_id": "...", "name": "...", ... },
  "signature": "a1b2c3d4..."
}
```

**Response（成功）：**
```json
{
  "valid": true,
  "student_id": "S20240001",
  "name": "王小明",
  "pc_number": 3,
  "confidence": 0.92
}
```

**Response（失敗）：**
```json
{ "valid": false, "error": "Invalid signature" }
```
```json
{ "valid": false, "error": "Token expired" }
```

---

## 4. 整合模式

### 模式 A：簡單模式（內網信任環境）

直接從 `/identity` 拿身份，不做 token 驗證。
適合：封閉內網、學校電腦教室、不需防偽造。

### 模式 B：安全模式（推薦）

前端取 `/identity/token` → 送到你的後端 → 後端轉發到 Face Server `/api/v1/identity/verify`。
適合：任何需要防止學生偽造身份的場景。

### 模式 C：Callback 模式

你的 App 在本機開一個 HTTP endpoint，註冊到 Identity API。
適合：桌面程式、daemon、不想寫輪詢邏輯。

---

## 5. 整合範例

### 5.1 Web App（JavaScript，推薦 SSE 模式）

```html
<script src="identity_sdk.js"></script>
<script>
const identity = new FaceIdentity();

// 即時模式 (SSE) — 推薦
identity.connect({
  onLogin: async (user) => {
    console.log(`辨識成功: ${user.name}`);

    // 安全模式：取 token 送後端驗證
    const token = await identity.getToken();
    const resp = await fetch("/api/auth/face-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token),
    });
    const result = await resp.json();
    if (result.success) {
      window.location.href = "/dashboard";
    }
  },
  onLogout: () => {
    // 可選：自動登出
    fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  },
  onError: () => {
    // Identity API 未啟動，顯示一般登入表單
    document.getElementById("manual-login").style.display = "block";
  },
});
</script>
```

### 5.2 Web App 後端（你需要實作）

```
POST /api/auth/face-login

邏輯：
1. 收到前端傳來的 { payload, signature }
2. 轉發到 Face Server:
   POST http://{FACE_SERVER_IP}:5000/api/v1/identity/verify
   Body: { payload, signature }
3. if response.valid === true:
   a. 用 student_id 查你的 DB 找到對應 user
   b. 建立 session / JWT / cookie（依你的 auth 機制）
   c. return { success: true }
4. else:
   return { success: false, error: response.error }
```

### 5.3 Python 桌面程式

```python
from identity_sdk import FaceIdentityClient

client = FaceIdentityClient()

# 檢查服務是否可用
if not client.is_available():
    print("人臉辨識服務未啟動")
    exit()

# 方式 1: 一次性檢查
user = client.get_identity()
if user["logged_in"]:
    print(f"目前使用者: {user['name']} ({user['student_id']})")

# 方式 2: 等待登入（阻塞）
print("等待人臉辨識...")
user = client.wait_for_login(timeout=30)
if user:
    print(f"歡迎 {user['name']}！")

# 方式 3: 即時事件串流
for event in client.stream():
    if event["event"] == "login":
        print(f"登入: {event['name']}")
        # 執行你的登入邏輯
    elif event["event"] == "logout":
        print("已登出")
        # 執行你的登出邏輯
```

### 5.4 任何程式語言（純 HTTP）

```bash
# 查詢身份
curl http://127.0.0.1:5050/identity

# 取得 token
curl http://127.0.0.1:5050/identity/token

# SSE 串流
curl -N http://127.0.0.1:5050/identity/stream

# 註冊 callback
curl -X POST http://127.0.0.1:5050/callback/register \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:8080/hook", "events": ["login", "logout"]}'
```

---

## 6. 你的 App 需要做的事

### 前端
1. 引入 `identity_sdk.js`（或用原生 fetch / EventSource）
2. 在登入頁呼叫 `identity.connect()` 或輪詢 `/identity`
3. 辨識成功時取 token 送到後端，或直接用 student_id
4. 提供 fallback：如果 Identity API 無回應，顯示一般登入表單

### 後端
1. 新增 `POST /api/auth/face-login` endpoint
2. 收到 token 後轉發到 Face Server 驗證（安全模式）
3. 驗證通過後用 student_id 對應到你的 user 表，建立 session

### 資料庫
1. user 表需有 `student_id` 欄位（對應人臉辨識系統的學生編號）
2. 或建立 `face_identity_mapping` 表做對應：
   ```
   face_identity_mapping
   ├── user_id (你的系統 user ID)
   └── student_id (人臉辨識系統 student ID)
   ```

### UI
1. 登入頁顯示「偵測人臉中...」動畫
2. 辨識成功顯示學生姓名 + 自動跳轉（或按鈕確認）
3. Identity API 不可用時降級為手動登入

---

## 7. 注意事項

| 項目 | 說明 |
|------|------|
| 安全性 | `127.0.0.1:5050` 僅限本機存取，無法從外部偽造 |
| Token 有效期 | 5 分鐘，過期需重新取得 |
| CORS | 已啟用，瀏覽器可直接 fetch localhost |
| 服務未啟動 | 你的 App 應優雅降級，顯示一般登入方式 |
| student_id 格式 | 由學校決定（如 `S20240001`），你的系統需能對應 |
| 多人 | 一台 PC 同時只有一位登入者 |
| Face Server IP | 預設 `{老師電腦IP}:5000`，需在你的後端設定 |

---

## 8. 帳號綁定策略

人臉辨識系統透過學校照片匯入，已將「人臉 → student_id」綁定完成。
你的 App 只需要處理「student_id → 你的 App 帳號」這一層。

### 策略 A：直接用 student_id 當帳號（推薦，最單純）

如果你的 Web App 是學校專案，直接用 `student_id` 作為 user 主鍵：

```sql
CREATE TABLE users (
  student_id  VARCHAR(20) PRIMARY KEY,  -- 同人臉辨識系統的 student_id
  name        VARCHAR(100),
  class_name  VARCHAR(50),
  role        VARCHAR(20) DEFAULT 'student',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

人臉辨識回傳 `student_id` → 直接查 `users` 表 → 建立 session。

### 策略 B：獨立帳號系統 + 對應欄位

如果你的 App 已有帳號體系（email、username），在 user 表加一個 `student_id` 欄位做對應：

```sql
ALTER TABLE users ADD COLUMN student_id VARCHAR(20) UNIQUE;
```

人臉辨識回傳 `student_id` → `WHERE student_id = ?` 查到對應 user → 建立 session。

### 策略 C：獨立對應表（多對多情境）

極少數情況下需要（例如一個帳號對應多個 student_id）：

```sql
CREATE TABLE face_identity_mapping (
  user_id     INT REFERENCES users(id),
  student_id  VARCHAR(20) UNIQUE,
  linked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 首次綁定流程

不管哪種策略，如果學生的 App 帳號尚未與 `student_id` 綁定，建議的流程：

```
1. 學生第一次刷臉 → 你的 App 收到 student_id
2. 發現 student_id 不存在於你的 DB
3. 顯示「首次使用，請確認身份」頁面
   - 自動帶入姓名（從人臉辨識系統取得）
   - 學生填入班級 / 座號等額外資訊（如需要）
   - 或直接用 student_id 自動建立帳號
4. 綁定完成，後續刷臉直接登入
```

---

## 9. SDK 檔案

整合時需要的檔案（從人臉辨識專案取得）：

| 檔案 | 用途 | 放在哪裡 |
|------|------|----------|
| `client/identity_sdk.js` | 瀏覽器 SDK | Web App 的 static/public 目錄 |
| `client/identity_sdk.py` | Python SDK | 桌面程式的 lib 目錄或 pip install |

也可以不用 SDK，直接用 HTTP 呼叫 API（見第 5.4 節）。
