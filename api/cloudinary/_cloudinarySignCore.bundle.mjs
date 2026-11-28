// server/cloudinarySignCore.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var ALLOWED_IMAGE_MIMES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);
var BOOTSTRAPPED_ADMIN_EMAIL = "emadkhalid277@gmail.com";
var GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var MAX_JSON_BODY_BYTES = 64 * 1024;
var cachedFirebaseConfig = null;
function loadFirebaseConfig() {
  if (cachedFirebaseConfig) {
    return cachedFirebaseConfig;
  }
  const candidates = [
    path.resolve(process.cwd(), "firebase-applet-config.json"),
    path.resolve(import.meta.dirname, "..", "firebase-applet-config.json"),
    path.resolve(import.meta.dirname, "..", "..", "firebase-applet-config.json")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, "utf8");
      cachedFirebaseConfig = JSON.parse(raw);
      return cachedFirebaseConfig;
    }
  }
  const envProjectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "").trim();
  if (envProjectId) {
    cachedFirebaseConfig = {
      projectId: envProjectId,
      apiKey: (process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "").trim(),
      firestoreDatabaseId: (process.env.FIRESTORE_DATABASE_ID || "").trim()
    };
    return cachedFirebaseConfig;
  }
  throw new Error("Missing firebase-applet-config.json on server");
}
var cachedCerts = null;
async function getGooglePublicCerts() {
  const now = Date.now();
  if (cachedCerts && now < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public certificates (HTTP ${res.status})`);
  }
  const certs = await res.json();
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = {
    certs,
    expiresAt: now + Math.max(60, maxAgeSeconds - 60) * 1e3
  };
  return certs;
}
function decodeBase64UrlJson(segment) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - normalized.length % 4) % 4;
  const padded = normalized + "=".repeat(padLen);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}
function verifyTokenWithCert(headerB64, payloadB64, signatureB64, payload, certPem) {
  const firebaseConfig = loadFirebaseConfig();
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const normalizedSig = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
  const sigBuffer = Buffer.from(
    normalizedSig + "=".repeat((4 - normalizedSig.length % 4) % 4),
    "base64"
  );
  if (!verifier.verify(certPem, sigBuffer)) {
    throw new Error("Invalid Firebase token signature");
  }
  const nowSec = Math.floor(Date.now() / 1e3);
  const expectedIss = `https://securetoken.google.com/${firebaseConfig.projectId}`;
  if (payload.aud !== firebaseConfig.projectId || payload.iss !== expectedIss) {
    throw new Error("Firebase token audience or issuer mismatch");
  }
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
    throw new Error("Firebase token missing valid subject");
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error("Firebase token expired");
  }
  if (payload.iat && payload.iat > nowSec + 300) {
    throw new Error("Firebase token issued in the future");
  }
  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
    emailVerified: payload.email_verified === true
  };
}
async function verifyFirebaseIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed Firebase ID token");
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson(headerB64);
  const payload = decodeBase64UrlJson(payloadB64);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported Firebase token header");
  }
  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    cachedCerts = null;
    const freshCerts = await getGooglePublicCerts();
    if (!freshCerts[header.kid]) {
      throw new Error("Unknown Firebase token signing key");
    }
    return verifyTokenWithCert(headerB64, payloadB64, signatureB64, payload, freshCerts[header.kid]);
  }
  return verifyTokenWithCert(headerB64, payloadB64, signatureB64, payload, certPem);
}
async function checkIsAdminUser(user, idToken) {
  if (user.email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  if (!user.emailVerified) {
    return false;
  }
  const firebaseConfig = loadFirebaseConfig();
  const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)" ? firebaseConfig.firestoreDatabaseId : "(default)";
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(user.uid)}`;
  try {
    const res = await fetch(docUrl, {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });
    return res.ok;
  } catch {
    return false;
  }
}
var signRateLimitMap = /* @__PURE__ */ new Map();
function isRateLimited(uid) {
  const now = Date.now();
  const windowMs = 6e4;
  const recent = (signRateLimitMap.get(uid) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= 25) {
    signRateLimitMap.set(uid, recent);
    return true;
  }
  recent.push(now);
  signRateLimitMap.set(uid, recent);
  return false;
}
function sanitizeSegment(raw, fallback, maxLen = 64) {
  const str = typeof raw === "string" ? raw.trim() : "";
  const cleaned = str.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || fallback).slice(0, maxLen);
}
function getCloudinaryCredentials() {
  return {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || "").trim()
  };
}
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
async function readJsonBody(req) {
  if (req.body !== void 0 && req.body !== null) {
    if (typeof req.body === "string") {
      if (!req.body.trim()) return {};
      const parsed2 = JSON.parse(req.body);
      return parsed2 && typeof parsed2 === "object" ? parsed2 : {};
    }
    if (Buffer.isBuffer(req.body)) {
      const text = req.body.toString("utf8").trim();
      if (!text) return {};
      const parsed2 = JSON.parse(text);
      return parsed2 && typeof parsed2 === "object" ? parsed2 : {};
    }
    if (typeof req.body === "object") {
      return req.body;
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_JSON_BODY_BYTES) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}
function getQueryParam(req, key) {
  if (req.query && key in req.query) {
    const val = req.query[key];
    return Array.isArray(val) ? String(val[0] || "") : String(val || "");
  }
  try {
    const parsed = new URL(req.url || "/", "http://localhost");
    return parsed.searchParams.get(key) || "";
  } catch {
    return "";
  }
}
async function handleCloudinaryHealthRequest(req, res) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, {
      code: "method/not-allowed",
      error: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0627\u0631. \u0627\u0633\u062A\u062E\u062F\u0645 GET."
    });
    return;
  }
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  const configured = Boolean(cloudName && apiKey && apiSecret);
  const payload = {
    configured,
    hasCloudName: Boolean(cloudName),
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret)
  };
  if (getQueryParam(req, "verify") === "1" && configured) {
    try {
      const authHeader = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const pingRes = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/ping`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${authHeader}`
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeout);
      const pingBody = await pingRes.json().catch(() => ({}));
      payload.connectionVerified = pingRes.ok && pingBody.status === "ok";
      payload.cloudinaryStatus = pingRes.status;
      if (!pingRes.ok) {
        payload.connectionError = pingBody?.error?.message || `Cloudinary ping HTTP ${pingRes.status}`;
      }
    } catch (err) {
      payload.connectionVerified = false;
      payload.connectionError = err instanceof Error ? err.message : "Cloudinary ping failed";
    }
  }
  sendJson(res, 200, payload);
}
async function handleCloudinarySignRequest(req, res) {
  if ((req.method || "").toUpperCase() !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, {
      code: "method/not-allowed",
      error: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629 \u0644\u0645\u0633\u0627\u0631 \u062A\u0648\u0642\u064A\u0639 \u0627\u0644\u0631\u0641\u0639. \u064A\u062C\u0628 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 POST."
    });
    return;
  }
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  if (!cloudName || !apiKey || !apiSecret) {
    sendJson(res, 503, {
      code: "cloudinary/not-configured",
      error: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A Cloudinary \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645. \u064A\u0631\u062C\u0649 \u0625\u0636\u0627\u0641\u0629 CLOUDINARY_CLOUD_NAME \u0648CLOUDINARY_API_KEY \u0648CLOUDINARY_API_SECRET \u0641\u064A \u0645\u062A\u063A\u064A\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629 \u0627\u0644\u0622\u0645\u0646\u0629."
    });
    return;
  }
  const rawAuth = req.headers.authorization;
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] || "" : rawAuth || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) {
    sendJson(res, 401, {
      code: "auth/missing-token",
      error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0628\u0637\u0644\u0628 \u062A\u0648\u0642\u064A\u0639 \u0627\u0644\u0631\u0641\u0639. \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648\u0644\u064B\u0627."
    });
    return;
  }
  const idToken = tokenMatch[1].trim();
  let verifiedUser;
  try {
    verifiedUser = await verifyFirebaseIdToken(idToken);
  } catch (authErr) {
    console.error("[NIZAL Cloudinary Sign Auth Error]", authErr);
    sendJson(res, 401, {
      code: "auth/invalid-token",
      error: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u062C\u0644\u0633\u0629 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648 \u0623\u0646 \u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D. \u064A\u0631\u062C\u0649 \u0625\u0639\u0627\u062F\u0629 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644."
    });
    return;
  }
  if (isRateLimited(verifiedUser.uid)) {
    sendJson(res, 429, {
      code: "cloudinary/rate-limited",
      error: "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0624\u0642\u062A \u0644\u0637\u0644\u0628\u0627\u062A \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631. \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u062F\u0642\u064A\u0642\u0629 \u062B\u0645 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629."
    });
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (parseErr) {
    const isTooLarge = parseErr instanceof Error && parseErr.message === "PAYLOAD_TOO_LARGE";
    sendJson(res, isTooLarge ? 413 : 400, {
      code: isTooLarge ? "cloudinary/payload-too-large" : "cloudinary/invalid-json",
      error: isTooLarge ? "\u0628\u064A\u0627\u0646\u0627\u062A \u0637\u0644\u0628 \u0627\u0644\u062A\u0648\u0642\u064A\u0639 \u062A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647." : "\u0635\u064A\u063A\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0637\u0644\u0628 \u0627\u0644\u062A\u0648\u0642\u064A\u0639 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629."
    });
    return;
  }
  const scope = body.scope === "admin_question" ? "admin_question" : body.scope === "admin_category" ? "admin_category" : body.scope === "user_question" ? "user_question" : null;
  if (!scope) {
    sendJson(res, 400, {
      code: "cloudinary/invalid-scope",
      error: "\u0646\u0637\u0627\u0642 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D."
    });
    return;
  }
  if (scope === "admin_question" || scope === "admin_category") {
    const isAdmin = await checkIsAdminUser(verifiedUser, idToken);
    if (!isAdmin) {
      sendJson(res, 403, {
        code: "auth/forbidden",
        error: "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0645\u062A\u0627\u062D \u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0634\u0631\u0641 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0641\u0642\u0637."
      });
      return;
    }
  }
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const fileSize = Number(body.fileSize);
  if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
    sendJson(res, 400, {
      code: "cloudinary/invalid-format",
      error: "\u0635\u064A\u063A\u0629 \u0627\u0644\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629. \u0627\u0644\u0635\u064A\u063A \u0627\u0644\u0645\u0633\u0645\u0648\u062D\u0629 \u0647\u064A JPG \u0648PNG \u0648WEBP \u0641\u0642\u0637."
    });
    return;
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_BYTES) {
    sendJson(res, 400, {
      code: "cloudinary/invalid-size",
      error: "\u062D\u062C\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631 \u0648\u0644\u0627 \u064A\u062A\u062C\u0627\u0648\u0632 5 \u0645\u064A\u062C\u0627\u0628\u0627\u064A\u062A."
    });
    return;
  }
  const folder = scope === "admin_question" ? `nizal/questions/${sanitizeSegment(body.folderHint, "general")}` : scope === "admin_category" ? `nizal/categories/${sanitizeSegment(body.folderHint, "subcategories")}` : `nizal/user-questions/${sanitizeSegment(verifiedUser.uid, "user", 128)}`;
  const prefix = scope === "admin_question" ? sanitizeSegment(body.questionIdHint, "q") : scope === "admin_category" ? sanitizeSegment(body.questionIdHint, "cat") : "uq";
  const publicId = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const timestamp = Math.floor(Date.now() / 1e3);
  const allowedFormats = "jpg,jpeg,png,webp";
  const paramsToSign = {
    allowed_formats: allowedFormats,
    folder,
    public_id: publicId,
    timestamp
  };
  const stringToSign = Object.keys(paramsToSign).sort().map((key) => `${key}=${paramsToSign[key]}`).join("&");
  const signature = crypto.createHash("sha1").update(`${stringToSign}${apiSecret}`).digest("hex");
  sendJson(res, 200, {
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder,
    publicId,
    allowedFormats
  });
}
export {
  ALLOWED_IMAGE_MIMES,
  BOOTSTRAPPED_ADMIN_EMAIL,
  MAX_IMAGE_BYTES,
  checkIsAdminUser,
  getCloudinaryCredentials,
  handleCloudinaryHealthRequest,
  handleCloudinarySignRequest,
  loadFirebaseConfig,
  verifyFirebaseIdToken
};
