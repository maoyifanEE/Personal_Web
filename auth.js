(function () {
  const defaultApiBase = "http://127.0.0.1:8000/api";
  const configuredBase = window.PERSONAL_WEB_API_BASE_URL;
  const apiBaseUrl = (configuredBase || defaultApiBase).replace(/\/$/, "");
  let cachedState = null;
  let cachedCsrfToken = null;

  const logPrefix = "[auth]";

  const safeJson = async (response) => {
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn(logPrefix, "Failed to parse JSON response", error);
      return {};
    }
  };

  const hasRole = (state, role) => Boolean(state?.roles?.includes(role));
  const hasPermission = (state, permission) => Boolean(state?.permissions?.includes(permission));

  const getCurrentAuthState = async ({ force = false } = {}) => {
    if (cachedState && !force) {
      return cachedState;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/auth/me`, {
        method: "GET",
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error(`Auth state request failed: ${response.status}`);
      }
      cachedState = await response.json();
      console.info(logPrefix, "Auth state loaded", {
        authenticated: cachedState.authenticated,
        role: cachedState.role
      });
      return cachedState;
    } catch (error) {
      cachedState = {
        authenticated: false,
        role: "guest",
        user: null,
        roles: [],
        permissions: [],
        unavailable: true
      };
      console.warn(logPrefix, "Backend auth state unavailable; using guest state", error);
      return cachedState;
    }
  };

  const getCsrfToken = async ({ force = false } = {}) => {
    if (cachedCsrfToken && !force) {
      return cachedCsrfToken;
    }

    const response = await fetch(`${apiBaseUrl}/auth/csrf`, {
      method: "GET",
      credentials: "include"
    });
    const body = await safeJson(response);
    if (!response.ok || !body.csrfToken) {
      throw new Error("CSRF token unavailable");
    }
    cachedCsrfToken = body.csrfToken;
    console.info(logPrefix, "CSRF token refreshed");
    return cachedCsrfToken;
  };

  const login = async ({ usernameOrEmail, password }) => {
    let response;
    try {
      response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ usernameOrEmail, password })
      });
    } catch (error) {
      const authError = new Error("Backend unavailable");
      authError.code = "BACKEND_UNAVAILABLE";
      authError.cause = error;
      console.warn(logPrefix, "Login failed because backend is unavailable", error);
      throw authError;
    }

    const body = await safeJson(response);
    if (!response.ok) {
      const authError = new Error(body.detail || "Login failed");
      authError.status = response.status;
      authError.detail = body.detail;
      authError.code = response.status === 401 ? "INVALID_CREDENTIALS" : "BACKEND_SETUP_ERROR";
      console.warn(logPrefix, "Login failed", {
        status: response.status,
        code: authError.code,
        detail: body.detail
      });
      throw authError;
    }
    cachedState = body;
    cachedCsrfToken = null;
    console.info(logPrefix, "Login succeeded", {
      userId: body.user?.id,
      role: body.role
    });
    return body;
  };

  const logout = async () => {
    const response = await fetch(`${apiBaseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      console.warn(logPrefix, "Logout returned non-ok status", response.status);
    }
    cachedState = null;
    cachedCsrfToken = null;
    console.info(logPrefix, "Logout completed");
  };

  const authFetch = async (path, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("X-CSRF-Token", await getCsrfToken());
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      method,
      headers,
      credentials: "include"
    });
    if (response.status === 403 && method !== "GET") {
      cachedCsrfToken = null;
      console.warn(logPrefix, "Auth fetch rejected; CSRF cache cleared", { path, method });
    }
    return response;
  };

  const requireAuthenticatedUser = async () => {
    const state = await getCurrentAuthState({ force: true });
    if (!state.authenticated) {
      throw new Error("Authentication required");
    }
    return state;
  };

  const requireAdmin = async () => {
    const state = await requireAuthenticatedUser();
    if (!hasRole(state, "admin") && !hasPermission(state, "admin:access")) {
      throw new Error("Admin permission required");
    }
    return state;
  };

  window.PersonalWebAuth = {
    apiBaseUrl,
    authFetch,
    getCsrfToken,
    getCurrentAuthState,
    hasPermission,
    hasRole,
    login,
    logout,
    requireAdmin,
    requireAuthenticatedUser
  };
})();
