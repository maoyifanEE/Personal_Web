(function () {
  "use strict";

  var STORAGE_KEY = "personal_web_health_v1";
  var STORAGE_VERSION = 2;
  var state = null;
  var currentManagerType = null;
  var pendingSeriesCheckin = null;
  var selectedSeriesOptionId = null;

  var ICON_REGISTRY = {
    carrot: { label: "胡萝卜", icon: "🥕" },
    tomato: { label: "番茄", icon: "🍅" },
    broccoli: { label: "西兰花", icon: "🥦" },
    leafyGreen: { label: "绿叶菜", icon: "🥬" },
    corn: { label: "玉米", icon: "🌽" },
    sweetPotato: { label: "红薯", icon: "🍠" },
    mushroom: { label: "蘑菇", icon: "🍄" },
    garlic: { label: "大蒜", icon: "🧄" },
    onion: { label: "洋葱", icon: "🧅" },
    potato: { label: "土豆", icon: "🥔" },
    avocado: { label: "牛油果", icon: "🥑" },
    apple: { label: "苹果", icon: "🍎" },
    pear: { label: "梨", icon: "🍐" },
    banana: { label: "香蕉", icon: "🍌" },
    orange: { label: "橙子", icon: "🍊" },
    lemon: { label: "柠檬", icon: "🍋" },
    watermelon: { label: "西瓜", icon: "🍉" },
    grape: { label: "葡萄", icon: "🍇" },
    strawberry: { label: "草莓", icon: "🍓" },
    blueberry: { label: "蓝莓", icon: "🫐" },
    cherry: { label: "樱桃", icon: "🍒" },
    peach: { label: "桃子", icon: "🍑" },
    mango: { label: "芒果", icon: "🥭" },
    pineapple: { label: "菠萝", icon: "🍍" },
    coconut: { label: "椰子", icon: "🥥" },
    kiwi: { label: "猕猴桃", icon: "🥝" },
    fruit: { label: "水果", icon: "🍎" },
    milk: { label: "牛奶", icon: "🥛" },
    yogurt: { label: "酸奶", icon: "🥣" },
    egg: { label: "鸡蛋", icon: "🥚" },
    cheese: { label: "奶酪", icon: "🧀" },
    tofu: { label: "豆腐", icon: "⬜" },
    beans: { label: "豆类", icon: "🫘" },
    chicken: { label: "鸡肉", icon: "🍗" },
    fish: { label: "鱼", icon: "🐟" },
    salmon: { label: "三文鱼", icon: "🍣" },
    shrimp: { label: "虾", icon: "🍤" },
    rice: { label: "米饭", icon: "🍚" },
    oatmeal: { label: "燕麦", icon: "🥣" },
    bread: { label: "全麦面包", icon: "🍞" },
    noodles: { label: "面食", icon: "🍜" },
    nuts: { label: "坚果", icon: "🥜" },
    water: { label: "喝水", icon: "💧" },
    tea: { label: "茶", icon: "🍵" },
    salad: { label: "沙拉", icon: "🥗" },
    soup: { label: "汤", icon: "🍲" },

    walk: { label: "快走", icon: "🚶" },
    aerobic: { label: "有氧运动", icon: "🏃" },
    run: { label: "跑步", icon: "🏃" },
    cycling: { label: "骑行", icon: "🚴" },
    swimming: { label: "游泳", icon: "🏊" },
    jumpRope: { label: "跳绳", icon: "🪢" },
    stretch: { label: "拉伸", icon: "🤸" },
    yoga: { label: "瑜伽", icon: "🧘" },
    squat: { label: "深蹲", icon: "🏋️" },
    core: { label: "核心训练", icon: "🧘" },
    strength: { label: "力量训练", icon: "💪" },
    pushup: { label: "俯卧撑", icon: "🤲" },
    plank: { label: "平板支撑", icon: "🧱" },
    climb: { label: "爬楼", icon: "🪜" },
    hike: { label: "徒步", icon: "🥾" },
    dance: { label: "舞蹈", icon: "💃" },
    rowing: { label: "划船", icon: "🚣" },
    ski: { label: "滑雪", icon: "⛷️" },
    skating: { label: "滑冰", icon: "⛸️" },
    basketball: { label: "篮球", icon: "🏀" },
    football: { label: "足球", icon: "⚽" },
    tennis: { label: "网球", icon: "🎾" },
    badminton: { label: "羽毛球", icon: "🏸" },
    tableTennis: { label: "乒乓球", icon: "🏓" },
    volleyball: { label: "排球", icon: "🏐" },
    boxing: { label: "拳击", icon: "🥊" },

    sleepLate: { label: "熬夜", icon: "🌙" },
    friedFood: { label: "油炸", icon: "🍟" },
    sweetDrink: { label: "甜饮料", icon: "🧋" },
    midnightSnack: { label: "夜宵", icon: "🌭" },
    alcohol: { label: "酒精", icon: "🍺" },
    wine: { label: "红酒", icon: "🍷" },
    cake: { label: "蛋糕", icon: "🍰" },
    candy: { label: "糖果", icon: "🍬" },
    chocolate: { label: "巧克力", icon: "🍫" },
    iceCream: { label: "冰淇淋", icon: "🍦" },
    chips: { label: "薯片", icon: "🥔" },
    burger: { label: "汉堡", icon: "🍔" },
    pizza: { label: "披萨", icon: "🍕" },
    hotpot: { label: "火锅", icon: "🍲" },
    barbecue: { label: "烧烤", icon: "🍖" },
    instantNoodles: { label: "泡面", icon: "🍜" },
    takeaway: { label: "外卖", icon: "🥡" },
    coffeeOver: { label: "咖啡过量", icon: "☕" },
    screenTime: { label: "刷屏", icon: "📱" },
    sedentary: { label: "久坐", icon: "🪑" },

    heart: { label: "心脏", icon: "❤️" },
    pulse: { label: "心率", icon: "💓" },
    scale: { label: "体重", icon: "⚖️" },
    sleep: { label: "睡眠", icon: "🛌" },
    sun: { label: "日照", icon: "☀️" },
    moon: { label: "休息", icon: "🌙" },
    leaf: { label: "健康", icon: "🍃" },
    calendar: { label: "周期", icon: "📅" },
    note: { label: "记录", icon: "📝" },
    check: { label: "完成", icon: "✅" },
    warning: { label: "提醒", icon: "⚠️" },
    star: { label: "重点", icon: "⭐" },
    default: { label: "通用", icon: "✨" }
  };

  var ICON_CATEGORIES = [
    {
      label: "健康饮食",
      keys: [
        "carrot", "tomato", "broccoli", "leafyGreen", "corn", "sweetPotato", "mushroom", "garlic",
        "onion", "potato", "avocado", "apple", "pear", "banana", "orange", "lemon", "watermelon",
        "grape", "strawberry", "blueberry", "cherry", "peach", "mango", "pineapple", "coconut",
        "kiwi", "fruit", "milk", "yogurt", "egg", "cheese", "tofu", "beans", "chicken", "fish",
        "salmon", "shrimp", "rice", "oatmeal", "bread", "noodles", "nuts", "water", "tea", "salad", "soup"
      ]
    },
    {
      label: "运动打卡",
      keys: [
        "walk", "aerobic", "run", "cycling", "swimming", "jumpRope", "stretch", "yoga", "squat", "core",
        "strength", "pushup", "plank", "climb", "hike", "dance", "rowing", "ski", "skating",
        "basketball", "football", "tennis", "badminton", "tableTennis", "volleyball", "boxing"
      ]
    },
    {
      label: "放纵警告",
      keys: [
        "sleepLate", "friedFood", "sweetDrink", "midnightSnack", "alcohol", "wine", "cake", "candy",
        "chocolate", "iceCream", "chips", "burger", "pizza", "hotpot", "barbecue", "instantNoodles",
        "takeaway", "coffeeOver", "screenTime", "sedentary"
      ]
    },
    {
      label: "通用",
      keys: [
        "heart", "pulse", "scale", "sleep", "sun", "moon", "leaf", "calendar", "note", "check",
        "warning", "star", "default"
      ]
    }
  ];

  var titleIconMap = {
    胡萝卜: "carrot",
    番茄: "tomato",
    西兰花: "broccoli",
    牛奶: "milk",
    酸奶: "yogurt",
    三文鱼: "salmon",
    蓝莓: "blueberry",
    鸡蛋: "egg",
    坚果: "nuts",
    水果补充: "fruit",
    苹果: "apple",
    香蕉: "banana",
    猕猴桃: "kiwi",
    快走: "walk",
    跑步: "run",
    拉伸: "stretch",
    骑行: "cycling",
    深蹲: "squat",
    核心训练: "core",
    上肢训练: "strength",
    有氧运动: "run",
    球类运动: "basketball",
    熬夜: "sleepLate",
    油炸: "friedFood",
    甜饮料: "sweetDrink",
    夜宵: "midnightSnack",
    酒精: "alcohol",
    刷屏: "screenTime",
    久坐: "sedentary"
  };

  var positiveFilters = [
    { key: "all", label: "全部" },
    { key: "uncompleted", label: "未打卡" },
    { key: "completed", label: "已打卡" },
    { key: "overdue", label: "已逾期" }
  ];

  var indulgenceFilters = [
    { key: "all", label: "全部" },
    { key: "excellent", label: "很好" },
    { key: "acceptable", label: "可接受" },
    { key: "slightlyHigh", label: "略多" },
    { key: "tooMany", label: "偏多" },
    { key: "cooling", label: "冷却中" }
  ];

  var sectionConfig = {
    diet: {
      listKey: "dietCards",
      containerId: "diet-cards",
      filterKey: "dietFilter",
      accent: "#20a87f",
      label: "健康饮食",
      lastLabel: "上次完成"
    },
    exercise: {
      listKey: "exerciseCards",
      containerId: "exercise-cards",
      filterKey: "exerciseFilter",
      accent: "#3d78d8",
      label: "运动打卡",
      lastLabel: "上次完成"
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

  function toLocalTimestamp(date) {
    return [
      toIsoDate(date),
      "T",
      String(date.getHours()).padStart(2, "0"),
      ":",
      String(date.getMinutes()).padStart(2, "0"),
      ":",
      String(date.getSeconds()).padStart(2, "0")
    ].join("");
  }

  function daysAgo(days) {
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return toIsoDate(date);
  }

  function timestampAgo(days, hour) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour || 12, 0, 0, 0);
    return toLocalTimestamp(date);
  }

  function parseIsoDate(value) {
    var dateOnly = String(value || "").slice(0, 10);
    var parts = dateOnly.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return null;
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function parseTimestamp(value) {
    if (!value) {
      return null;
    }
    var date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return parseIsoDate(value);
  }

  function fullDaysBetween(fromIso, toIso) {
    var from = parseIsoDate(fromIso);
    var to = parseIsoDate(toIso);
    if (!from || !to) {
      return 0;
    }
    return Math.floor((to - from) / 86400000);
  }

  function getIcon(iconKey) {
    return ICON_REGISTRY[iconKey] || ICON_REGISTRY.default;
  }

  function iconKeyForTitle(title, fallback) {
    return titleIconMap[title] || fallback || "default";
  }

  function makeSeedData() {
    return {
      version: STORAGE_VERSION,
      dietCards: [
        createPositiveSeed("diet-carrot", "diet", "胡萝卜", "carrot", "high", 7, [completion(daysAgo(6))], 1),
        createPositiveSeed("diet-milk", "diet", "牛奶", "milk", "medium", 2, [completion(daysAgo(1))], 2),
        createPositiveSeed("diet-salmon", "diet", "三文鱼", "salmon", "high", 5, [completion(daysAgo(3))], 3),
        createPositiveSeed("diet-fruit", "diet", "水果补充", "fruit", "medium", 2, [
          completion(daysAgo(2), "banana")
        ], 4, {
          mode: "series",
          options: [
            { id: "apple", label: "苹果", iconKey: "apple" },
            { id: "banana", label: "香蕉", iconKey: "banana" },
            { id: "kiwi", label: "猕猴桃", iconKey: "kiwi" },
            { id: "blueberry", label: "蓝莓", iconKey: "blueberry" }
          ]
        }),
        createPositiveSeed("diet-nuts", "diet", "坚果", "nuts", "medium", 3, [completion(daysAgo(5))], 5)
      ],
      exerciseCards: [
        createPositiveSeed("exercise-walk", "exercise", "快走", "walk", "medium", 1, [completion(daysAgo(1))], 1),
        createPositiveSeed("exercise-stretch", "exercise", "拉伸", "stretch", "low", 2, [completion(daysAgo(1))], 2),
        createPositiveSeed("exercise-bike", "exercise", "骑行", "cycling", "high", 3, [completion(daysAgo(4))], 3),
        createPositiveSeed("exercise-ball", "exercise", "球类运动", "basketball", "medium", 7, [
          completion(daysAgo(8), "football", "足球")
        ], 4, {
          mode: "series",
          options: [
            { id: "basketball", label: "篮球", iconKey: "basketball" },
            { id: "football", label: "足球", iconKey: "football" },
            { id: "badminton", label: "羽毛球", iconKey: "badminton" }
          ]
        }),
        createPositiveSeed("exercise-core", "exercise", "核心训练", "core", "high", 2, [completion(todayIso())], 5),
        createPositiveSeed("exercise-upper", "exercise", "上肢训练", "strength", "medium", 4, [completion(daysAgo(5))], 6)
      ],
      indulgenceCards: [
        createIndulgenceSeed("indulgence-late", "熬夜", "sleepLate", "high", 7, [
          event(timestampAgo(2, 1)),
          event(timestampAgo(8, 1))
        ], 1),
        createIndulgenceSeed("indulgence-fried", "油炸", "friedFood", "high", 10, [
          event(timestampAgo(12, 12))
        ], 2),
        createIndulgenceSeed("indulgence-drink", "甜饮料", "sweetDrink", "medium", 5, [
          event(timestampAgo(5, 14)),
          event(timestampAgo(10, 14))
        ], 3),
        createIndulgenceSeed("indulgence-night", "夜宵", "midnightSnack", "medium", 7, [
          event(timestampAgo(8, 23)),
          event(timestampAgo(9, 23)),
          event(timestampAgo(10, 23))
        ], 4)
      ],
      uiPrefs: {
        dietFilter: "all",
        exerciseFilter: "all",
        indulgenceFilter: "all"
      }
    };
  }

  function completion(date, optionId, optionLabel) {
    return {
      completedAt: normalizeCompletionTimestamp(date),
      optionId: optionId || null,
      optionLabel: optionLabel || null
    };
  }

  function normalizeCompletionTimestamp(value) {
    var text = String(value || todayIso());
    if (text.indexOf("T") !== -1) {
      return text;
    }
    return text.slice(0, 10) + "T00:00:00";
  }

  function event(occurredAt) {
    return {
      occurredAt: occurredAt
    };
  }

  function createPositiveSeed(id, type, title, iconKey, importance, recurrenceDays, history, order, extra) {
    var card = {
      id: id,
      type: type,
      title: title,
      iconKey: iconKey,
      mode: "single",
      options: [],
      importance: importance,
      recurrenceDays: recurrenceDays,
      checkinHistory: history,
      active: true,
      sortOrder: order,
      note: ""
    };
    return Object.assign(card, extra || {});
  }

  function createIndulgenceSeed(id, title, iconKey, riskLevel, gapDays, history, order) {
    return {
      id: id,
      type: "indulgence",
      title: title,
      iconKey: iconKey,
      riskLevel: riskLevel,
      recommendedGapDays: gapDays,
      eventHistory: history,
      active: true,
      sortOrder: order,
      note: ""
    };
  }

  function loadState() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = makeSeedData();
      saveState("首次加载，写入示例数据");
      return;
    }

    try {
      state = migrateState(JSON.parse(raw));
      saveState("本地数据加载并迁移完成");
    } catch (error) {
      console.warn("[Personal_Web] 健康管理本地数据迁移失败，已重置为示例数据。", error);
      state = makeSeedData();
      saveState("迁移失败后重置示例数据");
    }
  }

  function migrateState(input) {
    var seed = makeSeedData();
    var migrated = {
      version: STORAGE_VERSION,
      dietCards: migratePositiveCards(input.dietCards, "diet", seed.dietCards),
      exerciseCards: migratePositiveCards(input.exerciseCards, "exercise", seed.exerciseCards),
      indulgenceCards: migrateIndulgenceCards(input.indulgenceCards, seed.indulgenceCards),
      uiPrefs: migrateUiPrefs(input.uiPrefs)
    };
    console.log("[Personal_Web] 健康管理数据版本", input.version || 1, "->", STORAGE_VERSION);
    return migrated;
  }

  function migrateUiPrefs(uiPrefs) {
    var prefs = uiPrefs || {};
    return {
      dietFilter: normalizeFilter(prefs.dietFilter, positiveFilters),
      exerciseFilter: normalizeFilter(prefs.exerciseFilter, positiveFilters),
      indulgenceFilter: normalizeFilter(prefs.indulgenceFilter, indulgenceFilters)
    };
  }

  function normalizeFilter(value, filters) {
    if (filters.some(function (filter) { return filter.key === value; })) {
      return value;
    }
    return "all";
  }

  function migratePositiveCards(cards, type, fallback) {
    if (!Array.isArray(cards) || cards.length === 0) {
      return fallback;
    }
    return cards.map(function (card, index) {
      var title = safeText(card.title, fallback[index] && fallback[index].title || "新卡片");
      var mode = card.mode === "series" ? "series" : "single";
      var iconKey = card.iconKey || iconKeyForTitle(title, fallback[index] && fallback[index].iconKey);
      var options = Array.isArray(card.options) ? card.options.map(migrateSeriesOption).filter(Boolean) : [];
      if (mode === "series" && options.length === 0) {
        options = [
          { id: "default-option", label: title, iconKey: iconKey }
        ];
      }
      return {
        id: safeText(card.id, type + "-" + Date.now() + "-" + index),
        type: type,
        title: title,
        iconKey: iconKey,
        mode: mode,
        options: options,
        importance: normalizeLevel(card.importance, "medium"),
        recurrenceDays: toPositiveInteger(card.recurrenceDays, 3),
        checkinHistory: migrateCheckinHistory(card.checkinHistory),
        active: card.active !== false,
        sortOrder: toPositiveInteger(card.sortOrder, index + 1),
        note: safeText(card.note, "")
      };
    });
  }

  function migrateSeriesOption(option, index) {
    if (!option) {
      return null;
    }
    var label = safeText(option.label, "选项");
    return {
      id: safeText(option.id, "option-" + index + "-" + Date.now()),
      label: label,
      iconKey: option.iconKey || iconKeyForTitle(label, "default")
    };
  }

  function migrateCheckinHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }
    return history.map(function (item) {
      if (typeof item === "string") {
        return completion(item);
      }
      if (item && item.completedAt) {
        return completion(item.completedAt, item.optionId || null, item.optionLabel || null);
      }
      return null;
    }).filter(Boolean);
  }

  function migrateIndulgenceCards(cards, fallback) {
    if (!Array.isArray(cards) || cards.length === 0) {
      return fallback;
    }
    return cards.map(function (card, index) {
      var title = safeText(card.title, fallback[index] && fallback[index].title || "放纵项");
      return {
        id: safeText(card.id, "indulgence-" + Date.now() + "-" + index),
        type: "indulgence",
        title: title,
        iconKey: card.iconKey || iconKeyForTitle(title, fallback[index] && fallback[index].iconKey),
        riskLevel: normalizeLevel(card.riskLevel, "medium"),
        recommendedGapDays: toPositiveInteger(card.recommendedGapDays, 7),
        eventHistory: migrateEventHistory(card.eventHistory),
        active: card.active !== false,
        sortOrder: toPositiveInteger(card.sortOrder, index + 1),
        note: safeText(card.note, "")
      };
    });
  }

  function migrateEventHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }
    return history.map(function (item) {
      if (typeof item === "string") {
        return event(item.length > 10 ? item : item + "T12:00:00");
      }
      if (item && item.occurredAt) {
        return event(String(item.occurredAt));
      }
      return null;
    }).filter(Boolean);
  }

  function saveState(reason) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (reason) {
      console.log("[Personal_Web] 健康管理本地数据已保存：", reason);
    }
  }

  function calculatePositiveStatus(card) {
    var latest = latestCompletion(card.checkinHistory);
    if (!latest) {
      return {
        status: "uncompleted",
        label: "未打卡",
        lastCompletedAt: null,
        lastCompletedOption: null,
        daysSinceLast: null,
        daysUntilDue: 0,
        overdueDays: 0,
        timingText: "今天该打卡"
      };
    }

    var daysSinceLast = fullDaysBetween(latest.completedAt, todayIso());
    var daysUntilDue = card.recurrenceDays - daysSinceLast;
    if (daysSinceLast < card.recurrenceDays) {
      return {
        status: "completed",
        label: "已完成",
        lastCompletedAt: latest.completedAt,
        lastCompletedOption: latest.optionId || null,
        lastCompletedOptionLabel: latest.optionLabel || null,
        daysSinceLast: daysSinceLast,
        daysUntilDue: daysUntilDue,
        overdueDays: 0,
        timingText: daysUntilDue > 0 ? "还剩 " + daysUntilDue + " 天" : "已完成"
      };
    }

    if (daysSinceLast === card.recurrenceDays) {
      return {
        status: "uncompleted",
        label: "未打卡",
        lastCompletedAt: latest.completedAt,
        lastCompletedOption: latest.optionId || null,
        lastCompletedOptionLabel: latest.optionLabel || null,
        daysSinceLast: daysSinceLast,
        daysUntilDue: 0,
        overdueDays: 0,
        timingText: "今天该打卡"
      };
    }

    return {
      status: "overdue",
      label: "已逾期 " + (daysSinceLast - card.recurrenceDays) + " 天",
      lastCompletedAt: latest.completedAt,
      lastCompletedOption: latest.optionId || null,
      lastCompletedOptionLabel: latest.optionLabel || null,
      daysSinceLast: daysSinceLast,
      daysUntilDue: daysUntilDue,
      overdueDays: daysSinceLast - card.recurrenceDays,
      timingText: "已逾期 " + (daysSinceLast - card.recurrenceDays) + " 天"
    };
  }

  function latestCompletion(history) {
    if (!Array.isArray(history) || history.length === 0) {
      return null;
    }
    return history.slice().sort(function (a, b) {
      return String(a.completedAt).localeCompare(String(b.completedAt));
    }).pop();
  }

  function calculateIndulgenceStatus(card) {
    var last = latestEvent(card.eventHistory);
    var recent14dCount = countRecentEvents(card.eventHistory, 14);
    if (!last) {
      return {
        status: "excellent",
        label: "很好",
        lastOccurredAt: null,
        daysSinceLast: null,
        daysUntilAllowed: 0,
        recent14dCount: 0,
        timingText: "当前很好",
        severityClass: "severity-green"
      };
    }

    var daysSinceLast = fullDaysBetween(toIsoDate(parseTimestamp(last.occurredAt)), todayIso());
    var daysUntilAllowed = card.recommendedGapDays - daysSinceLast;

    if (recent14dCount === 0) {
      return indulgenceResult("excellent", "很好", last, daysSinceLast, daysUntilAllowed, recent14dCount, "当前很好", "severity-green");
    }

    if (daysUntilAllowed > 0) {
      var severity = recent14dCount >= 3 ? "severity-red" : recent14dCount === 2 ? "severity-orange" : "severity-yellow";
      return indulgenceResult("cooling", "冷却中，还需 " + daysUntilAllowed + " 天", last, daysSinceLast, daysUntilAllowed, recent14dCount, "还需 " + daysUntilAllowed + " 天", severity);
    }

    if (recent14dCount === 1) {
      return indulgenceResult("acceptable", "可接受", last, daysSinceLast, daysUntilAllowed, recent14dCount, "可接受", "severity-green");
    }

    if (recent14dCount === 2) {
      return indulgenceResult("slightlyHigh", "略多", last, daysSinceLast, daysUntilAllowed, recent14dCount, "建议放慢节奏", "severity-orange");
    }

    return indulgenceResult("tooMany", "偏多", last, daysSinceLast, daysUntilAllowed, recent14dCount, "建议继续克制", "severity-red");
  }

  function indulgenceResult(status, label, last, daysSinceLast, daysUntilAllowed, recent14dCount, timingText, severityClass) {
    return {
      status: status,
      label: label,
      lastOccurredAt: last.occurredAt,
      daysSinceLast: daysSinceLast,
      daysUntilAllowed: daysUntilAllowed,
      recent14dCount: recent14dCount,
      timingText: timingText,
      severityClass: severityClass
    };
  }

  function latestEvent(history) {
    if (!Array.isArray(history) || history.length === 0) {
      return null;
    }
    return history.slice().sort(function (a, b) {
      return parseTimestamp(a.occurredAt) - parseTimestamp(b.occurredAt);
    }).pop();
  }

  function countRecentEvents(history, days) {
    if (!Array.isArray(history)) {
      return 0;
    }
    var now = new Date();
    var windowMs = days * 86400000;
    return history.filter(function (item) {
      var occurredAt = parseTimestamp(item.occurredAt);
      if (!occurredAt) {
        return false;
      }
      var diff = now - occurredAt;
      return diff >= 0 && diff <= windowMs;
    }).length;
  }

  function render() {
    renderSummary();
    renderFilters("diet", positiveFilters);
    renderFilters("exercise", positiveFilters);
    renderFilters("indulgence", indulgenceFilters);
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
        title: "待打卡",
        value: positiveStatuses.filter(function (item) {
          return item.status === "uncompleted" || item.status === "overdue";
        }).length,
        text: "当前周期需要处理的饮食或运动卡片"
      },
      {
        icon: "🔥",
        title: "已逾期",
        value: positiveStatuses.filter(function (item) { return item.status === "overdue"; }).length,
        text: "超过各自周期的卡片数量"
      },
      {
        icon: "✅",
        title: "已完成",
        value: positiveStatuses.filter(function (item) { return item.status === "completed"; }).length,
        text: "当前周期已经满足的项目"
      },
      {
        icon: "⚠️",
        title: "放纵警告",
        value: indulgenceStatuses.filter(function (item) {
          return item.status === "cooling" || item.status === "slightlyHigh" || item.status === "tooMany";
        }).length,
        text: "近两周需要关注节奏的项目"
      },
      {
        icon: "💾",
        title: "本地保存",
        value: "已保存",
        text: "数据仅保存在当前浏览器"
      }
    ];

    document.getElementById("summary-grid").innerHTML = metrics.map(function (metric) {
      return [
        "<article class=\"summary-card\">",
        "<span class=\"summary-icon\" aria-hidden=\"true\">" + metric.icon + "</span>",
        "<div><p>" + metric.title + "</p><strong>" + metric.value + "</strong><span>" + metric.text + "</span></div>",
        "</article>"
      ].join("");
    }).join("");
  }

  function renderFilters(type, filters) {
    var config = sectionConfig[type];
    var activeFilter = state.uiPrefs[config.filterKey] || "all";
    var container = document.querySelector("[data-filter-group=\"" + type + "\"]");
    container.innerHTML = filters.map(function (filter) {
      var active = filter.key === activeFilter ? " is-active" : "";
      return "<button class=\"filter-chip" + active + "\" type=\"button\" data-filter=\"" +
        filter.key + "\" data-filter-type=\"" + type + "\">" + filter.label + "</button>";
    }).join("");
  }

  function renderSection(type) {
    var config = sectionConfig[type];
    var container = document.getElementById(config.containerId);
    var cards = state[config.listKey].filter(isActive).filter(function (card) {
      return filterCard(type, card);
    });

    cards.sort(type === "indulgence" ? sortIndulgenceCards : sortPositiveCards);

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
    var icon = getIcon(card.iconKey);
    var level = importanceLabel(card.importance);
    var disabled = status.status === "completed";
    var optionText = getLastOptionText(card, status.lastCompletedOption, status.lastCompletedOptionLabel);
    var actionText = status.status === "overdue" ? "补打卡" : status.status === "completed" ? "已完成" : "打卡";
    var cardClasses = "health-card is-" + status.status;

    return [
      "<article class=\"" + cardClasses + "\" style=\"--card-accent:" + positiveAccent(status.status, config.accent) +
        ";--level-color:" + level.color + "\">",
      "<div class=\"card-top\">",
      "<span class=\"card-icon\" aria-hidden=\"true\">" + icon.icon + "</span>",
      "<div class=\"card-title\"><h3>" + escapeHtml(card.title) + "</h3>",
      "<span class=\"status-pill\">" + escapeHtml(status.label) + "</span></div>",
      "<button class=\"card-menu\" type=\"button\" data-open-manager=\"" + type +
        "\" aria-label=\"管理" + escapeHtml(card.title) + "\">⋯</button>",
      "</div>",
      card.mode === "series" ? renderSeriesOptions(card) : "",
      "<div class=\"card-info\">",
      infoRow("上次完成", formatLastPositive(status.lastCompletedAt, optionText)),
      infoRow("周期", card.recurrenceDays + "天"),
      infoRow("当前节奏", status.timingText),
      "</div>",
      "<span class=\"level-tag level-" + card.importance + "\">" + level.label + "</span>",
      card.note ? "<p class=\"card-note\">" + escapeHtml(card.note) + "</p>" : "",
      "<button class=\"health-action-button" + (disabled ? " is-disabled" : "") +
        "\" type=\"button\" data-checkin=\"" + card.id + "\" data-type=\"" + type + "\"" +
        (disabled ? " disabled" : "") + ">" + actionText + "</button>",
      "</article>"
    ].join("");
  }

  function renderSeriesOptions(card) {
    return "<div class=\"series-option-preview\">" + card.options.map(function (option) {
      return "<span>" + getIcon(option.iconKey).icon + " " + escapeHtml(option.label) + "</span>";
    }).join("") + "</div>";
  }

  function renderIndulgenceCard(card) {
    var status = calculateIndulgenceStatus(card);
    var risk = riskLabel(card.riskLevel);
    var icon = getIcon(card.iconKey);

    return [
      "<article class=\"health-card is-" + status.status + " " + status.severityClass +
        "\" style=\"--card-accent:" + indulgenceAccent(status) + ";--level-color:" + risk.color + "\">",
      "<div class=\"card-top\">",
      "<span class=\"card-icon\" aria-hidden=\"true\">" + icon.icon + "</span>",
      "<div class=\"card-title\"><h3>" + escapeHtml(card.title) + "</h3>",
      "<span class=\"status-pill\">" + escapeHtml(status.label) + "</span></div>",
      "<button class=\"card-menu\" type=\"button\" data-open-manager=\"indulgence\" aria-label=\"管理" +
        escapeHtml(card.title) + "\">⋯</button>",
      "</div>",
      "<div class=\"card-info\">",
      infoRow("上次发生", status.lastOccurredAt ? relativeDateText(status.lastOccurredAt) : "暂无记录"),
      infoRow("建议间隔", card.recommendedGapDays + "天"),
      infoRow("近两周", status.recent14dCount + " 次"),
      infoRow("当前状态", status.timingText),
      infoRow("警告程度", risk.label),
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

  function formatLastPositive(date, optionText) {
    if (!date) {
      return "暂无记录";
    }
    var base = relativeDateText(date);
    return optionText ? base + " · " + optionText : base;
  }

  function getLastOptionText(card, optionId, optionLabel) {
    if (optionLabel) {
      return optionLabel;
    }
    if (!optionId || card.mode !== "series") {
      return "";
    }
    return getSeriesOptionLabel(card, optionId);
  }

  function getSeriesOptionLabel(card, optionId) {
    var option = card.options.find(function (item) {
      return item.id === optionId;
    });
    return option ? option.label : "";
  }

  function findSeriesOption(card, optionId) {
    return (card.options || []).find(function (item) {
      return item.id === optionId;
    });
  }

  function relativeDateText(value) {
    var dateOnly = String(value).slice(0, 10);
    var days = fullDaysBetween(dateOnly, todayIso());
    if (days === 0) {
      return "今天";
    }
    return days + " 天前";
  }

  function positiveAccent(status, fallback) {
    return {
      completed: "#2f9d70",
      uncompleted: "#d98a2f",
      overdue: "#c8524d"
    }[status] || fallback;
  }

  function indulgenceAccent(status) {
    if (status.status === "excellent" || status.status === "acceptable") {
      return "#2f9d70";
    }
    if (status.status === "slightlyHigh" || status.severityClass === "severity-orange") {
      return "#d98a2f";
    }
    if (status.severityClass === "severity-red" || status.status === "tooMany") {
      return "#c8524d";
    }
    return "#d5a42f";
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
      high: { label: "高", color: "#c8524d" },
      medium: { label: "中", color: "#d98a2f" },
      low: { label: "低", color: "#87925b" }
    }[value] || { label: "中", color: "#d98a2f" };
  }

  function filterCard(type, card) {
    var config = sectionConfig[type];
    var filter = state.uiPrefs[config.filterKey] || "all";
    var status = type === "indulgence" ? calculateIndulgenceStatus(card) : calculatePositiveStatus(card);

    if (filter === "all") {
      return true;
    }
    return status.status === filter;
  }

  function sortPositiveCards(a, b) {
    var statusA = calculatePositiveStatus(a);
    var statusB = calculatePositiveStatus(b);
    var rankA = positiveRank(statusA);
    var rankB = positiveRank(statusB);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    if (statusA.status === "overdue" && statusB.status === "overdue") {
      return statusB.overdueDays - statusA.overdueDays || a.sortOrder - b.sortOrder;
    }
    if (statusA.status === "completed" && statusB.status === "completed") {
      return statusA.daysUntilDue - statusB.daysUntilDue || a.sortOrder - b.sortOrder;
    }
    return a.sortOrder - b.sortOrder;
  }

  function positiveRank(status) {
    return {
      overdue: 1,
      uncompleted: 2,
      completed: 3
    }[status.status] || 4;
  }

  function sortIndulgenceCards(a, b) {
    var statusA = calculateIndulgenceStatus(a);
    var statusB = calculateIndulgenceStatus(b);
    var rankA = indulgenceRank(statusA);
    var rankB = indulgenceRank(statusB);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    if (statusA.status === "cooling" && statusB.status === "cooling") {
      return statusB.recent14dCount - statusA.recent14dCount || a.sortOrder - b.sortOrder;
    }
    return a.sortOrder - b.sortOrder;
  }

  function indulgenceRank(status) {
    return {
      tooMany: 1,
      cooling: 2,
      slightlyHigh: 3,
      acceptable: 4,
      excellent: 5
    }[status.status] || 6;
  }

  function isActive(card) {
    return card.active;
  }

  function bySortOrder(a, b) {
    return a.sortOrder - b.sortOrder;
  }

  function addPositiveCheckin(card, optionId) {
    var option = optionId ? findSeriesOption(card, optionId) : null;
    card.checkinHistory.push(completion(toLocalTimestamp(new Date()), optionId || null, option ? option.label : null));
  }

  function handleDocumentClick(event) {
    var filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      var type = filterButton.dataset.filterType;
      state.uiPrefs[sectionConfig[type].filterKey] = filterButton.dataset.filter;
      saveState("筛选条件更新");
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
    if (card.mode === "series") {
      openSeriesDialog(type, card);
      return;
    }
    addPositiveCheckin(card);
    saveState(card.title + " 已打卡");
    render();
  }

  function handleIndulgenceRecord(id) {
    var card = findCard("indulgence", id);
    if (!card) {
      return;
    }
    card.eventHistory.push(event(toLocalTimestamp(new Date())));
    saveState(card.title + " 已记录一次");
    render();
  }

  function findCard(type, id) {
    return state[sectionConfig[type].listKey].find(function (card) {
      return card.id === id;
    });
  }

  function openSeriesDialog(type, card) {
    pendingSeriesCheckin = { type: type, id: card.id };
    selectedSeriesOptionId = card.options[0] && card.options[0].id;
    document.getElementById("series-dialog-title").textContent = "这次完成了什么？";
    document.getElementById("series-dialog-copy").textContent = card.title + "：选择其中一项，本周期即视为完成。";
    renderSeriesChoices(card);
    document.getElementById("series-backdrop").hidden = false;
    document.getElementById("series-dialog").hidden = false;
  }

  function renderSeriesChoices(card) {
    var confirmButton = document.getElementById("series-confirm-button");
    if (!Array.isArray(card.options) || card.options.length === 0) {
      selectedSeriesOptionId = null;
      confirmButton.disabled = true;
      document.getElementById("series-choice-grid").innerHTML =
        "<div class=\"empty-state\">这个同系列卡片还没有可选项</div>";
      return;
    }
    confirmButton.disabled = false;
    document.getElementById("series-choice-grid").innerHTML = card.options.map(function (option) {
      var active = option.id === selectedSeriesOptionId ? " is-selected" : "";
      return [
        "<button class=\"series-choice" + active + "\" type=\"button\" data-series-option=\"" + option.id + "\">",
        "<span>" + getIcon(option.iconKey).icon + "</span>",
        "<strong>" + escapeHtml(option.label) + "</strong>",
        "</button>"
      ].join("");
    }).join("");
  }

  function closeSeriesDialog() {
    pendingSeriesCheckin = null;
    selectedSeriesOptionId = null;
    document.getElementById("series-backdrop").hidden = true;
    document.getElementById("series-dialog").hidden = true;
  }

  function confirmSeriesCheckin() {
    if (!pendingSeriesCheckin || !selectedSeriesOptionId) {
      return;
    }
    var card = findCard(pendingSeriesCheckin.type, pendingSeriesCheckin.id);
    if (!card) {
      closeSeriesDialog();
      return;
    }
    addPositiveCheckin(card, selectedSeriesOptionId);
    saveState(card.title + " 同系列打卡完成");
    closeSeriesDialog();
    render();
  }

  function openManager(type) {
    currentManagerType = type;
    document.getElementById("drawer-backdrop").hidden = false;
    document.getElementById("manager-drawer").hidden = false;
    renderManager();
    console.log("[Personal_Web] 打开健康管理卡片面板：", sectionConfig[type].label);
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
      var status = card.active ? "启用" : "停用";
      return [
        "<article class=\"manager-item\">",
        "<div class=\"manager-item-title\"><span>" + getIcon(card.iconKey).icon + " " + escapeHtml(card.title) +
          "</span><small>" + status + "</small></div>",
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
    document.getElementById("mode-field-wrap").hidden = isIndulgence;
    document.getElementById("recurrence-field-wrap").hidden = isIndulgence;
    document.getElementById("importance-field-wrap").hidden = isIndulgence;
    document.getElementById("gap-field-wrap").hidden = !isIndulgence;
    document.getElementById("risk-field-wrap").hidden = !isIndulgence;
    toggleSeriesEditor();
  }

  function resetForm() {
    document.getElementById("manager-form").reset();
    document.getElementById("card-id-field").value = "";
    document.getElementById("manager-form-title").textContent = "新增卡片";
    document.getElementById("active-field").checked = true;
    document.getElementById("mode-field").value = "single";
    document.getElementById("recurrence-field").value = 3;
    document.getElementById("gap-field").value = 7;
    document.getElementById("card-icon-field").value = currentManagerType === "indulgence" ? "default" : "fruit";
    document.getElementById("series-option-list").innerHTML = "";
    updateIconPreview();
    toggleSeriesEditor();
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
    saveState("卡片管理操作：" + action);
    render();
  }

  function fillForm(card) {
    document.getElementById("manager-form-title").textContent = "编辑卡片";
    document.getElementById("card-id-field").value = card.id;
    document.getElementById("card-title-field").value = card.title;
    document.getElementById("card-icon-field").value = card.iconKey || "default";
    document.getElementById("note-field").value = card.note || "";
    document.getElementById("active-field").checked = card.active;
    if (currentManagerType === "indulgence") {
      document.getElementById("gap-field").value = card.recommendedGapDays;
      document.getElementById("risk-field").value = card.riskLevel;
    } else {
      document.getElementById("mode-field").value = card.mode || "single";
      document.getElementById("recurrence-field").value = card.recurrenceDays;
      document.getElementById("importance-field").value = card.importance;
      renderOptionEditor(card.options || []);
    }
    updateIconPreview();
    toggleSeriesEditor();
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    var id = document.getElementById("card-id-field").value;
    var cards = state[sectionConfig[currentManagerType].listKey];
    var card = id ? findCard(currentManagerType, id) : createBlankCard(currentManagerType);

    card.title = document.getElementById("card-title-field").value.trim();
    card.iconKey = document.getElementById("card-icon-field").value || "default";
    card.note = document.getElementById("note-field").value.trim();
    card.active = document.getElementById("active-field").checked;

    if (currentManagerType === "indulgence") {
      card.recommendedGapDays = toPositiveInteger(document.getElementById("gap-field").value, 7);
      card.riskLevel = document.getElementById("risk-field").value;
    } else {
      card.mode = document.getElementById("mode-field").value;
      card.recurrenceDays = toPositiveInteger(document.getElementById("recurrence-field").value, 3);
      card.importance = document.getElementById("importance-field").value;
      card.options = card.mode === "series" ? collectSeriesOptions() : [];
      if (card.mode === "series" && card.options.length === 0) {
        alert("同系列卡片至少需要一个可选项。");
        return;
      }
    }

    if (!id) {
      cards.push(card);
    }

    normalizeOrder(currentManagerType);
    saveState("卡片表单保存");
    resetForm();
    render();
  }

  function createBlankCard(type) {
    var order = state[sectionConfig[type].listKey].length + 1;
    if (type === "indulgence") {
      return createIndulgenceSeed("indulgence-" + Date.now(), "新放纵项", "default", "medium", 7, [], order);
    }
    return createPositiveSeed(type + "-" + Date.now(), type, "新卡片", "default", "medium", 3, [], order);
  }

  function swapOrder(a, b) {
    var next = a.sortOrder;
    a.sortOrder = b.sortOrder;
    b.sortOrder = next;
  }

  function normalizeOrder(type) {
    state[sectionConfig[type].listKey].sort(bySortOrder).forEach(function (card, index) {
      card.sortOrder = index + 1;
    });
  }

  function populateIconSelects() {
    var select = document.getElementById("card-icon-field");
    select.innerHTML = iconOptionsMarkup();
    updateIconPreview();
  }

  function iconOptionsMarkup(selected) {
    return ICON_CATEGORIES.map(function (category) {
      var options = category.keys.map(function (key) {
        var icon = getIcon(key);
        return "<option value=\"" + key + "\"" + (selected === key ? " selected" : "") + ">" +
          icon.icon + " " + icon.label + "</option>";
      }).join("");
      return "<optgroup label=\"" + category.label + "\">" + options + "</optgroup>";
    }).join("");
  }

  function updateIconPreview() {
    var icon = getIcon(document.getElementById("card-icon-field").value);
    document.getElementById("icon-preview").textContent = "当前图标：" + icon.icon + " " + icon.label;
  }

  function toggleSeriesEditor() {
    var isSeries = document.getElementById("mode-field").value === "series" && currentManagerType !== "indulgence";
    document.getElementById("series-editor").hidden = !isSeries;
    if (isSeries && document.getElementById("series-option-list").children.length === 0) {
      renderOptionEditor([
        { id: "option-" + Date.now(), label: "", iconKey: "default" }
      ]);
    }
  }

  function renderOptionEditor(options) {
    document.getElementById("series-option-list").innerHTML = options.map(function (option) {
      return optionEditorRow(option);
    }).join("");
  }

  function optionEditorRow(option) {
    var id = option.id || "option-" + Date.now();
    return [
      "<div class=\"series-option-row\" data-option-row=\"" + id + "\">",
      "<input class=\"series-option-label\" type=\"text\" value=\"" + escapeHtml(option.label || "") +
        "\" placeholder=\"选项名称\" maxlength=\"16\">",
      "<select class=\"series-option-icon\">" + iconOptionsMarkup(option.iconKey || "default") + "</select>",
      "<button class=\"ghost-button\" type=\"button\" data-remove-option=\"" + id + "\">移除</button>",
      "</div>"
    ].join("");
  }

  function collectSeriesOptions() {
    return Array.from(document.querySelectorAll(".series-option-row")).map(function (row, index) {
      var label = row.querySelector(".series-option-label").value.trim();
      if (!label) {
        return null;
      }
      return {
        id: row.dataset.optionRow || "option-" + index + "-" + Date.now(),
        label: label,
        iconKey: row.querySelector(".series-option-icon").value || "default"
      };
    }).filter(Boolean);
  }

  function handleOptionEditorClick(event) {
    var remove = event.target.closest("[data-remove-option]");
    if (remove) {
      var row = remove.closest(".series-option-row");
      if (row) {
        row.remove();
      }
      return;
    }
    if (event.target.id === "add-option-button") {
      document.getElementById("series-option-list").insertAdjacentHTML("beforeend", optionEditorRow({
        id: "option-" + Date.now(),
        label: "",
        iconKey: "default"
      }));
    }
  }

  function handleSeriesChoice(event) {
    var button = event.target.closest("[data-series-option]");
    if (!button || !pendingSeriesCheckin) {
      return;
    }
    selectedSeriesOptionId = button.dataset.seriesOption;
    var card = findCard(pendingSeriesCheckin.type, pendingSeriesCheckin.id);
    if (card) {
      renderSeriesChoices(card);
    }
  }

  function safeText(value, fallback) {
    if (typeof value !== "string" || !value.trim()) {
      return fallback;
    }
    return value.trim();
  }

  function normalizeLevel(value, fallback) {
    return value === "high" || value === "medium" || value === "low" ? value : fallback;
  }

  function toPositiveInteger(value, fallback) {
    var number = parseInt(value, 10);
    return number > 0 ? number : fallback;
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
    document.getElementById("card-icon-field").addEventListener("change", updateIconPreview);
    document.getElementById("mode-field").addEventListener("change", toggleSeriesEditor);
    document.getElementById("series-option-list").addEventListener("click", handleOptionEditorClick);
    document.getElementById("add-option-button").addEventListener("click", handleOptionEditorClick);
    document.getElementById("series-choice-grid").addEventListener("click", handleSeriesChoice);
    document.getElementById("series-confirm-button").addEventListener("click", confirmSeriesCheckin);
    document.getElementById("series-cancel-button").addEventListener("click", closeSeriesDialog);
    document.getElementById("series-close-button").addEventListener("click", closeSeriesDialog);
    document.getElementById("series-backdrop").addEventListener("click", closeSeriesDialog);
    document.getElementById("reset-data-button").addEventListener("click", function () {
      state = makeSeedData();
      saveState("重置示例数据");
      render();
      if (currentManagerType) {
        resetForm();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    console.log("[Personal_Web] 健康管理 V1 初始化开始");
    populateIconSelects();
    loadState();
    bindEvents();
    resetForm();
    render();
    console.log("[Personal_Web] 健康管理 V1 已加载，数据版本：", state.version);
    console.log("[Personal_Web] 健康管理内置图标分类数量：", ICON_CATEGORIES.length);
  });
})();
