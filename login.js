(function () {
  const form = document.querySelector("[data-login-form]");

  if (!form) {
    return;
  }

  const accountInput = form.querySelector("[data-login-account]");
  const passwordInput = form.querySelector("[data-login-password]");
  const errorMessage = form.querySelector("[data-login-error]");
  const testPassword = "demo1234";

  const setError = (message) => {
    if (errorMessage) {
      errorMessage.textContent = message;
    }
  };

  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      console.info("[login] Enter key submitted the static mock login form");
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const account = accountInput.value.trim();
    const password = passwordInput.value;

    console.info("[login] Static mock login submitted", {
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

    // Temporary mock routing only. This is not security; real authentication
    // must be implemented later with backend sessions and permission checks.
    if (password !== testPassword) {
      console.warn("[login] Static mock login rejected: incorrect test password");
      setError("Incorrect test password.");
      passwordInput.focus();
      passwordInput.select();
      return;
    }

    console.info("[login] Static mock login accepted; redirecting to hub.html");
    setError("");
    window.location.href = "./hub.html";
  });
})();
