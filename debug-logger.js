(function () {
  const core = window.PersonalWebDebugCore;
  const LEGACY_STORAGE_KEY = "personalWebDebugLogV1";
  const FALLBACK_STORAGE_KEY = "personalWebDebugLogV2Fallback";
  const SESSION_KEY = "personalWebDebugSessionIdV1";
  const DB_NAME = "personalWebDebugV2";
  const STORE_NAME = "entries";
  const DB_VERSION = 1;
  const RECENT_CACHE_LIMIT = 1000;
  const RECENT_RENDER_LIMIT = 500;
  const MAX_EMERGENCY_ENTRIES = 100000;
  const MAX_EMERGENCY_BYTES = 50 * 1024 * 1024;
  const PRUNE_INTERVAL_MS = 15 * 60 * 1000;
  const PRUNE_WRITE_INTERVAL = 250;

  let dbPromise = null;
  let storageBackend = "indexeddb";
  let degraded = false;
  let omitted = [];
  let recentEntries = [];
  let lastPruneAt = 0;
  let writesSincePrune = 0;
  let fetchWrapped = false;
  let captureInstalled = false;

  const makeId = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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
  const isLocalDevelopmentHost = () => ["127.0.0.1", "localhost"].includes(window.location.hostname);

  const sanitize = (value, key = "") => core.sanitize(value, key);

  const nowIso = () => new Date().toISOString();

  const createEntry = (level, event, details = {}) => ({
    id: makeId("debug"),
    timestamp: nowIso(),
    level,
    event,
    page,
    path: window.location.pathname + window.location.search,
    sessionId,
    details: sanitize(details)
  });

  const updateRecentCache = (entry) => {
    recentEntries.push(entry);
    if (recentEntries.length > RECENT_CACHE_LIMIT) {
      recentEntries = recentEntries.slice(-RECENT_CACHE_LIMIT);
    }
  };

  const openDatabase = () => {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
          store.createIndex("sessionId", "sessionId", { unique: false });
          store.createIndex("event", "event", { unique: false });
          store.createIndex("page", "page", { unique: false });
          store.createIndex("level", "level", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    }).catch((error) => {
      storageBackend = "localStorage";
      degraded = true;
      omitted.push({
        reason: "indexeddb_unavailable",
        message: error.message,
        timestamp: nowIso()
      });
      dbPromise = null;
      return null;
    });
    return dbPromise;
  };

  const idbRequest = async (mode, callback) => {
    const db = await openDatabase();
    if (!db) {
      return null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try {
        result = callback(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  };

  const requestToPromise = (request) =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });

  const readFallbackEntries = () => {
    try {
      const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  };

  const writeFallbackEntries = (entries) => {
    try {
      const pruned = core.pruneEntriesByAge(entries);
      const trimmed = core.emergencyTrimEntries(pruned, {
        maxEntries: MAX_EMERGENCY_ENTRIES,
        maxBytes: MAX_EMERGENCY_BYTES
      });
      window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(trimmed.entries));
      if (trimmed.trimmed) {
        omitted.push({
          reason: "fallback_emergency_trim",
          entriesBefore: trimmed.entriesBefore,
          entriesAfter: trimmed.entriesAfter,
          timestamp: nowIso()
        });
      }
    } catch (error) {
      degraded = true;
      omitted.push({
        reason: "fallback_write_failed",
        message: error.message,
        timestamp: nowIso()
      });
    }
  };

  const putIndexedDbEntry = async (entry) => {
    const db = await openDatabase();
    if (!db) {
      const entries = readFallbackEntries();
      entries.push(entry);
      writeFallbackEntries(entries);
      return;
    }
    await idbRequest("readwrite", (store) => {
      store.put(entry);
    });
  };

  const getAllIndexedDbEntries = async () => {
    const db = await openDatabase();
    if (!db) {
      return readFallbackEntries();
    }
    return idbRequest("readonly", (store) => requestToPromise(store.getAll()));
  };

  const deleteIndexedDbEntries = async (ids) => {
    if (!ids.length) {
      return 0;
    }
    const db = await openDatabase();
    if (!db) {
      return 0;
    }
    await idbRequest("readwrite", (store) => {
      ids.forEach((id) => store.delete(id));
    });
    return ids.length;
  };

  const pruneExpiredLogs = async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastPruneAt < PRUNE_INTERVAL_MS && writesSincePrune < PRUNE_WRITE_INTERVAL) {
      return { skipped: true };
    }
    lastPruneAt = now;
    writesSincePrune = 0;
    const entries = await getAllIndexedDbEntries();
    const retained = core.pruneEntriesByAge(entries, now);
    const retainedIds = new Set(retained.map((entry) => entry.id));
    const expiredIds = entries.filter((entry) => !retainedIds.has(entry.id)).map((entry) => entry.id);

    if (storageBackend === "indexeddb") {
      await deleteIndexedDbEntries(expiredIds);
    } else {
      writeFallbackEntries(retained);
    }

    const trimmed = core.emergencyTrimEntries(retained, {
      maxEntries: MAX_EMERGENCY_ENTRIES,
      maxBytes: MAX_EMERGENCY_BYTES
    });
    if (trimmed.trimmed) {
      const trimIds = retained
        .filter((entry) => !new Set(trimmed.entries.map((item) => item.id)).has(entry.id))
        .map((entry) => entry.id);
      if (storageBackend === "indexeddb") {
        await deleteIndexedDbEntries(trimIds);
      } else {
        writeFallbackEntries(trimmed.entries);
      }
      log("warn", "debug.retention.emergency_trim", {
        entriesBefore: trimmed.entriesBefore,
        entriesAfter: trimmed.entriesAfter,
        estimatedBytesBefore: trimmed.estimatedBytesBefore,
        estimatedBytesAfter: trimmed.estimatedBytesAfter,
        reason: trimmed.reason
      });
    }
    return {
      skipped: false,
      expiredDeleted: expiredIds.length,
      retained: trimmed.entries.length
    };
  };

  const migrateLegacyLocalStorage = async () => {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return { migrated: 0 };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      omitted.push({
        reason: "legacy_log_parse_failed",
        message: error.message,
        timestamp: nowIso()
      });
      return { migrated: 0 };
    }
    if (!Array.isArray(parsed)) {
      return { migrated: 0 };
    }
    const retained = core.pruneEntriesByAge(parsed).map((entry) => ({
      ...entry,
      id: entry.id || makeId("legacy-debug"),
      timestamp: entry.timestamp || nowIso(),
      sessionId: entry.sessionId || sessionId,
      page: entry.page || page,
      details: sanitize(entry.details || {})
    }));
    for (const entry of retained) {
      await putIndexedDbEntry(entry);
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return { migrated: retained.length };
  };

  const ready = async () => {
    await openDatabase();
    if (degraded) {
      log("warn", "debug.storage.indexeddb_unavailable", {
        storageBackend,
        degraded,
        omissions: omitted
      });
    }
    await migrateLegacyLocalStorage();
    await pruneExpiredLogs({ force: true });
    return getRetentionInfo();
  };

  const log = (level, event, details = {}) => {
    const entry = createEntry(level, event, details);
    updateRecentCache(entry);
    writesSincePrune += 1;
    putIndexedDbEntry(entry)
      .then(() => pruneExpiredLogs())
      .catch((error) => {
        degraded = true;
        omitted.push({
          reason: "persist_failed",
          message: error.message,
          timestamp: nowIso()
        });
      });
    const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[consoleMethod](`[PersonalWebDebug] ${event}`, entry.details);
    return entry;
  };

  const info = (event, details = {}) => log("info", event, details);
  const warn = (event, details = {}) => log("warn", event, details);
  const error = (event, details = {}) => log("error", event, details);

  const getLogsAsync = async (options = {}) => {
    await readyPromise;
    const entries = core.pruneEntriesByAge(await getAllIndexedDbEntries());
    entries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    if (options.limit) {
      return entries.slice(-options.limit);
    }
    return entries;
  };

  const getLogs = () => recentEntries.slice();

  const getRetentionInfo = async () => {
    const entries = core.pruneEntriesByAge(await getAllIndexedDbEntries());
    entries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    return {
      retentionDays: core.RETENTION_DAYS,
      cutoffTimestamp: core.cutoffTimestamp(),
      entryCount: entries.length,
      oldestTimestamp: entries[0]?.timestamp || null,
      newestTimestamp: entries[entries.length - 1]?.timestamp || null,
      storageBackend,
      degraded,
      omissions: omitted.slice()
    };
  };

  const clearLogs = async () => {
    const count = (await getAllIndexedDbEntries()).length;
    const db = await openDatabase();
    if (db) {
      await idbRequest("readwrite", (store) => {
        store.clear();
      });
    }
    window.localStorage.removeItem(FALLBACK_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    recentEntries = [];
    info("debug.logs_cleared", { clearedCount: count });
    return count;
  };

  const localStorageItemSummary = (key) => {
    try {
      const value = window.localStorage.getItem(key);
      return {
        exists: value !== null,
        size: value ? value.length : 0
      };
    } catch (storageError) {
      return {
        exists: false,
        size: 0,
        error: storageError.message
      };
    }
  };

  const snapshot = async () => {
    const retention = await getRetentionInfo();
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
      retention,
      localStorageFallbackSize: (window.localStorage.getItem(FALLBACK_STORAGE_KEY) || "").length
    });
  };

  const timestampForFile = () => new Date().toISOString().replace(/[:.]/g, "-");

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

  const exportLogs = async () => {
    const entries = await getLogsAsync();
    const payload = {
      exportedAt: nowIso(),
      retention: await getRetentionInfo(),
      snapshot: await snapshot(),
      entries
    };
    downloadText(
      JSON.stringify(payload, null, 2),
      `personal-web-debug-${timestampForFile()}.local-debug.json`,
      "application/json"
    );
    info("debug.exported_json", { entryCount: entries.length });
  };

  const exportTextSummary = async () => {
    const currentSnapshot = await snapshot();
    const logs = await getLogsAsync({ limit: RECENT_RENDER_LIMIT });
    const retention = currentSnapshot.retention;
    const lines = [
      "Personal_Web Local Debug Summary",
      "================================",
      `Exported at: ${nowIso()}`,
      `Session: ${currentSnapshot.sessionId}`,
      `Page: ${currentSnapshot.page}`,
      `Path: ${currentSnapshot.path}`,
      `Retention days: ${retention.retentionDays}`,
      `Storage: ${retention.storageBackend}`,
      `Retained entries: ${retention.entryCount}`,
      `Showing latest: ${logs.length}`,
      "",
      "Recent entries:",
      ...logs.map((entry) => `${entry.timestamp} [${entry.level}] ${entry.event} ${JSON.stringify(entry.details)}`)
    ];
    downloadText(
      lines.join("\n"),
      `personal-web-debug-${timestampForFile()}_summary.local-debug.txt`,
      "text/plain"
    );
    info("debug.exported_text_summary", { entryCount: retention.entryCount });
  };

  const collectBrowserBundlePayload = async (source = page) => {
    await readyPromise;
    await pruneExpiredLogs({ force: true });
    const entries = await getLogsAsync();
    const retention = await getRetentionInfo();
    return sanitize({
      sessionId,
      page: source,
      location: window.location.href,
      retentionDays: retention.retentionDays,
      cutoffTimestamp: retention.cutoffTimestamp,
      entryCount: entries.length,
      oldestTimestamp: retention.oldestTimestamp,
      newestTimestamp: retention.newestTimestamp,
      storageBackend: retention.storageBackend,
      degraded: retention.degraded,
      omissions: retention.omissions,
      complete: !retention.degraded && retention.omissions.length === 0,
      entries,
      snapshot: await snapshot(),
      clientSummary: {
        currentUrl: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        },
        userAgent: navigator.userAgent,
        localDebugLogCount: entries.length,
        journeyDrafts: {
          journeySketchCanvasStateV1: localStorageItemSummary("journeySketchCanvasStateV1"),
          journeyData: localStorageItemSummary("journeyData")
        }
      }
    });
  };

  const sendToBackend = async (extra = {}) => {
    const apiBaseUrl = window.PersonalWebAuth?.apiBaseUrl || "http://127.0.0.1:8000/api";
    const entries = await getLogsAsync();
    const payload = {
      sessionId,
      page,
      location: window.location.href,
      entries,
      extra: sanitize(extra),
      retention: await getRetentionInfo()
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

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const makeExportError = (message, category, cause) => {
    const exportError = new Error(message);
    exportError.category = category;
    if (cause) {
      exportError.cause = cause;
    }
    return exportError;
  };

  const exportFullDebugBundle = async ({ source = page, setStatus } = {}) => {
    const updateStatus = (message, isError = false) => {
      if (typeof setStatus === "function") {
        setStatus(message, isError);
      }
    };

    if (!isLocalDevelopmentHost()) {
      warn("debug.bundle_export.rejected_non_local", { source, host: window.location.hostname });
      updateStatus("完整调试包仅在本地开发模式可用。", true);
      throw makeExportError("Debug bundle export is available only on localhost.", "non_local_host");
    }

    info("debug.bundle_export.start", { source });
    updateStatus("正在生成完整调试包...");

    const apiBaseUrl = window.PersonalWebAuth?.apiBaseUrl || "http://127.0.0.1:8000/api";
    const payload = await collectBrowserBundlePayload(source);
    const requestPath = "/debug/export-bundle";
    let response;
    try {
      if (window.PersonalWebAuth?.authFetch) {
        response = await window.PersonalWebAuth.authFetch(requestPath, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${apiBaseUrl}${requestPath}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }
    } catch (fetchError) {
      warn("debug.bundle_export.backend_unavailable", {
        source,
        error: fetchError.message
      });
      updateStatus("后端不可用，无法导出完整调试包。", true);
      throw makeExportError("Debug backend is unavailable.", "backend_unavailable", fetchError);
    }

    if (!response.ok) {
      warn("debug.bundle_export.failure", {
        source,
        status: response.status
      });
      updateStatus(`完整调试包导出失败：${response.status}`, true);
      throw makeExportError(`Debug bundle export failed: ${response.status}`, "backend_rejected");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `personal-web-debug-${timestampForFile()}.local-debug.zip`;
    downloadBlob(blob, filename);
    info("debug.bundle_export.success", {
      source,
      filename,
      bytes: blob.size
    });
    updateStatus("调试包已下载。");
    return {
      ok: true,
      filename,
      bytes: blob.size
    };
  };

  const safeEventTarget = (event) => {
    const target = event.target?.closest?.(
      "button,a,[role='button'],[data-action],[data-sticker-action]," +
        "[data-node-action],[data-tool],[data-debug-action],[data-file-input],input,select,textarea"
    );
    return target || event.target;
  };

  const targetHierarchy = (target) => {
    const items = [];
    let node = target;
    while (node && node.nodeType === 1 && items.length < 5) {
      items.push({
        tag: node.tagName.toLowerCase(),
        id: node.id || "",
        className: typeof node.className === "string" ? node.className.slice(0, 100) : ""
      });
      node = node.parentElement;
    }
    return items;
  };

  const installInteractionCapture = () => {
    if (captureInstalled || !isLocalDevelopmentHost()) {
      return;
    }
    captureInstalled = true;

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!core.isInteractiveTarget(event.target)) {
          return;
        }
        const target = safeEventTarget(event);
        info("ui.control.pointerdown", {
          ...core.summarizeTarget(target),
          pointerType: event.pointerType,
          button: event.button,
          page,
          path: window.location.pathname + window.location.search,
          hierarchy: targetHierarchy(target)
        });
      },
      true
    );

    document.addEventListener(
      "click",
      (event) => {
        if (!core.isInteractiveTarget(event.target)) {
          return;
        }
        const target = safeEventTarget(event);
        info("ui.control.click", {
          ...core.summarizeTarget(target),
          defaultPrevented: event.defaultPrevented,
          eventPhase: event.eventPhase,
          disabled: Boolean(target.disabled || target.getAttribute?.("aria-disabled") === "true"),
          page,
          path: window.location.pathname + window.location.search,
          hierarchy: targetHierarchy(target)
        });
      },
      true
    );

    document.addEventListener(
      "change",
      (event) => {
        const target = event.target;
        if (!target || !["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
          return;
        }
        const details = {
          ...core.summarizeTarget(target),
          inputType: target.type || target.tagName.toLowerCase()
        };
        if (target.type === "checkbox" || target.type === "radio") {
          details.checked = Boolean(target.checked);
        } else if (target.type === "range" || target.dataset?.setting) {
          details.numericValue = Number(target.value);
        } else if (target.type === "file") {
          details.files = Array.from(target.files || []).map((file) => ({
            extension: file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "",
            type: file.type,
            size: file.size
          }));
        } else if (target.tagName === "SELECT") {
          details.selectedIndex = target.selectedIndex;
          details.value = target.value;
        }
        info("ui.input.change", details);
      },
      true
    );

    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        info("ui.form.submit", {
          tag: form?.tagName?.toLowerCase() || "",
          id: form?.id || "",
          className: typeof form?.className === "string" ? form.className.slice(0, 180) : "",
          actionPath: form?.action ? core.safeUrlParts(form.action, window.location.href).path : ""
        });
      },
      true
    );

    window.addEventListener("error", (event) => {
      if (event.target && event.target !== window) {
        const target = event.target;
        error("browser.resource_load_error", {
          tag: target.tagName?.toLowerCase() || "",
          id: target.id || "",
          className: typeof target.className === "string" ? target.className.slice(0, 120) : "",
          source: target.src || target.href || ""
        });
        return;
      }
      error("browser.error", {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
      });
    }, true);

    window.addEventListener("unhandledrejection", (event) => {
      error("browser.unhandled_rejection", {
        reason: event.reason?.message || String(event.reason || ""),
        stack: event.reason?.stack
      });
    });

    document.addEventListener("DOMContentLoaded", () => info("page.dom_ready", { page }));
    document.addEventListener("visibilitychange", () => {
      info("page.visibility_change", { visibilityState: document.visibilityState });
    });
    window.addEventListener("online", () => info("page.online"));
    window.addEventListener("offline", () => warn("page.offline"));
    window.addEventListener("pagehide", () => info("page.hide"));
  };

  const wrapFetch = () => {
    if (fetchWrapped || !isLocalDevelopmentHost() || typeof window.fetch !== "function") {
      return;
    }
    fetchWrapped = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const requestId = makeId("request");
      const method = String(init.method || input?.method || "GET").toUpperCase();
      const url = typeof input === "string" ? input : input?.url;
      const safeUrl = core.safeUrlParts(url, window.location.href);
      const startedAt = performance.now();
      info("network.fetch.start", {
        requestId,
        method,
        ...safeUrl,
        sameOriginOrLocalApi: safeUrl.sameOrigin || safeUrl.origin.includes("127.0.0.1")
      });
      try {
        const response = await originalFetch(input, init);
        info("network.fetch.complete", {
          requestId,
          method,
          ...safeUrl,
          status: response.status,
          ok: response.ok,
          durationMs: Math.round(performance.now() - startedAt),
          contentType: response.headers.get("Content-Type") || ""
        });
        return response;
      } catch (fetchError) {
        warn("network.fetch.failure", {
          requestId,
          method,
          ...safeUrl,
          durationMs: Math.round(performance.now() - startedAt),
          error: fetchError.message
        });
        throw fetchError;
      }
    };
  };

  const readyPromise = ready();

  window.PersonalWebDebug = {
    log,
    info,
    warn,
    error,
    ready: () => readyPromise,
    getLogs,
    getLogsAsync,
    getRetentionInfo,
    pruneExpiredLogs,
    clearLogs,
    exportLogs,
    exportTextSummary,
    exportFullDebugBundle,
    snapshot,
    sanitize,
    sendToBackend,
    isLocalDevelopmentHost,
    collectBrowserBundlePayload,
    sessionId,
    entries: getLogs,
    clear: clearLogs
  };

  installInteractionCapture();
  wrapFetch();
  info("debug.logger.ready", {
    storageBackend,
    retentionDays: core.RETENTION_DAYS,
    maxEmergencyEntries: MAX_EMERGENCY_ENTRIES,
    maxEmergencyBytes: MAX_EMERGENCY_BYTES,
    localDevelopmentCapture: isLocalDevelopmentHost()
  });
})();
