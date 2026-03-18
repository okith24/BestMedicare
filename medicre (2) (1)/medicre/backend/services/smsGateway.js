const { URL, URLSearchParams } = require("url");

const DEFAULT_SMS_API_URL = "https://app.notify.lk/api/v1/send";

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function parseBoolean(value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function parseExtraParams() {
  const raw = env("SMS_EXTRA_PARAMS");
  if (!raw) return [];
  return raw
    .split("&")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [key, ...rest] = pair.split("=");
      return [decodeURIComponent(String(key || "")), decodeURIComponent(rest.join("=") || "")];
    })
    .filter(([key]) => key);
}

function normalizePhoneNumber(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";

  let normalized = raw.replace(/[^\d+]/g, "");
  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  if (normalized.startsWith("0") && normalized.length === 10) {
    normalized = `94${normalized.slice(1)}`;
  }

  return normalized.replace(/\D/g, "");
}

function isSmsGatewayConfigured() {
  const enabled = parseBoolean(process.env.SMS_ENABLED, true);
  const apiUrl = env("SMS_API_URL", DEFAULT_SMS_API_URL);
  const userId = env("SMS_USER_ID", env("SMS_USERID"));
  const apiKey = env("SMS_API_KEY");
  return Boolean(enabled && apiUrl && userId && apiKey);
}

async function sendSms({ to, message }) {
  if (!isSmsGatewayConfigured()) {
    throw new Error("SMS gateway is not configured");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this Node.js runtime");
  }

  const destination = normalizePhoneNumber(to);
  const text = String(message || "").trim();

  if (!destination) {
    throw new Error("SMS destination phone number is required");
  }
  if (!text) {
    throw new Error("SMS message is required");
  }

  const apiUrl = env("SMS_API_URL", DEFAULT_SMS_API_URL);
  const userId = env("SMS_USER_ID", env("SMS_USERID"));
  const apiKey = env("SMS_API_KEY");
  const senderId = env("SMS_SENDER_ID", "NotifyDEMO");
  const userParam = env("SMS_USER_PARAM", "user_id");
  const keyParam = env("SMS_KEY_PARAM", "api_key");
  const senderParam = env("SMS_SENDER_PARAM", "sender_id");
  const toParam = env("SMS_TO_PARAM", "to");
  const messageParam = env("SMS_MESSAGE_PARAM", "message");
  const method = env("SMS_METHOD", "POST").toUpperCase() === "GET" ? "GET" : "POST";
  const timeoutMs = Math.max(1000, Number(process.env.SMS_TIMEOUT_MS || 10000));

  const params = new URLSearchParams();
  params.set(userParam, userId);
  params.set(keyParam, apiKey);
  params.set(senderParam, senderId);
  params.set(toParam, destination);
  params.set(messageParam, text);

  for (const [key, value] of parseExtraParams()) {
    if (!params.has(key)) params.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let requestUrl = apiUrl;
    const requestInit = {
      method,
      signal: controller.signal,
      headers: {}
    };

    if (method === "GET") {
      const target = new URL(apiUrl);
      params.forEach((value, key) => target.searchParams.append(key, value));
      requestUrl = target.toString();
    } else {
      requestInit.headers["Content-Type"] = "application/x-www-form-urlencoded";
      requestInit.body = params.toString();
    }

    const response = await fetch(requestUrl, requestInit);
    const responseBody = await response.text();

    let providerPayload = null;
    try {
      providerPayload = JSON.parse(responseBody);
    } catch {
      providerPayload = null;
    }

    if (!response.ok) {
      const providerError =
        providerPayload?.errors
        || providerPayload?.message
        || providerPayload?.error
        || responseBody;
      throw new Error(`SMS request failed with status ${response.status}: ${providerError}`);
    }

    if (providerPayload && Object.prototype.hasOwnProperty.call(providerPayload, "status")) {
      const providerStatus = String(providerPayload.status || "").toLowerCase();
      if (!["success", "ok", "queued"].includes(providerStatus)) {
        const providerError = providerPayload?.message || providerPayload?.data || providerPayload?.error || providerPayload.status;
        throw new Error(`SMS provider error: ${providerError}`);
      }
    }

    return {
      ok: true,
      status: response.status,
      responseBody,
      providerPayload
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  normalizePhoneNumber,
  isSmsGatewayConfigured,
  sendSms
};

