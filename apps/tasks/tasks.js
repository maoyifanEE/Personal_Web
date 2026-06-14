(function () {
  "use strict";

  var STORAGE_KEY = "personal_web_tasks_v1";
  var DAY_MS = 24 * 60 * 60 * 1000;
  var state = loadState();

  var elements = {};

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bindEvents();
    render();
    console.log("[Personal_Web] 任务清单 V1 已加载：", {
      storageKey: STORAGE_KEY,
      tasks: state.tasks.length,
      lists: state.lists.length,
      tags: state.tags.length,
      activeView: state.ui.activeView
    });
  });

  function cacheElements() {
    elements.shell = document.querySelector(".task-app-shell");
    elements.viewButtons = document.querySelectorAll("[data-view-button]");
    elements.sidebar = document.querySelector(".task-sidebar");
    elements.userListStack = document.getElementById("user-list-stack");
    elements.taskView = document.getElementById("task-view");
    elements.calendarView = document.getElementById("calendar-view");
    elements.taskTitle = document.getElementById("task-view-title");
    elements.quickAddForm = document.getElementById("quick-add-form");
    elements.quickAddInput = document.getElementById("quick-add-input");
    elements.taskGroupStack = document.getElementById("task-group-stack");
    elements.calendarTitle = document.getElementById("calendar-title");
    elements.calendarGrid = document.getElementById("calendar-grid");
    elements.detailEmpty = document.getElementById("detail-empty");
    elements.detailForm = document.getElementById("detail-form");
    elements.resetButton = document.getElementById("reset-demo-button");
    elements.prevMonth = document.getElementById("prev-month-button");
    elements.nextMonth = document.getElementById("next-month-button");
    elements.todayButton = document.getElementById("calendar-today-button");
    elements.calendarAddButton = document.getElementById("calendar-add-button");
  }

  function bindEvents() {
    elements.viewButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setActiveView(button.dataset.viewButton);
      });
    });

    elements.sidebar.addEventListener("click", function (event) {
      var smartButton = event.target.closest("[data-smart-list]");
      if (smartButton) {
        selectSmartList(smartButton.dataset.smartList);
        return;
      }

      var listButton = event.target.closest("[data-list-id]");
      if (listButton) {
        selectUserList(listButton.dataset.listId);
      }
    });

    elements.quickAddForm.addEventListener("submit", function (event) {
      event.preventDefault();
      quickAddTask(elements.quickAddInput.value);
    });

    elements.taskGroupStack.addEventListener("click", function (event) {
      var checkButton = event.target.closest("[data-toggle-task]");
      if (checkButton) {
        toggleTaskCompleted(checkButton.dataset.toggleTask);
        return;
      }

      var row = event.target.closest("[data-task-row]");
      if (row) {
        selectTask(row.dataset.taskRow);
      }
    });

    elements.calendarGrid.addEventListener("click", function (event) {
      var taskButton = event.target.closest("[data-calendar-task]");
      if (taskButton) {
        selectTask(taskButton.dataset.calendarTask);
        return;
      }

      var dayCell = event.target.closest("[data-calendar-date]");
      if (dayCell) {
        state.ui.selectedCalendarDate = dayCell.dataset.calendarDate;
        saveState("选择日历日期");
        render();
      }
    });

    elements.calendarGrid.addEventListener("dblclick", function (event) {
      var dayCell = event.target.closest("[data-calendar-date]");
      if (dayCell) {
        createCalendarTask(dayCell.dataset.calendarDate);
      }
    });

    document.getElementById("detail-form").addEventListener("submit", function (event) {
      event.preventDefault();
      saveDetailForm();
    });

    document.getElementById("detail-completed").addEventListener("change", function () {
      var task = getSelectedTask();
      if (!task) {
        return;
      }
      setTaskCompleted(task, document.getElementById("detail-completed").checked);
      saveState("详情完成状态更新");
      render();
    });

    document.getElementById("trash-task-button").addEventListener("click", trashSelectedTask);
    document.getElementById("restore-task-button").addEventListener("click", restoreSelectedTask);
    document.getElementById("delete-task-button").addEventListener("click", deleteSelectedTask);
    document.getElementById("close-detail-button").addEventListener("click", function () {
      state.ui.selectedTaskId = null;
      saveState("关闭任务详情");
      render();
    });

    document.getElementById("subtask-input").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        addSubtask(event.target.value);
      }
    });

    document.getElementById("subtask-list").addEventListener("click", function (event) {
      var toggle = event.target.closest("[data-subtask-toggle]");
      if (toggle) {
        toggleSubtask(toggle.dataset.subtaskToggle);
        return;
      }

      var remove = event.target.closest("[data-subtask-remove]");
      if (remove) {
        removeSubtask(remove.dataset.subtaskRemove);
      }
    });

    elements.resetButton.addEventListener("click", function () {
      if (window.confirm("确认重置任务清单示例数据？")) {
        state = createSeedState();
        saveState("重置示例数据");
        render();
      }
    });

    elements.prevMonth.addEventListener("click", function () {
      shiftMonth(-1);
    });

    elements.nextMonth.addEventListener("click", function () {
      shiftMonth(1);
    });

    elements.todayButton.addEventListener("click", function () {
      var today = new Date();
      state.ui.calendarYear = today.getFullYear();
      state.ui.calendarMonth = today.getMonth();
      state.ui.selectedCalendarDate = toIsoDate(today);
      saveState("回到今天");
      render();
    });

    elements.calendarAddButton.addEventListener("click", function () {
      createCalendarTask(state.ui.selectedCalendarDate || toIsoDate(new Date()));
    });
  }

  function loadState() {
    var fallback = createSeedState();
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        console.log("[Personal_Web] 未找到任务清单本地数据，使用示例数据。");
        return fallback;
      }
      var parsed = JSON.parse(raw);
      var migrated = migrateState(parsed, fallback);
      console.log("[Personal_Web] 已加载任务清单本地数据：", {
        tasks: migrated.tasks.length,
        lists: migrated.lists.length,
        tags: migrated.tags.length
      });
      return migrated;
    } catch (error) {
      console.warn("[Personal_Web] 任务清单本地数据读取失败，已回退示例数据：", error.message);
      return fallback;
    }
  }

  function saveState(reason) {
    state.version = 1;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      console.log("[Personal_Web] 任务清单状态已保存：", {
        reason: reason,
        tasks: state.tasks.length
      });
    } catch (error) {
      console.warn("[Personal_Web] 任务清单状态保存失败：", error.message);
    }
  }

  function migrateState(input, fallback) {
    if (!input || typeof input !== "object") {
      return fallback;
    }

    var next = {
      version: 1,
      tasks: Array.isArray(input.tasks) ? input.tasks.map(migrateTask).filter(Boolean) : fallback.tasks,
      lists: Array.isArray(input.lists) && input.lists.length ? input.lists.map(migrateList) : fallback.lists,
      tags: Array.isArray(input.tags) ? input.tags.map(migrateTag).filter(Boolean) : fallback.tags,
      ui: Object.assign({}, fallback.ui, input.ui || {})
    };

    if (!next.lists.some(function (list) { return list.id === "inbox"; })) {
      next.lists.unshift(createList("inbox", "收集箱", "#7c8b87", 0));
    }

    next.tasks.forEach(function (task, index) {
      if (!next.lists.some(function (list) { return list.id === task.listId; })) {
        task.listId = "inbox";
      }
      task.order = Number.isFinite(task.order) ? task.order : index + 1;
    });

    return next;
  }

  function migrateTask(task) {
    if (!task || typeof task !== "object") {
      return null;
    }
    var now = new Date().toISOString();
    return {
      id: task.id || createId("task"),
      title: String(task.title || "未命名任务"),
      note: String(task.note || ""),
      completed: Boolean(task.completed),
      completedAt: task.completedAt || null,
      trashed: Boolean(task.trashed),
      trashedAt: task.trashedAt || null,
      listId: task.listId || "inbox",
      tagIds: Array.isArray(task.tagIds) ? task.tagIds : [],
      dueDate: normalizeDateString(task.dueDate),
      dueTime: task.dueTime || null,
      priority: ["none", "low", "medium", "high"].includes(task.priority) ? task.priority : "none",
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(migrateSubtask) : [],
      reminder: migrateReminder(task.reminder),
      repeat: migrateRepeat(task.repeat),
      createdAt: task.createdAt || now,
      updatedAt: task.updatedAt || now,
      order: Number.isFinite(task.order) ? task.order : 0
    };
  }

  function migrateSubtask(subtask) {
    return {
      id: subtask.id || createId("subtask"),
      title: String(subtask.title || "子任务"),
      completed: Boolean(subtask.completed)
    };
  }

  function migrateReminder(reminder) {
    if (!reminder || typeof reminder !== "object") {
      return { enabled: false, minutesBefore: null };
    }
    return {
      enabled: Boolean(reminder.enabled),
      minutesBefore: Number.isFinite(reminder.minutesBefore) ? reminder.minutesBefore : null
    };
  }

  function migrateRepeat(repeat) {
    if (!repeat || typeof repeat !== "object") {
      return { type: "none", interval: 1 };
    }
    return {
      type: ["none", "daily", "weekly", "monthly", "yearly"].includes(repeat.type) ? repeat.type : "none",
      interval: Number.isFinite(repeat.interval) && repeat.interval > 0 ? repeat.interval : 1
    };
  }

  function migrateList(list) {
    return createList(
      list.id || createId("list"),
      list.name || "未命名清单",
      list.color || "#7c8b87",
      Number.isFinite(list.order) ? list.order : 0,
      Boolean(list.archived)
    );
  }

  function migrateTag(tag) {
    if (!tag || typeof tag !== "object") {
      return null;
    }
    return {
      id: tag.id || createId("tag"),
      name: tag.name || "标签",
      color: tag.color || "#7c8b87"
    };
  }

  function createSeedState() {
    var today = startOfDay(new Date());
    var lists = [
      createList("inbox", "收集箱", "#7c8b87", 0),
      createList("todo-later", "要做但是不急", "#35b7c7", 1),
      createList("scheduled", "安排好的", "#df78a8", 2),
      createList("daily", "每天打卡", "#65a86d", 3),
      createList("planned", "计划做的", "#df8b36", 4),
      createList("important", "重要", "#d9544d", 5),
      createList("health-life", "健康生活", "#7d9b82", 6)
    ];

    var tags = [
      createTag("tag-work", "工作", "#4b78d8"),
      createTag("tag-life", "生活", "#7d9b82"),
      createTag("tag-health", "健康", "#2f8b68"),
      createTag("tag-id", "证件", "#d48930"),
      createTag("tag-finance", "财务", "#8d6ed8")
    ];

    var orderSeed = 0;
    function tasksOrder() {
      orderSeed += 1;
      return orderSeed;
    }

    var tasks = [
      seedTask("理赔资料整理", "important", 0, "medium", ["tag-id"], "整理理赔需要的材料，确认缺失项。"),
      seedTask("蛀牙补牙", "health-life", 5, "high", ["tag-health"], "预约牙科并确认时间。"),
      seedTask("定投计划复盘", "planned", 3, "medium", ["tag-finance"], "查看近期计划是否需要调整。"),
      seedTask("VPN 到期检查", "scheduled", 8, "medium", ["tag-work"], ""),
      seedTask("车险到期提醒", "scheduled", 13, "high", ["tag-finance"], ""),
      seedTask("居住证续签准备", "important", 17, "high", ["tag-id"], "确认材料清单。"),
      seedTask("照片整理", "todo-later", 21, "low", ["tag-life"], ""),
      seedTask("周末运动安排", "health-life", 2, "low", ["tag-health"], "安排一次户外活动。")
    ];

    function seedTask(title, listId, offset, priority, tagIds, note) {
      var due = addDays(today, offset);
      return createTask({
        title: title,
        listId: listId,
        dueDate: toIsoDate(due),
        dueTime: offset === 0 ? "18:00" : null,
        priority: priority,
        tagIds: tagIds,
        note: note,
        order: tasksOrder()
      });
    }

    return {
      version: 1,
      tasks: tasks,
      lists: lists,
      tags: tags,
      ui: {
        activeView: "tasks",
        selectedSmartList: "inbox",
        selectedListId: null,
        selectedTaskId: null,
        calendarYear: today.getFullYear(),
        calendarMonth: today.getMonth(),
        selectedCalendarDate: toIsoDate(today)
      }
    };
  }

  function createList(id, name, color, order, archived) {
    return {
      id: id,
      name: name,
      color: color,
      order: order,
      archived: Boolean(archived)
    };
  }

  function createTag(id, name, color) {
    return {
      id: id,
      name: name,
      color: color
    };
  }

  function createTask(overrides) {
    var now = new Date().toISOString();
    return Object.assign({
      id: createId("task"),
      title: "新任务",
      note: "",
      completed: false,
      completedAt: null,
      trashed: false,
      trashedAt: null,
      listId: "inbox",
      tagIds: [],
      dueDate: null,
      dueTime: null,
      priority: "none",
      subtasks: [],
      reminder: { enabled: false, minutesBefore: null },
      repeat: { type: "none", interval: 1 },
      createdAt: now,
      updatedAt: now,
      order: state && state.tasks ? state.tasks.length + 1 : 1
    }, overrides || {});
  }

  function render() {
    normalizeUi();
    elements.shell.dataset.view = state.ui.activeView;
    elements.viewButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.viewButton === state.ui.activeView);
    });
    elements.taskView.hidden = state.ui.activeView !== "tasks";
    elements.calendarView.hidden = state.ui.activeView !== "calendar";

    renderSidebar();
    renderTaskView();
    renderCalendar();
    renderDetailPanel();
  }

  function normalizeUi() {
    if (!state.ui.activeView) {
      state.ui.activeView = "tasks";
    }
    if (!state.ui.selectedSmartList && !state.ui.selectedListId) {
      state.ui.selectedSmartList = "inbox";
    }
    if (!Number.isFinite(state.ui.calendarYear) || !Number.isFinite(state.ui.calendarMonth)) {
      var today = new Date();
      state.ui.calendarYear = today.getFullYear();
      state.ui.calendarMonth = today.getMonth();
    }
  }

  function renderSidebar() {
    var counts = getCounts();
    Object.keys(counts).forEach(function (key) {
      var node = document.querySelector("[data-count=\"" + key + "\"]");
      if (node) {
        node.textContent = counts[key];
      }
    });

    document.querySelectorAll("[data-smart-list]").forEach(function (button) {
      button.classList.toggle("is-active", state.ui.selectedSmartList === button.dataset.smartList);
    });

    var lists = state.lists
      .filter(function (list) { return !list.archived && list.id !== "inbox"; })
      .sort(byOrder);

    elements.userListStack.innerHTML = lists.map(function (list) {
      return [
        "<button class=\"list-row" + (state.ui.selectedListId === list.id ? " is-active" : "") +
          "\" type=\"button\" data-list-id=\"" + escapeHtml(list.id) + "\">",
        "<span class=\"list-dot\" style=\"background:" + escapeHtml(list.color) + "\"></span>",
        "<span>" + escapeHtml(list.name) + "</span>",
        "<strong>" + countTasksForList(list.id) + "</strong>",
        "</button>"
      ].join("");
    }).join("");
  }

  function getCounts() {
    return {
      today: getTasksForSmartList("today").length,
      next7: getTasksForSmartList("next7").length,
      inbox: getTasksForSmartList("inbox").length,
      completed: getTasksForSmartList("completed").length,
      trash: getTasksForSmartList("trash").length
    };
  }

  function countTasksForList(listId) {
    return state.tasks.filter(function (task) {
      return !task.completed && !task.trashed && task.listId === listId;
    }).length;
  }

  function renderTaskView() {
    var title = getCurrentListTitle();
    elements.taskTitle.textContent = title;
    var tasks = getCurrentTasks();
    var groups = groupTasks(tasks);
    elements.taskGroupStack.innerHTML = groups.length ? groups.map(renderTaskGroup).join("") :
      "<p class=\"empty-state\">当前没有任务。</p>";
  }

  function getCurrentListTitle() {
    if (state.ui.selectedListId) {
      var list = findList(state.ui.selectedListId);
      return list ? list.name : "清单";
    }
    var titles = {
      today: "今天",
      next7: "最近7天",
      inbox: "收集箱",
      completed: "已完成",
      trash: "垃圾桶"
    };
    return titles[state.ui.selectedSmartList] || "收集箱";
  }

  function getCurrentTasks() {
    if (state.ui.selectedListId) {
      return sortTaskList(state.tasks.filter(function (task) {
        return !task.completed && !task.trashed && task.listId === state.ui.selectedListId;
      }));
    }
    return sortTaskList(getTasksForSmartList(state.ui.selectedSmartList || "inbox"));
  }

  function getTasksForSmartList(key) {
    var today = toIsoDate(new Date());
    var next7 = toIsoDate(addDays(startOfDay(new Date()), 7));
    if (key === "today") {
      return state.tasks.filter(function (task) {
        return isActiveTask(task) && task.dueDate === today;
      });
    }
    if (key === "next7") {
      return state.tasks.filter(function (task) {
        return isActiveTask(task) && task.dueDate && task.dueDate >= today && task.dueDate <= next7;
      });
    }
    if (key === "completed") {
      return state.tasks.filter(function (task) {
        return task.completed && !task.trashed;
      }).sort(function (a, b) {
        return String(b.completedAt || "").localeCompare(String(a.completedAt || ""));
      });
    }
    if (key === "trash") {
      return state.tasks.filter(function (task) {
        return task.trashed;
      }).sort(function (a, b) {
        return String(b.trashedAt || "").localeCompare(String(a.trashedAt || ""));
      });
    }
    return state.tasks.filter(function (task) {
      return isActiveTask(task) && task.listId === "inbox";
    });
  }

  function isActiveTask(task) {
    return !task.completed && !task.trashed;
  }

  function sortTaskList(tasks) {
    return tasks.slice().sort(function (a, b) {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      var today = toIsoDate(new Date());
      var aOverdue = a.dueDate && a.dueDate < today && !a.completed;
      var bOverdue = b.dueDate && b.dueDate < today && !b.completed;
      if (aOverdue !== bOverdue) {
        return aOverdue ? -1 : 1;
      }
      if (a.dueDate !== b.dueDate) {
        return String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"));
      }
      if (a.dueTime !== b.dueTime) {
        return String(a.dueTime || "99:99").localeCompare(String(b.dueTime || "99:99"));
      }
      var priorityDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (priorityDiff) {
        return priorityDiff;
      }
      return a.order - b.order;
    });
  }

  function groupTasks(tasks) {
    var selected = state.ui.selectedSmartList;
    if (selected === "completed") {
      return [{ title: "已完成", tasks: tasks }];
    }
    if (selected === "trash") {
      return [{ title: "垃圾桶", tasks: tasks }];
    }
    var today = toIsoDate(new Date());
    var groups = [
      { title: "今天", tasks: [] },
      { title: "更远", tasks: [] },
      { title: "无日期", tasks: [] }
    ];
    tasks.forEach(function (task) {
      if (!task.dueDate) {
        groups[2].tasks.push(task);
      } else if (task.dueDate <= today) {
        groups[0].tasks.push(task);
      } else {
        groups[1].tasks.push(task);
      }
    });
    return groups.filter(function (group) { return group.tasks.length; });
  }

  function renderTaskGroup(group) {
    return [
      "<section class=\"task-group\">",
      "<h3>" + escapeHtml(group.title) + "</h3>",
      group.tasks.map(renderTaskRow).join(""),
      "</section>"
    ].join("");
  }

  function renderTaskRow(task) {
    var list = findList(task.listId);
    var selected = state.ui.selectedTaskId === task.id;
    return [
      "<article class=\"task-row" + (selected ? " is-selected" : "") + (task.completed ? " is-completed" : "") +
        "\" data-task-row=\"" + escapeHtml(task.id) + "\">",
      "<button class=\"task-checkbox" + (task.completed ? " is-checked" : "") +
        "\" type=\"button\" data-toggle-task=\"" + escapeHtml(task.id) + "\" aria-label=\"切换完成状态\">" +
        (task.completed ? "✓" : "") + "</button>",
      "<div>",
      "<p class=\"task-title\">" + escapeHtml(task.title) + "</p>",
      "<div class=\"task-meta-line\">",
      "<span class=\"task-meta\">" + escapeHtml(list ? list.name : "收集箱") + "</span>",
      task.dueDate ? "<span class=\"task-meta" + (isOverdue(task) ? " date-warning" : "") + "\">" +
        escapeHtml(formatDateLabel(task.dueDate)) + (task.dueTime ? " " + escapeHtml(task.dueTime) : "") + "</span>" : "",
      task.priority !== "none" ? "<span class=\"priority-chip priority-" + task.priority + "\">" +
        escapeHtml(priorityLabel(task.priority)) + "</span>" : "",
      "</div>",
      renderTagLine(task.tagIds),
      "</div>",
      "<span class=\"task-meta\">" + escapeHtml(formatDateLabel(task.dueDate)) + "</span>",
      "</article>"
    ].join("");
  }

  function renderTagLine(tagIds) {
    if (!tagIds || !tagIds.length) {
      return "";
    }
    return "<div class=\"tag-line\">" + tagIds.map(function (tagId) {
      var tag = findTag(tagId);
      return tag ? "<span class=\"tag-chip\" style=\"background:" + escapeHtml(tag.color) +
        "22;color:" + escapeHtml(tag.color) + "\">#" + escapeHtml(tag.name) + "</span>" : "";
    }).join("") + "</div>";
  }

  function quickAddTask(rawTitle) {
    var parsed = parseQuickAdd(rawTitle);
    if (!parsed.title) {
      return;
    }
    var task = createTask({
      title: parsed.title,
      dueDate: parsed.dueDate,
      priority: parsed.priority,
      tagIds: parsed.tagIds,
      listId: getCreationListId()
    });
    state.tasks.push(task);
    state.ui.selectedTaskId = task.id;
    elements.quickAddInput.value = "";
    saveState("快速新增任务");
    render();
  }

  function parseQuickAdd(value) {
    var title = String(value || "").trim();
    var dueDate = null;
    var priority = "none";
    var tagIds = [];

    if (!title) {
      return { title: "" };
    }

    if (title.includes("今天")) {
      dueDate = toIsoDate(new Date());
      title = title.replace("今天", "").trim();
    }
    if (title.includes("明天")) {
      dueDate = toIsoDate(addDays(new Date(), 1));
      title = title.replace("明天", "").trim();
    }
    [
      ["!高", "high"],
      ["!中", "medium"],
      ["!低", "low"]
    ].forEach(function (pair) {
      if (title.includes(pair[0])) {
        priority = pair[1];
        title = title.replace(pair[0], "").trim();
      }
    });

    var tagMatches = title.match(/#[^\s#]+/g) || [];
    tagMatches.forEach(function (match) {
      var tagName = match.slice(1);
      var tag = ensureTag(tagName);
      tagIds.push(tag.id);
      title = title.replace(match, "").trim();
    });

    if (!dueDate && state.ui.selectedSmartList === "today") {
      dueDate = toIsoDate(new Date());
    }
    if (!dueDate && state.ui.selectedSmartList === "next7") {
      dueDate = toIsoDate(new Date());
    }

    return {
      title: title || "新任务",
      dueDate: dueDate,
      priority: priority,
      tagIds: tagIds
    };
  }

  function getCreationListId() {
    if (state.ui.selectedListId) {
      return state.ui.selectedListId;
    }
    return state.ui.selectedSmartList === "inbox" ? "inbox" : "inbox";
  }

  function selectSmartList(key) {
    state.ui.activeView = "tasks";
    state.ui.selectedSmartList = key;
    state.ui.selectedListId = null;
    saveState("切换智能清单");
    render();
  }

  function selectUserList(listId) {
    state.ui.activeView = "tasks";
    state.ui.selectedSmartList = null;
    state.ui.selectedListId = listId;
    saveState("切换用户清单");
    render();
  }

  function setActiveView(view) {
    state.ui.activeView = view;
    saveState("切换视图");
    render();
  }

  function selectTask(id) {
    state.ui.selectedTaskId = id;
    saveState("选择任务");
    render();
  }

  function toggleTaskCompleted(id) {
    var task = findTask(id);
    if (!task) {
      return;
    }
    setTaskCompleted(task, !task.completed);
    state.ui.selectedTaskId = task.id;
    saveState("切换任务完成状态");
    render();
  }

  function setTaskCompleted(task, completed) {
    task.completed = completed;
    task.completedAt = completed ? new Date().toISOString() : null;
    task.updatedAt = new Date().toISOString();
  }

  function renderDetailPanel() {
    var task = getSelectedTask();
    elements.detailEmpty.hidden = Boolean(task);
    elements.detailForm.hidden = !task;
    if (!task) {
      return;
    }

    document.getElementById("detail-completed").checked = task.completed;
    document.getElementById("detail-title").value = task.title;
    document.getElementById("detail-note").value = task.note || "";
    document.getElementById("detail-list").innerHTML = state.lists
      .filter(function (list) { return !list.archived; })
      .sort(byOrder)
      .map(function (list) {
        return "<option value=\"" + escapeHtml(list.id) + "\"" + (task.listId === list.id ? " selected" : "") +
          ">" + escapeHtml(list.name) + "</option>";
      }).join("");
    document.getElementById("detail-priority").value = task.priority;
    document.getElementById("detail-due-date").value = task.dueDate || "";
    document.getElementById("detail-due-time").value = task.dueTime || "";
    document.getElementById("detail-tags").value = task.tagIds.map(function (tagId) {
      var tag = findTag(tagId);
      return tag ? tag.name : "";
    }).filter(Boolean).join(" ");
    document.getElementById("detail-reminder").value = task.reminder.enabled ? String(task.reminder.minutesBefore || 0) : "none";
    document.getElementById("detail-repeat").value = task.repeat.type || "none";

    renderSubtasks(task);
    document.getElementById("trash-task-button").hidden = task.trashed;
    document.getElementById("restore-task-button").hidden = !task.trashed;
    document.getElementById("delete-task-button").hidden = !task.trashed;
  }

  function saveDetailForm() {
    var task = getSelectedTask();
    if (!task) {
      return;
    }
    task.title = document.getElementById("detail-title").value.trim() || "未命名任务";
    task.note = document.getElementById("detail-note").value.trim();
    task.listId = document.getElementById("detail-list").value;
    task.priority = document.getElementById("detail-priority").value;
    task.dueDate = normalizeDateString(document.getElementById("detail-due-date").value);
    task.dueTime = document.getElementById("detail-due-time").value || null;
    task.tagIds = parseTagInput(document.getElementById("detail-tags").value);
    task.reminder = parseReminderInput(document.getElementById("detail-reminder").value);
    task.repeat = {
      type: document.getElementById("detail-repeat").value,
      interval: 1
    };
    task.updatedAt = new Date().toISOString();
    saveState("保存任务详情");
    render();
  }

  function parseTagInput(value) {
    return String(value || "").split(/\s+/).map(function (name) {
      return name.trim().replace(/^#/, "");
    }).filter(Boolean).map(function (name) {
      return ensureTag(name).id;
    });
  }

  function parseReminderInput(value) {
    if (value === "none") {
      return { enabled: false, minutesBefore: null };
    }
    return { enabled: true, minutesBefore: Number(value) };
  }

  function trashSelectedTask() {
    var task = getSelectedTask();
    if (!task) {
      return;
    }
    task.trashed = true;
    task.trashedAt = new Date().toISOString();
    task.updatedAt = task.trashedAt;
    saveState("移入垃圾桶");
    render();
  }

  function restoreSelectedTask() {
    var task = getSelectedTask();
    if (!task) {
      return;
    }
    task.trashed = false;
    task.trashedAt = null;
    task.updatedAt = new Date().toISOString();
    saveState("恢复任务");
    render();
  }

  function deleteSelectedTask() {
    var task = getSelectedTask();
    if (!task) {
      return;
    }
    if (!window.confirm("确认永久删除这个任务？")) {
      return;
    }
    state.tasks = state.tasks.filter(function (item) {
      return item.id !== task.id;
    });
    state.ui.selectedTaskId = null;
    saveState("永久删除任务");
    render();
  }

  function renderSubtasks(task) {
    var list = document.getElementById("subtask-list");
    list.innerHTML = task.subtasks.length ? task.subtasks.map(function (subtask) {
      return [
        "<div class=\"subtask-row\">",
        "<input type=\"checkbox\" data-subtask-toggle=\"" + escapeHtml(subtask.id) + "\"" +
          (subtask.completed ? " checked" : "") + ">",
        "<span" + (subtask.completed ? " style=\"text-decoration:line-through;color:var(--task-muted)\"" : "") +
          ">" + escapeHtml(subtask.title) + "</span>",
        "<button class=\"small-icon-button\" type=\"button\" data-subtask-remove=\"" +
          escapeHtml(subtask.id) + "\" aria-label=\"删除子任务\">×</button>",
        "</div>"
      ].join("");
    }).join("") : "<p class=\"empty-state\">暂无子任务。</p>";
  }

  function addSubtask(value) {
    var task = getSelectedTask();
    var title = String(value || "").trim();
    if (!task || !title) {
      return;
    }
    task.subtasks.push({
      id: createId("subtask"),
      title: title,
      completed: false
    });
    task.updatedAt = new Date().toISOString();
    document.getElementById("subtask-input").value = "";
    saveState("新增子任务");
    render();
  }

  function toggleSubtask(id) {
    var task = getSelectedTask();
    if (!task) {
      return;
    }
    var subtask = task.subtasks.find(function (item) { return item.id === id; });
    if (subtask) {
      subtask.completed = !subtask.completed;
      task.updatedAt = new Date().toISOString();
      saveState("切换子任务");
      render();
    }
  }

  function removeSubtask(id) {
    var task = getSelectedTask();
    if (!task) {
      return;
    }
    task.subtasks = task.subtasks.filter(function (item) { return item.id !== id; });
    task.updatedAt = new Date().toISOString();
    saveState("删除子任务");
    render();
  }

  function renderCalendar() {
    var year = state.ui.calendarYear;
    var month = state.ui.calendarMonth;
    elements.calendarTitle.textContent = year + "年" + pad(month + 1) + "月";
    var cells = getCalendarCells(year, month);
    elements.calendarGrid.innerHTML = cells.map(renderCalendarDay).join("");
  }

  function getCalendarCells(year, month) {
    var firstDay = new Date(year, month, 1);
    var start = addDays(firstDay, -firstDay.getDay());
    var cells = [];
    for (var index = 0; index < 42; index += 1) {
      cells.push(addDays(start, index));
    }
    return cells;
  }

  function renderCalendarDay(date) {
    var iso = toIsoDate(date);
    var month = state.ui.calendarMonth;
    var tasks = getTasksForCalendarDate(iso);
    var visible = tasks.slice(0, 3);
    var more = tasks.length - visible.length;
    return [
      "<section class=\"calendar-day" + (date.getMonth() !== month ? " is-muted" : "") +
        (iso === toIsoDate(new Date()) ? " is-today" : "") +
        (iso === state.ui.selectedCalendarDate ? " is-selected" : "") +
        "\" data-calendar-date=\"" + iso + "\">",
      "<div class=\"calendar-date-line\"><span>" + date.getDate() + "</span></div>",
      visible.map(renderCalendarTask).join(""),
      more > 0 ? "<p class=\"calendar-more\">+" + more + "</p>" : "",
      "</section>"
    ].join("");
  }

  function renderCalendarTask(task) {
    var list = findList(task.listId);
    return "<button class=\"calendar-task" + (task.completed ? " is-completed" : "") +
      "\" type=\"button\" data-calendar-task=\"" + escapeHtml(task.id) +
      "\" style=\"border-left-color:" + escapeHtml(list ? list.color : "#2f8b68") + "\">" +
      escapeHtml((task.dueTime ? task.dueTime + " " : "") + task.title) + "</button>";
  }

  function getTasksForCalendarDate(iso) {
    return state.tasks.filter(function (task) {
      return !task.trashed && task.dueDate === iso;
    }).sort(function (a, b) {
      if (a.dueTime !== b.dueTime) {
        return String(a.dueTime || "99:99").localeCompare(String(b.dueTime || "99:99"));
      }
      return priorityWeight(b.priority) - priorityWeight(a.priority);
    });
  }

  function createCalendarTask(date) {
    var task = createTask({
      title: "新任务",
      dueDate: date || state.ui.selectedCalendarDate || toIsoDate(new Date()),
      listId: "inbox"
    });
    state.tasks.push(task);
    state.ui.selectedTaskId = task.id;
    state.ui.activeView = "calendar";
    saveState("日历新增任务");
    render();
  }

  function shiftMonth(delta) {
    var next = new Date(state.ui.calendarYear, state.ui.calendarMonth + delta, 1);
    state.ui.calendarYear = next.getFullYear();
    state.ui.calendarMonth = next.getMonth();
    saveState("切换日历月份");
    render();
  }

  function findTask(id) {
    return state.tasks.find(function (task) {
      return task.id === id;
    });
  }

  function getSelectedTask() {
    return state.ui.selectedTaskId ? findTask(state.ui.selectedTaskId) : null;
  }

  function findList(id) {
    return state.lists.find(function (list) {
      return list.id === id;
    });
  }

  function findTag(id) {
    return state.tags.find(function (tag) {
      return tag.id === id;
    });
  }

  function ensureTag(name) {
    var existing = state.tags.find(function (tag) {
      return tag.name === name;
    });
    if (existing) {
      return existing;
    }
    var tag = createTag(createId("tag"), name, randomTagColor());
    state.tags.push(tag);
    return tag;
  }

  function randomTagColor() {
    var colors = ["#4b78d8", "#7d9b82", "#2f8b68", "#d48930", "#8d6ed8"];
    return colors[state.tags.length % colors.length];
  }

  function priorityWeight(priority) {
    return {
      high: 3,
      medium: 2,
      low: 1,
      none: 0
    }[priority] || 0;
  }

  function priorityLabel(priority) {
    return {
      high: "高",
      medium: "中",
      low: "低",
      none: "无"
    }[priority] || "无";
  }

  function byOrder(a, b) {
    return a.order - b.order;
  }

  function isOverdue(task) {
    return task.dueDate && !task.completed && task.dueDate < toIsoDate(new Date());
  }

  function formatDateLabel(iso) {
    if (!iso) {
      return "无日期";
    }
    var today = toIsoDate(new Date());
    var tomorrow = toIsoDate(addDays(new Date(), 1));
    if (iso === today) {
      return "今天";
    }
    if (iso === tomorrow) {
      return "明天";
    }
    var date = parseIsoDate(iso);
    return (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    return new Date(startOfDay(date).getTime() + days * DAY_MS);
  }

  function toIsoDate(date) {
    var normalized = startOfDay(date);
    return [
      normalized.getFullYear(),
      pad(normalized.getMonth() + 1),
      pad(normalized.getDate())
    ].join("-");
  }

  function parseIsoDate(iso) {
    var parts = String(iso).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function normalizeDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : null;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function createId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
