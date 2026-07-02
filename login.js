(function () {
  const form = document.querySelector("[data-login-form]");

  if (!form) {
    return;
  }

  const accountInput = form.querySelector("[data-login-account]");
  const passwordInput = form.querySelector("[data-login-password]");
  const errorMessage = form.querySelector("[data-login-error]");
  const submitButton = form.querySelector("[data-login-submit]");

  const debugLog = (event, details = {}, level = "info") => {
    if (window.PersonalWebDebug?.log) {
      window.PersonalWebDebug.log(level, event, details);
      return;
    }
    console[level === "error" ? "error" : level === "warn" ? "warn" : "info"](`[login] ${event}`, details);
  };

  const setError = (message) => {
    if (errorMessage) {
      errorMessage.textContent = message;
    }
  };

  const setSubmitting = (isSubmitting) => {
    if (submitButton) {
      submitButton.disabled = isSubmitting;
      submitButton.textContent = isSubmitting ? "Entering..." : "Enter";
    }
  };

  const loginErrorMessage = (error) => {
    if (error?.code === "BACKEND_UNAVAILABLE") {
      return "无法连接本地后端，请确认 backend 已在 127.0.0.1:8000 启动。";
    }
    if (error?.code === "BACKEND_SETUP_ERROR") {
      return "本地后端返回错误，请检查数据库迁移和开发账号 seed 是否已执行。";
    }
    return "账号或密码不正确。";
  };

  const redirectIfAuthenticated = async () => {
    if (!window.PersonalWebAuth?.getCurrentAuthState) {
      debugLog("login.auth_helper_missing", {}, "warn");
      return;
    }
    try {
      const state = await window.PersonalWebAuth.getCurrentAuthState({ force: true });
      if (state?.authenticated) {
        debugLog("login.already_authenticated_redirect", {
          userId: state.user?.id,
          roles: state.roles
        });
        setError("已登录，正在进入个人工具中心...");
        window.location.replace("./hub.html");
      }
    } catch (error) {
      debugLog("login.auth_state_check_failed", { error: error.message }, "warn");
    }
  };

  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      debugLog("login.enter_key_submit");
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const account = accountInput.value.trim();
    const password = passwordInput.value;

    debugLog("login.submit_attempted", {
      hasAccount: Boolean(account),
      hasPassword: Boolean(password)
    });

    if (!account) {
      setError("Please enter account and password.");
      accountInput.focus();
      return;
    }

    if (!password) {
      setError("Please enter account and password.");
      passwordInput.focus();
      return;
    }

    if (!window.PersonalWebAuth) {
      debugLog("login.auth_helper_unavailable", {}, "error");
      setError("Login service is not available.");
      passwordInput.focus();
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const state = await window.PersonalWebAuth.login({
        usernameOrEmail: account,
        password
      });
      debugLog("login.accepted_redirect", {
        userId: state.user?.id,
        roles: state.roles
      });
      window.location.href = "./hub.html";
    } catch (error) {
      debugLog("login.rejected", {
        code: error?.code,
        status: error?.status,
        detail: error?.detail,
        message: error?.message
      }, "warn");
      setError(loginErrorMessage(error));
      passwordInput.focus();
      passwordInput.select();
    } finally {
      setSubmitting(false);
    }
  });

  redirectIfAuthenticated();
})();
