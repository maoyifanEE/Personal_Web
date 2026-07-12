(function () {
  const deniedEl = document.querySelector("[data-messages-denied]");
  const deniedTextEl = document.querySelector("[data-messages-denied-text]");
  const contentEl = document.querySelector("[data-messages-content]");
  const summaryEl = document.querySelector("[data-messages-summary]");
  const statusEl = document.querySelector("[data-messages-status]");
  const listEl = document.querySelector("[data-messages-list]");
  const filtersForm = document.querySelector("[data-messages-filters]");
  const refreshButton = document.querySelector("[data-messages-refresh]");
  const detailDialog = document.querySelector("[data-message-detail]");
  const detailBody = document.querySelector("[data-message-detail-body]");

  const state = {
    messages: [],
    canManage: false
  };

  const debugLog = (event, details = {}, level = "info") => {
    if (window.PersonalWebDebug?.log) {
      window.PersonalWebDebug.log(level, event, details);
      return;
    }
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method]("[messages-admin]", event, details);
  };

  const setHidden = (element, hidden) => {
    if (element) {
      element.hidden = hidden;
    }
  };

  const setStatus = (message = "", isError = false) => {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
  };

  const showDenied = (message) => {
    if (deniedTextEl) {
      deniedTextEl.textContent = message;
    }
    setHidden(deniedEl, false);
    setHidden(contentEl, true);
  };

  const showContent = () => {
    setHidden(deniedEl, true);
    setHidden(contentEl, false);
  };

  const safeJson = async (response) => {
    const text = await response.text();
    if (!text) {
      return {};
    }
    return JSON.parse(text);
  };

  const apiJson = async (path, options = {}) => {
    const response = await window.PersonalWebAuth.authFetch(path, options);
    const body = await safeJson(response);
    if (!response.ok) {
      const error = new Error(body.detail || `Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  };

  const hasRole = (authState, role) => window.PersonalWebAuth?.hasRole?.(authState, role);
  const hasPermission = (authState, permission) => window.PersonalWebAuth?.hasPermission?.(authState, permission);

  const createText = (tagName, text, className = "") => {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    return element;
  };

  const formatDate = (value) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString("zh-CN", { hour12: false });
  };

  const statusLabel = (value) => ({
    new: "新留言",
    read: "已读",
    archived: "归档"
  }[value] || value || "-");

  const renderSummary = (summary) => {
    if (!summaryEl) {
      return;
    }
    summaryEl.replaceChildren(
      createText("span", `全部 ${summary.total ?? 0}`),
      createText("span", `有效 ${summary.active ?? 0}`),
      createText("span", `新留言 ${summary.new ?? 0}`),
      createText("span", `已读 ${summary.read ?? 0}`),
      createText("span", `归档 ${summary.archived ?? 0}`),
      createText("span", `高亮 ${summary.highlighted ?? 0}`),
      createText("span", `软删除 ${summary.deleted ?? 0}`)
    );
  };

  const currentQuery = () => {
    const formData = new FormData(filtersForm);
    const params = new URLSearchParams();
    const status = String(formData.get("status") || "");
    const dataScope = String(formData.get("dataScope") || "");
    const search = String(formData.get("search") || "").trim();
    if (status) {
      params.set("status", status);
    }
    if (dataScope) {
      params.set("data_scope", dataScope);
    }
    if (search) {
      params.set("search", search);
    }
    if (formData.get("highlighted")) {
      params.set("highlighted", "true");
    }
    if (formData.get("includeDeleted")) {
      params.set("include_deleted", "true");
    }
    params.set("limit", "100");
    return params.toString();
  };

  const actionButton = (label, handler, disabled = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", async () => {
      try {
        button.disabled = true;
        await handler();
      } catch (error) {
        setStatus(error.message, true);
        debugLog("messages_admin.action.failure", { label, error: error.message, status: error.status }, "warn");
      } finally {
        button.disabled = false;
      }
    });
    return button;
  };

  const loadAll = async () => {
    setStatus("正在加载留言...");
    const [summary, list] = await Promise.all([
      apiJson("/admin/messages/summary"),
      apiJson(`/admin/messages?${currentQuery()}`)
    ]);
    state.messages = Array.isArray(list.items) ? list.items : [];
    renderSummary(summary);
    renderList();
    setStatus(`已加载 ${state.messages.length} 条留言。`);
    debugLog("messages_admin.loaded", { count: state.messages.length });
  };

  const patchMessage = async (messageId, payload) => {
    await apiJson(`/admin/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await loadAll();
  };

  const softDeleteMessage = async (messageId) => {
    await apiJson(`/admin/messages/${messageId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: "admin soft delete from messages UI" })
    });
    await loadAll();
  };

  const restoreMessage = async (messageId) => {
    await apiJson(`/admin/messages/${messageId}/restore`, { method: "POST" });
    await loadAll();
  };

  const openDetail = (message) => {
    if (!detailDialog || !detailBody) {
      return;
    }
    const noteInput = document.createElement("textarea");
    noteInput.rows = 4;
    noteInput.value = message.adminNote || "";
    noteInput.placeholder = "管理员备注";
    const actions = document.createElement("div");
    actions.className = "messages-detail__actions";
    actions.append(
      actionButton("保存备注", () => patchMessage(message.id, { adminNote: noteInput.value }), !state.canManage),
      actionButton("标记已读", () => patchMessage(message.id, { status: "read" }), !state.canManage),
      actionButton("归档", () => patchMessage(message.id, { status: "archived" }), !state.canManage)
    );
    detailBody.replaceChildren(
      createText("h2", `#${message.id} ${message.nickname}`),
      createText("p", `时间：${formatDate(message.createdAt)}`),
      createText("p", `联系方式：${message.contact || "未提供"}`),
      createText("p", `状态：${statusLabel(message.status)} / ${message.dataScope}`),
      createText("p", `高亮：${message.isHighlighted ? "是" : "否"}`),
      createText("p", `软删除：${message.deletedAt ? formatDate(message.deletedAt) : "否"}`),
      createText("h3", "留言内容"),
      createText("p", message.message, "messages-detail__message"),
      createText("h3", "管理员备注"),
      noteInput,
      actions
    );
    detailDialog.showModal();
  };

  const renderList = () => {
    if (!listEl) {
      return;
    }
    listEl.replaceChildren();
    if (!state.messages.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.textContent = "当前筛选条件下没有留言。";
      row.append(cell);
      listEl.append(row);
      return;
    }
    state.messages.forEach((message) => {
      const row = document.createElement("tr");
      if (message.deletedAt) {
        row.classList.add("is-deleted");
      }
      const statusCell = createText("td", statusLabel(message.status));
      if (message.isHighlighted) {
        statusCell.append(createText("span", "高亮", "status-pill status-pill--highlight"));
      }
      const actions = document.createElement("td");
      actions.className = "messages-row-actions";
      actions.append(
        actionButton("详情", () => openDetail(message)),
        actionButton("已读", () => patchMessage(message.id, { status: "read" }), !state.canManage || Boolean(message.deletedAt)),
        actionButton(message.isHighlighted ? "取消高亮" : "高亮", () => {
          return patchMessage(message.id, { isHighlighted: !message.isHighlighted });
        }, !state.canManage || Boolean(message.deletedAt))
      );
      if (message.deletedAt) {
        actions.append(actionButton("恢复", () => restoreMessage(message.id), !state.canManage));
      } else {
        actions.append(actionButton("软删除", () => softDeleteMessage(message.id), !state.canManage));
      }
      row.append(
        createText("td", String(message.id)),
        createText("td", formatDate(message.createdAt)),
        createText("td", message.nickname),
        createText("td", message.contact || "未提供"),
        statusCell,
        createText("td", message.dataScope),
        createText("td", message.message.length > 80 ? `${message.message.slice(0, 80)}...` : message.message),
        actions
      );
      listEl.append(row);
    });
  };

  const initialize = async () => {
    if (!window.PersonalWebAuth) {
      showDenied("认证模块未加载，无法访问留言管理。");
      return;
    }
    try {
      const authState = await window.PersonalWebAuth.getCurrentAuthState({ force: true });
      const canRead = hasRole(authState, "admin") && hasPermission(authState, "visitor_messages:read");
      state.canManage = hasRole(authState, "admin") && hasPermission(authState, "visitor_messages:manage");
      if (!authState.authenticated || !canRead) {
        showDenied("需要管理员登录，并拥有 visitor_messages:read 权限。");
        debugLog("messages_admin.auth.denied", {
          authenticated: Boolean(authState.authenticated),
          roles: authState.roles,
          permissions: authState.permissions
        }, "warn");
        return;
      }
      showContent();
      await loadAll();
    } catch (error) {
      showDenied("无法检查权限，请确认本地后端已启动并重新登录。");
      debugLog("messages_admin.initialize.failure", { error: error.message }, "warn");
    }
  };

  filtersForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadAll().catch((error) => {
      setStatus(error.message, true);
      debugLog("messages_admin.filter.failure", { error: error.message }, "warn");
    });
  });

  refreshButton?.addEventListener("click", () => {
    loadAll().catch((error) => {
      setStatus(error.message, true);
      debugLog("messages_admin.refresh.failure", { error: error.message }, "warn");
    });
  });

  initialize();
})();
