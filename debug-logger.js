(function () {
  const STORAGE_KEY = "personalWebDebugLogV1";
  const SESSION_KEY = "personalWebDebugSessionIdV1";
  const MAX_ENTRIES = 500;
  const MAX_DETAIL_LENGTH = 1200;
  const REDACTED = "[REDACTED]";
  const DATA_URL_REDACTED = "[DATA_URL_REDACTED]";
  const sensitivePattern = /password|token|session|csrf|cookie|authorization|database_url|secret|jwt|key/i;

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
    if (sensitivePattern.test(key)) {
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
      return value.slice(0, 60).map((item) => sanitize(item, key));
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

  const writeEntries = (entries) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch (error) {
      console.warn("[debug] Failed to write local debug log", error);
    }
  };

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

  const exportLogs = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionId,
      userAgent: navigator.userAgent,
      location: window.location.href,
      entries: readEntries()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `personal-web-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.local-debug.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    log("info", "debug.exported", { entryCount: payload.entries.length });
  };

  const clear = () => {
    writeEntries([]);
    log("info", "debug.cleared");
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
    log("info", "debug.sent_to_backend", { entryCount: payload.entries.length });
    return response.json();
  };

  window.PersonalWebDebug = {
    clear,
    entries: readEntries,
    exportLogs,
    log,
    sanitize,
    sendToBackend,
    sessionId
  };

  log("info", "debug.logger.ready", { storageKey: STORAGE_KEY, maxEntries: MAX_ENTRIES });
})();
