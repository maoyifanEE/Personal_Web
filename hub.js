(function () {
  const statusEl = document.querySelector("[data-hub-auth-status]");
  const gridEl = document.querySelector("[data-hub-grid]");
  const loginLink = document.querySelector("[data-hub-login-link]");
  const logoutButton = document.querySelector("[data-hub-logout]");
  const localDebugCard = document.querySelector("[data-local-debug-card]");
  const localDebugExportButton = document.querySelector("[data-hub-debug-export]");
  const localDebugPageLink = document.querySelector("[data-hub-debug-page]");
  const localDebugStatus = document.querySelector("[data-hub-debug-status]");
  const adminOnlyItems = Array.from(document.querySelectorAll("[data-admin-only]"));
  const homepageEditorItems = Array.from(document.querySelectorAll("[data-homepage-editor]"));

  const debugLog = (event, details = {}, level = "info") => {
    if (window.PersonalWebDebug?.log) {
      window.PersonalWebDebug.log(level, event, details);
      return;
    }
    console[level === "error" ? "error" : level === "warn" ? "warn" : "info"](`[hub] ${event}`, details);
  };

  const setElementHidden = (element, hidden) => {
    if (!element) {
      return;
    }
    element.hidden = hidden;
    element.style.display = hidden ? "none" : "";
  };

  const setStatus = (message) => {
    if (statusEl) {
      statusEl.textContent = message;
    }
  };

  const setDebugStatus = (message = "", isError = false) => {
    if (!localDebugStatus) {
      return;
    }
    localDebugStatus.textContent = message;
    localDebugStatus.classList.toggle("is-error", isError);
  };

  const isLocalDevelopmentHost = () => {
    if (window.PersonalWebDebug?.isLocalDevelopmentHost) {
      return window.PersonalWebDebug.isLocalDevelopmentHost();
    }
    return ["127.0.0.1", "localhost"].includes(window.location.hostname);
  };

  const initializeLocalDebugCard = () => {
    if (!localDebugCard) {
      return;
    }
    if (!isLocalDevelopmentHost()) {
      setElementHidden(localDebugCard, true);
      debugLog("hub.debug_export.hidden_non_local", { host: window.location.hostname });
      return;
    }
    setElementHidden(localDebugCard, false);
    setDebugStatus("本地调试包仅在 localhost / 127.0.0.1 可用。");
    debugLog("hub.debug_export.visible", { host: window.location.hostname });
  };

  const renderGuest = (reason) => {
    debugLog("hub.render_guest", { reason }, "warn");
    setStatus("请先登录后再进入个人工具。");
    if (gridEl) {
      gridEl.hidden = true;
    }
    setElementHidden(loginLink, false);
    setElementHidden(logoutButton, true);
    adminOnlyItems.forEach((item) => setElementHidden(item, true));
    homepageEditorItems.forEach((item) => setElementHidden(item, true));
  };

  const renderUser = (state) => {
    const displayName = state.user?.displayName || state.user?.username || "用户";
    const roles = state.roles?.join(", ") || "user";
    const canManageUsers =
      window.PersonalWebAuth.hasRole(state, "admin") ||
      window.PersonalWebAuth.hasPermission(state, "users:manage");
    const canEditHomepage =
      window.PersonalWebAuth.hasRole(state, "admin") ||
      window.PersonalWebAuth.hasPermission(state, "homepage:edit");

    debugLog("hub.render_user", {
      userId: state.user?.id,
      roles: state.roles,
      canManageUsers,
      canEditHomepage
    });
    setStatus(`已登录：${displayName}（${roles}）`);
    if (gridEl) {
      gridEl.hidden = false;
    }
    setElementHidden(loginLink, true);
    setElementHidden(logoutButton, false);
    adminOnlyItems.forEach((item) => setElementHidden(item, !canManageUsers));
    homepageEditorItems.forEach((item) => setElementHidden(item, !canEditHomepage));
  };

  const initializeHub = async () => {
    if (!window.PersonalWebAuth) {
      renderGuest("auth helper missing");
      return;
    }

    try {
      const state = await window.PersonalWebAuth.getCurrentAuthState({ force: true });
      if (!state.authenticated) {
        renderGuest("not authenticated");
        return;
      }
      renderUser(state);
    } catch (error) {
      renderGuest(error.message);
    }
  };

  logoutButton?.addEventListener("click", async () => {
    try {
      await window.PersonalWebAuth.logout();
      renderGuest("logged out");
    } catch (error) {
      debugLog("hub.logout_failed", { error: error.message }, "warn");
      renderGuest("logout failed");
    }
  });

  localDebugExportButton?.addEventListener("click", async () => {
    debugLog("hub.debug_export.click");
    try {
      if (!window.PersonalWebDebug?.exportFullDebugBundle) {
        throw new Error("Debug export helper is unavailable.");
      }
      await window.PersonalWebDebug.exportFullDebugBundle({
        source: "hub",
        setStatus: setDebugStatus
      });
      debugLog("hub.debug_export.success");
    } catch (error) {
      debugLog("hub.debug_export.failure", {
        category: error.category || "unknown",
        error: error.message
      }, "warn");
    }
  });

  localDebugPageLink?.addEventListener("click", () => {
    debugLog("hub.debug_log_page.open");
  });

  initializeLocalDebugCard();
  initializeHub();
})();
