const logCover = (message, details = {}) => {
  console.log(`[Personal_Web][Cover] ${message}`, details);
};

const initializeCoverPage = () => {
  logCover("Cover page initialized.", {
    journeyEntry: document.querySelector(".journey-hidden-entrance")?.getAttribute("href") || null,
    privateEntry: document.querySelector(".hidden-entrance")?.getAttribute("href") || null,
    clickAnywhereNavigation: false
  });
};

document.addEventListener("DOMContentLoaded", initializeCoverPage);


const initializeVisitorMessagePrototype = () => {
  const modal = document.getElementById("visitor-message-modal");
  const openButton = document.querySelector("[data-message-open]");
  const form = document.querySelector("[data-message-form]");
  const status = document.querySelector("[data-message-status]");

  if (!modal || !openButton || !form || !status) {
    logCover("Visitor message prototype not initialized: required elements missing.");
    return;
  }

  const panel = modal.querySelector(".visitor-message-modal__panel");
  const closeControls = modal.querySelectorAll("[data-message-close]");
  let lastFocusedElement = null;

  const setStatus = (message, type = "info") => {
    status.textContent = message;
    status.classList.toggle("is-error", type === "error");
    status.classList.toggle("is-prototype-success", type === "success");
    logCover("Visitor message prototype status updated.", { type, message });
  };

  const openModal = () => {
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("visitor-message-open");
    setStatus("?????????????", "info");
    window.requestAnimationFrame(() => panel?.focus());
    logCover("Visitor message modal opened.");
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove("visitor-message-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
    logCover("Visitor message modal closed.");
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

    logCover("Visitor message prototype submit attempted.", {
      hasNickname: Boolean(nickname),
      hasMessage: Boolean(message),
      persistence: "disabled"
    });

    if (!nickname) {
      setStatus("????????????????????", "error");
      form.elements.nickname?.focus();
      return;
    }

    if (!message) {
      setStatus("?????????????????????", "error");
      form.elements.message?.focus();
      return;
    }

    setStatus(
      "??????????????????????????????????????? API ???????????",
      "success"
    );
  });

  logCover("Visitor message prototype initialized.", {
    persistence: "none",
    storage: "disabled",
    backend: "not implemented"
  });
};

document.addEventListener("DOMContentLoaded", initializeVisitorMessagePrototype);
