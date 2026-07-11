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
    messagePrototypeEnabled: isLocal
  };
};

const FEATURE_NOTICE_COPY = {
  "user-entry": {
    title: "用户入口暂未开放",
    message: "用户中心正在建设中，目前仅开放访客浏览。"
  },
  message: {
    title: "留言功能正在建设中",
    message: "目前留言不会被保存。后续开放后，你可以在这里给我留言。"
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
  setStatusBadgeVisibility("[data-message-unavailable-badge]", !policy.messagePrototypeEnabled);

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
    messagePrototypeEnabled: policy.messagePrototypeEnabled
  });
  const openFeatureNotice = initializeFeatureAvailabilityDialog(policy);
  debugLog("homepage.ready", {
    visitorEntry: document.querySelector("[data-visitor-entrance]")?.getAttribute("href") || null,
    userEntry: document.querySelector("[data-user-entrance]")?.getAttribute("href") || null,
    clickAnywhereNavigation: false
  });
  await initializeCoverEntrances(policy, openFeatureNotice);
  await initializeLocalDebugLink();
  initializeVisitorMessagePrototype(policy, openFeatureNotice);
});

const initializeVisitorMessagePrototype = (policy, openFeatureNotice) => {
  const modal = document.getElementById("visitor-message-modal");
  const openButton = document.querySelector("[data-message-open]");
  const form = document.querySelector("[data-message-form]");
  const status = document.querySelector("[data-message-status]");

  if (!modal || !openButton || !form || !status) {
    debugLog("visitor_message.prototype.missing_elements", {}, "warn");
    return;
  }

  if (!policy.messagePrototypeEnabled) {
    form.hidden = true;
    modal.hidden = true;
    openButton.setAttribute("aria-controls", "feature-availability-dialog");
    openButton.addEventListener("click", () => {
      debugLog("homepage.message.unavailable_clicked", {
        mode: policy.mode,
        hostname: policy.hostname
      });
      openFeatureNotice?.("message");
    });
    debugLog("visitor_message.prototype.public_disabled", {
      mode: policy.mode,
      hostname: policy.hostname
    });
    return;
  }

  const panel = modal.querySelector(".visitor-message-modal__panel");
  const closeControls = modal.querySelectorAll("[data-message-close]");
  let lastFocusedElement = null;

  const setStatus = (message, type = "info") => {
    status.textContent = message;
    status.classList.toggle("is-error", type === "error");
    status.classList.toggle("is-prototype-success", type === "success");
    debugLog("visitor_message.prototype.status", { type, message });
  };

  const openModal = () => {
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("visitor-message-open");
    setStatus("当前仅为前端原型，真实留言提交需要后端和数据库支持。", "info");
    window.requestAnimationFrame(() => panel?.focus());
    debugLog("visitor_message.prototype.opened");
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove("visitor-message-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
    debugLog("visitor_message.prototype.closed");
  };

  openButton.addEventListener("click", openModal);
  closeControls.forEach((control) => control.addEventListener("click", closeModal));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const nickname = String(formData.get("nickname") || "").trim();
    const message = String(formData.get("message") || "").trim();

    debugLog("visitor_message.prototype.submit_attempted", {
      hasNickname: Boolean(nickname),
      hasMessage: Boolean(message),
      persistence: "disabled"
    });

    if (!nickname) {
      setStatus("请先填写昵称。", "error");
      form.elements.nickname?.focus();
      return;
    }

    if (!message) {
      setStatus("请先填写留言内容。", "error");
      form.elements.message?.focus();
      return;
    }

    setStatus(
      "当前项目还没有后端和数据库，所以这条留言不会被真正保存。后续实现后，留言将通过 API 保存到服务器端数据库。",
      "success"
    );
  });

  debugLog("visitor_message.prototype.ready", {
    persistence: "none",
    storage: "disabled",
    backend: "not used"
  });
};
