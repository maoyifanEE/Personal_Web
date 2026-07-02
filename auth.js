(function () {
  const defaultApiBase = "http://127.0.0.1:8000/api";
  const configuredBase = window.PERSONAL_WEB_API_BASE_URL;
  const apiBaseUrl = (configuredBase || defaultApiBase).replace(/\/$/, "");
  let cachedState = null;
  let cachedCsrfToken = null;

  const logPrefix = "[auth]";
  const debugLog = (event, details = {}, level = "info") => {
    if (window.PersonalWebDebug?.log) {
      window.PersonalWebDebug.log(level, event, details);
    }
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method](logPrefix, event, details);
  };

  const makeRequestId = (purpose) =>
    `${purpose}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const nowMs = () => (window.performance?.now ? window.performance.now() : Date.now());
  const durationMs = (startedAt) => Math.round((nowMs() - startedAt) * 10) / 10;
  const responseRequestId = (response) => response?.headers?.get("X-Request-ID") || null;

  const safeJson = async (response) => {
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      debugLog("auth.response.invalid_json", { error: error.message }, "warn");
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
      const requestId = makeRequestId("auth-me");
      const startedAt = nowMs();
      const response = await fetch(`${apiBaseUrl}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: {
          "X-Request-ID": requestId
        }
      });
      if (!response.ok) {
        throw new Error(`Auth state request failed: ${response.status}`);
      }
      cachedState = await response.json();
      debugLog("auth.me.loaded", {
        requestId,
        responseRequestId: responseRequestId(response),
        method: "GET",
        path: "/auth/me",
        status: response.status,
        durationMs: durationMs(startedAt),
        authenticated: cachedState.authenticated,
        roles: cachedState.roles,
        permissions: cachedState.permissions
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
      debugLog("auth.me.unavailable_guest_fallback", { error: error.message }, "warn");
      return cachedState;
    }
  };

  const getCsrfToken = async ({ force = false } = {}) => {
    if (cachedCsrfToken && !force) {
      return cachedCsrfToken;
    }

    const requestId = makeRequestId("auth-csrf");
    const startedAt = nowMs();
    const response = await fetch(`${apiBaseUrl}/auth/csrf`, {
      method: "GET",
      credentials: "include",
      headers: {
        "X-Request-ID": requestId
      }
    });
    const body = await safeJson(response);
    if (!response.ok || !body.csrfToken) {
      debugLog("auth.csrf.unavailable", {
        requestId,
        responseRequestId: responseRequestId(response),
        method: "GET",
        path: "/auth/csrf",
        status: response.status,
        durationMs: durationMs(startedAt),
        errorCategory: "csrf_unavailable"
      }, "warn");
      throw new Error("CSRF token unavailable");
    }
    cachedCsrfToken = body.csrfToken;
    debugLog("auth.csrf.refreshed", {
      requestId,
      responseRequestId: responseRequestId(response),
      method: "GET",
      path: "/auth/csrf",
      status: response.status,
      durationMs: durationMs(startedAt)
    });
    return cachedCsrfToken;
  };

  const login = async ({ usernameOrEmail, password }) => {
    let response;
    const requestId = makeRequestId("auth-login");
    const startedAt = nowMs();
    try {
      response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId
        },
        body: JSON.stringify({ usernameOrEmail, password })
      });
    } catch (error) {
      const authError = new Error("Backend unavailable");
      authError.code = "BACKEND_UNAVAILABLE";
      authError.cause = error;
      debugLog("auth.login.backend_unavailable", {
        requestId,
        method: "POST",
        path: "/auth/login",
        durationMs: durationMs(startedAt),
        errorCategory: "network_unavailable",
        error: error.message
      }, "warn");
      throw authError;
    }

    const body = await safeJson(response);
    if (!response.ok) {
      const authError = new Error(body.detail || "Login failed");
      authError.status = response.status;
      authError.detail = body.detail;
      authError.code = response.status === 401 ? "INVALID_CREDENTIALS" : "BACKEND_SETUP_ERROR";
      debugLog("auth.login.failed", {
        requestId,
        responseRequestId: responseRequestId(response),
        method: "POST",
        path: "/auth/login",
        status: response.status,
        durationMs: durationMs(startedAt),
        code: authError.code,
        errorCategory: authError.code,
        detail: body.detail
      }, "warn");
      throw authError;
    }
    cachedState = body;
    cachedCsrfToken = null;
    debugLog("auth.login.succeeded", {
      requestId,
      responseRequestId: responseRequestId(response),
      method: "POST",
      path: "/auth/login",
      status: response.status,
      durationMs: durationMs(startedAt),
      userId: body.user?.id,
      roles: body.roles
    });
    return body;
  };

  const logout = async () => {
    const requestId = makeRequestId("auth-logout");
    const startedAt = nowMs();
    const response = await fetch(`${apiBaseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Request-ID": requestId
      }
    });
    if (!response.ok) {
      debugLog("auth.logout.non_ok", {
        requestId,
        responseRequestId: responseRequestId(response),
        method: "POST",
        path: "/auth/logout",
        status: response.status,
        durationMs: durationMs(startedAt),
        errorCategory: "logout_non_ok"
      }, "warn");
    }
    cachedState = null;
    cachedCsrfToken = null;
    debugLog("auth.logout.completed", {
      requestId,
      responseRequestId: responseRequestId(response),
      method: "POST",
      path: "/auth/logout",
      status: response.status,
      durationMs: durationMs(startedAt)
    });
  };

  const authFetch = async (path, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    const requestId = headers.get("X-Request-ID") || makeRequestId("auth-fetch");
    const startedAt = nowMs();
    const csrfRequired = !["GET", "HEAD", "OPTIONS"].includes(method);
    let csrfHeaderAttached = false;
    headers.set("X-Request-ID", requestId);
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    if (csrfRequired) {
      headers.set("X-CSRF-Token", await getCsrfToken());
      csrfHeaderAttached = true;
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      method,
      headers,
      credentials: "include"
    });
    debugLog("auth.fetch.completed", {
      requestId,
      responseRequestId: responseRequestId(response),
      path,
      method,
      status: response.status,
      durationMs: durationMs(startedAt),
      csrfRequired,
      csrfHeaderAttached
    });
    if (response.status === 403 && method !== "GET") {
      cachedCsrfToken = null;
      debugLog("auth.fetch.rejected_csrf_cache_cleared", {
        requestId,
        path,
        method,
        status: response.status,
        errorCategory: "forbidden_or_csrf"
      }, "warn");
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
