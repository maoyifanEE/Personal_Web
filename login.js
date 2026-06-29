(function () {
  const form = document.querySelector("[data-login-form]");

  if (!form) {
    return;
  }

  const accountInput = form.querySelector("[data-login-account]");
  const passwordInput = form.querySelector("[data-login-password]");
  const errorMessage = form.querySelector("[data-login-error]");
  const submitButton = form.querySelector("[data-login-submit]");

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

  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      console.info("[login] Enter key submitted the backend login form");
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const account = accountInput.value.trim();
    const password = passwordInput.value;

    console.info("[login] Backend login submitted", {
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
      console.error("[login] Auth helper is unavailable");
      setError("Login service is not available.");
      passwordInput.focus();
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await window.PersonalWebAuth.login({
        usernameOrEmail: account,
        password
      });
      console.info("[login] Backend login accepted; redirecting to hub.html");
      window.location.href = "./hub.html";
    } catch (error) {
      console.warn("[login] Backend login rejected", error);
      setError("Incorrect account or password.");
      passwordInput.focus();
      passwordInput.select();
    } finally {
      setSubmitting(false);
    }
  });
})();
