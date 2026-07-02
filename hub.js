(function () {
  const statusEl = document.querySelector("[data-hub-auth-status]");
  const gridEl = document.querySelector("[data-hub-grid]");
  const loginLink = document.querySelector("[data-hub-login-link]");
  const logoutButton = document.querySelector("[data-hub-logout]");
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

  initializeHub();
})();
