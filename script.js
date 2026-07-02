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

const initializeCoverEntrances = async () => {
  const visitorEntrance = document.querySelector("[data-visitor-entrance]");
  const userEntrance = document.querySelector("[data-user-entrance]");
  const localSessionReset = await resetLocalDevelopmentSession();

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

const createHomepageMediaElement = (media) => {
  if (!media?.url) {
    return null;
  }

  if (media.mediaType === "image") {
    const image = document.createElement("img");
    image.src = media.url;
    image.alt = media.title || "";
    image.loading = "lazy";
    return image;
  }

  if (media.mediaType === "video") {
    const video = document.createElement("video");
    video.src = media.url;
    video.controls = true;
    video.preload = "metadata";
    return video;
  }

  return null;
};

const renderHomepagePublicItems = (items = []) => {
  const root = document.querySelector("[data-homepage-public-items]");
  if (!root) {
    return;
  }

  root.replaceChildren();
  if (!items.length) {
    root.hidden = true;
    return;
  }

  const heading = document.createElement("h2");
  heading.textContent = "Latest highlights";
  root.append(heading);

  const list = document.createElement("div");
  list.className = "homepage-public-items__grid";
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "homepage-public-item";

    const mediaElement = createHomepageMediaElement(item.media);
    if (mediaElement) {
      const mediaWrap = document.createElement("div");
      mediaWrap.className = "homepage-public-item__media";
      mediaWrap.append(mediaElement);
      article.append(mediaWrap);
    }

    const title = document.createElement("h3");
    title.textContent = item.title || "Untitled";
    article.append(title);

    if (item.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "homepage-public-item__subtitle";
      subtitle.textContent = item.subtitle;
      article.append(subtitle);
    }

    const metaParts = [item.locationLabel, item.timeLabel].filter(Boolean);
    if (metaParts.length) {
      const meta = document.createElement("p");
      meta.className = "homepage-public-item__meta";
      meta.textContent = metaParts.join(" · ");
      article.append(meta);
    }

    if (item.description) {
      const description = document.createElement("p");
      description.className = "homepage-public-item__description";
      description.textContent = item.description;
      article.append(description);
    }

    list.append(article);
  });

  root.append(list);
  root.hidden = false;
};

const loadHomepagePublicItems = async () => {
  const apiBaseUrl = window.PersonalWebAuth?.apiBaseUrl || "http://127.0.0.1:8000/api";
  try {
    const response = await fetch(`${apiBaseUrl}/homepage/public`, {
      method: "GET",
      credentials: "include",
      headers: {
        "X-Request-ID": `homepage-public-${Date.now().toString(36)}`
      }
    });
    if (!response.ok) {
      throw new Error(`Homepage public request failed: ${response.status}`);
    }
    const payload = await response.json();
    renderHomepagePublicItems(Array.isArray(payload.items) ? payload.items : []);
    debugLog("homepage.public_items.loaded", {
      count: Array.isArray(payload.items) ? payload.items.length : 0
    });
  } catch (error) {
    renderHomepagePublicItems([]);
    debugLog("homepage.public_items.unavailable", { error: error.message }, "warn");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  debugLog("homepage.ready", {
    visitorEntry: document.querySelector("[data-visitor-entrance]")?.getAttribute("href") || null,
    userEntry: document.querySelector("[data-user-entrance]")?.getAttribute("href") || null,
    clickAnywhereNavigation: false
  });
  initializeCoverEntrances();
  loadHomepagePublicItems();
});

const initializeVisitorMessagePrototype = () => {
  const modal = document.getElementById("visitor-message-modal");
  const openButton = document.querySelector("[data-message-open]");
  const form = document.querySelector("[data-message-form]");
  const status = document.querySelector("[data-message-status]");

  if (!modal || !openButton || !form || !status) {
    debugLog("visitor_message.prototype.missing_elements", {}, "warn");
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

document.addEventListener("DOMContentLoaded", initializeVisitorMessagePrototype);
