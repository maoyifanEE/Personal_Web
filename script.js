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

const initializeCoverEntrances = async () => {
  const visitorEntrance = document.querySelector("[data-visitor-entrance]");
  const userEntrance = document.querySelector("[data-user-entrance]");

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

  userEntrance.setAttribute("href", target);
  userEntrance.addEventListener("click", () => {
    debugLog("homepage.user_entrance.clicked", {
      target: userEntrance.getAttribute("href")
    });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  debugLog("homepage.ready", {
    visitorEntry: document.querySelector("[data-visitor-entrance]")?.getAttribute("href") || null,
    userEntry: document.querySelector("[data-user-entrance]")?.getAttribute("href") || null,
    clickAnywhereNavigation: false
  });
  initializeCoverEntrances();
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
