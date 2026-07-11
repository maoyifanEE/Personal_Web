(function (global) {
  const RETENTION_DAYS = 7;
  const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const DEBUG_PAYLOAD_SCHEMA_VERSION = "personal-web-debug-payload-v2";
  const DEBUG_LOGGER_VERSION = "2026-07-11-debug-v4";
  const REDACTED = "[REDACTED]";
  const DATA_URL_REDACTED = "[DATA_URL_REDACTED]";
  const BODY_REDACTED = "[BODY_REDACTED]";
  const MAX_DETAIL_LENGTH = 8000;

  const exactSensitiveKeys = new Set([
    "password",
    "oldpassword",
    "newpassword",
    "confirmpassword",
    "token",
    "accesstoken",
    "refreshtoken",
    "sessiontoken",
    "sessiontokenhash",
    "csrf",
    "csrftoken",
    "cookie",
    "setcookie",
    "authorization",
    "databaseurl",
    "secret",
    "sessionsecret"
  ]);

  const normalizeKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const isSensitiveKey = (key) => {
    const normalized = normalizeKey(key);
    return Boolean(
      normalized &&
      (
        exactSensitiveKeys.has(normalized) ||
        normalized.endsWith("password") ||
        normalized.endsWith("token") ||
        normalized.includes("secret")
      )
    );
  };

  const cutoffTimestamp = (now = Date.now(), retentionMs = RETENTION_MS) =>
    new Date(now - retentionMs).toISOString();

  const timestampMs = (entry) => {
    const parsed = Date.parse(entry?.timestamp || "");
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const pruneEntriesByAge = (entries, now = Date.now(), retentionMs = RETENTION_MS) => {
    const cutoff = now - retentionMs;
    return entries.filter((entry) => timestampMs(entry) >= cutoff);
  };

  const estimatedBytes = (entries) => {
    try {
      return JSON.stringify(entries).length;
    } catch (error) {
      return entries.length * 2048;
    }
  };

  const emergencyTrimEntries = (entries, options = {}) => {
    const maxEntries = options.maxEntries || 100000;
    const maxBytes = options.maxBytes || 50 * 1024 * 1024;
    const sorted = [...entries].sort((a, b) => timestampMs(a) - timestampMs(b));
    const before = {
      entries: sorted.length,
      bytes: estimatedBytes(sorted)
    };
    let output = sorted;
    while (output.length > maxEntries) {
      output.shift();
    }
    let bytes = estimatedBytes(output);
    while (output.length > 0 && bytes > maxBytes) {
      output.shift();
      bytes = estimatedBytes(output);
    }
    return {
      entries: output,
      trimmed: output.length !== before.entries,
      entriesBefore: before.entries,
      entriesAfter: output.length,
      estimatedBytesBefore: before.bytes,
      estimatedBytesAfter: bytes,
      reason: before.entries > maxEntries ? "max_entries" : "max_bytes"
    };
  };

  const sanitizeString = (value) => {
    if (value.trim().toLowerCase().startsWith("data:")) {
      return `${DATA_URL_REDACTED} length=${value.length}`;
    }
    if (value.startsWith("blob:")) {
      return "[BLOB_URL_REDACTED]";
    }
    if (value.length > MAX_DETAIL_LENGTH) {
      return `${value.slice(0, MAX_DETAIL_LENGTH)}...[truncated ${value.length}]`;
    }
    return value;
  };

  const sanitize = (value, key = "") => {
    if (isSensitiveKey(key)) {
      return REDACTED;
    }
    const normalized = normalizeKey(key);
    if (["body", "requestbody", "responsebody", "filecontent", "imagebytes"].includes(normalized)) {
      return BODY_REDACTED;
    }
    if (typeof value === "string") {
      return sanitizeString(value);
    }
    if (Array.isArray(value)) {
      return value.slice(0, 500).map((item) => sanitize(item, key));
    }
    if (value && typeof value === "object") {
      const output = {};
      Object.entries(value).forEach(([entryKey, entryValue]) => {
        output[entryKey] = sanitize(entryValue, entryKey);
      });
      return output;
    }
    return value;
  };

  const safeUrlParts = (inputUrl, baseUrl = "http://localhost/") => {
    try {
      const url = new URL(String(inputUrl || ""), baseUrl);
      const redactedSearch = [];
      url.searchParams.forEach((value, key) => {
        redactedSearch.push(`${encodeURIComponent(key)}=${isSensitiveKey(key) ? REDACTED : "[VALUE]"}`);
      });
      return {
        origin: url.origin,
        path: url.pathname,
        queryKeys: Array.from(url.searchParams.keys()),
        safeSearch: redactedSearch.length ? `?${redactedSearch.join("&")}` : "",
        sameOrigin: url.origin === new URL(baseUrl).origin
      };
    } catch (error) {
      return {
        origin: "",
        path: "[INVALID_URL]",
        queryKeys: [],
        safeSearch: "",
        sameOrigin: false
      };
    }
  };

  const safeLabel = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 80);

  const summarizeTarget = (target) => {
    const dataset = {};
    Object.entries(target?.dataset || {}).forEach(([key, value]) => {
      if (/action|tool|sticker|node|debug|file|setting/i.test(key)) {
        dataset[key] = sanitize(value, key);
      }
    });
    return {
      tag: target?.tagName?.toLowerCase?.() || "",
      id: target?.id || "",
      className: typeof target?.className === "string" ? target.className.slice(0, 180) : "",
      role: target?.getAttribute?.("role") || "",
      ariaLabel: safeLabel(target?.getAttribute?.("aria-label")),
      label: safeLabel(target?.innerText || target?.textContent),
      dataset
    };
  };

  const isInteractiveTarget = (target) =>
    Boolean(
      target?.closest?.(
        "button,a,[role='button'],[data-action],[data-sticker-action]," +
          "[data-node-action],[data-tool],[data-debug-action],[data-file-input]"
      )
    );

  const validateDebugBundlePayload = (payload) => {
    const errors = [];
    const entries = Array.isArray(payload?.entries) ? payload.entries : null;
    if (!payload || typeof payload !== "object") {
      errors.push("payload_missing");
    }
    if (payload?.schemaVersion !== DEBUG_PAYLOAD_SCHEMA_VERSION) {
      errors.push("schemaVersion");
    }
    if (payload?.loggerVersion !== DEBUG_LOGGER_VERSION) {
      errors.push("loggerVersion");
    }
    if (payload?.retentionDays !== RETENTION_DAYS) {
      errors.push("retentionDays");
    }
    if (!payload?.cutoffTimestamp) {
      errors.push("cutoffTimestamp");
    }
    if (typeof payload?.entryCount !== "number") {
      errors.push("entryCount");
    }
    if (!["indexeddb", "localStorage"].includes(payload?.storageBackend)) {
      errors.push("storageBackend");
    }
    if (typeof payload?.complete !== "boolean") {
      errors.push("complete");
    }
    if (typeof payload?.degraded !== "boolean") {
      errors.push("degraded");
    }
    if (!Array.isArray(payload?.omissions)) {
      errors.push("omissions");
    }
    if (!entries) {
      errors.push("entries");
    } else if (payload?.entryCount !== entries.length) {
      errors.push("entryCount_mismatch");
    }
    if (entries && entries.length > 0 && !payload?.oldestTimestamp) {
      errors.push("oldestTimestamp");
    }
    if (entries && entries.length > 0 && !payload?.newestTimestamp) {
      errors.push("newestTimestamp");
    }
    return {
      ok: errors.length === 0,
      errors
    };
  };

  const api = {
    RETENTION_DAYS,
    RETENTION_MS,
    DEBUG_PAYLOAD_SCHEMA_VERSION,
    DEBUG_LOGGER_VERSION,
    REDACTED,
    DATA_URL_REDACTED,
    BODY_REDACTED,
    normalizeKey,
    isSensitiveKey,
    cutoffTimestamp,
    pruneEntriesByAge,
    emergencyTrimEntries,
    estimatedBytes,
    sanitize,
    safeUrlParts,
    summarizeTarget,
    isInteractiveTarget,
    validateDebugBundlePayload
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.PersonalWebDebugCore = api;
})(typeof window !== "undefined" ? window : globalThis);
