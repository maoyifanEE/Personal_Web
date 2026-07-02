(function () {
  const STORAGE_KEY = "personalWebDebugLogV1";
  const SESSION_KEY = "personalWebDebugSessionIdV1";
  const MAX_ENTRIES = 2000;
  const MAX_STORAGE_CHARS = 1_000_000;
  const MAX_DETAIL_LENGTH = 1200;
  const REDACTED = "[REDACTED]";
  const DATA_URL_REDACTED = "[DATA_URL_REDACTED]";

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
    if (!normalized) {
      return false;
    }
    return (
      exactSensitiveKeys.has(normalized) ||
      normalized.endsWith("password") ||
      normalized.endsWith("token") ||
      normalized.includes("secret")
    );
  };

  const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const getSessionId = () => {
    try {
      const existing = window.sessionStorage.getItem(SESSION_KEY);
      if (existing) {
        return existing;
      }
      const next = makeId("debug-session");
      window.sessionStorage.setItem(SESSION_KEY, next);
      return next;
    } catch (error) {
      return makeId("debug-session");
    }
  };

  const page = document.body?.dataset?.page || window.location.pathname || "unknown";
  const sessionId = getSessionId();

  const sanitize = (value, key = "") => {
    if (isSensitiveKey(key)) {
      return REDACTED;
    }
    if (typeof value === "string") {
      if (value.trim().toLowerCase().startsWith("data:")) {
        return `${DATA_URL_REDACTED} length=${value.length}`;
      }
      if (value.length > MAX_DETAIL_LENGTH) {
        return `${value.slice(0, MAX_DETAIL_LENGTH)}...[truncated ${value.length}]`;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 120).map((item) => sanitize(item, key));
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

  const readEntries = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("[debug] Failed to read local debug log", error);
      return [];
    }
  };

  const trimEntries = (entries) => {
    const output = entries.slice(-MAX_ENTRIES);
    let encoded = JSON.stringify(output);
    while (output.length > 0 && encoded.length > MAX_STORAGE_CHARS) {
      output.shift();
      encoded = JSON.stringify(output);
    }
    return output;
  };

  const writeEntries = (entries) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimEntries(entries)));
    } catch (error) {
      console.warn("[debug] Failed to write local debug log", error);
    }
  };

  const getLogs = () => readEntries();

  const log = (level, event, details = {}) => {
    const entry = {
      id: makeId("debug"),
      timestamp: new Date().toISOString(),
      level,
      event,
      page,
      path: window.location.pathname + window.location.search,
      sessionId,
      details: sanitize(details)
    };
    const entries = readEntries();
    entries.push(entry);
    writeEntries(entries);
    const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[consoleMethod](`[PersonalWebDebug] ${event}`, entry.details);
    return entry;
  };

  const info = (event, details = {}) => log("info", event, details);
  const warn = (event, details = {}) => log("warn", event, details);
  const error = (event, details = {}) => log("error", event, details);

  const clearLogs = () => {
    const count = readEntries().length;
    writeEntries([]);
    return count;
  };

  const snapshot = () => {
    const logs = readEntries();
    const raw = window.localStorage.getItem(STORAGE_KEY) || "";
    return sanitize({
      sessionId,
      page,
      path: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      logCount: logs.length,
      localStorageDebugSize: raw.length
    });
  };

  const downloadText = (text, filename, type) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const timestampForFile = () => new Date().toISOString().replace(/[:.]/g, "-");

  const exportLogs = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      snapshot: snapshot(),
      entries: readEntries()
    };
    downloadText(
      JSON.stringify(payload, null, 2),
      `personal-web-debug-${timestampForFile()}.local-debug.json`,
      "application/json"
    );
    info("debug.exported_json", { entryCount: payload.entries.length });
  };

  const exportTextSummary = () => {
    const currentSnapshot = snapshot();
    const logs = readEntries();
    const lines = [
      "Personal_Web Local Debug Summary",
      "================================",
      `Exported at: ${new Date().toISOString()}`,
      `Session: ${currentSnapshot.sessionId}`,
      `Page: ${currentSnapshot.page}`,
      `Path: ${currentSnapshot.path}`,
      `Viewport: ${currentSnapshot.viewport.width}x${currentSnapshot.viewport.height}`,
      `Log count: ${currentSnapshot.logCount}`,
      "",
      "Recent entries:",
      ...logs.slice(-120).map((entry) =>
        `${entry.timestamp} [${entry.level}] ${entry.event} ${JSON.stringify(entry.details)}`
      )
    ];
    downloadText(
      lines.join("\n"),
      `personal-web-debug-${timestampForFile()}_summary.local-debug.txt`,
      "text/plain"
    );
    info("debug.exported_text_summary", { entryCount: logs.length });
  };

  const sendToBackend = async (extra = {}) => {
    const apiBaseUrl = window.PersonalWebAuth?.apiBaseUrl || "http://127.0.0.1:8000/api";
    const payload = {
      sessionId,
      page,
      location: window.location.href,
      entries: readEntries(),
      extra: sanitize(extra)
    };
    const response = await fetch(`${apiBaseUrl}/debug/client-log`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Debug upload failed: ${response.status}`);
    }
    info("debug.sent_to_backend", { entryCount: payload.entries.length });
    return response.json();
  };

  window.PersonalWebDebug = {
    log,
    info,
    warn,
    error,
    getLogs,
    clearLogs,
    exportLogs,
    exportTextSummary,
    snapshot,
    sanitize,
    sendToBackend,
    sessionId,
    entries: getLogs,
    clear: clearLogs
  };

  info("debug.logger.ready", {
    storageKey: STORAGE_KEY,
    maxEntries: MAX_ENTRIES,
    maxStorageChars: MAX_STORAGE_CHARS
  });
})();
