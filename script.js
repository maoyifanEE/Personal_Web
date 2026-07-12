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
    userEntranceEnabled: isLocal
  };
};

const FEATURE_NOTICE_COPY = {
  "user-entry": {
    title: "用户入口暂未开放",
    message: "用户中心正在建设中，目前仅开放访客浏览。"
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
    userEntranceEnabled: policy.userEntranceEnabled
  });
  const openFeatureNotice = initializeFeatureAvailabilityDialog(policy);
  debugLog("homepage.ready", {
    visitorEntry: document.querySelector("[data-visitor-entrance]")?.getAttribute("href") || null,
    userEntry: document.querySelector("[data-user-entrance]")?.getAttribute("href") || null,
    clickAnywhereNavigation: false
  });
  await initializeCoverEntrances(policy, openFeatureNotice);
  await initializeLocalDebugLink();
  initializeVisitorMessageForm(policy);
});

const initializeVisitorMessageForm = (policy) => {
  const modal = document.getElementById("visitor-message-modal");
  const openButton = document.querySelector("[data-message-open]");
  const form = document.querySelector("[data-message-form]");
  const status = document.querySelector("[data-message-status]");

  if (!modal || !openButton || !form || !status) {
    debugLog("visitor_message.form.missing_elements", {}, "warn");
    return;
  }

  const panel = modal.querySelector(".visitor-message-modal__panel");
  const closeControls = modal.querySelectorAll("[data-message-close]");
  let lastFocusedElement = null;

  const setStatus = (message, type = "info") => {
    status.textContent = message;
    status.classList.toggle("is-error", type === "error");
    status.classList.toggle("is-success", type === "success");
    debugLog("visitor_message.form.status", { type });
  };

  const openModal = () => {
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("visitor-message-open");
    setStatus("请填写昵称和留言内容。联系方式可选，仅管理员可见。", "info");
    window.requestAnimationFrame(() => panel?.focus());
    debugLog("visitor_message.form.opened", { mode: policy.mode, hostname: policy.hostname });
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove("visitor-message-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
    debugLog("visitor_message.form.closed");
  };

  openButton.addEventListener("click", openModal);
  closeControls.forEach((control) => control.addEventListener("click", closeModal));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const nickname = String(formData.get("nickname") || "").trim();
    const contact = String(formData.get("contact") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const website = String(formData.get("website") || "").trim();

    debugLog("visitor_message.form.submit_attempted", {
      hasNickname: Boolean(nickname),
      hasMessage: Boolean(message),
      hasContact: Boolean(contact),
      honeypotFilled: Boolean(website)
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

    const submitButton = form.querySelector(".visitor-message-submit");
    if (submitButton) {
      submitButton.disabled = true;
    }
    setStatus("正在提交留言...", "info");

    try {
      const response = await fetch(`${window.PersonalWebAuth.apiBaseUrl}/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": `message-create-${Date.now().toString(36)}`
        },
        body: JSON.stringify({ nickname, contact, message, website })
      });
      let body = {};
      try {
        body = await response.json();
      } catch (error) {
        debugLog("visitor_message.form.invalid_json_response", { error: error.message }, "warn");
      }
      if (!response.ok || body.accepted !== true) {
        const error = new Error(response.status === 429 ? "提交太频繁，请稍后再试。" : "留言提交失败，请稍后再试。");
        error.status = response.status;
        throw error;
      }
      form.reset();
      setStatus("留言已提交，谢谢你的留言。", "success");
      debugLog("visitor_message.form.submit_success", {
        status: response.status,
        responseRequestId: response.headers.get("X-Request-ID") || null
      });
    } catch (error) {
      setStatus(error.message || "留言提交失败，请稍后再试。", "error");
      debugLog("visitor_message.form.submit_failure", {
        status: error.status || null,
        error: error.message
      }, "warn");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });

  debugLog("visitor_message.form.ready", {
    mode: policy.mode,
    backend: "/api/messages",
    storage: "database"
  });
};
