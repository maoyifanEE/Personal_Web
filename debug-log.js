(function () {
  const output = document.querySelector("[data-debug-output]");
  const status = document.querySelector("[data-debug-status]");

  const setStatus = (message, isError = false) => {
    if (status) {
      status.textContent = message;
      status.classList.toggle("is-error", isError);
    }
  };

  const timestampForFile = () => new Date().toISOString().replace(/[:.]/g, "-");

  const localStorageItemSummary = (key) => {
    try {
      const value = window.localStorage.getItem(key);
      return {
        exists: value !== null,
        size: value ? value.length : 0
      };
    } catch (error) {
      return {
        exists: false,
        size: 0,
        error: error.message
      };
    }
  };

  const collectBrowserBundlePayload = () => {
    const logs = window.PersonalWebDebug.getLogs();
    return window.PersonalWebDebug.sanitize({
      sessionId: window.PersonalWebDebug.sessionId,
      page: "debug-log",
      location: window.location.href,
      entries: logs,
      snapshot: window.PersonalWebDebug.snapshot(),
      clientSummary: {
        currentUrl: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        },
        userAgent: navigator.userAgent,
        localDebugLogCount: logs.length,
        journeyDrafts: {
          journeySketchCanvasStateV1: localStorageItemSummary("journeySketchCanvasStateV1"),
          journeyData: localStorageItemSummary("journeyData")
        }
      }
    });
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

  const exportFullDebugBundle = async () => {
    window.PersonalWebDebug.info("debug.bundle_export.click");
    window.PersonalWebDebug.info("debug.bundle_export.start");
    setStatus("正在生成完整调试包...");

    const apiBaseUrl = window.PersonalWebAuth?.apiBaseUrl || "http://127.0.0.1:8000/api";
    const payload = collectBrowserBundlePayload();

    let response;
    try {
      response = await fetch(`${apiBaseUrl}/debug/export-bundle`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      window.PersonalWebDebug.warn("debug.bundle_export.backend_unavailable", {
        error: error.message
      });
      setStatus("后端不可用，无法导出完整调试包。请使用浏览器日志导出作为备用。", true);
      return;
    }

    if (!response.ok) {
      window.PersonalWebDebug.warn("debug.bundle_export.failure", {
        status: response.status
      });
      setStatus("完整调试包导出失败。请使用浏览器日志导出或 CLI 收集脚本作为备用。", true);
      throw new Error(`Debug bundle export failed: ${response.status}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `personal-web-debug-${timestampForFile()}.local-debug.zip`;
    downloadBlob(blob, filename);
    window.PersonalWebDebug.info("debug.bundle_export.success", {
      filename,
      bytes: blob.size
    });
    setStatus("调试包已下载。");
  };

  const render = () => {
    if (!window.PersonalWebDebug) {
      setStatus("调试日志模块未加载。", true);
      return;
    }
    const entries = window.PersonalWebDebug.entries();
    if (output) {
      output.textContent = JSON.stringify(entries.slice(-120), null, 2);
    }
    setStatus(`已读取 ${entries.length} 条本地日志，当前显示最近 ${Math.min(entries.length, 120)} 条。`);
    window.PersonalWebDebug.log("info", "debug_page.rendered", { entryCount: entries.length });
  };

  document.addEventListener("click", async (event) => {
    const action = event.target?.dataset?.debugAction;
    if (!action || !window.PersonalWebDebug) {
      return;
    }
    try {
      if (action === "refresh") {
        render();
      } else if (action === "export") {
        window.PersonalWebDebug.exportLogs();
      } else if (action === "export-text") {
        window.PersonalWebDebug.exportTextSummary();
      } else if (action === "export-bundle") {
        await exportFullDebugBundle();
      } else if (action === "send") {
        setStatus("正在发送到本地后端调试端点...");
        const result = await window.PersonalWebDebug.sendToBackend({ source: "debug-log-page" });
        setStatus(`已发送到本地后端：${result.entryCount} 条。`);
      } else if (action === "clear") {
        window.PersonalWebDebug.clear();
        render();
      }
    } catch (error) {
      setStatus(`操作失败：${error.message}`, true);
      window.PersonalWebDebug.log("warn", "debug_page.action_failed", {
        action,
        error: error.message
      });
    }
  });

  render();
})();
