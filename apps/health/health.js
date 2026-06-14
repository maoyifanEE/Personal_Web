(function () {
  "use strict";

  var STORAGE_KEY = "personal_web_health_v1";
  var state = null;
  var currentManagerType = null;

  var positiveFilters = [
    { key: "all", label: "全部" },
    { key: "todayPriority", label: "今日优先" },
    { key: "dueSoon", label: "即将到期" },
    { key: "overdue", label: "已逾期" },
    { key: "completedToday", label: "今日已完成" }
  ];

  var indulgenceFilters = [
    { key: "all", label: "全部" },
    { key: "cooling", label: "冷却中" },
    { key: "almostRecovered", label: "接近恢复" },
    { key: "allowedCautious", label: "可接受" },
    { key: "monthlyWarning", label: "月度偏多" }
  ];

  var sectionConfig = {
    diet: {
      listKey: "dietCards",
      containerId: "diet-cards",
      filterKey: "dietFilter",
      accent: "#20a87f",
      label: "健康饮食",
      lastLabel: "上次吃",
      actionDone: "今日已打卡",
      actionDefault: "立即打卡"
    },
    exercise: {
      listKey: "exerciseCards",
      containerId: "exercise-cards",
      filterKey: "exerciseFilter",
      accent: "#3d78d8",
      label: "运动打卡",
      lastLabel: "上次打卡",
      actionDone: "今日已完成",
      actionDefault: "完成打卡"
    },
    indulgence: {
      listKey: "indulgenceCards",
      containerId: "indulgence-cards",
      filterKey: "indulgenceFilter",
      accent: "#df6f3d",
      label: "放纵警告"
    }
  };

  function todayIso() {
    return toIsoDate(new Date());
  }

  function toIsoDate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function daysAgo(days) {
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return toIsoDate(date);
  }

  function parseIsoDate(value) {
    var parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function fullDaysBetween(fromIso, toIso) {
    var from = parseIsoDate(fromIso);
    var to = parseIsoDate(toIso);
    return Math.floor((to - from) / 86400000);
  }

  function latestDate(history) {
    if (!history || history.length === 0) {
      return null;
    }

    return history.slice().sort().pop();
  }

  function makeSeedData() {
    return {
      version: 1,
      dietCards: [
        createPositiveSeed("diet-carrot", "diet", "胡萝卜", "🥕", "high", 7, [daysAgo(6)], 1),
        createPositiveSeed("diet-milk", "diet", "牛奶", "🥛", "medium", 2, [daysAgo(1)], 2),
        createPositiveSeed("diet-salmon", "diet", "三文鱼", "🍣", "high", 5, [daysAgo(3)], 3),
        createPositiveSeed("diet-blueberry", "diet", "蓝莓", "🫐", "low", 4, [todayIso()], 4),
        createPositiveSeed("diet-egg", "diet", "鸡蛋", "🥚", "medium", 3, [daysAgo(2)], 5),
        createPositiveSeed("diet-nuts", "diet", "坚果", "🥜", "medium", 3, [daysAgo(5)], 6)
      ],
      exerciseCards: [
        createPositiveSeed("exercise-walk", "exercise", "快走", "🚶", "medium", 1, [daysAgo(1)], 1),
        createPositiveSeed("exercise-stretch", "exercise", "拉伸", "🤸", "low", 2, [daysAgo(1)], 2),
        createPositiveSeed("exercise-bike", "exercise", "骑行", "🚴", "high", 3, [daysAgo(4)], 3),
        createPositiveSeed("exercise-squat", "exercise", "深蹲", "🏋️", "medium", 3, [daysAgo(2)], 4),
        createPositiveSeed("exercise-core", "exercise", "核心训练", "🧘", "high", 2, [todayIso()], 5),
        createPositiveSeed("exercise-upper", "exercise", "上肢训练", "💪", "medium", 4, [daysAgo(5)], 6)
      ],
      indulgenceCards: [
        createIndulgenceSeed("indulgence-late", "熬夜", "🌙", "high", 7, [daysAgo(2)], 4, 1),
        createIndulgenceSeed("indulgence-fried", "油炸", "🍟", "high", 10, [daysAgo(11)], 3, 2),
        createIndulgenceSeed("indulgence-drink", "甜饮料", "🧋", "medium", 5, [daysAgo(4)], 5, 3),
        createIndulgenceSeed("indulgence-night", "夜宵", "🌭", "medium", 7, [todayIso()], 4, 4)
      ],
      uiPrefs: {
        dietFilter: "all",
        exerciseFilter: "all",
        indulgenceFilter: "all"
      }
    };
  }

  function createPositiveSeed(id, type, title, icon, importance, recurrenceDays, history, order) {
    return {
      id: id,
      type: type,
      title: title,
      icon: icon,
      importance: importance,
      recurrenceDays: recurrenceDays,
      checkinHistory: history,
      active: true,
      sortOrder: order,
      note: ""
    };
  }

  function createIndulgenceSeed(id, title, icon, riskLevel, gapDays, history, limit, order) {
    return {
      id: id,
      type: "indulgence",
      title: title,
      icon: icon,
      riskLevel: riskLevel,
      recommendedGapDays: gapDays,
      eventHistory: history,
      monthlySoftLimit: limit,
      active: true,
      sortOrder: order,
      note: ""
    };
  }

  function loadState() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = makeSeedData();
      saveState();
      return;
    }

    try {
      state = JSON.parse(raw);
    } catch (error) {
      console.warn("[Personal_Web] health storage parse failed, resetting.", error);
      state = makeSeedData();
      saveState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function calculatePositiveStatus(card) {
    var today = todayIso();
    var lastCompletedAt = latestDate(card.checkinHistory);
    if (!lastCompletedAt) {
      return {
        status: "dueToday",
        label: "今天需要完成",
        lastCompletedAt: null,
        timingText: "今天需要完成"
      };
    }

    if (lastCompletedAt === today) {
      return {
        status: "completedToday",
        label: "今日已完成",
        lastCompletedAt: lastCompletedAt,
        daysSinceLast: 0,
        daysUntilDue: card.recurrenceDays,
        timingText: "今天已完成"
      };
    }

    var daysSinceLast = fullDaysBetween(lastCompletedAt, today);
    var daysUntilDue = card.recurrenceDays - daysSinceLast;
    var upcomingWindowDays = Math.max(1, Math.ceil(card.recurrenceDays * 0.25));

    if (daysUntilDue < 0) {
      return {
        status: "overdue",
        label: "已逾期 " + Math.abs(daysUntilDue) + " 天",
        lastCompletedAt: lastCompletedAt,
        daysSinceLast: daysSinceLast,
        daysUntilDue: daysUntilDue,
        timingText: "已逾期 " + Math.abs(daysUntilDue) + " 天"
      };
    }

    if (daysUntilDue === 0) {
      return {
        status: "dueToday",
        label: "今天需要完成",
        lastCompletedAt: lastCompletedAt,
        daysSinceLast: daysSinceLast,
        daysUntilDue: daysUntilDue,
        timingText: "今天需要完成"
      };
    }

    if (daysUntilDue >= 1 && daysUntilDue <= upcomingWindowDays) {
      return {
        status: "dueSoon",
        label: "即将到期",
        lastCompletedAt: lastCompletedAt,
        daysSinceLast: daysSinceLast,
        daysUntilDue: daysUntilDue,
        timingText: "距离下次还剩 " + daysUntilDue + " 天"
      };
    }

    return {
      status: "normal",
      label: "正常",
      lastCompletedAt: lastCompletedAt,
      daysSinceLast: daysSinceLast,
      daysUntilDue: daysUntilDue,
      timingText: "距离下次还剩 " + daysUntilDue + " 天"
    };
  }

  function calculateIndulgenceStatus(card) {
    var today = todayIso();
    var lastOccurredAt = latestDate(card.eventHistory);
    var recent30dCount = countRecentDays(card.eventHistory, 30);

    if (!lastOccurredAt) {
      return {
        status: "allowedCautious",
        label: "可接受",
        lastOccurredAt: null,
        recent30dCount: recent30dCount,
        timingText: "今天起可接受"
      };
    }

    var daysSinceLast = fullDaysBetween(lastOccurredAt, today);
    var daysUntilAllowed = card.recommendedGapDays - daysSinceLast;

    if (lastOccurredAt === today) {
      return {
        status: "justOccurred",
        label: "刚发生",
        lastOccurredAt: lastOccurredAt,
        daysSinceLast: 0,
        daysUntilAllowed: card.recommendedGapDays,
        recent30dCount: recent30dCount,
        timingText: "建议继续克制"
      };
    }

    if (daysUntilAllowed > 2) {
      return {
        status: "cooling",
        label: "冷却中",
        lastOccurredAt: lastOccurredAt,
        daysSinceLast: daysSinceLast,
        daysUntilAllowed: daysUntilAllowed,
        recent30dCount: recent30dCount,
        timingText: "还需 " + daysUntilAllowed + " 天"
      };
    }

    if (daysUntilAllowed >= 1 && daysUntilAllowed <= 2) {
      return {
        status: "almostRecovered",
        label: "接近恢复",
        lastOccurredAt: lastOccurredAt,
        daysSinceLast: daysSinceLast,
        daysUntilAllowed: daysUntilAllowed,
        recent30dCount: recent30dCount,
        timingText: "还需 " + daysUntilAllowed + " 天"
      };
    }

    if (daysUntilAllowed <= 0 && recent30dCount <= card.monthlySoftLimit) {
      return {
        status: "allowedCautious",
        label: "可接受",
        lastOccurredAt: lastOccurredAt,
        daysSinceLast: daysSinceLast,
        daysUntilAllowed: daysUntilAllowed,
        recent30dCount: recent30dCount,
        timingText: "今天起可接受"
      };
    }

    return {
      status: "monthlyWarning",
      label: "月度偏多",
      lastOccurredAt: lastOccurredAt,
      daysSinceLast: daysSinceLast,
      daysUntilAllowed: daysUntilAllowed,
      recent30dCount: recent30dCount,
      timingText: "建议继续克制"
    };
  }

  function countRecentDays(history, days) {
    var today = todayIso();
    return (history || []).filter(function (item) {
      return fullDaysBetween(item, today) <= days;
    }).length;
  }

  function render() {
    renderFilters();
    renderSummary();
    renderSection("diet");
    renderSection("exercise");
    renderSection("indulgence");
    if (currentManagerType) {
      renderManager();
    }
  }

  function renderSummary() {
    var positiveCards = state.dietCards.concat(state.exerciseCards).filter(isActive);
    var positiveStatuses = positiveCards.map(calculatePositiveStatus);
    var indulgenceStatuses = state.indulgenceCards.filter(isActive).map(calculateIndulgenceStatus);
    var metrics = [
      {
        icon: "📌",
        title: "今日待完成",
        value: positiveStatuses.filter(function (item) {
          return item.status === "dueToday" || item.status === "overdue";
        }).length,
        text: "需要今天处理的饮食或运动卡片"
      },
      {
        icon: "⏳",
        title: "即将到期",
        value: positiveStatuses.filter(hasStatus("dueSoon")).length,
        text: "已经进入提醒窗口的健康习惯"
      },
      {
        icon: "✅",
        title: "今日已完成",
        value: positiveStatuses.filter(hasStatus("completedToday")).length,
        text: "今天已经打卡完成的项目"
      },
      {
        icon: "🔥",
        title: "已逾期",
        value: positiveStatuses.filter(hasStatus("overdue")).length,
        text: "超过各自周期的卡片数量"
      },
      {
        icon: "⚠️",
        title: "放纵警告",
        value: indulgenceStatuses.filter(function (item) {
          return ["justOccurred", "cooling", "monthlyWarning"].includes(item.status);
        }).length,
        text: "需要保持克制或关注节奏的项目"
      }
    ];

    var summary = document.getElementById("summary-grid");
    summary.innerHTML = metrics.map(function (metric) {
      return [
        "<article class=\"summary-card\">",
        "<span class=\"summary-icon\" aria-hidden=\"true\">" + metric.icon + "</span>",
        "<h2>" + metric.title + "</h2>",
        "<strong>" + metric.value + "</strong>",
        "<p>" + metric.text + "</p>",
        "</article>"
      ].join("");
    }).join("");
  }

  function hasStatus(status) {
    return function (item) {
      return item.status === status;
    };
  }

  function renderFilters() {
    renderFilterGroup("diet", positiveFilters);
    renderFilterGroup("exercise", positiveFilters);
    renderFilterGroup("indulgence", indulgenceFilters);
  }

  function renderFilterGroup(type, filters) {
    var config = sectionConfig[type];
    var wrap = document.querySelector("[data-filter-group=\"" + type + "\"]");
    var current = state.uiPrefs[config.filterKey] || "all";
    wrap.innerHTML = filters.map(function (filter) {
      var active = filter.key === current ? " is-active" : "";
      return "<button class=\"filter-chip" + active + "\" type=\"button\" data-filter=\"" +
        filter.key + "\" data-filter-type=\"" + type + "\">" + filter.label + "</button>";
    }).join("");
  }

  function renderSection(type) {
    var config = sectionConfig[type];
    var container = document.getElementById(config.containerId);
    var cards = state[config.listKey]
      .filter(isActive)
      .sort(bySortOrder)
      .filter(function (card) {
        return filterCard(type, card);
      });

    if (cards.length === 0) {
      container.innerHTML = "<div class=\"empty-state\">当前筛选下暂无卡片</div>";
      return;
    }

    container.innerHTML = cards.map(function (card) {
      return type === "indulgence" ? renderIndulgenceCard(card) : renderPositiveCard(type, card);
    }).join("");
  }

  function renderPositiveCard(type, card) {
    var config = sectionConfig[type];
    var status = calculatePositiveStatus(card);
    var actionText = getPositiveActionText(type, status.status);
    var disabled = status.status === "completedToday";
    var level = importanceLabel(card.importance);
    var levelClass = "level-" + card.importance;
    var accent = positiveAccent(status.status, config.accent);

    return [
      "<article class=\"health-card is-" + status.status + "\" style=\"--card-accent:" + accent +
        ";--level-color:" + level.color + "\">",
      "<div class=\"card-top\">",
      "<span class=\"card-icon\" aria-hidden=\"true\">" + escapeHtml(card.icon) + "</span>",
      "<div class=\"card-title\"><h3>" + escapeHtml(card.title) + "</h3>",
      "<span class=\"status-pill\">" + status.label + "</span></div>",
      "<button class=\"card-menu\" type=\"button\" data-open-manager=\"" + type +
        "\" aria-label=\"管理" + escapeHtml(card.title) + "\">⋯</button>",
      "</div>",
      "<div class=\"card-info\">",
      infoRow(config.lastLabel, status.lastCompletedAt ? relativeDateText(status.lastCompletedAt, "完成") : "暂无记录"),
      infoRow("周期", "每 " + card.recurrenceDays + " 天一次"),
      infoRow("当前节奏", status.timingText),
      "</div>",
      "<span class=\"level-tag " + levelClass + "\">" + level.label + "</span>",
      card.note ? "<p class=\"card-note\">" + escapeHtml(card.note) + "</p>" : "",
      "<button class=\"health-action-button" + (disabled ? " is-disabled" : "") +
        "\" type=\"button\" data-checkin=\"" + card.id + "\" data-type=\"" + type + "\"" +
        (disabled ? " disabled" : "") + ">" + actionText + "</button>",
      "</article>"
    ].join("");
  }

  function renderIndulgenceCard(card) {
    var status = calculateIndulgenceStatus(card);
    var risk = riskLabel(card.riskLevel);
    var accent = indulgenceAccent(status.status);

    return [
      "<article class=\"health-card is-" + status.status + "\" style=\"--card-accent:" + accent +
        ";--level-color:" + risk.color + "\">",
      "<div class=\"card-top\">",
      "<span class=\"card-icon\" aria-hidden=\"true\">" + escapeHtml(card.icon) + "</span>",
      "<div class=\"card-title\"><h3>" + escapeHtml(card.title) + "</h3>",
      "<span class=\"status-pill\">" + status.label + "</span></div>",
      "<button class=\"card-menu\" type=\"button\" data-open-manager=\"indulgence\" aria-label=\"管理" +
        escapeHtml(card.title) + "\">⋯</button>",
      "</div>",
      "<div class=\"card-info\">",
      infoRow("上次发生", status.lastOccurredAt ? relativeDateText(status.lastOccurredAt, "发生") : "暂无记录"),
      infoRow("建议节奏", "至少间隔 " + card.recommendedGapDays + " 天"),
      infoRow("可再次放纵", status.timingText),
      infoRow("近30天次数", status.recent30dCount + " 次"),
      infoRow("建议上限", card.monthlySoftLimit + " 次"),
      "</div>",
      "<span class=\"level-tag level-" + card.riskLevel + "\">" + risk.label + "</span>",
      card.note ? "<p class=\"card-note\">" + escapeHtml(card.note) + "</p>" : "",
      "<button class=\"health-action-button\" type=\"button\" data-indulgence=\"" + card.id + "\">记录一次</button>",
      "</article>"
    ].join("");
  }

  function infoRow(label, value) {
    return "<div class=\"info-row\"><span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function relativeDateText(iso, suffix) {
    var days = fullDaysBetween(iso, todayIso());
    if (days === 0) {
      return "今天";
    }
    return days + " 天前" + (suffix ? "" : "");
  }

  function positiveAccent(status, fallback) {
    return {
      normal: fallback,
      dueSoon: "#d98a2f",
      dueToday: "#e08a22",
      overdue: "#c8524d",
      completedToday: "#2f9d70"
    }[status] || fallback;
  }

  function indulgenceAccent(status) {
    return {
      justOccurred: "#c8524d",
      cooling: "#df6f3d",
      almostRecovered: "#d98a2f",
      allowedCautious: "#68766f",
      monthlyWarning: "#4f4c48"
    }[status] || "#df6f3d";
  }

  function importanceLabel(value) {
    return {
      high: { label: "高", color: "#c8524d" },
      medium: { label: "中", color: "#d98a2f" },
      low: { label: "低", color: "#2f9d70" }
    }[value] || { label: "中", color: "#d98a2f" };
  }

  function riskLabel(value) {
    return {
      high: { label: "高风险", color: "#c8524d" },
      medium: { label: "中风险", color: "#d98a2f" },
      low: { label: "低风险", color: "#87925b" }
    }[value] || { label: "中风险", color: "#d98a2f" };
  }

  function getPositiveActionText(type, status) {
    if (status === "completedToday") {
      return type === "diet" ? "今日已打卡" : "今日已完成";
    }
    if (status === "overdue") {
      return "补打卡";
    }
    return sectionConfig[type].actionDefault;
  }

  function filterCard(type, card) {
    var config = sectionConfig[type];
    var filter = state.uiPrefs[config.filterKey] || "all";
    var status = type === "indulgence" ? calculateIndulgenceStatus(card) : calculatePositiveStatus(card);

    if (filter === "all") {
      return true;
    }
    if (filter === "todayPriority") {
      return status.status === "dueToday" || status.status === "overdue";
    }
    if (filter === "cooling") {
      return status.status === "cooling" || status.status === "justOccurred";
    }
    return status.status === filter;
  }

  function isActive(card) {
    return card.active;
  }

  function bySortOrder(a, b) {
    return a.sortOrder - b.sortOrder;
  }

  function addToday(history) {
    var today = todayIso();
    if (latestDate(history) !== today) {
      history.push(today);
    }
  }

  function handleDocumentClick(event) {
    var filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      var type = filterButton.dataset.filterType;
      state.uiPrefs[sectionConfig[type].filterKey] = filterButton.dataset.filter;
      saveState();
      render();
      return;
    }

    var checkinButton = event.target.closest("[data-checkin]");
    if (checkinButton) {
      handlePositiveCheckin(checkinButton.dataset.type, checkinButton.dataset.checkin);
      return;
    }

    var indulgenceButton = event.target.closest("[data-indulgence]");
    if (indulgenceButton) {
      handleIndulgenceRecord(indulgenceButton.dataset.indulgence);
      return;
    }

    var manageButton = event.target.closest("[data-manage-type], [data-open-manager]");
    if (manageButton) {
      openManager(manageButton.dataset.manageType || manageButton.dataset.openManager);
    }
  }

  function handlePositiveCheckin(type, id) {
    var card = findCard(type, id);
    if (!card) {
      return;
    }
    addToday(card.checkinHistory);
    saveState();
    render();
  }

  function handleIndulgenceRecord(id) {
    var card = findCard("indulgence", id);
    if (!card) {
      return;
    }
    addToday(card.eventHistory);
    saveState();
    render();
  }

  function findCard(type, id) {
    return state[sectionConfig[type].listKey].find(function (card) {
      return card.id === id;
    });
  }

  function openManager(type) {
    currentManagerType = type;
    document.getElementById("drawer-backdrop").hidden = false;
    document.getElementById("manager-drawer").hidden = false;
    renderManager();
  }

  function closeManager() {
    currentManagerType = null;
    document.getElementById("drawer-backdrop").hidden = true;
    document.getElementById("manager-drawer").hidden = true;
  }

  function renderManager() {
    var config = sectionConfig[currentManagerType];
    document.getElementById("drawer-title").textContent = "管理" + config.label;
    renderManagerList();
    configureFormForType(currentManagerType);
  }

  function renderManagerList() {
    var cards = state[sectionConfig[currentManagerType].listKey].slice().sort(bySortOrder);
    var list = document.getElementById("manager-list");
    list.innerHTML = cards.map(function (card, index) {
      return [
        "<article class=\"manager-item\">",
        "<div class=\"manager-item-title\"><span>" + escapeHtml(card.icon) + " " + escapeHtml(card.title) +
          "</span><small>" + (card.active ? "启用" : "停用") + "</small></div>",
        "<div class=\"manager-actions\">",
        managerButton("编辑", "edit", card.id),
        managerButton("上移", "up", card.id, index === 0),
        managerButton("下移", "down", card.id, index === cards.length - 1),
        managerButton(card.active ? "停用" : "启用", "toggle", card.id),
        managerButton("删除", "delete", card.id),
        "</div>",
        "</article>"
      ].join("");
    }).join("");
  }

  function managerButton(label, action, id, disabled) {
    return "<button type=\"button\" data-manager-action=\"" + action + "\" data-card-id=\"" + id + "\"" +
      (disabled ? " disabled" : "") + ">" + label + "</button>";
  }

  function configureFormForType(type) {
    var isIndulgence = type === "indulgence";
    document.getElementById("recurrence-field-wrap").hidden = isIndulgence;
    document.getElementById("importance-field-wrap").hidden = isIndulgence;
    document.getElementById("gap-field-wrap").hidden = !isIndulgence;
    document.getElementById("limit-field-wrap").hidden = !isIndulgence;
    document.getElementById("risk-field-wrap").hidden = !isIndulgence;
  }

  function resetForm() {
    document.getElementById("manager-form").reset();
    document.getElementById("card-id-field").value = "";
    document.getElementById("manager-form-title").textContent = "新增卡片";
    document.getElementById("active-field").checked = true;
    document.getElementById("recurrence-field").value = 3;
    document.getElementById("gap-field").value = 7;
    document.getElementById("limit-field").value = 4;
  }

  function handleManagerAction(event) {
    var button = event.target.closest("[data-manager-action]");
    if (!button) {
      return;
    }

    var action = button.dataset.managerAction;
    var id = button.dataset.cardId;
    var cards = state[sectionConfig[currentManagerType].listKey].sort(bySortOrder);
    var index = cards.findIndex(function (card) {
      return card.id === id;
    });
    var card = cards[index];

    if (!card) {
      return;
    }

    if (action === "edit") {
      fillForm(card);
      return;
    }
    if (action === "toggle") {
      card.active = !card.active;
    }
    if (action === "delete") {
      state[sectionConfig[currentManagerType].listKey] = state[sectionConfig[currentManagerType].listKey]
        .filter(function (item) {
          return item.id !== id;
        });
    }
    if (action === "up" && index > 0) {
      swapOrder(cards[index], cards[index - 1]);
    }
    if (action === "down" && index < cards.length - 1) {
      swapOrder(cards[index], cards[index + 1]);
    }

    normalizeOrder(currentManagerType);
    saveState();
    render();
  }

  function fillForm(card) {
    document.getElementById("manager-form-title").textContent = "编辑卡片";
    document.getElementById("card-id-field").value = card.id;
    document.getElementById("card-title-field").value = card.title;
    document.getElementById("card-icon-field").value = card.icon;
    document.getElementById("note-field").value = card.note || "";
    document.getElementById("active-field").checked = card.active;
    if (currentManagerType === "indulgence") {
      document.getElementById("gap-field").value = card.recommendedGapDays;
      document.getElementById("limit-field").value = card.monthlySoftLimit;
      document.getElementById("risk-field").value = card.riskLevel;
    } else {
      document.getElementById("recurrence-field").value = card.recurrenceDays;
      document.getElementById("importance-field").value = card.importance;
    }
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    var id = document.getElementById("card-id-field").value;
    var cards = state[sectionConfig[currentManagerType].listKey];
    var card = id ? findCard(currentManagerType, id) : createBlankCard(currentManagerType);

    card.title = document.getElementById("card-title-field").value.trim();
    card.icon = document.getElementById("card-icon-field").value.trim();
    card.note = document.getElementById("note-field").value.trim();
    card.active = document.getElementById("active-field").checked;

    if (currentManagerType === "indulgence") {
      card.recommendedGapDays = toPositiveInteger(document.getElementById("gap-field").value, 7);
      card.monthlySoftLimit = toPositiveInteger(document.getElementById("limit-field").value, 4);
      card.riskLevel = document.getElementById("risk-field").value;
    } else {
      card.recurrenceDays = toPositiveInteger(document.getElementById("recurrence-field").value, 3);
      card.importance = document.getElementById("importance-field").value;
    }

    if (!id) {
      cards.push(card);
    }

    normalizeOrder(currentManagerType);
    saveState();
    resetForm();
    render();
  }

  function createBlankCard(type) {
    var order = state[sectionConfig[type].listKey].length + 1;
    if (type === "indulgence") {
      return {
        id: "indulgence-" + Date.now(),
        type: "indulgence",
        title: "",
        icon: "⚠️",
        riskLevel: "medium",
        recommendedGapDays: 7,
        eventHistory: [],
        monthlySoftLimit: 4,
        active: true,
        sortOrder: order,
        note: ""
      };
    }

    return {
      id: type + "-" + Date.now(),
      type: type,
      title: "",
      icon: type === "diet" ? "🥗" : "🏃",
      importance: "medium",
      recurrenceDays: 3,
      checkinHistory: [],
      active: true,
      sortOrder: order,
      note: ""
    };
  }

  function toPositiveInteger(value, fallback) {
    var number = parseInt(value, 10);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function swapOrder(a, b) {
    var current = a.sortOrder;
    a.sortOrder = b.sortOrder;
    b.sortOrder = current;
  }

  function normalizeOrder(type) {
    state[sectionConfig[type].listKey].sort(bySortOrder).forEach(function (card, index) {
      card.sortOrder = index + 1;
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    document.getElementById("drawer-close-button").addEventListener("click", closeManager);
    document.getElementById("drawer-backdrop").addEventListener("click", closeManager);
    document.getElementById("manager-list").addEventListener("click", handleManagerAction);
    document.getElementById("manager-form").addEventListener("submit", handleFormSubmit);
    document.getElementById("clear-form-button").addEventListener("click", resetForm);
    document.getElementById("add-card-button").addEventListener("click", resetForm);
    document.getElementById("reset-data-button").addEventListener("click", function () {
      state = makeSeedData();
      saveState();
      render();
      if (currentManagerType) {
        resetForm();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadState();
    bindEvents();
    resetForm();
    render();
    console.log("[Personal_Web] health management V1 loaded");
  });
})();
