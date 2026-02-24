/**
 * iOS App Attestation Server Demo
 *
 * Demo Apple App Attest 驗證流程
 */

import express from "express";
import crypto from "crypto";
import { verifyAttestation, verifyAssertion } from "node-app-attest";

const app = express();
app.use(express.json());

// ===== Configuration =====
// 請設置自己的 Apple 開發者資訊
const BUNDLE_IDENTIFIER = "hthsieh.ApptestDemo";
const TEAM_IDENTIFIER = "7RTU2TSVH9";
const ALLOW_DEVELOPMENT_ENV = true;

// ===== In-Memory Storage =====
const challenges = new Map(); // challenge -> { createdAt, expiresAt }
const attestations = new Map();    // key_id -> { publicKey, signCount }

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const PORT = 3000;

// ===== Helper Functions =====

/**
 * 生成一個新的 challenge
 */
function generateChallenge() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * 驗證 challenge 是否有效
 */
function isValidChallenge(challenge) {
  if (!challenges.has(challenge)) {
    console.log("❌ Challenge not found in storage");
    return false;
  }

  const record = challenges.get(challenge);
  const now = Date.now();

  if (now > record.expiresAt) {
    console.log("❌ Challenge expired");
    challenges.delete(challenge);
    return false;
  }

  console.log("✅ Challenge is valid");
  return true;
}

// ===== API Endpoints =====

app.get("/challenge", (req, res) => {
  console.log("\n🔹 [GET /challenge] 請求新的 challenge");
  const challenge = generateChallenge();
  const now = Date.now();
  challenges.set(challenge, { createdAt: now, expiresAt: now + CHALLENGE_EXPIRY_MS });
  console.log(`✅ Generated new challenge: ${challenge.substring(0, 16)}...`);
  res.json({ challenge });
});

app.post("/register", async (req, res) => {
  console.log("\n🔹 [POST /register] 設備註冊請求 (Attestation)");
  const { key_id, attestation_object_b64, challenge } = req.body;

  try {
    // Step 1: 驗證 Challenge
    console.log("\n📍 Step 1: 驗證 Challenge");
    if (!isValidChallenge(challenge)) {
      return res.status(400).json({ error: "Invalid challenge" });
    }
    challenges.delete(challenge);

    // Step 2: 使用 node-app-attest 驗證 Attestation
    console.log("\n📍 Step 2: 驗證 Attestation");
    const attestationBuffer = Buffer.from(attestation_object_b64, "base64");

    const result = verifyAttestation({
      attestation: attestationBuffer,
      challenge: challenge,
      keyId: key_id,
      bundleIdentifier: BUNDLE_IDENTIFIER,
      teamIdentifier: TEAM_IDENTIFIER,
      allowDevelopmentEnvironment: ALLOW_DEVELOPMENT_ENV,
    });

    console.log(`✅ Attestation verified successfully!`);
    console.log(`   Key ID: ${result.keyId}`);
    console.log(`   Public Key (first 50 chars): ${result.publicKey.substring(0, 50)}...`);

    // Step 3: 保存 Attestation
    console.log("\n📍 Step 3: 保存 Attestation 資料");
    attestations.set(key_id, {
      publicKey: result.publicKey,
      signCount: 0,
      registeredAt: new Date(),
    });

    console.log(`✅ Device registered successfully!`);
    res.json({ success: true, message: "Device registered successfully", keyId: result.keyId });

  } catch (error) {
    console.log(`❌ Attestation verification failed: ${error.message}`);
    res.status(401).json({ error: "Attestation verification failed", details: error.message });
  }
});

app.post("/transfer", async (req, res) => {
  console.log("\n🔹 [POST /transfer] 敏感操作請求 (Assertion)");
  const { key_id, payload, assertion_object_b64, client_data_raw } = req.body;
  const client_data = JSON.parse(client_data_raw);

  try {
    // Step 1: 檢索 Attestation
    console.log("\n📍 Step 1: 檢索 Attestation");
    const attestationRecord = attestations.get(key_id);
    if (!attestationRecord) {
      return res.status(400).json({ error: "Unknown device" });
    }

    // Step 2: 驗證 Challenge
    console.log("\n📍 Step 2: 驗證 Challenge");
    if (!isValidChallenge(client_data.challenge)) {
      return res.status(400).json({ error: "Invalid challenge" });
    }

    // ⚠️ 為了 Demo 重放攻擊，我們刻意不刪除 challenge，讓它可以被重複使用
    // challenges.delete(client_data.challenge);

    // Step 3: 驗證 Payload Hash
    console.log("\n📍 Step 3: 驗證 Payload Hash");
    // 1. 將 Base64 還原為原始二進位
    const payloadData = Buffer.from(payload, 'base64');

    // 2. 計算預期 Hash
    const expectedPayloadHash = crypto.createHash("sha256").update(payloadData).digest("hex");

    // 3. 與 client_data 裡的 hash 對比
    if (client_data.payload_hash !== expectedPayloadHash) {
      return res.status(400).send("Tampering detected!");
    };
    console.log("✅ Payload hash verified");

    // Step 4: 使用 node-app-attest 驗證 Assertion
    console.log("\n📍 Step 4: 驗證 Assertion");
    const assertionBuffer = Buffer.from(assertion_object_b64, "base64");
    const payloadBuffer = Buffer.from(client_data_raw, 'utf8');

    const result = verifyAssertion({
      assertion: assertionBuffer,
      payload: payloadBuffer,
      publicKey: attestationRecord.publicKey,
      bundleIdentifier: BUNDLE_IDENTIFIER,
      teamIdentifier: TEAM_IDENTIFIER,
      signCount: attestationRecord.signCount,
    });

    console.log(`✅ Assertion verified successfully!`);
    console.log(`   New Sign Count: ${result.signCount}`);

    // Step 5: 更新計數器
    console.log("\n📍 Step 5: 更新計數器");
    attestationRecord.signCount = result.signCount;

    const realPayload = JSON.parse(payloadData.toString('utf8'));
    console.log(`✅ Transfer completed! Amount: ${realPayload.amount}, To: ${realPayload.to}`);
    res.json({ success: true, message: "Transfer completed successfully" });

  } catch (error) {
    console.log(`❌ Assertion verification failed: ${error.message}`);
    res.status(401).json({ error: "Assertion verification failed", details: error.message });
  }
});

app.get("/attestations", (req, res) => {
  const attestationList = Array.from(attestations.keys()).map((keyId) => {
    const att = attestations.get(keyId);
    return {
      keyId,
      signCount: att.signCount,
      registeredAt: att.registeredAt,
      publicKeyPreview: att.publicKey.substring(0, 50) + "..."
    };
  });
  res.json({ attestations: attestationList });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║      iOS App Attestation Server (node-app-attest)             ║
╚═══════════════════════════════════════════════════════════════╝
Server running at: http://localhost:${PORT}

Available Endpoints:
• GET  /challenge         - 取得新的 challenge
• POST /register          - 設備註冊 Attestation
• POST /transfer          - 敏感操作 Assertion
• GET  /attestations      - 查看已註冊設備
`);
});
