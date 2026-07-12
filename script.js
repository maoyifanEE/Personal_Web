const debugLog = (event, details = {}, level = "info") => {
  if (window.PersonalWebDebug?.log) {
    window.PersonalWebDebug.log(level, event, details);
    return;
  }
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[Personal_Web][Cover] ${event}`,
    details
  );
};

const isLocalDevelopmentHost = () =>
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

const getHomepageRuntimePolicy = () => {
  const hostname = window.location.hostname || "";
  const isLocal = isLocalDevelopmentHost();
  return {
    hostname,
    isLocal,
    mode: isLocal ? "local" : "public",
    userEntranceEnabled: isLocal,
    visitorMessagesEnabled: false
  };
};

const FEATURE_NOTICE_COPY = {
  "user-entry": {
    title: "用户入口暂未开放",
    message: "用户中心正在建设中，目前仅开放访客浏览。"
  },
  "message-entry": {
    title: "留言功能暂未开放",
    message: "留言功能正在准备中，暂时无法提交。"
  }
};

const cleanLocalStartUrl = (url) => {
  url.searchParams.delete("devLogout");
  url.searchParams.delete("localStart");
  url.searchParams.delete("resetSession");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl || "/");
  debugLog("index.dev_session_reset.url_cleaned", { path: nextUrl || "/" });
};

const setLocalStartStatus = (message = "") => {
  const status = document.querySelector("[data-local-start-status]");
  if (!status) {
    return;
  }

  status.textContent = message;
  status.hidden = !message;
  debugLog("index.local_start_status.updated", {
    visible: Boolean(message)
  });
};

const canExportDebugBundle = (state) =>
  Boolean(
    state?.authenticated &&
    (
      window.PersonalWebAuth?.hasRole?.(state, "admin") ||
      window.PersonalWebAuth?.hasPermission?.(state, "admin:access")
    )
  );

const initializeLocalDebugLink = async () => {
  const link = document.querySelector("[data-local-debug-link]");
  if (!link) {
    return;
  }
  if (!isLocalDevelopmentHost()) {
    link.hidden = true;
    debugLog("index.debug_link.hidden_non_local", { host: window.location.hostname });
    return;
  }
  try {
    const state = await window.PersonalWebAuth?.getCurrentAuthState?.({ force: true });
    if (!canExportDebugBundle(state)) {
      link.hidden = true;
      debugLog("index.debug_link.hidden_not_admin", {
        authenticated: Boolean(state?.authenticated),
        roles: state?.roles || [],
        permissions: state?.permissions || []
      });
      return;
    }
  } catch (error) {
    link.hidden = true;
    debugLog("index.debug_link.hidden_not_admin", { error: error.message }, "warn");
    return;
  }
  link.hidden = false;
  debugLog("index.debug_link.visible_admin", { host: window.location.hostname });
  link.addEventListener("click", () => {
    debugLog("index.debug_link.click", { target: link.getAttribute("href") });
  });
};

const shouldResetLocalSession = () => {
  const params = new URLSearchParams(window.location.search);
  return (
    isLocalDevelopmentHost() &&
    (
      params.get("devLogout") === "1" ||
      (params.get("localStart") === "1" && params.get("resetSession") === "1")
    )
  );
};

const resetLocalDevelopmentSession = async () => {
  const url = new URL(window.location.href);
  if (!shouldResetLocalSession()) {
    return false;
  }

  debugLog("index.dev_session_reset.detected", { host: window.location.hostname });
  debugLog("index.dev_session_reset.start");

  try {
    if (window.PersonalWebAuth?.logout) {
      await window.PersonalWebAuth.logout();
      debugLog("index.dev_session_reset.success");
    } else {
      debugLog("index.dev_session_reset.backend_unavailable", {
        reason: "auth helper unavailable"
      }, "warn");
      setLocalStartStatus("本地启动未能调用后端退出接口；入口已切回登录页。");
    }
  } catch (error) {
    const eventName = /fetch|network|failed/i.test(error.message || "")
      ? "index.dev_session_reset.backend_unavailable"
      : "index.dev_session_reset.failure";
    debugLog(eventName, { error: error.message }, "warn");
    setLocalStartStatus("本地启动退出检查失败；入口已切回登录页。");
  } finally {
    cleanLocalStartUrl(url);
  }

  return true;
};

const setStatusBadgeVisibility = (selector, visible) => {
  const badge = document.querySelector(selector);
  if (badge) {
    badge.hidden = !visible;
  }
};

const preparePublicButtonLikeLink = (element) => {
  element.removeAttribute("href");
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
};

const initializeFeatureAvailabilityDialog = (policy) => {
  const dialog = document.getElementById("feature-availability-dialog");
  if (!dialog) {
    debugLog("homepage.feature_notice.missing", {}, "warn");
    return null;
  }

  const panel = dialog.querySelector(".feature-availability-dialog__panel");
  const title = dialog.querySelector("[data-feature-notice-title]");
  const message = dialog.querySelector("[data-feature-notice-message]");
  const closeControls = dialog.querySelectorAll("[data-feature-notice-close]");
  let lastFocusedElement = null;
  let activeFeature = null;

  const closeNotice = (closeReason = "button") => {
    if (dialog.hidden) {
      return;
    }

    dialog.hidden = true;
    document.body.classList.remove("feature-notice-open");
    debugLog("homepage.feature_notice.closed", {
      feature: activeFeature,
      closeReason
    });

    const focusTarget = lastFocusedElement;
    activeFeature = null;
    lastFocusedElement = null;
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  };

  closeControls.forEach((control) => {
    control.addEventListener("click", () => {
      const closeReason = control.classList.contains("feature-availability-dialog__overlay")
        ? "backdrop"
        : "button";
      closeNotice(closeReason);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.hidden) {
      closeNotice("escape");
    }
  });

  return (feature) => {
    const copy = FEATURE_NOTICE_COPY[feature];
    if (!copy || !title || !message) {
      debugLog("homepage.feature_notice.copy_missing", { feature }, "warn");
      return;
    }

    activeFeature = feature;
    lastFocusedElement = document.activeElement;
    title.textContent = copy.title;
    message.textContent = copy.message;
    dialog.hidden = false;
    document.body.classList.add("feature-notice-open");
    window.requestAnimationFrame(() => panel?.focus());
    debugLog("homepage.feature_notice.opened", {
      feature,
      mode: policy.mode,
      hostname: policy.hostname
    });
  };
};

const initializeCoverEntrances = async (policy, openFeatureNotice) => {
  const visitorEntrance = document.querySelector("[data-visitor-entrance]");
  const userEntrance = document.querySelector("[data-user-entrance]");
  const localSessionReset = policy.isLocal ? await resetLocalDevelopmentSession() : false;

  setStatusBadgeVisibility("[data-user-unavailable-badge]", !policy.userEntranceEnabled);
  if (visitorEntrance) {
    visitorEntrance.setAttribute("href", "./journey.html?view=public");
    visitorEntrance.addEventListener("click", () => {
      debugLog("homepage.visitor_entrance.clicked", {
        target: visitorEntrance.getAttribute("href")
      });
    });
  }

  if (!userEntrance) {
    debugLog("homepage.user_entrance.missing", {}, "warn");
    return;
  }

  if (!policy.userEntranceEnabled) {
    preparePublicButtonLikeLink(userEntrance);
    userEntrance.addEventListener("click", (event) => {
      event.preventDefault();
      debugLog("homepage.user_entrance.unavailable_clicked", {
        mode: policy.mode,
        hostname: policy.hostname
      });
      openFeatureNotice?.("user-entry");
    });
    userEntrance.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      userEntrance.click();
    });
    debugLog("homepage.user_entrance.public_unavailable", {
      mode: policy.mode,
      hostname: policy.hostname
    });
    return;
  }

  let target = "./login.html";
  if (!localSessionReset) {
    try {
      const authState = await window.PersonalWebAuth?.getCurrentAuthState?.({ force: true });
      if (authState?.authenticated) {
        target = "./hub.html";
      }
      debugLog("homepage.user_entrance.resolved", {
        authenticated: Boolean(authState?.authenticated),
        target
      });
    } catch (error) {
      debugLog("homepage.user_entrance.auth_check_failed", { error: error.message }, "warn");
    }
  } else {
    debugLog("homepage.user_entrance.resolved", {
      authenticated: false,
      localSessionReset: true,
      target
    });
  }

  userEntrance.setAttribute("href", target);
  userEntrance.addEventListener("click", () => {
    debugLog("homepage.user_entrance.clicked", {
      target: userEntrance.getAttribute("href")
    });
  });
};

document.addEventListener("DOMContentLoaded", async () => {
  const policy = getHomepageRuntimePolicy();
  debugLog("homepage.runtime_mode.resolved", {
    mode: policy.mode,
    hostname: policy.hostname,
    userEntranceEnabled: policy.userEntranceEnabled,
    visitorMessagesEnabled: policy.visitorMessagesEnabled
  });
  const openFeatureNotice = initializeFeatureAvailabilityDialog(policy);
  debugLog("homepage.ready", {
    visitorEntry: document.querySelector("[data-visitor-entrance]")?.getAttribute("href") || null,
    userEntry: document.querySelector("[data-user-entrance]")?.getAttribute("href") || null,
    clickAnywhereNavigation: false
  });
  await initializeCoverEntrances(policy, openFeatureNotice);
  await initializeLocalDebugLink();
  initializeVisitorMessageEntry(policy, openFeatureNotice);
});

const initializeVisitorMessageEntry = (policy, openFeatureNotice) => {
  const openButton = document.querySelector("[data-message-open]");

  if (!openButton) {
    debugLog("visitor_message.entry.missing", {}, "warn");
    return;
  }

  const openUnavailableNotice = (event) => {
    event.preventDefault();
    debugLog("visitor_message.entry.unavailable_clicked", {
      mode: policy.mode,
      hostname: policy.hostname,
      visitorMessagesEnabled: policy.visitorMessagesEnabled
    });
    openFeatureNotice?.("message-entry");
  };

  openButton.addEventListener("click", openUnavailableNotice);

  debugLog("visitor_message.entry.disabled", {
    mode: policy.mode,
    backend: null,
    storage: "disabled"
  });
};
