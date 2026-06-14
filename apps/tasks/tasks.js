(function () {
  "use strict";

  var STORAGE_KEY = "personal_web_tasks_v1";
  var DAY_MS = 24 * 60 * 60 * 1000;
  var state = loadState();

  var elements = {};
  var calendarTaskDraft = null;
  var dateTimeDraft = null;
  var dateTimePickerMonth = null;
  var calendarDragJustEnded = false;

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
    elements.calendarWeekdays = document.getElementById("calendar-weekdays");
    elements.detailEmpty = document.getElementById("detail-empty");
    elements.detailForm = document.getElementById("detail-form");
    elements.resetButton = document.getElementById("reset-demo-button");
    elements.prevMonth = document.getElementById("prev-month-button");
    elements.nextMonth = document.getElementById("next-month-button");
    elements.todayButton = document.getElementById("calendar-today-button");
    elements.calendarAddButton = document.getElementById("calendar-add-button");
    elements.calendarModeButtons = document.querySelectorAll("[data-calendar-mode]");
    elements.calendarPopover = document.getElementById("calendar-popover");
    elements.calendarFilterButton = document.getElementById("calendar-filter-button");
    elements.calendarFilterPanel = document.getElementById("calendar-filter-panel");
    elements.filterShowCompleted = document.getElementById("filter-show-completed");
    elements.filterListOptions = document.getElementById("filter-list-options");
    elements.filterColorBy = document.getElementById("filter-color-by");
    elements.unscheduledTray = document.getElementById("unscheduled-tray");
    elements.unscheduledList = document.getElementById("unscheduled-list");
    elements.batchToolbar = document.getElementById("calendar-batch-toolbar");
    elements.batchCountLabel = document.getElementById("batch-count-label");
    elements.calendarTaskPopover = document.getElementById("calendar-task-popover");
    elements.dateTimePopover = document.getElementById("calendar-datetime-popover");
    elements.dateTimeDateGrid = document.getElementById("datetime-date-grid");
    elements.dateTimeMonthTitle = document.getElementById("datetime-month-title");
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
      var resize = event.target.closest("[data-resize-task]");
      if (resize) {
        return;
      }

      var taskButton = event.target.closest("[data-calendar-task]");
      if (taskButton) {
        handleCalendarTaskClick(event, taskButton.dataset.calendarTask, taskButton);
        return;
      }

      var allDayCell = event.target.closest("[data-week-all-day]");
      if (allDayCell) {
        state.ui.selectedCalendarDate = allDayCell.dataset.weekAllDay;
        openCalendarCreatePopover({ date: allDayCell.dataset.weekAllDay, allDay: true });
        return;
      }

      var weekSlot = event.target.closest("[data-week-slot]") || event.target.closest("[data-week-date]");
      if (weekSlot) {
        var hour = Number(weekSlot.dataset.weekHour);
        var minute = Number(weekSlot.dataset.weekMinute || 0);
        state.ui.selectedCalendarDate = weekSlot.dataset.weekDate;
        openCalendarCreatePopover({
          date: weekSlot.dataset.weekDate,
          allDay: false,
          time: minutesToTime(hour * 60 + minute),
          endTime: minutesToTime(hour * 60 + minute + 60)
        });
        return;
      }

      var dayCell = event.target.closest("[data-calendar-date]");
      if (dayCell) {
        state.ui.selectedCalendarDate = dayCell.dataset.calendarDate;
        saveState("选择日历日期");
        render();
        if (state.ui.calendarViewMode === "month" && !event.target.closest("[data-calendar-task]")) {
          openCalendarCreatePopover({ date: dayCell.dataset.calendarDate, allDay: true });
        }
      }
    });

    elements.calendarGrid.addEventListener("dragstart", handleCalendarDragStart);
    elements.calendarGrid.addEventListener("dragover", handleCalendarDragOver);
    elements.calendarGrid.addEventListener("dragleave", handleCalendarDragLeave);
    elements.calendarGrid.addEventListener("drop", handleCalendarDrop);
    elements.calendarGrid.addEventListener("mousedown", handleCalendarMouseDown);

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
    document.getElementById("detail-all-day").addEventListener("change", function () {
      toggleDetailTimeFields();
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
      openCalendarCreatePopover({
        date: state.ui.selectedCalendarDate || toIsoDate(new Date()),
        allDay: true
      });
    });

    elements.calendarModeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        state.ui.calendarViewMode = button.dataset.calendarMode;
        saveState("切换日历视图");
        render();
      });
    });

    elements.calendarPopover.addEventListener("submit", handleCalendarCreateSubmit);
    document.getElementById("calendar-create-cancel").addEventListener("click", closeCalendarCreatePopover);
    document.getElementById("calendar-create-all-day").addEventListener("change", toggleCalendarCreateTimeFields);
    elements.calendarTaskPopover.addEventListener("submit", saveCalendarTaskPopover);
    elements.calendarTaskPopover.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    document.getElementById("calendar-detail-close").addEventListener("click", closeCalendarTaskPopover);
    document.getElementById("calendar-detail-close-bottom").addEventListener("click", closeCalendarTaskPopover);
    document.getElementById("calendar-detail-trash").addEventListener("click", trashCalendarTaskDraft);
    document.getElementById("calendar-detail-date-line").addEventListener("click", function (event) {
      openDateTimePicker(event.currentTarget);
    });
    document.getElementById("calendar-detail-completed").addEventListener("change", function () {
      if (!calendarTaskDraft) {
        return;
      }
      var task = findTask(calendarTaskDraft.id);
      if (!task) {
        return;
      }
      setTaskCompleted(task, document.getElementById("calendar-detail-completed").checked);
      calendarTaskDraft.completed = task.completed;
      calendarTaskDraft.completedAt = task.completedAt;
      saveState("日历浮窗完成状态更新");
      render();
      renderCalendarTaskPopover();
    });
    elements.dateTimePopover.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    elements.dateTimeDateGrid.addEventListener("click", function (event) {
      var button = event.target.closest("[data-picker-date]");
      if (button) {
        dateTimeDraft.dueDate = button.dataset.pickerDate;
        renderDateTimePicker();
      }
    });
    document.getElementById("datetime-prev-month").addEventListener("click", function () {
      dateTimePickerMonth = addMonths(dateTimePickerMonth || new Date(), -1);
      renderDateTimePicker();
    });
    document.getElementById("datetime-next-month").addEventListener("click", function () {
      dateTimePickerMonth = addMonths(dateTimePickerMonth || new Date(), 1);
      renderDateTimePicker();
    });
    document.querySelectorAll("[data-date-quick]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyDateQuick(button.dataset.dateQuick);
      });
    });
    document.getElementById("datetime-apply").addEventListener("click", applyDateTimePicker);
    document.getElementById("datetime-clear").addEventListener("click", clearDateTimePicker);
    elements.calendarFilterButton.addEventListener("click", function () {
      elements.calendarFilterPanel.hidden = !elements.calendarFilterPanel.hidden;
    });
    elements.filterShowCompleted.addEventListener("change", function () {
      state.ui.calendarFilters.showCompleted = elements.filterShowCompleted.checked;
      saveState("切换日历已完成显示");
      render();
    });
    elements.filterColorBy.addEventListener("change", function () {
      state.ui.calendarFilters.colorBy = elements.filterColorBy.value;
      saveState("切换日历颜色依据");
      render();
    });
    elements.filterListOptions.addEventListener("change", function () {
      state.ui.calendarFilters.visibleListIds = Array.from(
        elements.filterListOptions.querySelectorAll("input:checked")
      ).map(function (input) {
        return input.value;
      });
      saveState("切换日历清单筛选");
      render();
    });
    elements.unscheduledList.addEventListener("dragstart", handleCalendarDragStart);
    elements.unscheduledList.addEventListener("dragend", clearDragState);
    document.getElementById("toggle-unscheduled-button").addEventListener("click", function () {
      elements.unscheduledTray.classList.toggle("is-collapsed");
      this.textContent = elements.unscheduledTray.classList.contains("is-collapsed") ? "展开" : "收起";
    });
    elements.batchToolbar.addEventListener("click", handleBatchAction);
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
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
    next.ui.calendarViewMode = ["month", "week", "agenda"].includes(next.ui.calendarViewMode) ?
      next.ui.calendarViewMode : "month";
    next.ui.selectedCalendarTaskIds = Array.isArray(next.ui.selectedCalendarTaskIds) ?
      next.ui.selectedCalendarTaskIds : [];
    next.ui.calendarFilters = Object.assign({
      showCompleted: true,
      visibleListIds: next.lists.map(function (list) { return list.id; }),
      colorBy: "list"
    }, next.ui.calendarFilters || {});
    if (!Array.isArray(next.ui.calendarFilters.visibleListIds) || !next.ui.calendarFilters.visibleListIds.length) {
      next.ui.calendarFilters.visibleListIds = next.lists.map(function (list) { return list.id; });
    }
    if (!["list", "priority"].includes(next.ui.calendarFilters.colorBy)) {
      next.ui.calendarFilters.colorBy = "list";
    }

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
    return normalizeTaskSchedule({
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
      startAt: task.startAt || null,
      endAt: task.endAt || null,
      allDay: typeof task.allDay === "boolean" ? task.allDay : !task.dueTime,
      priority: ["none", "low", "medium", "high"].includes(task.priority) ? task.priority : "none",
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(migrateSubtask) : [],
      reminder: migrateReminder(task.reminder),
      repeat: migrateRepeat(task.repeat),
      createdAt: task.createdAt || now,
      updatedAt: task.updatedAt || now,
      order: Number.isFinite(task.order) ? task.order : 0
    });
  }

  function normalizeTaskSchedule(task) {
    if (!task.dueDate) {
      task.dueTime = null;
      task.startAt = null;
      task.endAt = null;
      task.allDay = false;
      return task;
    }

    if (task.startAt && task.endAt) {
      task.dueDate = task.startAt.slice(0, 10);
      task.dueTime = task.allDay ? null : task.startAt.slice(11, 16);
      return task;
    }

    if (task.dueTime) {
      task.allDay = false;
      task.startAt = task.dueDate + "T" + task.dueTime;
      task.endAt = addMinutesToLocalDateTime(task.startAt, 60);
      return task;
    }

    task.allDay = true;
    task.startAt = task.dueDate + "T00:00";
    task.endAt = task.dueDate + "T23:59";
    return task;
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
        selectedCalendarDate: toIsoDate(today),
        calendarViewMode: "month",
        calendarFilters: {
          showCompleted: true,
          visibleListIds: lists.map(function (list) { return list.id; }),
          colorBy: "list"
        },
        selectedCalendarTaskIds: []
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
    return normalizeTaskSchedule(Object.assign({
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
      startAt: null,
      endAt: null,
      allDay: false,
      priority: "none",
      subtasks: [],
      reminder: { enabled: false, minutesBefore: null },
      repeat: { type: "none", interval: 1 },
      createdAt: now,
      updatedAt: now,
      order: state && state.tasks ? state.tasks.length + 1 : 1
    }, overrides || {}));
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
    if (!["month", "week", "agenda"].includes(state.ui.calendarViewMode)) {
      state.ui.calendarViewMode = "month";
    }
    if (!Array.isArray(state.ui.selectedCalendarTaskIds)) {
      state.ui.selectedCalendarTaskIds = [];
    }
    if (!state.ui.calendarFilters) {
      state.ui.calendarFilters = {
        showCompleted: true,
        visibleListIds: state.lists.map(function (list) { return list.id; }),
        colorBy: "list"
      };
    }
    if (!Array.isArray(state.ui.calendarFilters.visibleListIds) || !state.ui.calendarFilters.visibleListIds.length) {
      state.ui.calendarFilters.visibleListIds = state.lists.map(function (list) { return list.id; });
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
    if (view !== "calendar") {
      closeCalendarTaskPopover();
      closeCalendarCreatePopover();
    }
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
    document.getElementById("detail-all-day").checked = task.allDay;
    document.getElementById("detail-start-time").value = task.startAt ? task.startAt.slice(11, 16) : "";
    document.getElementById("detail-end-time").value = task.endAt ? task.endAt.slice(11, 16) : "";
    document.getElementById("detail-tags").value = task.tagIds.map(function (tagId) {
      var tag = findTag(tagId);
      return tag ? tag.name : "";
    }).filter(Boolean).join(" ");
    document.getElementById("detail-reminder").value = task.reminder.enabled ? String(task.reminder.minutesBefore || 0) : "none";
    document.getElementById("detail-repeat").value = task.repeat.type || "none";

    renderSubtasks(task);
    toggleDetailTimeFields();
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
    task.allDay = document.getElementById("detail-all-day").checked;
    task.dueTime = task.allDay ? null : (document.getElementById("detail-start-time").value ||
      document.getElementById("detail-due-time").value || null);
    if (task.dueDate && task.allDay) {
      task.startAt = task.dueDate + "T00:00";
      task.endAt = task.dueDate + "T23:59";
    } else if (task.dueDate && task.dueTime) {
      task.startAt = task.dueDate + "T" + task.dueTime;
      task.endAt = task.dueDate + "T" + (document.getElementById("detail-end-time").value ||
        minutesToTime(timeToMinutes(task.dueTime) + 60));
    } else {
      task.startAt = null;
      task.endAt = null;
    }
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
    var mode = state.ui.calendarViewMode || "month";
    elements.calendarTitle.textContent = mode === "week" ? formatWeekTitle(getSelectedWeekStart()) :
      (mode === "agenda" ? "日历列表" : year + "年" + pad(month + 1) + "月");
    elements.calendarGrid.className = "calendar-grid is-" + mode;
    elements.calendarWeekdays.hidden = mode !== "month";
    elements.calendarModeButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.calendarMode === mode);
    });
    renderCalendarFilters();
    renderUnscheduledTray();
    renderBatchToolbar();
    if (mode === "week") {
      renderWeekCalendar();
    } else if (mode === "agenda") {
      renderAgendaCalendar();
    } else {
      renderMonthCalendar();
    }
  }

  function renderMonthCalendar() {
    var cells = getCalendarCells(state.ui.calendarYear, state.ui.calendarMonth);
    elements.calendarGrid.innerHTML = cells.map(renderCalendarDay).join("");
  }

  function renderWeekCalendar() {
    var weekStart = getSelectedWeekStart();
    var days = [];
    for (var index = 0; index < 7; index += 1) {
      days.push(addDays(weekStart, index));
    }
    var hours = [];
    for (var hour = 6; hour <= 23; hour += 1) {
      hours.push(hour);
    }

    elements.calendarGrid.innerHTML = [
      "<div class=\"calendar-week-layout\">",
      "<div class=\"week-header-row\"><div></div>",
      days.map(function (day) {
        return "<div class=\"week-header-cell\">" + weekdayLabel(day) + "<br>" +
          (day.getMonth() + 1) + "/" + day.getDate() + "</div>";
      }).join(""),
      "</div>",
      "<div class=\"week-all-day-row\"><div class=\"week-ruler-cell\">全天</div>",
      days.map(function (day) {
        var iso = toIsoDate(day);
        return "<div class=\"week-all-day-cell\" data-week-all-day=\"" + iso +
          "\" data-calendar-date=\"" + iso + "\">" +
          getAllDayCalendarTasks(iso).map(renderCalendarTask).join("") + "</div>";
      }).join(""),
      "</div>",
      hours.map(function (hour) {
        return "<div class=\"week-time-row\"><div class=\"week-ruler-cell\">" + pad(hour) + ":00</div>" +
          days.map(function (day) {
            var iso = toIsoDate(day);
            return "<div class=\"week-day-column\" data-week-date=\"" + iso + "\" data-week-hour=\"" + hour +
              "\"><div class=\"week-slot\" data-week-slot=\"true\" data-week-date=\"" + iso +
              "\" data-week-hour=\"" + hour + "\" data-week-minute=\"0\"></div>" +
              "<div class=\"week-slot\" data-week-slot=\"true\" data-week-date=\"" + iso +
              "\" data-week-hour=\"" + hour + "\" data-week-minute=\"30\"></div>" +
              renderWeekBlocksForHour(iso, hour) + "</div>";
          }).join("") + "</div>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderAgendaCalendar() {
    var tasks = getVisibleCalendarTasks().sort(sortCalendarTasks);
    var today = toIsoDate(new Date());
    var tomorrow = toIsoDate(addDays(new Date(), 1));
    var next7 = toIsoDate(addDays(new Date(), 7));
    var groups = [
      { title: "今天", tasks: [] },
      { title: "明天", tasks: [] },
      { title: "本周", tasks: [] },
      { title: "更远", tasks: [] },
      { title: "无日期", tasks: [] }
    ];
    tasks.forEach(function (task) {
      if (!task.dueDate) {
        groups[4].tasks.push(task);
      } else if (task.dueDate === today) {
        groups[0].tasks.push(task);
      } else if (task.dueDate === tomorrow) {
        groups[1].tasks.push(task);
      } else if (task.dueDate <= next7) {
        groups[2].tasks.push(task);
      } else {
        groups[3].tasks.push(task);
      }
    });
    elements.calendarGrid.innerHTML = "<div class=\"agenda-stack\">" + groups
      .filter(function (group) { return group.tasks.length; })
      .map(function (group) {
        return "<section class=\"agenda-group\"><h3>" + group.title + "</h3>" +
          group.tasks.map(renderAgendaRow).join("") + "</section>";
      }).join("") + "</div>";
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
    var visible = tasks.slice(0, 4);
    var more = tasks.length - visible.length;
    return [
      "<section class=\"calendar-day" + (date.getMonth() !== month ? " is-muted" : "") +
        (iso === toIsoDate(new Date()) ? " is-today" : "") +
        (iso === state.ui.selectedCalendarDate ? " is-selected" : "") +
        "\" data-calendar-date=\"" + iso + "\" data-month-day=\"" + iso + "\">",
      "<div class=\"calendar-date-line\"><span>" + date.getDate() + "</span></div>",
      visible.map(renderCalendarTask).join(""),
      more > 0 ? "<p class=\"calendar-more\">+" + more + "</p>" : "",
      "</section>"
    ].join("");
  }

  function renderCalendarTask(task) {
    var color = getCalendarTaskColor(task);
    var selected = state.ui.selectedTaskId === task.id;
    var multi = state.ui.selectedCalendarTaskIds.includes(task.id);
    return "<button class=\"calendar-task" + (task.completed ? " is-completed" : "") +
      (selected ? " is-selected" : "") + (multi ? " is-multi-selected" : "") +
      "\" type=\"button\" data-calendar-task=\"" + escapeHtml(task.id) +
      "\" draggable=\"true\" title=\"" + escapeHtml(task.title) +
      "\" style=\"border-left-color:" + escapeHtml(color) + "\">" +
      "<span class=\"calendar-task-title\">" + escapeHtml(task.title) + "</span>" +
      (task.dueTime ? "<span class=\"calendar-task-time\">" + escapeHtml(task.dueTime) + "</span>" : "") +
      "</button>";
  }

  function getTasksForCalendarDate(iso) {
    return getVisibleCalendarTasks().filter(function (task) {
      return taskCoversDate(task, iso);
    }).sort(sortCalendarTasks);
  }

  function getAllDayCalendarTasks(iso) {
    return getTasksForCalendarDate(iso).filter(function (task) {
      return task.allDay || !task.dueTime;
    });
  }

  function renderWeekBlocksForHour(iso, hour) {
    return getTasksForCalendarDate(iso).filter(function (task) {
      if (task.allDay || !task.startAt) {
        return false;
      }
      return Number(task.startAt.slice(11, 13)) === hour;
    }).map(function (task) {
      var start = timeToMinutes(task.startAt.slice(11, 16));
      var end = timeToMinutes(task.endAt ? task.endAt.slice(11, 16) : minutesToTime(start + 60));
      var top = (start % 60) / 60 * 68;
      var height = Math.max(34, (end - start) / 60 * 68);
      var selected = state.ui.selectedTaskId === task.id;
      var multi = state.ui.selectedCalendarTaskIds.includes(task.id);
      return "<button class=\"week-task-block" + (selected ? " is-selected" : "") +
        (multi ? " is-multi-selected" : "") + "\" type=\"button\" draggable=\"true\" data-calendar-task=\"" +
        escapeHtml(task.id) + "\" style=\"top:" + top + "px;height:" + height +
        "px;border-left-color:" + escapeHtml(getCalendarTaskColor(task)) + "\">" +
        "<span class=\"week-task-title\">" + escapeHtml(task.title) + "</span>" +
        "<span class=\"week-task-time\">" + escapeHtml(formatTaskTimeRange(task)) + "</span>" +
        "<span class=\"resize-handle\" data-resize-task=\"" + escapeHtml(task.id) + "\"></span></button>";
    }).join("");
  }

  function renderAgendaRow(task) {
    var selected = state.ui.selectedTaskId === task.id;
    var multi = state.ui.selectedCalendarTaskIds.includes(task.id);
    return "<button class=\"agenda-row" + (selected ? " is-selected" : "") +
      (multi ? " is-multi-selected" : "") + "\" type=\"button\" draggable=\"true\" data-calendar-task=\"" +
      escapeHtml(task.id) + "\" style=\"border-left-color:" + escapeHtml(getCalendarTaskColor(task)) + "\">" +
      "<span class=\"task-checkbox" + (task.completed ? " is-checked" : "") + "\">" +
      (task.completed ? "✓" : "") + "</span><span>" + escapeHtml(task.title) + "</span><span>" +
      escapeHtml(formatDateLabel(task.dueDate) + (task.dueTime ? " " + task.dueTime : "")) + "</span></button>";
  }

  function createCalendarTaskFromDraft(draft) {
    var task = createTask(calendarDraftToTaskFields(draft));
    state.tasks.push(task);
    state.ui.selectedTaskId = task.id;
    state.ui.selectedCalendarTaskIds = [task.id];
    state.ui.activeView = "calendar";
    saveState("日历创建任务");
    render();
  }

  function shiftMonth(delta) {
    if (state.ui.calendarViewMode === "week") {
      var selected = state.ui.selectedCalendarDate ? parseIsoDate(state.ui.selectedCalendarDate) : new Date();
      state.ui.selectedCalendarDate = toIsoDate(addDays(selected, delta * 7));
      var nextWeekDate = parseIsoDate(state.ui.selectedCalendarDate);
      state.ui.calendarYear = nextWeekDate.getFullYear();
      state.ui.calendarMonth = nextWeekDate.getMonth();
      saveState("切换日历周");
      render();
      return;
    }
    var next = new Date(state.ui.calendarYear, state.ui.calendarMonth + delta, 1);
    state.ui.calendarYear = next.getFullYear();
    state.ui.calendarMonth = next.getMonth();
    saveState("切换日历月份");
    render();
  }

  function renderUnscheduledTray() {
    var tasks = state.tasks.filter(function (task) {
      return !task.completed && !task.trashed && !task.dueDate;
    }).sort(sortTaskList);
    elements.unscheduledList.className = "unscheduled-list";
    elements.unscheduledList.innerHTML = tasks.length ? tasks.map(function (task) {
      return "<button class=\"unscheduled-item\" type=\"button\" draggable=\"true\" data-unscheduled-task=\"" +
        escapeHtml(task.id) + "\" style=\"border-left-color:" + escapeHtml(getCalendarTaskColor(task)) + "\">" +
        escapeHtml(task.title) + "</button>";
    }).join("") : "<p class=\"empty-state\">暂无未安排任务。</p>";
  }

  function renderCalendarFilters() {
    elements.filterShowCompleted.checked = state.ui.calendarFilters.showCompleted;
    elements.filterColorBy.value = state.ui.calendarFilters.colorBy;
    elements.filterListOptions.className = "filter-list-options";
    elements.filterListOptions.innerHTML = state.lists
      .filter(function (list) { return !list.archived; })
      .sort(byOrder)
      .map(function (list) {
        var checked = state.ui.calendarFilters.visibleListIds.includes(list.id);
        return "<label><input type=\"checkbox\" value=\"" + escapeHtml(list.id) + "\"" +
          (checked ? " checked" : "") + "> " + escapeHtml(list.name) + "</label>";
      }).join("");
  }

  function renderBatchToolbar() {
    var count = state.ui.selectedCalendarTaskIds.length;
    elements.batchToolbar.hidden = count < 2;
    elements.batchCountLabel.textContent = "已选择 " + count + " 项";
  }

  function getVisibleCalendarTasks() {
    return state.tasks.filter(function (task) {
      if (task.trashed) {
        return false;
      }
      if (!state.ui.calendarFilters.showCompleted && task.completed) {
        return false;
      }
      if (!state.ui.calendarFilters.visibleListIds.includes(task.listId)) {
        return false;
      }
      return true;
    });
  }

  function taskCoversDate(task, iso) {
    if (!task.dueDate) {
      return false;
    }
    if (task.allDay && task.startAt && task.endAt) {
      return iso >= task.startAt.slice(0, 10) && iso <= task.endAt.slice(0, 10);
    }
    return task.dueDate === iso;
  }

  function sortCalendarTasks(a, b) {
    if (a.dueTime !== b.dueTime) {
      return String(a.dueTime || "99:99").localeCompare(String(b.dueTime || "99:99"));
    }
    return priorityWeight(b.priority) - priorityWeight(a.priority);
  }

  function getCalendarTaskColor(task) {
    if (state.ui.calendarFilters.colorBy === "priority") {
      return {
        high: "#c84f45",
        medium: "#d48930",
        low: "#2f8b68",
        none: "#7c8b87"
      }[task.priority] || "#7c8b87";
    }
    var list = findList(task.listId);
    return list ? list.color : "#2f8b68";
  }

  function openCalendarCreatePopover(options) {
    var date = options.date || toIsoDate(new Date());
    var endDate = options.endDate || date;
    document.getElementById("calendar-create-title").value = "";
    document.getElementById("calendar-create-date").value = date;
    document.getElementById("calendar-create-end-date").value = endDate;
    document.getElementById("calendar-create-all-day").checked = options.allDay !== false;
    document.getElementById("calendar-create-time").value = options.time || "09:00";
    document.getElementById("calendar-create-end-time").value = options.endTime || minutesToTime(timeToMinutes(options.time || "09:00") + 60);
    document.getElementById("calendar-create-priority").value = "none";
    document.getElementById("calendar-create-list").innerHTML = state.lists
      .filter(function (list) { return !list.archived; })
      .sort(byOrder)
      .map(function (list) {
        return "<option value=\"" + escapeHtml(list.id) + "\"" + (list.id === getCreationListId() ? " selected" : "") +
          ">" + escapeHtml(list.name) + "</option>";
      }).join("");
    document.getElementById("calendar-popover-range").textContent = date === endDate ? "日期：" + date :
      "日期范围：" + date + " 至 " + endDate;
    document.getElementById("calendar-create-error").hidden = true;
    elements.calendarPopover.hidden = false;
    toggleCalendarCreateTimeFields();
  }

  function closeCalendarCreatePopover() {
    elements.calendarPopover.hidden = true;
  }

  function toggleCalendarCreateTimeFields() {
    document.getElementById("calendar-create-time-wrap").hidden =
      document.getElementById("calendar-create-all-day").checked;
  }

  function handleCalendarCreateSubmit(event) {
    event.preventDefault();
    var title = document.getElementById("calendar-create-title").value.trim();
    if (!title) {
      document.getElementById("calendar-create-error").hidden = false;
      return;
    }
    createCalendarTaskFromDraft({
      title: title,
      date: document.getElementById("calendar-create-date").value,
      endDate: document.getElementById("calendar-create-end-date").value,
      allDay: document.getElementById("calendar-create-all-day").checked,
      time: document.getElementById("calendar-create-time").value,
      endTime: document.getElementById("calendar-create-end-time").value,
      listId: document.getElementById("calendar-create-list").value,
      priority: document.getElementById("calendar-create-priority").value
    });
    closeCalendarCreatePopover();
  }

  function calendarDraftToTaskFields(draft) {
    var date = draft.date || toIsoDate(new Date());
    var endDate = draft.endDate || date;
    if (draft.allDay) {
      return {
        title: draft.title,
        listId: draft.listId || "inbox",
        priority: draft.priority || "none",
        dueDate: date,
        dueTime: null,
        allDay: true,
        startAt: date + "T00:00",
        endAt: endDate + "T23:59"
      };
    }
    var time = draft.time || "09:00";
    var endTime = draft.endTime || minutesToTime(timeToMinutes(time) + 60);
    return {
      title: draft.title,
      listId: draft.listId || "inbox",
      priority: draft.priority || "none",
      dueDate: date,
      dueTime: time,
      allDay: false,
      startAt: date + "T" + time,
      endAt: date + "T" + endTime
    };
  }

  function handleCalendarTaskClick(event, taskId, anchorElement) {
    event.preventDefault();
    event.stopPropagation();
    if (calendarDragJustEnded) {
      return;
    }
    closeCalendarCreatePopover();
    if (event.ctrlKey || event.metaKey) {
      toggleCalendarMultiSelect(taskId);
      return;
    }
    openCalendarTaskPopover(taskId, anchorElement);
  }

  function openCalendarTaskPopover(taskId, anchorElement) {
    var task = findTask(taskId);
    if (!task) {
      console.warn("[Personal_Web] 日历浮窗打开失败，任务不存在：", taskId);
      return;
    }
    var rect = anchorElement ? anchorElement.getBoundingClientRect() : null;
    state.ui.selectedTaskId = taskId;
    state.ui.selectedCalendarTaskIds = [taskId];
    calendarTaskDraft = cloneTaskForDraft(task);
    closeDateTimePicker();
    saveState("打开日历任务浮窗");
    render();
    renderCalendarTaskPopover();
    positionPopover(elements.calendarTaskPopover, rect, 420);
    console.log("[Personal_Web] 已打开日历任务浮窗：", {
      taskId: taskId,
      title: task.title
    });
  }

  function cloneTaskForDraft(task) {
    return JSON.parse(JSON.stringify(task));
  }

  function renderCalendarTaskPopover() {
    if (!calendarTaskDraft) {
      elements.calendarTaskPopover.hidden = true;
      return;
    }
    document.getElementById("calendar-detail-completed").checked = calendarTaskDraft.completed;
    document.getElementById("calendar-detail-date-line").textContent = formatDateTimeLine(calendarTaskDraft);
    document.getElementById("calendar-detail-title").value = calendarTaskDraft.title || "";
    document.getElementById("calendar-detail-note").value = calendarTaskDraft.note || "";
    document.getElementById("calendar-detail-list").innerHTML = state.lists
      .filter(function (list) { return !list.archived; })
      .sort(byOrder)
      .map(function (list) {
        return "<option value=\"" + escapeHtml(list.id) + "\"" +
          (calendarTaskDraft.listId === list.id ? " selected" : "") + ">" +
          escapeHtml(list.name) + "</option>";
      }).join("");
    document.getElementById("calendar-detail-priority").value = calendarTaskDraft.priority || "none";
    document.getElementById("calendar-detail-tags").value = (calendarTaskDraft.tagIds || []).map(function (tagId) {
      var tag = findTag(tagId);
      return tag ? tag.name : "";
    }).filter(Boolean).join(" ");
    document.getElementById("calendar-detail-reminder").value = calendarTaskDraft.reminder && calendarTaskDraft.reminder.enabled ?
      String(calendarTaskDraft.reminder.minutesBefore || 0) : "none";
    document.getElementById("calendar-detail-repeat").value = calendarTaskDraft.repeat && calendarTaskDraft.repeat.type ?
      calendarTaskDraft.repeat.type : "none";
    elements.calendarTaskPopover.hidden = false;
  }

  function readCalendarTaskDraftFromForm() {
    if (!calendarTaskDraft) {
      return;
    }
    calendarTaskDraft.title = document.getElementById("calendar-detail-title").value.trim() || "未命名任务";
    calendarTaskDraft.note = document.getElementById("calendar-detail-note").value.trim();
    calendarTaskDraft.listId = document.getElementById("calendar-detail-list").value;
    calendarTaskDraft.priority = document.getElementById("calendar-detail-priority").value;
    calendarTaskDraft.tagIds = parseTagInput(document.getElementById("calendar-detail-tags").value);
    calendarTaskDraft.reminder = parseReminderInput(document.getElementById("calendar-detail-reminder").value);
    calendarTaskDraft.repeat = {
      type: document.getElementById("calendar-detail-repeat").value,
      interval: 1
    };
  }

  function saveCalendarTaskPopover(event) {
    event.preventDefault();
    if (!calendarTaskDraft) {
      return;
    }
    var task = findTask(calendarTaskDraft.id);
    if (!task) {
      console.warn("[Personal_Web] 日历浮窗保存失败，任务不存在：", calendarTaskDraft.id);
      closeCalendarTaskPopover();
      return;
    }
    readCalendarTaskDraftFromForm();
    Object.assign(task, normalizeTaskSchedule(calendarTaskDraft), {
      updatedAt: new Date().toISOString()
    });
    saveState("保存日历浮窗任务");
    calendarTaskDraft = cloneTaskForDraft(task);
    render();
    renderCalendarTaskPopover();
    console.log("[Personal_Web] 日历浮窗任务已保存：", {
      taskId: task.id,
      dueDate: task.dueDate,
      dueTime: task.dueTime
    });
  }

  function closeCalendarTaskPopover() {
    calendarTaskDraft = null;
    closeDateTimePicker();
    elements.calendarTaskPopover.hidden = true;
  }

  function trashCalendarTaskDraft() {
    if (!calendarTaskDraft) {
      return;
    }
    if (!window.confirm("确认将这个任务移入垃圾桶？")) {
      return;
    }
    var task = findTask(calendarTaskDraft.id);
    if (!task) {
      closeCalendarTaskPopover();
      return;
    }
    task.trashed = true;
    task.trashedAt = new Date().toISOString();
    task.updatedAt = task.trashedAt;
    saveState("日历浮窗移入垃圾桶");
    closeCalendarTaskPopover();
    render();
  }

  function positionPopover(popover, rect, preferredWidth) {
    popover.hidden = false;
    var margin = 12;
    var width = Math.min(preferredWidth || 420, window.innerWidth - margin * 2);
    var measuredHeight = Math.min(popover.offsetHeight || 420, window.innerHeight - margin * 2);
    var left = rect ? rect.right + 10 : (window.innerWidth - width) / 2;
    var top = rect ? rect.top + 6 : (window.innerHeight - measuredHeight) / 2;
    if (left + width > window.innerWidth - margin && rect) {
      left = rect.left - width - 10;
    }
    if (left < margin) {
      left = margin;
    }
    if (top + measuredHeight > window.innerHeight - margin) {
      top = window.innerHeight - measuredHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }
    popover.style.left = Math.round(left) + "px";
    popover.style.top = Math.round(top) + "px";
    popover.style.right = "auto";
    popover.style.bottom = "auto";
  }

  function openDateTimePicker(anchorElement) {
    if (!calendarTaskDraft) {
      return;
    }
    readCalendarTaskDraftFromForm();
    dateTimeDraft = {
      dueDate: calendarTaskDraft.dueDate,
      dueTime: calendarTaskDraft.dueTime,
      reminder: calendarTaskDraft.reminder || { enabled: false, minutesBefore: null },
      repeat: calendarTaskDraft.repeat || { type: "none", interval: 1 }
    };
    dateTimePickerMonth = dateTimeDraft.dueDate ? parseIsoDate(dateTimeDraft.dueDate) : new Date();
    renderDateTimePicker();
    positionPopover(elements.dateTimePopover, anchorElement.getBoundingClientRect(), 320);
  }

  function renderDateTimePicker() {
    if (!dateTimeDraft) {
      elements.dateTimePopover.hidden = true;
      return;
    }
    var monthDate = dateTimePickerMonth || new Date();
    elements.dateTimeMonthTitle.textContent = monthDate.getFullYear() + "年" + pad(monthDate.getMonth() + 1) + "月";
    elements.dateTimeDateGrid.innerHTML = getCalendarCells(monthDate.getFullYear(), monthDate.getMonth()).map(function (date) {
      var iso = toIsoDate(date);
      return "<button type=\"button\" data-picker-date=\"" + iso + "\" class=\"" +
        (date.getMonth() !== monthDate.getMonth() ? "is-muted " : "") +
        (iso === toIsoDate(new Date()) ? "is-today " : "") +
        (iso === dateTimeDraft.dueDate ? "is-selected" : "") + "\">" +
        date.getDate() + "</button>";
    }).join("");
    document.getElementById("datetime-time-input").value = dateTimeDraft.dueTime || "";
    document.getElementById("datetime-reminder-input").value = dateTimeDraft.reminder && dateTimeDraft.reminder.enabled ?
      String(dateTimeDraft.reminder.minutesBefore || 0) : "none";
    document.getElementById("datetime-repeat-input").value = dateTimeDraft.repeat && dateTimeDraft.repeat.type ?
      dateTimeDraft.repeat.type : "none";
    elements.dateTimePopover.hidden = false;
  }

  function applyDateQuick(key) {
    if (!dateTimeDraft) {
      return;
    }
    var today = new Date();
    if (key === "today") {
      dateTimeDraft.dueDate = toIsoDate(today);
    } else if (key === "tomorrow") {
      dateTimeDraft.dueDate = toIsoDate(addDays(today, 1));
    } else if (key === "next-week") {
      dateTimeDraft.dueDate = toIsoDate(addDays(today, 7));
    } else if (key === "none") {
      dateTimeDraft.dueDate = null;
      dateTimeDraft.dueTime = null;
    }
    dateTimePickerMonth = dateTimeDraft.dueDate ? parseIsoDate(dateTimeDraft.dueDate) : today;
    renderDateTimePicker();
  }

  function applyDateTimePicker() {
    if (!calendarTaskDraft || !dateTimeDraft) {
      return;
    }
    var time = document.getElementById("datetime-time-input").value || null;
    var date = dateTimeDraft.dueDate;
    calendarTaskDraft.dueDate = date;
    calendarTaskDraft.dueTime = date ? time : null;
    calendarTaskDraft.allDay = !date || !time;
    if (date && time) {
      var duration = getTaskDurationMinutes(calendarTaskDraft);
      calendarTaskDraft.startAt = date + "T" + time;
      calendarTaskDraft.endAt = addMinutesToLocalDateTime(calendarTaskDraft.startAt, duration || 60);
    } else if (date) {
      calendarTaskDraft.startAt = date + "T00:00";
      calendarTaskDraft.endAt = date + "T23:59";
    } else {
      calendarTaskDraft.startAt = null;
      calendarTaskDraft.endAt = null;
    }
    calendarTaskDraft.reminder = parseReminderInput(document.getElementById("datetime-reminder-input").value);
    calendarTaskDraft.repeat = {
      type: document.getElementById("datetime-repeat-input").value,
      interval: 1
    };
    closeDateTimePicker();
    renderCalendarTaskPopover();
  }

  function clearDateTimePicker() {
    if (!calendarTaskDraft) {
      return;
    }
    calendarTaskDraft.dueDate = null;
    calendarTaskDraft.dueTime = null;
    calendarTaskDraft.startAt = null;
    calendarTaskDraft.endAt = null;
    calendarTaskDraft.allDay = true;
    closeDateTimePicker();
    renderCalendarTaskPopover();
  }

  function closeDateTimePicker() {
    dateTimeDraft = null;
    elements.dateTimePopover.hidden = true;
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }
    if (!elements.dateTimePopover.hidden) {
      closeDateTimePicker();
      return;
    }
    if (!elements.calendarTaskPopover.hidden) {
      closeCalendarTaskPopover();
      return;
    }
    if (!elements.calendarPopover.hidden) {
      closeCalendarCreatePopover();
    }
  }

  function formatDateTimeLine(task) {
    if (!task.dueDate) {
      return "无日期";
    }
    var line = formatDateLabel(task.dueDate);
    if (task.dueTime) {
      line += ", " + task.dueTime;
    }
    return line;
  }

  function toggleCalendarMultiSelect(taskId) {
    var ids = state.ui.selectedCalendarTaskIds;
    state.ui.selectedCalendarTaskIds = ids.includes(taskId) ?
      ids.filter(function (id) { return id !== taskId; }) : ids.concat(taskId);
    state.ui.selectedTaskId = taskId;
    saveState("切换日历多选");
    render();
  }

  function handleBatchAction(event) {
    var button = event.target.closest("[data-batch-action]");
    if (!button) {
      return;
    }
    var ids = state.ui.selectedCalendarTaskIds.slice();
    ids.forEach(function (id) {
      var task = findTask(id);
      if (!task) {
        return;
      }
      if (button.dataset.batchAction === "complete") {
        setTaskCompleted(task, true);
      } else if (button.dataset.batchAction === "trash") {
        task.trashed = true;
        task.trashedAt = new Date().toISOString();
      } else if (button.dataset.batchAction === "postpone") {
        postponeTaskOneHour(task);
      }
      task.updatedAt = new Date().toISOString();
    });
    if (button.dataset.batchAction === "clear") {
      state.ui.selectedCalendarTaskIds = [];
    }
    saveState("日历批量操作");
    render();
  }

  function postponeTaskOneHour(task) {
    if (task.startAt && task.endAt && !task.allDay) {
      task.startAt = addMinutesToLocalDateTime(task.startAt, 60);
      task.endAt = addMinutesToLocalDateTime(task.endAt, 60);
      task.dueDate = task.startAt.slice(0, 10);
      task.dueTime = task.startAt.slice(11, 16);
    } else if (task.dueTime) {
      task.dueTime = minutesToTime(timeToMinutes(task.dueTime) + 60);
      task.startAt = task.dueDate + "T" + task.dueTime;
      task.endAt = addMinutesToLocalDateTime(task.startAt, 60);
    }
  }

  var dragState = null;
  var resizeState = null;
  var rangeState = null;

  function handleCalendarDragStart(event) {
    var calendarTask = event.target.closest("[data-calendar-task]");
    var unscheduled = event.target.closest("[data-unscheduled-task]");
    if (calendarTask) {
      dragState = { type: "scheduled", taskId: calendarTask.dataset.calendarTask };
      calendarTask.classList.add("is-dragging");
    } else if (unscheduled) {
      dragState = { type: "unscheduled", taskId: unscheduled.dataset.unscheduledTask };
      unscheduled.classList.add("is-dragging");
    }
    if (dragState && event.dataTransfer) {
      event.dataTransfer.setData("text/plain", dragState.taskId);
      event.dataTransfer.effectAllowed = "move";
    }
  }

  function handleCalendarDragOver(event) {
    if (!dragState) {
      return;
    }
    var target = getDropTarget(event.target);
    if (target) {
      event.preventDefault();
      target.element.classList.add("is-drag-over");
    }
  }

  function handleCalendarDragLeave(event) {
    var target = getDropTarget(event.target);
    if (target) {
      target.element.classList.remove("is-drag-over");
    }
  }

  function handleCalendarDrop(event) {
    if (!dragState) {
      return;
    }
    var target = getDropTarget(event.target);
    if (!target) {
      clearDragState();
      return;
    }
    event.preventDefault();
    target.element.classList.remove("is-drag-over");
    var task = findTask(dragState.taskId);
    if (task) {
      scheduleTaskOnDrop(task, target, dragState.type);
      state.ui.selectedTaskId = task.id;
      state.ui.selectedCalendarTaskIds = [task.id];
      saveState("拖拽排程任务");
    }
    clearDragState();
    render();
  }

  function getDropTarget(node) {
    var monthDay = node.closest && node.closest("[data-month-day]");
    if (monthDay) {
      return { element: monthDay, date: monthDay.dataset.monthDay, allDay: true };
    }
    var allDay = node.closest && node.closest("[data-week-all-day]");
    if (allDay) {
      return { element: allDay, date: allDay.dataset.weekAllDay, allDay: true };
    }
    var weekSlot = node.closest && (node.closest("[data-week-slot]") || node.closest("[data-week-date]"));
    if (weekSlot) {
      return {
        element: weekSlot,
        date: weekSlot.dataset.weekDate,
        hour: Number(weekSlot.dataset.weekHour),
        minute: Number(weekSlot.dataset.weekMinute || 0),
        allDay: false
      };
    }
    return null;
  }

  function scheduleTaskOnDrop(task, target, sourceType) {
    var duration = getTaskDurationMinutes(task);
    if (target.allDay) {
      var span = getTaskSpanDays(task);
      task.dueDate = target.date;
      if (sourceType === "scheduled" && !task.allDay && (task.dueTime || task.startAt)) {
        var preservedTime = task.dueTime || task.startAt.slice(11, 16);
        task.dueTime = preservedTime;
        task.allDay = false;
        task.startAt = target.date + "T" + preservedTime;
        task.endAt = addMinutesToLocalDateTime(task.startAt, duration);
      } else {
        task.dueTime = null;
        task.allDay = true;
        task.startAt = target.date + "T00:00";
        task.endAt = toIsoDate(addDays(parseIsoDate(target.date), span - 1)) + "T23:59";
      }
    } else {
      var startTime = minutesToTime(target.hour * 60 + (target.minute || 0));
      task.dueDate = target.date;
      task.dueTime = startTime;
      task.allDay = false;
      task.startAt = target.date + "T" + startTime;
      task.endAt = addMinutesToLocalDateTime(task.startAt, duration);
    }
    task.updatedAt = new Date().toISOString();
  }

  function clearDragState() {
    document.querySelectorAll(".is-dragging,.is-drag-over").forEach(function (node) {
      node.classList.remove("is-dragging", "is-drag-over");
    });
    if (dragState) {
      calendarDragJustEnded = true;
      window.setTimeout(function () {
        calendarDragJustEnded = false;
      }, 80);
    }
    dragState = null;
  }

  function handleCalendarMouseDown(event) {
    var resize = event.target.closest("[data-resize-task]");
    if (resize) {
      startResize(event, resize.dataset.resizeTask);
      return;
    }
    if (state.ui.calendarViewMode !== "month") {
      return;
    }
    if (event.target.closest("[data-calendar-task]")) {
      return;
    }
    var day = event.target.closest("[data-month-day]");
    if (!day) {
      return;
    }
    rangeState = { start: day.dataset.monthDay, end: day.dataset.monthDay };
    day.classList.add("is-range-selecting");
    document.addEventListener("mouseover", handleRangeMouseOver);
    document.addEventListener("mouseup", handleRangeMouseUp, { once: true });
  }

  function handleRangeMouseOver(event) {
    if (!rangeState) {
      return;
    }
    var day = event.target.closest("[data-month-day]");
    if (day) {
      rangeState.end = day.dataset.monthDay;
      highlightRange(rangeState.start, rangeState.end);
    }
  }

  function handleRangeMouseUp() {
    if (!rangeState) {
      return;
    }
    document.removeEventListener("mouseover", handleRangeMouseOver);
    var start = rangeState.start < rangeState.end ? rangeState.start : rangeState.end;
    var end = rangeState.start < rangeState.end ? rangeState.end : rangeState.start;
    document.querySelectorAll(".is-range-selecting").forEach(function (node) {
      node.classList.remove("is-range-selecting");
    });
    openCalendarCreatePopover({ date: start, endDate: end, allDay: true });
    rangeState = null;
  }

  function highlightRange(start, end) {
    var min = start < end ? start : end;
    var max = start < end ? end : start;
    document.querySelectorAll("[data-month-day]").forEach(function (day) {
      day.classList.toggle("is-range-selecting", day.dataset.monthDay >= min && day.dataset.monthDay <= max);
    });
  }

  function startResize(event, taskId) {
    event.preventDefault();
    event.stopPropagation();
    var task = findTask(taskId);
    if (!task || task.allDay || !task.startAt) {
      return;
    }
    resizeState = {
      taskId: taskId,
      startY: event.clientY,
      originalEnd: task.endAt,
      startAt: task.startAt
    };
  }

  function handleResizeMove(event) {
    if (!resizeState) {
      return;
    }
    event.preventDefault();
  }

  function handleResizeEnd(event) {
    if (!resizeState) {
      return;
    }
    var task = findTask(resizeState.taskId);
    if (task) {
      var deltaSlots = Math.round((event.clientY - resizeState.startY) / 34);
      var baseDuration = getTaskDurationMinutes({
        startAt: resizeState.startAt,
        endAt: resizeState.originalEnd
      });
      var nextDuration = Math.max(30, baseDuration + deltaSlots * 30);
      nextDuration = Math.min(nextDuration, 24 * 60 - timeToMinutes(task.startAt.slice(11, 16)));
      task.endAt = addMinutesToLocalDateTime(task.startAt, nextDuration);
      task.updatedAt = new Date().toISOString();
      saveState("调整任务时长");
      render();
    }
    resizeState = null;
  }

  function toggleDetailTimeFields() {
    var allDay = document.getElementById("detail-all-day").checked;
    document.getElementById("detail-due-time").disabled = allDay;
    document.getElementById("detail-start-time").disabled = allDay;
    document.getElementById("detail-end-time").disabled = allDay;
  }

  function getSelectedWeekStart() {
    var selected = state.ui.selectedCalendarDate ? parseIsoDate(state.ui.selectedCalendarDate) :
      new Date(state.ui.calendarYear, state.ui.calendarMonth, 1);
    return addDays(selected, -selected.getDay());
  }

  function formatWeekTitle(weekStart) {
    var weekEnd = addDays(weekStart, 6);
    return weekStart.getFullYear() + "年" + pad(weekStart.getMonth() + 1) + "月" +
      pad(weekStart.getDate()) + "日 - " + pad(weekEnd.getMonth() + 1) + "月" +
      pad(weekEnd.getDate()) + "日";
  }

  function weekdayLabel(date) {
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  }

  function formatTaskTimeRange(task) {
    if (task.allDay || !task.startAt) {
      return "全天";
    }
    return task.startAt.slice(11, 16) + " - " + (task.endAt ? task.endAt.slice(11, 16) : "");
  }

  function getTaskDurationMinutes(task) {
    if (!task.startAt || !task.endAt) {
      return 60;
    }
    var start = localDateTimeToDate(task.startAt);
    var end = localDateTimeToDate(task.endAt);
    return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  function getTaskSpanDays(task) {
    if (!task.startAt || !task.endAt || !task.allDay) {
      return 1;
    }
    var start = parseIsoDate(task.startAt.slice(0, 10));
    var end = parseIsoDate(task.endAt.slice(0, 10));
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  }

  function localDateTimeToDate(value) {
    var datePart = value.slice(0, 10);
    var timePart = value.slice(11, 16);
    var date = parseIsoDate(datePart);
    var minutes = timeToMinutes(timePart);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
  }

  function addMinutesToLocalDateTime(value, minutes) {
    var next = new Date(localDateTimeToDate(value).getTime() + minutes * 60000);
    return toIsoDate(next) + "T" + minutesToTime(next.getHours() * 60 + next.getMinutes());
  }

  function timeToMinutes(value) {
    var parts = String(value || "00:00").split(":").map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  function minutesToTime(total) {
    var normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
    return pad(Math.floor(normalized / 60)) + ":" + pad(normalized % 60);
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

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
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
