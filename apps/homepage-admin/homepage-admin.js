(function () {
  const statusEl = document.querySelector("[data-homepage-admin-status]");
  const substatusEl = document.querySelector("[data-homepage-admin-substatus]");
  const deniedEl = document.querySelector("[data-homepage-admin-denied]");
  const deniedTextEl = document.querySelector("[data-homepage-admin-denied-text]");
  const contentEl = document.querySelector("[data-homepage-admin-content]");
  const mediaUploadForm = document.querySelector("[data-media-upload-form]");
  const itemCreateForm = document.querySelector("[data-item-create-form]");
  const mediaListEl = document.querySelector("[data-media-list]");
  const itemListEl = document.querySelector("[data-item-list]");
  const publicPreviewEl = document.querySelector("[data-public-preview]");
  const smokeCleanupPanel = document.querySelector("[data-smoke-cleanup-panel]");
  const mediaSelect = document.querySelector("[data-media-select]");
  const refreshMediaButton = document.querySelector("[data-refresh-media]");
  const refreshItemsButton = document.querySelector("[data-refresh-items]");
  const refreshPublicButton = document.querySelector("[data-refresh-public]");
  const previewSmokeCleanupButton = document.querySelector("[data-preview-smoke-cleanup]");

  const state = {
    media: [],
    items: [],
    publicItems: []
  };

  const debugLog = (event, details = {}, level = "info") => {
    if (window.PersonalWebDebug?.log) {
      window.PersonalWebDebug.log(level, event, details);
      return;
    }
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method]("[homepage-admin]", event, details);
  };

  const setStatus = (message, details = "") => {
    if (statusEl) {
      statusEl.textContent = message;
    }
    if (substatusEl) {
      substatusEl.textContent = details;
    }
  };

  const publicHomepageSyncHint = "已打开的首页会在重新聚焦或返回页面时自动同步。";

  const showDenied = (message, showLogin = false) => {
    if (deniedTextEl) {
      deniedTextEl.textContent = message;
    }
    if (deniedEl) {
      deniedEl.hidden = false;
      const loginLink = deniedEl.querySelector('a[href="../../login.html"]');
      if (loginLink) {
        loginLink.hidden = !showLogin;
      }
    }
    if (contentEl) {
      contentEl.hidden = true;
    }
  };

  const showContent = () => {
    if (deniedEl) {
      deniedEl.hidden = true;
    }
    if (contentEl) {
      contentEl.hidden = false;
    }
  };

  const apiJson = async (path, options = {}) => {
    const response = await window.PersonalWebAuth.authFetch(path, options);
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(body.detail || `Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  };

  const publicJson = async () => {
    const apiBaseUrl = window.PersonalWebAuth?.apiBaseUrl || "http://127.0.0.1:8000/api";
    const response = await fetch(`${apiBaseUrl}/homepage/public`, {
      method: "GET",
      credentials: "include"
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.detail || `Public preview failed: ${response.status}`);
    }
    return body;
  };

  const errorMessage = (error) => {
    if (error?.status === 400) {
      return "请求内容无效，可能是文件类型、内容签名或表单字段不符合要求。";
    }
    if (error?.status === 401) {
      return "登录已失效，请重新登录。";
    }
    if (error?.status === 403) {
      return "当前账号没有 homepage:edit 权限。";
    }
    if (error?.status === 413) {
      return "文件过大，超过本地开发限制。";
    }
    return error?.message || "后端不可用或请求失败。";
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) {
      return "-";
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (value) => {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString("zh-CN");
  };

  const formValue = (form, name) => String(new FormData(form).get(name) || "").trim();

  const nullableText = (value) => {
    const text = String(value || "").trim();
    return text || null;
  };

  const mediaOptionLabel = (media) =>
    `#${media.id} ${media.title || media.originalFilename || media.mediaType} (${media.mediaType})`;

  const refreshMediaSelect = () => {
    if (!mediaSelect) {
      return;
    }
    const currentValue = mediaSelect.value;
    mediaSelect.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "无";
    mediaSelect.append(empty);
    state.media.forEach((media) => {
      const option = document.createElement("option");
      option.value = String(media.id);
      option.textContent = mediaOptionLabel(media);
      mediaSelect.append(option);
    });
    mediaSelect.value = currentValue;
  };

  const createBadge = (text, className = "") => {
    const span = document.createElement("span");
    span.className = `homepage-admin-badge ${className}`.trim();
    span.textContent = text;
    return span;
  };

  const createPreview = (media) => {
    const preview = document.createElement("div");
    preview.className = "homepage-admin-row-preview";
    if (!media?.adminUrl) {
      preview.textContent = "无预览";
      return preview;
    }
    if (media.mediaType === "image") {
      const image = document.createElement("img");
      image.src = media.adminUrl;
      image.alt = media.title || media.originalFilename || "";
      preview.append(image);
      return preview;
    }
    if (media.mediaType === "video") {
      const video = document.createElement("video");
      video.src = media.adminUrl;
      video.controls = true;
      video.preload = "metadata";
      preview.append(video);
      return preview;
    }
    preview.textContent = media.mediaType || "unknown";
    return preview;
  };

  const copyText = async (text, label) => {
    if (!navigator.clipboard?.writeText) {
      setStatus(`${label}：${text}`);
      return;
    }
    await navigator.clipboard.writeText(String(text));
    setStatus(`${label} 已复制。`);
  };

  const patchMedia = async (mediaId, payload) => {
    const updated = await apiJson(`/homepage/media/${mediaId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    debugLog("homepage_admin.media.update.success", { mediaId, payload });
    setStatus(`媒体 #${updated.id} 已更新。`);
    await loadAll();
  };

  const patchItem = async (itemId, payload) => {
    const updated = await apiJson(`/homepage/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    debugLog("homepage_admin.item.update.success", { itemId, payload });
    await loadAll();
    setStatus(`展示项 #${updated.id} 已更新。`, publicHomepageSyncHint);
  };

  const hideItem = async (itemId, shouldReload = true) => {
    const updated = await apiJson(`/homepage/items/${itemId}`, {
      method: "DELETE"
    });
    debugLog("homepage_admin.item.hide.success", { itemId });
    if (shouldReload) {
      await loadAll();
    }
    setStatus(`展示项 #${updated.id} 已隐藏。`, publicHomepageSyncHint);
  };

  const fieldInput = (labelText, name, value = "", type = "text") => {
    const label = document.createElement("label");
    label.className = "homepage-admin-field";
    label.textContent = labelText;
    const input = document.createElement("input");
    input.name = name;
    input.type = type;
    input.value = value ?? "";
    label.append(input);
    return label;
  };

  const fieldTextarea = (labelText, name, value = "") => {
    const label = document.createElement("label");
    label.className = "homepage-admin-field";
    label.textContent = labelText;
    const textarea = document.createElement("textarea");
    textarea.name = name;
    textarea.rows = 3;
    textarea.value = value ?? "";
    label.append(textarea);
    return label;
  };

  const fieldSelect = (labelText, name, value, options) => {
    const label = document.createElement("label");
    label.className = "homepage-admin-field";
    label.textContent = labelText;
    const select = document.createElement("select");
    select.name = name;
    options.forEach((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.append(element);
    });
    select.value = value ?? "";
    label.append(select);
    return label;
  };

  const fieldCheckbox = (labelText, name, checked) => {
    const label = document.createElement("label");
    label.className = "homepage-admin-check";
    const input = document.createElement("input");
    input.name = name;
    input.type = "checkbox";
    input.checked = Boolean(checked);
    label.append(input, document.createTextNode(labelText));
    return label;
  };

  const rowPayload = (root, names) => {
    const payload = {};
    names.forEach((name) => {
      const field = root.querySelector(`[name="${name}"]`);
      if (!field) {
        return;
      }
      if (field.type === "checkbox") {
        payload[name] = field.checked;
        return;
      }
      payload[name] = field.value;
    });
    return payload;
  };

  const actionButton = (text, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", async () => {
      try {
        button.disabled = true;
        await handler();
      } catch (error) {
        debugLog("homepage_admin.action.failure", { action: text, error: error.message }, "warn");
        setStatus(`${text}失败：${errorMessage(error)}`);
      } finally {
        button.disabled = false;
      }
    });
    return button;
  };

  const actionLink = (text, href) => {
    const link = document.createElement("a");
    link.className = "secondary-action";
    link.textContent = text;
    link.href = href || "#";
    link.target = "_blank";
    link.rel = "noopener";
    if (!href) {
      link.hidden = true;
    }
    return link;
  };

  const mediaOptions = () => [
    { value: "", label: "无" },
    ...state.media.map((media) => ({ value: String(media.id), label: mediaOptionLabel(media) }))
  ];

  const renderMedia = () => {
    if (!mediaListEl) {
      return;
    }
    mediaListEl.innerHTML = "";
    if (!state.media.length) {
      const empty = document.createElement("p");
      empty.className = "homepage-admin-empty";
      empty.textContent = "暂无媒体。";
      mediaListEl.append(empty);
      return;
    }
    state.media.forEach((media) => {
      const row = document.createElement("article");
      row.className = "homepage-admin-row";
      const preview = createPreview(media);
      const body = document.createElement("div");
      body.className = "homepage-admin-row-body";

      const title = document.createElement("h3");
      title.textContent = `#${media.id} ${media.title || media.originalFilename}`;
      const meta = document.createElement("p");
      meta.className = "homepage-admin-meta";
      [
        `类型 ${media.mediaType}`,
        `MIME ${media.mimeType}`,
        `大小 ${formatBytes(media.fileSizeBytes)}`,
        `排序 ${media.sortOrder}`,
        `创建 ${formatDate(media.createdAt)}`
      ].forEach((part) => meta.append(createBadge(part)));
      meta.append(createBadge(media.isEnabled ? "已启用" : "已禁用", media.isEnabled ? "is-enabled" : "is-hidden"));

      const filename = document.createElement("p");
      filename.textContent = `原始文件：${media.originalFilename}`;
      const publicUrl = document.createElement("p");
      publicUrl.textContent = `公开 URL：${media.url}（仅当启用媒体被可见展示项引用时可访问）`;

      const editGrid = document.createElement("div");
      editGrid.className = "homepage-admin-edit-grid";
      editGrid.append(
        fieldInput("标题", "title", media.title || ""),
        fieldTextarea("描述", "description", media.description || ""),
        fieldInput("排序", "sortOrder", media.sortOrder, "number")
      );

      const actions = document.createElement("div");
      actions.className = "homepage-admin-row-actions";
      actions.append(
        actionButton(media.isEnabled ? "禁用" : "启用", () => patchMedia(media.id, { isEnabled: !media.isEnabled })),
        actionButton("保存元数据", () => {
          const payload = rowPayload(editGrid, ["title", "description", "sortOrder"]);
          payload.sortOrder = Number(payload.sortOrder || 0);
          return patchMedia(media.id, payload);
        }),
        actionButton("复制媒体 ID", () => copyText(media.id, "媒体 ID")),
        actionLink("Admin 预览", media.adminUrl),
        actionLink("公开 URL", media.url)
      );

      body.append(title, meta, filename, publicUrl, editGrid, actions);
      row.append(preview, body);
      mediaListEl.append(row);
    });
  };

  const renderItems = () => {
    if (!itemListEl) {
      return;
    }
    itemListEl.innerHTML = "";
    if (!state.items.length) {
      const empty = document.createElement("p");
      empty.className = "homepage-admin-empty";
      empty.textContent = "暂无展示项。";
      itemListEl.append(empty);
      return;
    }
    state.items.forEach((item) => {
      const row = document.createElement("article");
      row.className = "homepage-admin-row";
      const preview = createPreview(item.media);
      const body = document.createElement("div");
      body.className = "homepage-admin-row-body";

      const title = document.createElement("h3");
      title.textContent = `#${item.id} ${item.title}`;
      const meta = document.createElement("p");
      meta.className = "homepage-admin-meta";
      [
        `类型 ${item.displayType}`,
        `媒体 ${item.mediaId || "无"}`,
        `排序 ${item.sortOrder}`,
        `地点 ${item.locationLabel || "-"}`,
        `时间 ${item.timeLabel || "-"}`,
        `更新 ${formatDate(item.updatedAt)}`
      ].forEach((part) => meta.append(createBadge(part)));
      meta.append(createBadge(item.isVisible ? "可见" : "隐藏", item.isVisible ? "is-visible" : "is-hidden"));

      const editGrid = document.createElement("div");
      editGrid.className = "homepage-admin-edit-grid";
      editGrid.append(
        fieldInput("标题", "title", item.title || ""),
        fieldInput("副标题", "subtitle", item.subtitle || ""),
        fieldTextarea("描述", "description", item.description || ""),
        fieldInput("地点", "locationLabel", item.locationLabel || ""),
        fieldInput("时间", "timeLabel", item.timeLabel || ""),
        fieldSelect("展示类型", "displayType", item.displayType, [
          { value: "card", label: "card" },
          { value: "image", label: "image" },
          { value: "video", label: "video" },
          { value: "sticker", label: "sticker" }
        ]),
        fieldSelect("媒体", "mediaId", item.mediaId ? String(item.mediaId) : "", mediaOptions()),
        fieldInput("排序", "sortOrder", item.sortOrder, "number"),
        fieldCheckbox("可见", "isVisible", item.isVisible)
      );

      const actions = document.createElement("div");
      actions.className = "homepage-admin-row-actions";
      actions.append(
        actionButton("保存", () => {
          const payload = rowPayload(editGrid, [
            "title",
            "subtitle",
            "description",
            "locationLabel",
            "timeLabel",
            "displayType",
            "mediaId",
            "sortOrder",
            "isVisible"
          ]);
          payload.mediaId = payload.mediaId ? Number(payload.mediaId) : null;
          payload.sortOrder = Number(payload.sortOrder || 0);
          return patchItem(item.id, payload);
        }),
        actionButton(item.isVisible ? "隐藏" : "显示", () => patchItem(item.id, { isVisible: !item.isVisible })),
        actionButton("软隐藏", () => hideItem(item.id)),
        actionButton("复制展示项 ID", () => copyText(item.id, "展示项 ID"))
      );

      body.append(title, meta, editGrid, actions);
      row.append(preview, body);
      itemListEl.append(row);
    });
  };

  const renderPublicPreview = () => {
    if (!publicPreviewEl) {
      return;
    }
    publicPreviewEl.innerHTML = "";
    const summary = document.createElement("p");
    summary.textContent = `公开展示项数量：${state.publicItems.length}`;
    publicPreviewEl.append(summary);
    if (!state.publicItems.length) {
      const empty = document.createElement("p");
      empty.className = "homepage-admin-empty";
      empty.textContent = "公开首页当前没有数据库展示项。";
      publicPreviewEl.append(empty);
      return;
    }
    state.publicItems.forEach((item) => {
      const row = document.createElement("article");
      row.className = "homepage-admin-public-item";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const meta = document.createElement("p");
      meta.textContent = `#${item.id} | ${item.displayType} | ${item.media ? "有媒体" : "无媒体"}`;
      row.append(title, meta);
      publicPreviewEl.append(row);
    });
  };

  const loadMedia = async () => {
    const payload = await apiJson("/homepage/media");
    state.media = Array.isArray(payload.media) ? payload.media : [];
    debugLog("homepage_admin.media.list.loaded", { count: state.media.length });
    refreshMediaSelect();
    renderMedia();
  };

  const loadItems = async () => {
    const payload = await apiJson("/homepage/items");
    state.items = Array.isArray(payload.items) ? payload.items : [];
    debugLog("homepage_admin.item.list.loaded", { count: state.items.length });
    renderItems();
  };

  const loadPublicPreview = async () => {
    const payload = await publicJson();
    state.publicItems = Array.isArray(payload.items) ? payload.items : [];
    debugLog("homepage_admin.public_preview.loaded", { count: state.publicItems.length });
    renderPublicPreview();
  };

  const loadAll = async () => {
    setStatus("正在加载首页内容管理数据...");
    await loadMedia();
    await loadItems();
    await loadPublicPreview();
    setStatus("首页内容管理数据已加载。", `媒体 ${state.media.length} 个，展示项 ${state.items.length} 个。`);
  };

  const uploadMedia = async (event) => {
    event.preventDefault();
    const formData = new FormData(mediaUploadForm);
    const file = formData.get("file");
    if (!file || !file.name) {
      setStatus("请选择要上传的媒体文件。");
      return;
    }
    debugLog("homepage_admin.media.upload.start", {
      filename: file.name,
      size: file.size,
      type: file.type
    });
    try {
      setStatus("正在上传媒体...");
      await apiJson("/homepage/media", {
        method: "POST",
        body: formData
      });
      debugLog("homepage_admin.media.upload.success", { filename: file.name });
      mediaUploadForm.reset();
      setStatus("媒体上传成功。");
      await loadAll();
    } catch (error) {
      debugLog("homepage_admin.media.upload.failure", {
        filename: file.name,
        status: error.status,
        error: error.message
      }, "warn");
      setStatus(`媒体上传失败：${errorMessage(error)}`);
    }
  };

  const createItem = async (event) => {
    event.preventDefault();
    const payload = {
      title: formValue(itemCreateForm, "title"),
      subtitle: nullableText(formValue(itemCreateForm, "subtitle")),
      description: nullableText(formValue(itemCreateForm, "description")),
      locationLabel: nullableText(formValue(itemCreateForm, "locationLabel")),
      timeLabel: nullableText(formValue(itemCreateForm, "timeLabel")),
      mediaId: formValue(itemCreateForm, "mediaId") ? Number(formValue(itemCreateForm, "mediaId")) : null,
      displayType: formValue(itemCreateForm, "displayType") || "card",
      sortOrder: Number(formValue(itemCreateForm, "sortOrder") || 0),
      isVisible: Boolean(new FormData(itemCreateForm).get("isVisible"))
    };
    if (!payload.title) {
      setStatus("请填写展示项标题。");
      return;
    }
    try {
      const created = await apiJson("/homepage/items", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      debugLog("homepage_admin.item.create.success", { itemId: created.id, mediaId: created.mediaId });
      itemCreateForm.reset();
      itemCreateForm.querySelector('[name="isVisible"]').checked = true;
      await loadAll();
      setStatus(`展示项 #${created.id} 已创建。`, publicHomepageSyncHint);
    } catch (error) {
      debugLog("homepage_admin.item.create.failure", { error: error.message }, "warn");
      setStatus(`创建展示项失败：${errorMessage(error)}`);
    }
  };

  const isSmokeItem = (item) => {
    const fields = [
      item.title,
      item.subtitle,
      item.locationLabel,
      item.timeLabel,
      item.description
    ].map((value) => String(value || ""));
    return (
      fields[0].includes("Smoke") ||
      fields[1].includes("Visible database item") ||
      item.locationLabel === "Local" ||
      item.timeLabel === "Smoke" ||
      fields[4].includes("/api/homepage/public during smoke testing")
    );
  };

  const previewSmokeCleanup = () => {
    const matches = state.items.filter((item) => item.isVisible && isSmokeItem(item));
    debugLog("homepage_admin.smoke_cleanup.preview", {
      count: matches.length,
      itemIds: matches.map((item) => item.id)
    });
    if (!smokeCleanupPanel) {
      return;
    }
    smokeCleanupPanel.hidden = false;
    smokeCleanupPanel.innerHTML = "";
    const title = document.createElement("h3");
    title.textContent = `匹配到 ${matches.length} 个测试展示项`;
    smokeCleanupPanel.append(title);
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.textContent = "没有发现可隐藏的 smoke/test 展示项。";
      smokeCleanupPanel.append(empty);
      return;
    }
    const list = document.createElement("ul");
    matches.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `#${item.id} ${item.title}`;
      list.append(li);
    });
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "确认隐藏这些测试展示项";
    button.addEventListener("click", async () => {
      if (!window.confirm(`确认隐藏 ${matches.length} 个测试展示项？`)) {
        return;
      }
      for (const item of matches) {
        await hideItem(item.id, false);
      }
      debugLog("homepage_admin.smoke_cleanup.success", { count: matches.length });
      smokeCleanupPanel.hidden = true;
      await loadAll();
      setStatus(`已隐藏 ${matches.length} 个测试展示项。`, publicHomepageSyncHint);
    });
    smokeCleanupPanel.append(list, button);
  };

  const initialize = async () => {
    debugLog("homepage_admin.page.load");
    if (!window.PersonalWebAuth) {
      showDenied("认证助手未加载，无法访问首页内容管理。", true);
      return;
    }
    try {
      const authState = await window.PersonalWebAuth.getCurrentAuthState({ force: true });
      if (!authState.authenticated) {
        debugLog("homepage_admin.auth.denied", { reason: "guest" }, "warn");
        setStatus("需要登录后使用。");
        showDenied("需要登录后使用。", true);
        return;
      }
      const canEditHomepage =
        window.PersonalWebAuth.hasRole(authState, "admin") ||
        window.PersonalWebAuth.hasPermission(authState, "homepage:edit");
      if (!canEditHomepage) {
        debugLog("homepage_admin.auth.denied", {
          userId: authState.user?.id,
          roles: authState.roles,
          permissions: authState.permissions
        }, "warn");
        setStatus("当前账号没有 homepage:edit 权限。");
        showDenied("当前账号没有 homepage:edit 权限。", false);
        return;
      }
      debugLog("homepage_admin.auth.allowed", {
        userId: authState.user?.id,
        roles: authState.roles
      });
      setStatus("权限检查通过。", `当前用户：${authState.user?.displayName || authState.user?.username}`);
      showContent();
      await loadAll();
    } catch (error) {
      debugLog("homepage_admin.auth.denied", { error: error.message }, "warn");
      setStatus("无法检查权限。");
      showDenied("无法检查权限，请确认本地后端已启动。", true);
    }
  };

  mediaUploadForm?.addEventListener("submit", uploadMedia);
  itemCreateForm?.addEventListener("submit", createItem);
  refreshMediaButton?.addEventListener("click", () => {
    loadMedia().catch((error) => setStatus(errorMessage(error)));
  });
  refreshItemsButton?.addEventListener("click", () => {
    loadItems().catch((error) => setStatus(errorMessage(error)));
  });
  refreshPublicButton?.addEventListener("click", () => {
    loadPublicPreview().catch((error) => setStatus(errorMessage(error)));
  });
  previewSmokeCleanupButton?.addEventListener("click", previewSmokeCleanup);

  initialize();
})();
