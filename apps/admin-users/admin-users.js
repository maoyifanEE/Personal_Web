(function () {
  const statusEl = document.querySelector("[data-admin-users-status]");
  const contentEl = document.querySelector("[data-admin-users-content]");
  const tableEl = document.querySelector("[data-admin-users-table]");
  const createForm = document.querySelector("[data-create-user-form]");
  const refreshButton = document.querySelector("[data-refresh-users]");

  const setStatus = (message) => {
    if (statusEl) {
      statusEl.textContent = message;
    }
  };

  const apiJson = async (path, options = {}) => {
    const response = await window.PersonalWebAuth.authFetch(path, options);
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(body.detail || `Request failed: ${response.status}`);
    }
    return body;
  };

  const renderUsers = (users) => {
    if (!tableEl) {
      return;
    }
    tableEl.innerHTML = "";
    users.forEach((user) => {
      const card = document.createElement("article");
      card.className = "admin-user-row";
      card.innerHTML = `
        <div>
          <h3>${user.displayName || user.username}</h3>
          <p>用户名：${user.username}</p>
          <p>状态：${user.status}</p>
          <p>角色：${(user.roles || []).join(", ") || "none"}</p>
        </div>
        <div class="admin-user-actions">
          <button type="button" data-toggle-active>${user.status === "active" ? "停用" : "启用"}</button>
          <button type="button" data-reset-password>重置密码</button>
          <button type="button" data-add-admin>加 admin</button>
          <button type="button" data-remove-admin>移除 admin</button>
        </div>
      `;

      card.querySelector("[data-toggle-active]")?.addEventListener("click", async () => {
        await updateUser(user.id, { isActive: user.status !== "active" });
      });
      card.querySelector("[data-reset-password]")?.addEventListener("click", async () => {
        const password = window.prompt("请输入新的临时密码。");
        if (!password) {
          return;
        }
        await resetPassword(user.id, password);
      });
      card.querySelector("[data-add-admin]")?.addEventListener("click", async () => {
        await addRole(user.id, "admin");
      });
      card.querySelector("[data-remove-admin]")?.addEventListener("click", async () => {
        await removeRole(user.id, "admin");
      });

      tableEl.appendChild(card);
    });
  };

  const loadUsers = async () => {
    setStatus("正在加载用户...");
    const users = await apiJson("/admin/users");
    console.info("[admin-users] Loaded users", { count: users.length });
    renderUsers(users);
    setStatus(`已加载 ${users.length} 个用户。`);
  };

  const updateUser = async (userId, payload) => {
    await apiJson(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    console.info("[admin-users] Updated user", { userId, payload });
    await loadUsers();
  };

  const resetPassword = async (userId, password) => {
    await apiJson(`/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password })
    });
    console.info("[admin-users] Reset password", { userId });
    await loadUsers();
  };

  const addRole = async (userId, role) => {
    await apiJson(`/admin/users/${userId}/roles`, {
      method: "POST",
      body: JSON.stringify({ role })
    });
    console.info("[admin-users] Added role", { userId, role });
    await loadUsers();
  };

  const removeRole = async (userId, role) => {
    await apiJson(`/admin/users/${userId}/roles/${role}`, {
      method: "DELETE"
    });
    console.info("[admin-users] Removed role", { userId, role });
    await loadUsers();
  };

  const initialize = async () => {
    if (!window.PersonalWebAuth) {
      setStatus("认证助手未加载，无法访问用户管理。");
      return;
    }
    try {
      const state = await window.PersonalWebAuth.requireAdmin();
      console.info("[admin-users] Admin access granted", { userId: state.user?.id });
      if (contentEl) {
        contentEl.hidden = false;
      }
      await loadUsers();
    } catch (error) {
      console.warn("[admin-users] Admin access denied", error);
      setStatus("需要管理员权限。请先使用管理员账号登录。");
    }
  };

  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const payload = {
      username: String(formData.get("username") || "").trim(),
      displayName: String(formData.get("displayName") || "").trim(),
      password: String(formData.get("password") || ""),
      roles: [String(formData.get("role") || "user")]
    };
    if (!payload.username || !payload.password) {
      setStatus("请填写用户名和密码。");
      return;
    }
    try {
      await apiJson("/admin/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      console.info("[admin-users] Created user", { username: payload.username, roles: payload.roles });
      createForm.reset();
      await loadUsers();
    } catch (error) {
      console.warn("[admin-users] Create user failed", error);
      setStatus(`创建失败：${error.message}`);
    }
  });

  refreshButton?.addEventListener("click", () => {
    loadUsers().catch((error) => {
      console.warn("[admin-users] Refresh failed", error);
      setStatus(`刷新失败：${error.message}`);
    });
  });

  initialize();
})();
