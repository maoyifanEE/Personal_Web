(function () {
  const statusEl = document.querySelector("[data-hub-auth-status]");
  const gridEl = document.querySelector("[data-hub-grid]");
  const loginLink = document.querySelector("[data-hub-login-link]");
  const logoutButton = document.querySelector("[data-hub-logout]");
  const adminOnlyItems = Array.from(document.querySelectorAll("[data-admin-only]"));

  const setStatus = (message) => {
    if (statusEl) {
      statusEl.textContent = message;
    }
  };

  const renderGuest = (reason) => {
    console.warn("[hub] Rendering guest state", { reason });
    setStatus("请先登录后再进入私人工具。");
    if (gridEl) {
      gridEl.hidden = true;
    }
    if (loginLink) {
      loginLink.hidden = false;
    }
    if (logoutButton) {
      logoutButton.hidden = true;
    }
    adminOnlyItems.forEach((item) => {
      item.hidden = true;
    });
  };

  const renderUser = (state) => {
    const displayName = state.user?.displayName || state.user?.username || "用户";
    const roles = state.roles?.join(", ") || "user";
    console.info("[hub] Rendering authenticated hub", {
      userId: state.user?.id,
      roles
    });
    setStatus(`已登录：${displayName}（${roles}）`);
    if (gridEl) {
      gridEl.hidden = false;
    }
    if (loginLink) {
      loginLink.hidden = true;
    }
    if (logoutButton) {
      logoutButton.hidden = false;
    }
    const canManageUsers =
      window.PersonalWebAuth.hasRole(state, "admin") ||
      window.PersonalWebAuth.hasPermission(state, "users:manage");
    adminOnlyItems.forEach((item) => {
      item.hidden = !canManageUsers;
    });
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
      console.warn("[hub] Logout failed", error);
      renderGuest("logout failed");
    }
  });

  initializeHub();
})();
