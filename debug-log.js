(function () {
  const output = document.querySelector("[data-debug-output]");
  const status = document.querySelector("[data-debug-status]");
  const adminNote = document.querySelector("[data-debug-admin-note]");
  const bundleButton = document.querySelector("[data-debug-action='export-bundle']");
  const loginLink = document.querySelector("[data-debug-login-link]");
  let canExportFullBundle = false;

  const setStatus = (message, isError = false) => {
    if (status) {
      status.textContent = message;
      status.classList.toggle("is-error", isError);
    }
  };

  const setAdminNote = (message = "", isError = false) => {
    if (!adminNote) {
      return;
    }
    adminNote.textContent = message;
    adminNote.classList.toggle("is-error", isError);
  };

  const setBundleExportVisible = (visible) => {
    canExportFullBundle = visible;
    if (bundleButton) {
      bundleButton.hidden = !visible;
      bundleButton.disabled = !visible;
    }
    if (loginLink) {
      loginLink.hidden = visible;
    }
  };

  const isAdminState = (state) =>
    Boolean(
      state?.authenticated &&
      (
        window.PersonalWebAuth?.hasRole?.(state, "admin") ||
        window.PersonalWebAuth?.hasPermission?.(state, "admin:access")
      )
    );

  const validateCurrentDebugRuntime = async () => {
    if (
      !window.PersonalWebDebug?.ready ||
      !window.PersonalWebDebug?.collectBrowserBundlePayload ||
      !window.PersonalWebDebug?.validateDebugBundlePayload
    ) {
      throw new Error("调试日志模块版本过时或尚未初始化，请强制刷新页面后重试。");
    }
    await window.PersonalWebDebug.ready();
    const payload = await window.PersonalWebDebug.collectBrowserBundlePayload("debug-log-preflight");
    const validation = window.PersonalWebDebug.validateDebugBundlePayload(payload);
    if (!validation.ok) {
      throw new Error(`调试日志模块版本过时或尚未初始化，请强制刷新页面后重试：${validation.errors.join(", ")}`);
    }
    return payload;
  };

  const initializeFullBundleAccess = async () => {
    setBundleExportVisible(false);
    if (!window.PersonalWebDebug?.isLocalDevelopmentHost?.()) {
      setAdminNote("完整调试包 ZIP 仅在本地开发模式可用。", true);
      window.PersonalWebDebug?.warn?.("debug_page.bundle_export.hidden_non_local", {
        host: window.location.hostname
      });
      return;
    }
    try {
      const state = await window.PersonalWebAuth?.getCurrentAuthState?.({ force: true });
      if (!isAdminState(state)) {
        setAdminNote("完整调试包 ZIP 需要管理员登录后才能导出。", true);
        setBundleExportVisible(false);
        window.PersonalWebDebug?.warn?.("debug_page.bundle_export.hidden_not_admin", {
          authenticated: Boolean(state?.authenticated),
          roles: state?.roles || [],
          permissions: state?.permissions || []
        });
        return;
      }
      setAdminNote("完整调试包 ZIP 仅限本地开发环境的管理员导出。");
      setBundleExportVisible(true);
      window.PersonalWebDebug?.info?.("debug_page.bundle_export.visible_admin", {
        userId: state.user?.id
      });
    } catch (error) {
      setAdminNote("完整调试包 ZIP 需要管理员登录后才能导出。", true);
      setBundleExportVisible(false);
      window.PersonalWebDebug?.warn?.("debug_page.bundle_export.auth_check_failed", {
        error: error.message
      });
    }
  };

  const render = async () => {
    if (!window.PersonalWebDebug) {
      setStatus("调试日志模块未加载。", true);
      return;
    }
    await window.PersonalWebDebug.ready();
    const [entries, retention] = await Promise.all([
      window.PersonalWebDebug.getLogsAsync({ limit: 500 }),
      window.PersonalWebDebug.getRetentionInfo()
    ]);
    if (output) {
      output.textContent = JSON.stringify(
        {
          retention,
          showing: `Showing latest ${entries.length} of ${retention.entryCount} retained entries`,
          entries
        },
        null,
        2
      );
    }
    setStatus(
      [
        `保留 ${retention.entryCount} 条日志，当前显示最新 ${entries.length} 条。`,
        `保留周期：${retention.retentionDays} 天。`,
        `存储：${retention.storageBackend}${retention.degraded ? "（降级）" : ""}。`,
        `最早：${retention.oldestTimestamp || "无"}。`,
        `最新：${retention.newestTimestamp || "无"}。`
      ].join(" ")
    );
    window.PersonalWebDebug.info("debug_page.rendered", {
      entryCount: retention.entryCount,
      renderedCount: entries.length,
      storageBackend: retention.storageBackend,
      degraded: retention.degraded
    });
  };

  const exportFullDebugBundle = async () => {
    if (!canExportFullBundle) {
      setStatus("需要管理员登录后才能导出完整调试包。", true);
      window.PersonalWebDebug?.warn?.("debug_page.bundle_export.blocked_not_admin");
      return;
    }
    await validateCurrentDebugRuntime();
    await window.PersonalWebDebug.exportFullDebugBundle({
      source: "debug-log",
      setStatus
    });
  };

  document.addEventListener("click", async (event) => {
    const action = event.target?.dataset?.debugAction;
    if (!action || !window.PersonalWebDebug) {
      return;
    }
    try {
      if (action === "refresh") {
        await render();
      } else if (action === "export") {
        await window.PersonalWebDebug.exportLogs();
      } else if (action === "export-text") {
        await window.PersonalWebDebug.exportTextSummary();
      } else if (action === "export-bundle") {
        await exportFullDebugBundle();
      } else if (action === "send") {
        setStatus("正在发送到本地后端调试端点...");
        const result = await window.PersonalWebDebug.sendToBackend({ source: "debug-log-page" });
        setStatus(`已发送到本地后端：${result.entryCount} 条。`);
      } else if (action === "clear") {
        await window.PersonalWebDebug.clear();
        await render();
      }
    } catch (error) {
      setStatus(`操作失败：${error.message}`, true);
      window.PersonalWebDebug.warn("debug_page.action_failed", {
        action,
        category: error.category || "unknown",
        error: error.message
      });
    }
  });

  render();
  initializeFullBundleAccess();
})();
