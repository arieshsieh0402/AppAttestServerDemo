# iOS App Attestation Server Demo

一個使用 [`node-app-attest`](https://github.com/uebelack/node-app-attest) npm 套件的 iOS App Attestation 後端驗證伺服器 Demo。
在 Node.js 後端驗證 Apple App Attest 的 attestation 和 assertion 物件，以確保請求來自真正的 iOS 應用程式。

## Quick Start

### Environment

- Node.js v16+
- npm v7+

### Installation

```bash
# Clone repo
git clone <repository-url>
cd AppAttestServer

# Install dependencies
npm install
```

### Settings

在啟動伺服器之前，設置你的 Apple 開發者資訊：

```bash
# 直接編輯 server.js 中的 const
# 編輯以下行：
# const BUNDLE_IDENTIFIER = "com.yourcompany.yourapp"
# const TEAM_IDENTIFIER = "YOUR_TEAM_ID"
```

**如何找到你的 Team ID 和 Bundle ID：**

1. 訪問 [Apple Developer](https://developer.apple.com/)
2. 登錄你的開發者帳戶
3. 進入「Certificates, Identifiers & Profiles」
4. 你的 Team ID 即在頁面右上角（形如 `XXXXXX1234`）
5. Bundle ID 可在 Identifiers 中找到（形如 `com.yourcompany.yourapp`）

### 啟動伺服器

```bash
npm start
```

你會看到類似的輸出：

```
╔═══════════════════════════════════════════════════════════════╗
║      iOS App Attestation Server (node-app-attest) 🚀         ║
╚═══════════════════════════════════════════════════════════════╝
🌐 Server running at: http://localhost:3000

📌 Available Endpoints:
   • GET  /challenge         - 取得新的 challenge
   • POST /register          - 設備註冊 Attestation
   • POST /transfer          - 敏感操作 Assertion
   • GET  /attestations      - 查看已註冊設備

💡 使用 node-app-attest npm 套件的簡化版本
```

## 📡 API Endpoints

### 1. GET `/challenge`

取得新的 challenge（用於防重放攻擊）

**Request：**
```bash
curl http://localhost:3000/challenge
```

**Response：**
```json
{
  "challenge": "bd5cffe121540d67249177fd9782ab9d776b97d6f0b688cbf6d703db8541541f"
}
```

---

### 2. POST `/register`

設備初始註冊（Attestation 驗證）

iOS 應用呼叫此端點來註冊新設備，並將 Apple App Attest 的 attestation object 發送給伺服器。

**Request header：**
```
Content-Type: application/json
```

**Request Body：**
```json
{
  "key_id": "unique-device-key-id",
  "attestation_object_b64": "base64-encoded-attestation-object",
  "challenge": "challenge-from-step1"
}
```

**Success response(201)：**
```json
{
  "success": true,
  "message": "Device registered successfully",
  "keyId": "unique-device-key-id"
}
```

**Fail response (401)：**
```json
{
  "error": "Attestation verification failed",
  "details": "錯誤原因..."
}
```

---

### 3. POST `/transfer`

執行敏感操作（Assertion 驗證）

iOS 應用呼叫此端點來執行需要安全驗證的操作。伺服器會驗證 assertion object 並檢查計數器以防止重放攻擊。

**Request header：**
```
Content-Type: application/json
```

**Request Body：**
```json
{
  "key_id": "unique-device-key-id",
  "payload": {
    "amount": 100,
    "to": "recipient-name"
  },
  "assertion_object_b64": "base64-encoded-assertion-object",
  "client_data": {
    "challenge": "challenge-from-step1",
    "payload_hash": "sha256-hash-of-payload"
  }
}
```

**Success response(201)：**
```json
{
  "success": true,
  "message": "Transfer completed successfully"
}
```

**Fail response (401)：**
```json
{
  "error": "Assertion verification failed",
  "details": "錯誤原因..."
}
```

---

### 4. GET `/attestations`

查看所有已註冊的設備（調試用）

```bash
curl http://localhost:3000/attestations
```

**Response：**
```json
{
  "attestations": [
    {
      "keyId": "device-123",
      "signCount": 5,
      "registeredAt": "2026-02-22T12:00:00.000Z",
      "publicKeyPreview": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIK..."
    }
  ]
}
```

## 驗證流程

### 階段 1：設備註冊（Attestation）

```
iOS App                          Backend Server
    |                                  |
    |-------- GET /challenge --------->|
    |                                  |
    |<---- Challenge (hex string) <----|
    |                                  |
    | [在 Secure Enclave 中生成密鑰對]  |
    | [對 challenge 進行認證]            |
    |                                  |
    |---- POST /register ------------->|
    |  (keyId, attestationObject,      |
    |   challenge)                     |
    |                                  |
    |    [驗證 Challenge 有效性]        |
    |    [驗證 Attestation 結構]        |
    |    [驗證 Apple 證書鏈]            |
    |    [驗證 App ID/Team ID]          |
    |    [提取並保存公鑰]               |
    |    [初始化計數器 = 0]              |
    |                                  |
    |<----- Success Response <---------|
```

### 階段 2：敏感操作（Assertion）

```
iOS App                          Backend Server
    |                                  |
    |-------- GET /challenge --------->|
    |                                  |
    |<---- Challenge (hex string) <----|
    |                                  |
    | [準備 payload 資料]               |
    | [計算 payload hash]               |
    | [在 Secure Enclave 中簽名]        |
    |                                  |
    |---- POST /transfer ------------->|
    |  (keyId, payload, assertion,     |
    |   clientData)                    |
    |                                  |
    |    [驗證 Challenge 有效性]        |
    |    [驗證 Payload Hash]            |
    |    [驗證 Assertion (node-app-attest)|
    |    [驗證計數器遞增]               |
    |    [更新計數器]                   |
    |    [執行業務邏輯]                 |
    |                                  |
    |<----- Success Response <---------|
```
