const STORAGE_KEY = "personal_web_homepage_timeline_v1";
const SVG_WIDTH = 1000;
const SIMPLE_SMOOTH_ENGINE = "simple-strong-smooth";
const DEFAULT_SIMPLE_SMOOTH = {
  engine: SIMPLE_SMOOTH_ENGINE,
  smoothStrength: 72,
  smoothSpacing: 12,
  catmullSamplesPerSegment: 16,
  preserveEndpoints: true
};
const DEFAULT_SMOOTHING = {
  ...DEFAULT_SIMPLE_SMOOTH
};
const TUNING_SLIDERS = [
  {
    key: "smoothStrength",
    label: "\u5e73\u6ed1\u5f3a\u5ea6",
    min: 0,
    max: 100,
    step: 1,
    hint: "\u4f4e\u503c\u66f4\u63a5\u8fd1\u624b\u7ed8\uff0c\u9ad8\u503c\u66f4\u5e73\u6ed1\u5e76\u51cf\u5c11\u6296\u52a8\u3002"
  },
  {
    key: "smoothSpacing",
    label: "\u91c7\u6837\u95f4\u8ddd",
    min: 4,
    max: 40,
    step: 1,
    unit: "px",
    hint: "\u4f4e\u503c\u4fdd\u7559\u66f4\u591a\u91c7\u6837\u70b9\u5e76\u66f4\u8d34\u8fd1\u539f\u7ebf\uff0c\u9ad8\u503c\u66f4\u7b80\u6d01\u5e73\u6ed1\u3002"
  },
  {
    key: "catmullSamplesPerSegment",
    label: "\u63d2\u503c\u5bc6\u5ea6",
    min: 6,
    max: 30,
    step: 1,
    hint: "\u9ad8\u503c\u4f1a\u751f\u6210\u66f4\u591a\u6700\u7ec8\u70b9\uff0c\u8ba9\u663e\u793a\u66f2\u7ebf\u66f4\u7ec6\u817b\u3002"
  }
];
const CURVE_TUNING_PRESETS = {
  close: {
    label: "\u63a5\u8fd1\u539f\u7ebf",
    values: {
      smoothStrength: 38,
      smoothSpacing: 8,
      catmullSamplesPerSegment: 14
    }
  },
  balanced: {
    label: "\u5747\u8861",
    values: DEFAULT_SIMPLE_SMOOTH
  },
  strong: {
    label: "\u5f3a\u529b\u5e73\u6ed1",
    values: {
      smoothStrength: 88,
      smoothSpacing: 14,
      catmullSamplesPerSegment: 22
    }
  },
  detail: {
    label: "\u7ec6\u8282\u66f4\u591a",
    values: {
      smoothStrength: 58,
      smoothSpacing: 6,
      catmullSamplesPerSegment: 24
    }
  },
  reset: {
    label: "\u91cd\u7f6e\u9ed8\u8ba4",
    values: DEFAULT_SIMPLE_SMOOTH
  }
};
const DRAW_POINT_MIN_DISTANCE = 10;
const PATH_ALIGNMENT_HANDLE_DISTANCE = 96;
const getBoundaryConnectionId = (fromAreaId, toAreaId) => `${fromAreaId}__${toAreaId}`;
const DEFAULT_BOUNDARY_CONNECTIONS = {
  [getBoundaryConnectionId("area-01", "area-02")]: {
    id: getBoundaryConnectionId("area-01", "area-02"),
    fromAreaId: "area-01",
    toAreaId: "area-02",
    enabled: false,
    tailDistance: 180,
    headDistance: 180,
    minPointsPerSide: 3,
    maxPointsPerSide: 8,
    samplesPerSegment: 18,
    alpha: 0.5
  }
};

const logHomepage = (message, details = {}) => {
  console.log(`[Personal_Web][HomepageEditor] ${message}`, details);
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const DEFAULT_HOMEPAGE_EDITOR_STATE = {
  version: 2,
  mode: "preview",
  view: "overview",
  selectedAreaId: "area-01",
  selectedNodeId: "major-01",
  selectedPointId: "area-01-a1",
  selectedHandle: "anchor",
  addNodeType: "major",
  activeTool: "select",
  drawingPreviewPoints: [],
  resetConfirmPending: false,
  dirty: false,
  boundaryConnections: clone(DEFAULT_BOUNDARY_CONNECTIONS),
  hero: {
    eyebrow: "Hello, World!",
    title: "A simple curved path timeline prototype."
  },
  globalStyles: {
    editorNote: "当前为本地编辑原型，配置仅保存在当前浏览器。"
  },
  areas: [
    {
      id: "area-01",
      title: "Area 01",
      description: "This is a placeholder description for Area 01.",
      order: 1,
      height: 520,
      mobileHeight: 640,
      theme: "green",
      background: {
        type: "gradient",
        colorA: "#edf7eb",
        colorB: "#e4f2e6",
        pattern: "soft-hills",
        placeholderImage: null
      },
      path: {
        viewBox: "0 0 1000 520",
        strokeColor: "#ffffff",
        shadowColor: "rgba(20, 40, 60, 0.12)",
        strokeWidth: 34,
        lineCap: "round",
        lineStyle: "solid",
        points: [
          { id: "area-01-a0", type: "anchor", x: 500, y: 0, cpOut: { x: 250, y: 120 } },
          { id: "area-01-a1", type: "anchor", x: 470, y: 300, cpIn: { x: 130, y: 160 }, cpOut: { x: 780, y: 390 } },
          { id: "area-01-a2", type: "anchor", x: 640, y: 520, cpIn: { x: 300, y: 430 } }
        ]
      },
      areaStyles: {
        majorNodeColor: "#2f6f45",
        minorNodeColor: "#76b7f2",
        majorCardStyle: "soft-card",
        minorCardStyle: "compact-card"
      },
      nodes: [
        {
          id: "major-01",
          type: "major",
          title: "Major Event 01",
          date: "2000",
          description: "This is a test description.",
          imageType: "placeholder",
          x: 510,
          y: 160,
          offsetX: 120,
          offsetY: -54,
          cardSide: "right",
          style: { color: "#2f6f45", icon: "dot", cardVariant: "large" }
        },
        {
          id: "minor-01",
          type: "minor",
          title: "Minor Event 01",
          date: "2000",
          description: "This is a placeholder event.",
          imageType: "placeholder",
          x: 360,
          y: 280,
          offsetX: -200,
          offsetY: -28,
          cardSide: "left",
          style: { color: "#76b7f2", icon: "dot", cardVariant: "compact" }
        },
        {
          id: "minor-02",
          type: "minor",
          title: "Minor Event 02",
          date: "2005",
          description: "This is a placeholder description.",
          imageType: "placeholder",
          x: 640,
          y: 390,
          offsetX: 72,
          offsetY: 12,
          cardSide: "right",
          style: { color: "#76b7f2", icon: "dot", cardVariant: "compact" }
        }
      ]
    },
    {
      id: "area-02",
      title: "Area 02",
      description: "This is a placeholder description for Area 02.",
      order: 2,
      height: 520,
      mobileHeight: 640,
      theme: "blue",
      background: {
        type: "gradient",
        colorA: "#eaf4fb",
        colorB: "#e3eef8",
        pattern: "soft-skyline",
        placeholderImage: null
      },
      path: {
        viewBox: "0 0 1000 520",
        strokeColor: "#ffffff",
        shadowColor: "rgba(20, 40, 60, 0.12)",
        strokeWidth: 34,
        lineCap: "round",
        lineStyle: "solid",
        points: [
          { id: "area-02-a0", type: "anchor", x: 640, y: 0, cpOut: { x: 860, y: 120 } },
          { id: "area-02-a1", type: "anchor", x: 620, y: 260, cpIn: { x: 920, y: 160 }, cpOut: { x: 270, y: 360 } },
          { id: "area-02-a2", type: "anchor", x: 390, y: 520, cpIn: { x: 740, y: 430 } }
        ]
      },
      areaStyles: {
        majorNodeColor: "#315f9d",
        minorNodeColor: "#68aee8",
        majorCardStyle: "soft-card",
        minorCardStyle: "compact-card"
      },
      nodes: [
        {
          id: "major-02",
          type: "major",
          title: "Major Event 02",
          date: "2005",
          description: "This is a placeholder event.",
          imageType: "placeholder",
          x: 700,
          y: 180,
          offsetX: -350,
          offsetY: -56,
          cardSide: "left",
          style: { color: "#315f9d", icon: "dot", cardVariant: "large" }
        },
        {
          id: "minor-03",
          type: "minor",
          title: "Minor Event 03",
          date: "2010",
          description: "This is a test description.",
          imageType: "placeholder",
          x: 520,
          y: 340,
          offsetX: 94,
          offsetY: -24,
          cardSide: "right",
          style: { color: "#68aee8", icon: "dot", cardVariant: "compact" }
        }
      ]
    },
    {
      id: "area-03",
      title: "Area 03",
      description: "This is a placeholder description for Area 03.",
      order: 3,
      height: 520,
      mobileHeight: 640,
      theme: "sand",
      background: {
        type: "gradient",
        colorA: "#fbf0da",
        colorB: "#f4e5c9",
        pattern: "soft-waves",
        placeholderImage: null
      },
      path: {
        viewBox: "0 0 1000 520",
        strokeColor: "#ffffff",
        shadowColor: "rgba(20, 40, 60, 0.12)",
        strokeWidth: 34,
        lineCap: "round",
        lineStyle: "solid",
        points: [
          { id: "area-03-a0", type: "anchor", x: 390, y: 0, cpOut: { x: 140, y: 110 } },
          { id: "area-03-a1", type: "anchor", x: 420, y: 270, cpIn: { x: 90, y: 150 }, cpOut: { x: 760, y: 370 } },
          { id: "area-03-a2", type: "anchor", x: 620, y: 520, cpIn: { x: 270, y: 430 } }
        ]
      },
      areaStyles: {
        majorNodeColor: "#9a6a28",
        minorNodeColor: "#d69b4c",
        majorCardStyle: "soft-card",
        minorCardStyle: "compact-card"
      },
      nodes: [
        {
          id: "major-03",
          type: "major",
          title: "Major Event 03",
          date: "2010",
          description: "This is a placeholder description.",
          imageType: "placeholder",
          x: 430,
          y: 190,
          offsetX: 110,
          offsetY: -62,
          cardSide: "right",
          style: { color: "#9a6a28", icon: "dot", cardVariant: "large" }
        },
        {
          id: "minor-04",
          type: "minor",
          title: "Minor Event 04",
          date: "2015",
          description: "This is a placeholder event.",
          imageType: "placeholder",
          x: 300,
          y: 330,
          offsetX: -210,
          offsetY: -18,
          cardSide: "left",
          style: { color: "#d69b4c", icon: "dot", cardVariant: "compact" }
        },
        {
          id: "minor-05",
          type: "minor",
          title: "Minor Event 05",
          date: "2015",
          description: "This is a placeholder description.",
          imageType: "placeholder",
          x: 610,
          y: 405,
          offsetX: 80,
          offsetY: 12,
          cardSide: "right",
          style: { color: "#d69b4c", icon: "dot", cardVariant: "compact" }
        }
      ]
    },
    {
      id: "area-04",
      title: "Area 04",
      description: "This is a placeholder description for Area 04.",
      order: 4,
      height: 540,
      mobileHeight: 660,
      theme: "purple",
      background: {
        type: "gradient",
        colorA: "#f0eafb",
        colorB: "#e9e4f6",
        pattern: "soft-abstract",
        placeholderImage: null
      },
      path: {
        viewBox: "0 0 1000 540",
        strokeColor: "#ffffff",
        shadowColor: "rgba(20, 40, 60, 0.12)",
        strokeWidth: 34,
        lineCap: "round",
        lineStyle: "solid",
        points: [
          { id: "area-04-a0", type: "anchor", x: 620, y: 0, cpOut: { x: 870, y: 130 } },
          { id: "area-04-a1", type: "anchor", x: 650, y: 280, cpIn: { x: 930, y: 150 }, cpOut: { x: 350, y: 420 } },
          { id: "area-04-a2", type: "anchor", x: 500, y: 540, cpIn: { x: 780, y: 440 } }
        ]
      },
      areaStyles: {
        majorNodeColor: "#7356a6",
        minorNodeColor: "#9a83cf",
        majorCardStyle: "soft-card",
        minorCardStyle: "compact-card"
      },
      nodes: [
        {
          id: "major-04",
          type: "major",
          title: "Major Event 04",
          date: "2020",
          description: "This is a test description.",
          imageType: "placeholder",
          x: 690,
          y: 210,
          offsetX: -345,
          offsetY: -48,
          cardSide: "left",
          style: { color: "#7356a6", icon: "dot", cardVariant: "large" }
        },
        {
          id: "minor-06",
          type: "minor",
          title: "Minor Event 06",
          date: "2020",
          description: "This is a placeholder event.",
          imageType: "placeholder",
          x: 520,
          y: 430,
          offsetX: 90,
          offsetY: -16,
          cardSide: "right",
          style: { color: "#9a83cf", icon: "dot", cardVariant: "compact" }
        }
      ]
    }
  ]
};

let editorState = clone(DEFAULT_HOMEPAGE_EDITOR_STATE);
let dragState = null;
const createDefaultUiState = () => ({
  popover: null,
  contextMenu: null,
  hoverPreview: null,
  lastPointerWasDrag: false,
  debugOverlay: false,
  tuningScope: "current",
  debugLayers: {
    raw: true,
    anchors: true,
    final: true,
    tangents: true
  }
});
let uiState = createDefaultUiState();
const curveDebugDataByArea = new Map();
let globalCurveDebugData = null;

const getOrderedAreas = () => [...editorState.areas].sort((a, b) => a.order - b.order);
const getAreaById = (areaId) => editorState.areas.find((area) => area.id === areaId);
const getSelectedArea = () => getAreaById(editorState.selectedAreaId) || getOrderedAreas()[0];
const getBoundaryConnections = () => editorState.boundaryConnections || {};
const getBoundaryConnection = (fromAreaId, toAreaId) =>
  getBoundaryConnections()[getBoundaryConnectionId(fromAreaId, toAreaId)] || null;

const sanitizeBoundaryConnection = (connection, defaults) => {
  const merged = { ...defaults, ...(connection || {}) };
  const numberOrDefault = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  return {
    id: merged.id || defaults.id,
    fromAreaId: merged.fromAreaId || defaults.fromAreaId,
    toAreaId: merged.toAreaId || defaults.toAreaId,
    enabled: merged.enabled === true,
    tailDistance: Math.round(clamp(numberOrDefault(merged.tailDistance, defaults.tailDistance), 80, 420)),
    headDistance: Math.round(clamp(numberOrDefault(merged.headDistance, defaults.headDistance), 80, 420)),
    minPointsPerSide: Math.round(clamp(numberOrDefault(merged.minPointsPerSide, defaults.minPointsPerSide), 2, 8)),
    maxPointsPerSide: Math.round(clamp(numberOrDefault(merged.maxPointsPerSide, defaults.maxPointsPerSide), 4, 16)),
    samplesPerSegment: Math.round(clamp(numberOrDefault(merged.samplesPerSegment, defaults.samplesPerSegment), 6, 36)),
    alpha: clamp(numberOrDefault(merged.alpha, defaults.alpha), 0.25, 1)
  };
};

const sanitizeBoundaryConnections = (rawConnections = {}) => {
  const defaults = clone(DEFAULT_BOUNDARY_CONNECTIONS);
  Object.entries(rawConnections || {}).forEach(([id, connection]) => {
    if (defaults[id]) {
      defaults[id] = sanitizeBoundaryConnection(connection, defaults[id]);
    }
  });
  return defaults;
};

const getNodeById = (nodeId) => {
  for (const area of editorState.areas) {
    const node = area.nodes.find((item) => item.id === nodeId);
    if (node) {
      return { area, node };
    }
  }
  return null;
};

const sanitizeState = (rawState) => {
  if (!rawState || !Array.isArray(rawState.areas)) {
    throw new Error("State is missing editable areas.");
  }

  const nextState = clone(DEFAULT_HOMEPAGE_EDITOR_STATE);
  Object.assign(nextState, rawState, {
    mode: "preview",
    activeTool: "select",
    version: 2,
    dirty: false
  });

  nextState.areas = rawState.areas.map((area, index) => {
    const defaultArea = DEFAULT_HOMEPAGE_EDITOR_STATE.areas[index] || DEFAULT_HOMEPAGE_EDITOR_STATE.areas[0];
    const migratedArea = {
      ...clone(defaultArea),
      ...area,
      background: { ...clone(defaultArea.background), ...(area.background || {}) },
      path: { ...clone(defaultArea.path), ...(area.path || {}) },
      areaStyles: { ...clone(defaultArea.areaStyles), ...(area.areaStyles || {}) },
      nodes: Array.isArray(area.nodes) ? area.nodes : clone(defaultArea.nodes)
    };
    migrateAreaPath(migratedArea);
    return migratedArea;
  });

  nextState.boundaryConnections = sanitizeBoundaryConnections(rawState.boundaryConnections);
  alignAdjacentAreaPaths(nextState.areas, "sanitize");
  nextState.areas.forEach((area) => migrateAreaNodes(area));

  return nextState;
};

const loadInitialState = () => {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    logHomepage("Using default editable homepage data.");
    return sanitizeState(clone(DEFAULT_HOMEPAGE_EDITOR_STATE));
  }

  try {
    const parsed = JSON.parse(saved);
    logHomepage("Loaded editable homepage data from localStorage.", {
      storageKey: STORAGE_KEY
    });
    return sanitizeState(parsed);
  } catch (error) {
    logHomepage("Saved homepage data is invalid. Falling back to defaults.", {
      error: error.message
    });
    return sanitizeState(clone(DEFAULT_HOMEPAGE_EDITOR_STATE));
  }
};

const markDirty = (reason) => {
  editorState.dirty = true;
  editorState.resetConfirmPending = false;
  logHomepage("Editor state changed.", { reason });
  updateSaveStatus("未保存");
};

const buildPathD = (points) => {
  if (!points.length) {
    return "";
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const cpOut = previous.cpOut || { x: previous.x, y: previous.y };
    const cpIn = point.cpIn || { x: point.x, y: point.y };
    return `${path} C ${cpOut.x} ${cpOut.y} ${cpIn.x} ${cpIn.y} ${point.x} ${point.y}`;
  }, "");
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const distanceBetweenPoints = (first, second) =>
  Math.hypot(first.x - second.x, first.y - second.y);

const normalizeSmoothing = (smoothing = {}) => ({
  ...DEFAULT_SIMPLE_SMOOTH,
  engine: SIMPLE_SMOOTH_ENGINE,
  smoothStrength: Math.round(clamp(
    Number(smoothing.simpleSmooth?.smoothStrength ?? smoothing.smoothStrength ?? DEFAULT_SIMPLE_SMOOTH.smoothStrength),
    0,
    100
  )),
  smoothSpacing: Math.round(clamp(
    Number(smoothing.simpleSmooth?.smoothSpacing ?? smoothing.smoothSpacing ?? DEFAULT_SIMPLE_SMOOTH.smoothSpacing),
    4,
    40
  )),
  catmullSamplesPerSegment: Math.round(clamp(
    Number(
      smoothing.simpleSmooth?.catmullSamplesPerSegment ??
      smoothing.catmullSamplesPerSegment ??
      DEFAULT_SIMPLE_SMOOTH.catmullSamplesPerSegment
    ),
    6,
    30
  )),
  preserveEndpoints: smoothing.simpleSmooth?.preserveEndpoints ?? smoothing.preserveEndpoints ?? true
});

const normalizePoint = (point, fallback = { x: SVG_WIDTH / 2, y: 0 }) => ({
  x: Math.round(Number.isFinite(point?.x) ? point.x : fallback.x),
  y: Math.round(Number.isFinite(point?.y) ? point.y : fallback.y)
});

const getBezierPoint = (p0, p1, p2, p3, t) => {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * p0.x + 3 * inverse ** 2 * t * p1.x + 3 * inverse * t ** 2 * p2.x + t ** 3 * p3.x,
    y: inverse ** 3 * p0.y + 3 * inverse ** 2 * t * p1.y + 3 * inverse * t ** 2 * p2.y + t ** 3 * p3.y
  };
};

const pointsFromBezierAnchors = (points, stepsPerSegment = 28) => {
  if (!points?.length) {
    return [];
  }

  const sampled = [{ x: points[0].x, y: points[0].y }];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const cpOut = previous.cpOut || previous;
    const cpIn = current.cpIn || current;
    for (let step = 1; step <= stepsPerSegment; step += 1) {
      sampled.push(getBezierPoint(previous, cpOut, cpIn, current, step / stepsPerSegment));
    }
  }
  return sampled.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
};

const getBasePathPoints = (area) => {
  if (area.path.mode === "freehand" && area.path.smoothPoints?.length >= 2) {
    return area.path.smoothPoints;
  }
  return pointsFromBezierAnchors(area.path.points || []);
};

const resamplePointsByDistance = (points, spacing = 22) => {
  if (points.length <= 2) {
    return points;
  }
  const resampled = [points[0]];
  let carried = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentLength = distanceBetweenPoints(previous, current);
    if (!segmentLength) {
      continue;
    }
    let target = spacing - carried;
    while (target <= segmentLength) {
      const ratio = target / segmentLength;
      resampled.push({
        x: Math.round(previous.x + (current.x - previous.x) * ratio),
        y: Math.round(previous.y + (current.y - previous.y) * ratio)
      });
      target += spacing;
    }
    carried = segmentLength - (target - spacing);
  }
  const last = points[points.length - 1];
  if (distanceBetweenPoints(resampled[resampled.length - 1], last) > 1) {
    resampled.push(last);
  }
  return resampled;
};

const removeConsecutiveDuplicatePoints = (points) => {
  const cleaned = [];
  points.forEach((point) => {
    const normalized = normalizePoint(point);
    const previous = cleaned[cleaned.length - 1];
    if (!previous || distanceBetweenPoints(previous, normalized) > 0) {
      cleaned.push(normalized);
    }
  });
  return cleaned;
};

const getPolylineLength = (points) =>
  points.reduce((total, point, index) => (
    index === 0 ? total : total + distanceBetweenPoints(points[index - 1], point)
  ), 0);

const gaussianWeights = (radius, sigma) => {
  const weights = [];
  let total = 0;
  for (let index = -radius; index <= radius; index += 1) {
    const weight = Math.exp(-(index * index) / (2 * sigma * sigma));
    weights.push(weight);
    total += weight;
  }
  return weights.map((weight) => weight / total);
};

const gaussianSmoothPoints = (points, radius, sigma, passes = 1) => {
  if (points.length <= 2) {
    return points;
  }

  let smoothed = points.map(normalizePoint);
  const weights = gaussianWeights(radius, sigma);
  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = smoothed.map((point, index) => {
      if (index === 0 || index === smoothed.length - 1) {
        return point;
      }
      let x = 0;
      let y = 0;
      weights.forEach((weight, offsetIndex) => {
        const sourceIndex = clamp(index + offsetIndex - radius, 0, smoothed.length - 1);
        x += smoothed[sourceIndex].x * weight;
        y += smoothed[sourceIndex].y * weight;
      });
      return { x: Math.round(x), y: Math.round(y) };
    });
  }
  return smoothed;
};

const catmullRomPoint = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (
      2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    ),
    y: 0.5 * (
      2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    )
  };
};

const catmullRomInterpolate = (points, samplesPerSegment) => {
  if (points.length <= 2) {
    return points.map(normalizePoint);
  }

  const samples = [normalizePoint(points[0])];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 1; step <= samplesPerSegment; step += 1) {
      samples.push(normalizePoint(catmullRomPoint(p0, p1, p2, p3, step / samplesPerSegment)));
    }
  }
  return removeConsecutiveDuplicatePoints(samples);
};

const buildDensePolylinePathD = (points) => {
  if (!points.length) {
    return "";
  }
  return `M ${points.map((point) => `${Math.round(point.x)} ${Math.round(point.y)}`).join(" L ")}`;
};

const getAreaLayouts = (areas) => {
  let top = 0;
  return [...areas]
    .sort((first, second) => first.order - second.order)
    .map((area) => {
      const layout = {
        area,
        top,
        bottom: top + area.height
      };
      top += area.height;
      return layout;
    });
};

const localToGlobalPoint = (point, layout) => ({
  x: Math.round(point.x),
  y: Math.round(point.y + layout.top),
  areaId: layout.area.id
});

const getLayoutByAreaId = (layouts, areaId) =>
  layouts.find((layout) => layout.area.id === areaId) || null;

const takeTailPointsByDistance = (points, distancePx, minPoints, maxPoints) => {
  const cleanPoints = removeConsecutiveDuplicatePoints(points || []);
  if (!cleanPoints.length) {
    return [];
  }

  const selected = [cleanPoints[cleanPoints.length - 1]];
  let accumulated = 0;
  for (let index = cleanPoints.length - 1; index > 0; index -= 1) {
    accumulated += distanceBetweenPoints(cleanPoints[index], cleanPoints[index - 1]);
    selected.push(cleanPoints[index - 1]);
    if (
      selected.length >= minPoints &&
      (accumulated >= distancePx || selected.length >= maxPoints)
    ) {
      break;
    }
  }

  return selected.slice(0, maxPoints).reverse();
};

const takeHeadPointsByDistance = (points, distancePx, minPoints, maxPoints) => {
  const cleanPoints = removeConsecutiveDuplicatePoints(points || []);
  if (!cleanPoints.length) {
    return [];
  }

  const selected = [cleanPoints[0]];
  let accumulated = 0;
  for (let index = 1; index < cleanPoints.length; index += 1) {
    accumulated += distanceBetweenPoints(cleanPoints[index - 1], cleanPoints[index]);
    selected.push(cleanPoints[index]);
    if (
      selected.length >= minPoints &&
      (accumulated >= distancePx || selected.length >= maxPoints)
    ) {
      break;
    }
  }

  return selected.slice(0, maxPoints);
};

const buildBoundaryConnectorSourcePoints = (connection, layouts) => {
  const fromLayout = getLayoutByAreaId(layouts, connection.fromAreaId);
  const toLayout = getLayoutByAreaId(layouts, connection.toAreaId);
  if (!fromLayout || !toLayout) {
    return null;
  }

  const minPoints = connection.minPointsPerSide || 3;
  const maxPoints = connection.maxPointsPerSide || 8;
  const tailPoints = takeTailPointsByDistance(
    getRenderablePathPoints(fromLayout.area),
    connection.tailDistance,
    minPoints,
    maxPoints
  );
  const headPoints = takeHeadPointsByDistance(
    getRenderablePathPoints(toLayout.area),
    connection.headDistance,
    minPoints,
    maxPoints
  );
  const sourcePoints = removeConsecutiveDuplicatePoints([
    ...tailPoints.map((point) => localToGlobalPoint(point, fromLayout)),
    ...headPoints.map((point) => localToGlobalPoint(point, toLayout))
  ]);

  return sourcePoints.length >= 4 ? sourcePoints : null;
};

const extendBefore = (first, second) => ({
  x: first.x + (first.x - second.x),
  y: first.y + (first.y - second.y)
});

const extendAfter = (last, previous) => ({
  x: last.x + (last.x - previous.x),
  y: last.y + (last.y - previous.y)
});

const getCatmullTime = (previousTime, p0, p1, alpha) =>
  previousTime + Math.max(Math.pow(distanceBetweenPoints(p0, p1), alpha), 0.0001);

const interpolateByTime = (p0, p1, t0, t1, t) => {
  const denominator = t1 - t0;
  if (Math.abs(denominator) < 0.0001) {
    return normalizePoint(p1);
  }
  const a = (t1 - t) / denominator;
  const b = (t - t0) / denominator;
  return {
    x: a * p0.x + b * p1.x,
    y: a * p0.y + b * p1.y
  };
};

const centripetalCatmullRomInterpolate = (points, samplesPerSegment = 18, alpha = 0.5) => {
  const cleanPoints = removeConsecutiveDuplicatePoints(points || []);
  if (cleanPoints.length < 4) {
    return cleanPoints;
  }

  const safeSamples = Math.round(clamp(Number(samplesPerSegment) || 18, 6, 36));
  const safeAlpha = clamp(Number(alpha) || 0.5, 0.25, 1);
  const extendedPoints = [
    extendBefore(cleanPoints[0], cleanPoints[1]),
    ...cleanPoints,
    extendAfter(cleanPoints[cleanPoints.length - 1], cleanPoints[cleanPoints.length - 2])
  ].map((point) => normalizePoint(point));
  const samples = [normalizePoint(cleanPoints[0])];

  for (let index = 0; index < extendedPoints.length - 3; index += 1) {
    const p0 = extendedPoints[index];
    const p1 = extendedPoints[index + 1];
    const p2 = extendedPoints[index + 2];
    const p3 = extendedPoints[index + 3];
    const t0 = 0;
    const t1 = getCatmullTime(t0, p0, p1, safeAlpha);
    const t2 = getCatmullTime(t1, p1, p2, safeAlpha);
    const t3 = getCatmullTime(t2, p2, p3, safeAlpha);

    if (![t1, t2, t3].every(Number.isFinite) || t2 <= t1) {
      return cleanPoints;
    }

    for (let step = 1; step <= safeSamples; step += 1) {
      const t = t1 + (t2 - t1) * (step / safeSamples);
      const a1 = interpolateByTime(p0, p1, t0, t1, t);
      const a2 = interpolateByTime(p1, p2, t1, t2, t);
      const a3 = interpolateByTime(p2, p3, t2, t3, t);
      const b1 = interpolateByTime(a1, a2, t0, t2, t);
      const b2 = interpolateByTime(a2, a3, t1, t3, t);
      const point = normalizePoint(interpolateByTime(b1, b2, t1, t2, t));
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
        samples.push(point);
      }
    }
  }

  const smoothed = removeConsecutiveDuplicatePoints(samples);
  if (!smoothed.length) {
    return cleanPoints;
  }
  smoothed[0] = normalizePoint(cleanPoints[0]);
  smoothed[smoothed.length - 1] = normalizePoint(cleanPoints[cleanPoints.length - 1]);
  return smoothed;
};

const buildBoundaryConnectorPathD = (sourcePoints, connection) => {
  const smoothPoints = centripetalCatmullRomInterpolate(
    sourcePoints,
    connection.samplesPerSegment || 18,
    connection.alpha || 0.5
  );
  return {
    d: buildDensePolylinePathD(smoothPoints),
    smoothPoints
  };
};

const getBoundaryConnectorDebugData = () => {
  const layouts = getAreaLayouts(getOrderedAreas());
  return Object.values(getBoundaryConnections()).map((connection) => {
    const sourcePoints = buildBoundaryConnectorSourcePoints(connection, layouts) || [];
    const { d, smoothPoints } = sourcePoints.length >= 4
      ? buildBoundaryConnectorPathD(sourcePoints, connection)
      : { d: "", smoothPoints: [] };
    return {
      ...connection,
      engine: "boundary-visual-connector",
      sourcePointCount: sourcePoints.length,
      smoothPointCount: smoothPoints.length,
      sourcePoints,
      smoothPoints,
      finalSvgPath: d
    };
  });
};

const getRoughLocalPointsForArea = (area) => {
  if (area.path.mode === "freehand") {
    if (area.path.rawPoints?.length >= 3) {
      return area.path.rawPoints.map((point) => normalizePoint(point));
    }
    if (area.path.resampledPoints?.length >= 3) {
      return area.path.resampledPoints.map((point) => normalizePoint(point));
    }
    if (area.path.smoothPoints?.length >= 3) {
      return area.path.smoothPoints.map((point) => normalizePoint(point));
    }
  }

  return pointsFromBezierAnchors(area.path.points || [], 18);
};

const findNearestPoint = (points, target) => points.reduce((nearest, point) => {
  const distance = distanceBetweenPoints(point, target);
  if (!nearest || distance < nearest.distance) {
    return { point, distance };
  }
  return nearest;
}, null);

const getDeviationStats = (rawPoints, finalSamples) => {
  if (!rawPoints.length || !finalSamples.length) {
    return {
      averageRawToFinalDeviation: 0,
      maxRawToFinalDeviation: 0
    };
  }

  const distances = rawPoints.map((point) => findNearestPoint(finalSamples, point)?.distance || 0);
  return {
    averageRawToFinalDeviation: Math.round(distances.reduce((total, distance) => total + distance, 0) / distances.length),
    maxRawToFinalDeviation: Math.round(Math.max(...distances))
  };
};

const buildFreehandPathD = (points, smoothing = DEFAULT_SMOOTHING) => {
  const normalizedSmoothing = normalizeSmoothing(smoothing);
  if (points.length < 3) {
    return points.length ? `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}` : "";
  }
  const processed = generateSimpleStrongSmoothPath(points, normalizedSmoothing);
  return processed?.d || buildDensePolylinePathD(points);
};

const getSimpleSmoothDerivedSettings = (settings) => {
  const smoothStrength = settings.smoothStrength;
  const gaussianRadius = Math.round(clamp(1 + smoothStrength / 12, 1, 10));
  const gaussianSigma = Math.max(1, gaussianRadius / 2.1);
  const gaussianPasses = Math.round(clamp(1 + Math.floor(smoothStrength / 22), 1, 7));
  const catmullSamplesPerSegment = Math.round(clamp(
    settings.catmullSamplesPerSegment || 8 + Math.floor(smoothStrength / 8),
    6,
    30
  ));
  return {
    gaussianRadius,
    gaussianSigma,
    gaussianPasses,
    catmullSamplesPerSegment
  };
};

const generateSimpleStrongSmoothPath = (rawPoints, smoothing = DEFAULT_SMOOTHING) => {
  const settings = normalizeSmoothing(smoothing);
  const sourcePoints = removeConsecutiveDuplicatePoints(rawPoints || []);
  if (sourcePoints.length < 2) {
    return null;
  }

  const resampledPoints = resamplePointsByDistance(sourcePoints, settings.smoothSpacing);
  const derived = getSimpleSmoothDerivedSettings(settings);
  const smoothedControlPoints = gaussianSmoothPoints(
    resampledPoints,
    derived.gaussianRadius,
    derived.gaussianSigma,
    derived.gaussianPasses
  );
  const finalSmoothPoints = catmullRomInterpolate(
    smoothedControlPoints,
    derived.catmullSamplesPerSegment
  );
  const d = buildDensePolylinePathD(finalSmoothPoints);
  const deviationStats = getDeviationStats(sourcePoints, finalSmoothPoints);
  const rawLength = Math.round(getPolylineLength(sourcePoints));
  const finalLength = Math.round(getPolylineLength(finalSmoothPoints));

  return {
    engine: SIMPLE_SMOOTH_ENGINE,
    rawPoints: sourcePoints,
    filteredPoints: sourcePoints,
    resampledPoints,
    smoothedControlPoints,
    smoothPoints: finalSmoothPoints,
    finalSmoothPoints,
    finalSplinePoints: finalSmoothPoints,
    finalSvgPath: d,
    d,
    simpleSmoothSettings: settings,
    diagnostics: {
      engine: SIMPLE_SMOOTH_ENGINE,
      rawPointCount: sourcePoints.length,
      filteredPointCount: sourcePoints.length,
      resampledPointCount: resampledPoints.length,
      smoothedControlPointCount: smoothedControlPoints.length,
      finalPointCount: finalSmoothPoints.length,
      finalSamplePointCount: finalSmoothPoints.length,
      rawLength,
      finalLength,
      smoothStrength: settings.smoothStrength,
      smoothSpacing: settings.smoothSpacing,
      catmullSamplesPerSegment: derived.catmullSamplesPerSegment,
      gaussianRadius: derived.gaussianRadius,
      gaussianSigma: Number(derived.gaussianSigma.toFixed(2)),
      gaussianPasses: derived.gaussianPasses,
      ...deviationStats
    }
  };
};

const processRawFreehandPoints = (rawPoints, smoothing = DEFAULT_SMOOTHING, options = {}) => {
  if (rawPoints.length < 3) {
    return null;
  }

  const normalizedSmoothing = normalizeSmoothing(smoothing);
  const processed = generateSimpleStrongSmoothPath(rawPoints, normalizedSmoothing);
  if (!processed) {
    return null;
  }
  const diagnostics = processed.diagnostics;

  if (options.log) {
    logHomepage("Generated journey curve with simple strong smoothing.", {
      ...diagnostics,
      smoothing: normalizedSmoothing
    });
  }

  return {
    rawPoints: processed.rawPoints,
    filteredPoints: processed.filteredPoints,
    resampledPoints: processed.resampledPoints,
    smoothedControlPoints: processed.smoothedControlPoints,
        smoothPoints: processed.smoothPoints,
    finalSmoothPoints: processed.finalSmoothPoints,
    finalSplinePoints: processed.finalSplinePoints,
    finalSvgPath: processed.finalSvgPath,
    simpleSmoothSettings: normalizedSmoothing,
    boundaryDiagnostics: [],
    diagnostics,
    d: processed.d
  };
};

const getRenderablePathPoints = (area) => {
  if (area.path.mode === "freehand" && area.path.smoothPoints?.length >= 2) {
    return area.path.smoothPoints.map((point) => normalizePoint(point));
  }

  return pointsFromBezierAnchors(area.path.points || [], 14);
};

const setCurveDebugData = (area, processed, boundaryDiagnostics = []) => {
  if (!area || !processed) {
    return;
  }

  const debugData = {
    areaId: area.id,
    areaTitle: area.title,
    generatedAt: new Date().toISOString(),
    rawPointerPoints: processed.rawPoints || [],
    filteredPoints: processed.filteredPoints || [],
    resampledPoints: processed.resampledPoints || [],
    smoothedControlPoints: processed.smoothedControlPoints || [],
    finalSmoothPoints: processed.finalSmoothPoints || processed.smoothPoints || [],
    finalSplinePoints: processed.finalSplinePoints || processed.smoothPoints || [],
    finalSvgPath: processed.finalSvgPath || processed.d || "",
    engine: SIMPLE_SMOOTH_ENGINE,
    simpleSmoothSettings: normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing),
    smoothingSettings: normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing),
    boundaryDiagnostics,
    diagnostics: processed.diagnostics || area.path.simpleSmoothDiagnostics || {}
  };

  curveDebugDataByArea.set(area.id, debugData);
};

const applyProcessedFreehandPath = (area, processed, boundaryDiagnostics = []) => {
  area.path.mode = "freehand";
  area.path.rawPoints = processed.rawPoints || [];
  area.path.filteredPoints = processed.filteredPoints || [];
  area.path.resampledPoints = processed.resampledPoints || [];
  area.path.smoothedControlPoints = processed.smoothedControlPoints || [];
  area.path.smoothPoints = processed.smoothPoints || processed.finalSplinePoints || [];
  area.path.finalSmoothPoints = processed.finalSmoothPoints || area.path.smoothPoints;
  area.path.finalSplinePoints = processed.finalSplinePoints || area.path.smoothPoints;
  area.path.finalSvgPath = processed.finalSvgPath || processed.d;
  area.path.simpleSmooth = normalizeSmoothing(processed.simpleSmoothSettings || area.path.simpleSmooth || area.path.smoothing);
  area.path.boundaryDiagnostics = boundaryDiagnostics;
  area.path.simpleSmoothDiagnostics = processed.diagnostics || area.path.simpleSmoothDiagnostics || {};
  area.path.d = processed.d || area.path.finalSvgPath || "";
  setCurveDebugData(area, processed, boundaryDiagnostics);
};

const rebuildAreaPathData = (area) => {
  area.path.simpleSmooth = normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing);
  area.path.smoothing = area.path.simpleSmooth;
  area.path.viewBox = `0 0 ${SVG_WIDTH} ${area.height}`;

  if (area.path.mode === "freehand") {
    const source = area.path.rawPoints?.length >= 3
      ? area.path.rawPoints
      : area.path.smoothPoints || [];
    const processed = processRawFreehandPoints(source, area.path.simpleSmooth);
    if (processed?.smoothPoints?.length >= 3) {
      applyProcessedFreehandPath(area, processed, area.path.boundaryDiagnostics || []);
    } else {
      area.path.smoothPoints = (area.path.smoothPoints || []).map((point) => normalizePoint(point));
      area.path.d = buildFreehandPathD(area.path.smoothPoints, area.path.smoothing);
    }
    return;
  }

  area.path.d = buildPathD(area.path.points || []);
};

const setAreaPathBoundaryPoint = (area, boundary, point) => {
  const safePoint = normalizePoint(point);

  if (area.path.mode === "freehand" && area.path.smoothPoints?.length >= 2) {
    if (area.path.rawPoints?.length >= 2) {
      const rawTargetIndex = boundary === "start" ? 0 : area.path.rawPoints.length - 1;
      area.path.rawPoints[rawTargetIndex] = safePoint;
      const processed = processRawFreehandPoints(area.path.rawPoints, area.path.simpleSmooth || area.path.smoothing);
      if (processed) {
        applyProcessedFreehandPath(area, processed, area.path.boundaryDiagnostics || []);
      }
      return true;
    }

    const points = area.path.smoothPoints.map((item) => normalizePoint(item));
    const targetIndex = boundary === "start" ? 0 : points.length - 1;
    points[targetIndex] = safePoint;
    area.path.smoothPoints = points;
    area.path.finalSmoothPoints = points;
    area.path.finalSplinePoints = points;
    area.path.finalSvgPath = buildDensePolylinePathD(points);
    area.path.d = area.path.finalSvgPath;
    return true;
  }

  const anchors = area.path.points || [];
  if (!anchors.length) {
    return false;
  }

  const targetIndex = boundary === "start" ? 0 : anchors.length - 1;
  anchors[targetIndex].x = safePoint.x;
  anchors[targetIndex].y = safePoint.y;
  area.path.d = buildPathD(anchors);
  return true;
};

const applySimpleStrongSmoothingToAreas = (areas, reason = "render") => {
  const layouts = getAreaLayouts(areas);
  const perAreaFinalPaths = {};
  const perAreaDiagnostics = {};
  const boundaryDiagnostics = [];

  layouts.forEach((layout) => {
    const area = layout.area;
    rebuildAreaPathData(area);
  });

  for (let index = 0; index < layouts.length - 1; index += 1) {
    const previousArea = layouts[index].area;
    const nextArea = layouts[index + 1].area;
    const previousPoints = getRenderablePathPoints(previousArea);
    const nextPoints = getRenderablePathPoints(nextArea);
    if (!previousPoints.length || !nextPoints.length) {
      continue;
    }

    const previousEndBefore = previousPoints[previousPoints.length - 1];
    const nextStartBefore = nextPoints[0];
    const sharedX = Math.round(clamp((previousEndBefore.x + nextStartBefore.x) / 2, 0, SVG_WIDTH));
    const previousConnection = { x: sharedX, y: previousArea.height };
    const nextConnection = { x: sharedX, y: 0 };
    const endpointGapBefore = Math.round(distanceBetweenPoints(
      localToGlobalPoint(previousEndBefore, layouts[index]),
      localToGlobalPoint(nextStartBefore, layouts[index + 1])
    ));

    setAreaPathBoundaryPoint(previousArea, "end", previousConnection);
    setAreaPathBoundaryPoint(nextArea, "start", nextConnection);

    const previousAfter = getRenderablePathPoints(previousArea).at(-1) || previousConnection;
    const nextAfter = getRenderablePathPoints(nextArea)[0] || nextConnection;
    const endpointGapAfter = Math.round(distanceBetweenPoints(
      localToGlobalPoint(previousAfter, layouts[index]),
      localToGlobalPoint(nextAfter, layouts[index + 1])
    ));

    boundaryDiagnostics.push({
      previousAreaId: previousArea.id,
      nextAreaId: nextArea.id,
      endpointGapBefore,
      endpointGapAfter,
      tangentAngleDifferenceBefore: null,
      tangentAngleDifferenceAfter: null,
      tangentImprovementDeg: null,
      sharedConnectionPoint: {
        x: sharedX,
        previousY: previousArea.height,
        nextY: 0
      },
      boundaryTangentLimitedByShapePreservation: false
    });
  }

  layouts.forEach((layout) => {
    const localBoundaryDiagnostics = boundaryDiagnostics.filter(
      (diagnostic) =>
        diagnostic.previousAreaId === layout.area.id ||
        diagnostic.nextAreaId === layout.area.id
    );
    layout.area.path.boundaryDiagnostics = localBoundaryDiagnostics;
    setCurveDebugData(layout.area, {
      rawPoints: layout.area.path.rawPoints || [],
      filteredPoints: layout.area.path.filteredPoints || [],
      resampledPoints: layout.area.path.resampledPoints || [],
      smoothedControlPoints: layout.area.path.smoothedControlPoints || [],
      smoothPoints: layout.area.path.smoothPoints || [],
      finalSmoothPoints: layout.area.path.finalSmoothPoints || layout.area.path.smoothPoints || [],
      finalSplinePoints: layout.area.path.finalSplinePoints || layout.area.path.smoothPoints || [],
      finalSvgPath: layout.area.path.finalSvgPath || layout.area.path.d || "",
      d: layout.area.path.d || "",
      simpleSmoothSettings: layout.area.path.simpleSmooth,
      diagnostics: layout.area.path.simpleSmoothDiagnostics || {}
    }, localBoundaryDiagnostics);
    perAreaFinalPaths[layout.area.id] = layout.area.path.d;
    perAreaDiagnostics[layout.area.id] = layout.area.path.simpleSmoothDiagnostics || {};
  });

  globalCurveDebugData = {
    generatedAt: new Date().toISOString(),
    reason,
    engine: SIMPLE_SMOOTH_ENGINE,
    globalRawRoutePoints: [],
    perAreaFinalPaths,
    perAreaDiagnostics,
    boundaryDiagnostics,
    smoothingSettings: normalizeSmoothing(layouts[0]?.area.path.simpleSmooth || layouts[0]?.area.path.smoothing),
    debugMetrics: {
      engine: SIMPLE_SMOOTH_ENGINE,
      areaCount: layouts.length,
      boundaryCount: boundaryDiagnostics.length
    }
  };

  logHomepage("Applied simple strong smoothing to journey areas.", {
    reason,
    areaCount: layouts.length,
    boundaryCount: boundaryDiagnostics.length
  });
};

const alignAdjacentAreaPaths = (areas, reason = "render") => {
  applySimpleStrongSmoothingToAreas(areas, reason);
};

const getAreaPathElement = (areaId) =>
  document.querySelector(`.area-path[data-area-id="${areaId}"] .area-path__main`);

const samplePath = (area, sampleCount = 240) => {
  const pathElement = typeof document !== "undefined" ? getAreaPathElement(area.id) : null;
  if (pathElement?.getTotalLength) {
    try {
      const totalLength = pathElement.getTotalLength();
      if (Number.isFinite(totalLength) && totalLength > 0) {
        return Array.from({ length: sampleCount + 1 }, (_, index) => {
          const length = (totalLength * index) / sampleCount;
          const point = pathElement.getPointAtLength(length);
          return {
            t: index / sampleCount,
            x: point.x,
            y: point.y,
            length
          };
        });
      }
    } catch (error) {
      logHomepage("Path DOM sampling failed; falling back to data sampling.", {
        areaId: area.id,
        error: error.message
      });
    }
  }

  const basePoints = getBasePathPoints(area);
  if (basePoints.length < 2) {
    return [{ t: 0, x: 500, y: Math.round(area.height / 2), length: 0 }];
  }

  let totalLength = 0;
  const samples = basePoints.map((point, index) => {
    if (index > 0) {
      totalLength += distanceBetweenPoints(basePoints[index - 1], point);
    }
    return { ...point, length: totalLength };
  });

  return samples.map((sample) => ({
    ...sample,
    t: totalLength ? sample.length / totalLength : 0
  }));
};

const getPointAtPathT = (area, pathT) => {
  const samples = samplePath(area);
  const t = clamp(Number(pathT) || 0, 0, 1);

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (current.t >= t) {
      const span = current.t - previous.t || 1;
      const localT = (t - previous.t) / span;
      return {
        x: Math.round(previous.x + (current.x - previous.x) * localT),
        y: Math.round(previous.y + (current.y - previous.y) * localT)
      };
    }
  }

  const last = samples[samples.length - 1];
  return { x: Math.round(last.x), y: Math.round(last.y) };
};

const getNearestPathT = (area, point) => {
  const samples = samplePath(area);
  let nearest = samples[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  samples.forEach((sample) => {
    const distance = distanceBetweenPoints(sample, point);
    if (distance < nearestDistance) {
      nearest = sample;
      nearestDistance = distance;
    }
  });

  return {
    pathT: clamp(nearest.t, 0, 1),
    distance: nearestDistance,
    point: { x: Math.round(nearest.x), y: Math.round(nearest.y) }
  };
};

const migrateAreaPath = (area) => {
  area.path.mode = area.path.mode || "bezier";
  area.path.smoothing = { ...DEFAULT_SMOOTHING, ...(area.path.smoothing || {}) };
  area.path.rawPoints = Array.isArray(area.path.rawPoints)
    ? area.path.rawPoints
    : pointsFromBezierAnchors(area.path.points || [], 10);
  area.path.smoothPoints = Array.isArray(area.path.smoothPoints)
    ? area.path.smoothPoints
    : pointsFromBezierAnchors(area.path.points || [], 10);
  area.path.d = area.path.d || (
    area.path.mode === "freehand"
      ? buildFreehandPathD(area.path.smoothPoints, area.path.smoothing)
      : buildPathD(area.path.points || [])
  );
};

const migrateAreaNodes = (area) => {
  area.nodes.forEach((node) => {
    node.anchorMode = node.anchorMode || "path";
    if (typeof node.pathT !== "number") {
      if (typeof node.x === "number" && typeof node.y === "number") {
        node.pathT = getNearestPathT(area, { x: node.x, y: node.y }).pathT;
      } else {
        node.anchorMode = "free";
        node.pathT = 0.5;
      }
    }
    if (node.anchorMode === "path") {
      const point = getPointAtPathT(area, node.pathT);
      node.x = point.x;
      node.y = point.y;
    }
  });
};

const createSvgElement = (tagName, attributes = {}) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
};

const getSvgPoint = (svg, event) => {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * viewBox.width),
    y: Math.round(((event.clientY - rect.top) / rect.height) * viewBox.height)
  };
};

const createPlaceholderImage = () => {
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-image";
  placeholder.textContent = "Placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  return placeholder;
};

const setTimelineView = (view) => {
  if (!["overview", "details"].includes(view)) {
    logHomepage("Timeline view update skipped.", { view });
    return;
  }

  editorState.view = view;
  const root = document.querySelector(".timeline-home");
  if (root) {
    root.dataset.view = view;
  }

  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.viewButton === view));
  });

  logHomepage("Timeline view changed.", {
    view,
    editorMode: editorState.mode
  });
};

const setEditorMode = (mode) => {
  editorState.mode = mode;
  const root = document.querySelector(".timeline-home");
  const toggle = document.querySelector("[data-editor-toggle]");

  if (root) {
    root.dataset.editorMode = mode;
    root.dataset.activeTool = editorState.activeTool || "select";
  }
  if (toggle) {
    toggle.textContent = mode === "edit" ? "退出编辑" : "编辑主页";
    toggle.setAttribute("aria-pressed", String(mode === "edit"));
  }

  if (mode !== "edit") {
    uiState = createDefaultUiState();
    editorState.activeTool = "select";
  }
  closeEventPopover();
  renderTimeline();
  renderEditorPanel();
  logHomepage("Homepage editor mode changed.", { mode });
};

const renderHero = () => {
  const hero = document.querySelector(".timeline-hero");
  if (!hero) {
    return;
  }

  const copy = hero.querySelector(".timeline-hero__copy");
  const eyebrow = hero.querySelector(".timeline-eyebrow");
  const title = hero.querySelector("#page-title");
  const heroData = {
    colorA: "#fffdf8",
    colorB: "#fbf8f1",
    height: 340,
    align: "center",
    ...editorState.hero
  };

  if (eyebrow) {
    eyebrow.textContent = heroData.eyebrow || "Hello, World!";
  }
  if (title) {
    title.textContent = heroData.title || "A simple curved path timeline prototype.";
  }
  hero.style.setProperty("--hero-color-a", heroData.colorA);
  hero.style.setProperty("--hero-color-b", heroData.colorB);
  hero.style.setProperty("--hero-height", `${heroData.height}px`);
  if (copy) {
    copy.dataset.align = heroData.align || "center";
  }
};

const renderTimeline = () => {
  const container = document.querySelector("#journey-areas");
  if (!container) {
    logHomepage("Timeline render skipped because area container is missing.");
    return;
  }

  renderHero();
  alignAdjacentAreaPaths(editorState.areas, "render");
  const root = document.querySelector(".timeline-home");
  if (root) {
    root.dataset.activeTool = editorState.activeTool || "select";
  }

  container.innerHTML = "";
  const orderedAreas = getOrderedAreas();
  orderedAreas.forEach((area, index) => {
    container.append(renderArea(area, index));
  });
  const connectorOverlay = renderBoundaryConnectionOverlay(getAreaLayouts(orderedAreas));
  if (connectorOverlay) {
    container.append(connectorOverlay);
  }

  setTimelineView(editorState.view || "overview");
  logHomepage("Rendered editable timeline.", {
    areaCount: editorState.areas.length,
    nodeCount: editorState.areas.reduce((total, area) => total + area.nodes.length, 0),
    mode: editorState.mode
  });
};

const renderBoundaryConnectionOverlay = (layouts) => {
  const enabledConnections = Object.values(getBoundaryConnections()).filter((connection) => connection.enabled);
  if (!enabledConnections.length || !layouts.length) {
    return null;
  }

  const totalHeight = layouts[layouts.length - 1].bottom;
  const svg = createSvgElement("svg", {
    class: "journey-boundary-connector-layer",
    viewBox: `0 0 ${SVG_WIDTH} ${totalHeight}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    focusable: "false"
  });
  svg.style.height = `${totalHeight}px`;

  enabledConnections.forEach((connection) => {
    const sourcePoints = buildBoundaryConnectorSourcePoints(connection, layouts);
    if (!sourcePoints) {
      logHomepage("Boundary connector skipped because source points are insufficient.", {
        connectionId: connection.id
      });
      return;
    }

    const fromArea = getAreaById(connection.fromAreaId);
    const { d, smoothPoints } = buildBoundaryConnectorPathD(sourcePoints, connection);
    if (!d) {
      logHomepage("Boundary connector skipped because no path data was generated.", {
        connectionId: connection.id
      });
      return;
    }

    const strokeWidth = Number(fromArea?.path?.strokeWidth) || 34;
    const shadowColor = fromArea?.path?.shadowColor || "rgba(20, 40, 60, 0.12)";
    const strokeColor = fromArea?.path?.strokeColor || "#ffffff";
    svg.append(
      createSvgElement("path", {
        class: "journey-boundary-connector-shadow",
        d,
        stroke: shadowColor,
        "stroke-width": String(strokeWidth + 10)
      }),
      createSvgElement("path", {
        class: "journey-boundary-connector-road",
        d,
        stroke: strokeColor,
        "stroke-width": String(strokeWidth),
        "data-boundary-connection-id": connection.id
      })
    );

    if (editorState.mode === "edit" && uiState.debugOverlay && uiState.debugLayers.anchors) {
      appendDebugPoints(svg, sourcePoints, "curve-debug__resampled", 5);
      appendDebugPoints(svg, smoothPoints, "curve-debug__control-point", 3);
    }
  });

  return svg.childNodes.length ? svg : null;
};

const renderArea = (area, index) => {
  const section = document.createElement("section");
  section.className = `journey-area pattern-${area.background.pattern}`;
  section.dataset.areaId = area.id;
  section.dataset.theme = area.theme;
  section.dataset.selected = String(editorState.selectedAreaId === area.id);
  section.style.setProperty("--area-height", `${area.height}px`);
  section.style.setProperty("--area-mobile-height", `${area.mobileHeight || area.height}px`);
  section.style.setProperty("--area-copy-offset", index % 2 === 0 ? "0" : "52%");
  section.style.setProperty("--area-color-a", area.background.colorA);
  section.style.setProperty("--area-color-b", area.background.colorB);
  section.style.setProperty("--major-node-color", area.areaStyles.majorNodeColor);
  section.style.setProperty("--minor-node-color", area.areaStyles.minorNodeColor);

  section.append(renderAreaCopy(area), renderAreaSvg(area), renderAreaNodes(area));
  if (editorState.mode === "edit") {
    section.append(renderAreaEditBadge(area));
    section.append(renderAreaResizeHandle(area));
  }

  if (editorState.mode === "edit") {
    section.addEventListener("pointerdown", (event) => {
      if (editorState.activeTool !== "freehand" || editorState.selectedAreaId !== area.id) {
        return;
      }
      if (event.target.closest(".journey-event") || event.target.closest(".curve-handle")) {
        return;
      }
      beginFreehandDrawing(event, section, area);
    });

    section.addEventListener("click", (event) => {
      if (event.target.closest(".journey-event") || event.target.closest(".curve-handle") || event.target.closest(".area-resize-handle")) {
        return;
      }
      editorState.selectedAreaId = area.id;
      if (editorState.activeTool === "add-node" && editorState.addNodeType) {
        const point = getAreaPointFromPointer(event, section, area);
        addNodeAt(area.id, point.x, point.y, editorState.addNodeType, "path");
        return;
      }
      renderEditorPanel();
    });

    section.addEventListener("contextmenu", (event) => {
      if (event.target.closest(".journey-event") || event.target.closest(".area-resize-handle")) {
        return;
      }
      event.preventDefault();
      editorState.selectedAreaId = area.id;
      const point = getAreaPointFromPointer(event, section, area);
      const nearest = getNearestPathT(area, point);
      uiState.contextMenu = {
        type: "curve",
        areaId: area.id,
        x: event.clientX,
        y: event.clientY,
        pathT: nearest.pathT,
        distance: nearest.distance
      };
      uiState.popover = null;
      renderTimeline();
      renderEditorPanel();
      logHomepage("Opened contextual curve menu.", { areaId: area.id, pathT: nearest.pathT });
    });
  }

  return section;
};

const renderAreaCopy = (area) => {
  const copy = document.createElement("div");
  copy.className = "journey-area__copy";
  copy.innerHTML = `
    <p class="journey-area__index">Area ${String(area.order).padStart(2, "0")}</p>
    <h2>${area.title}</h2>
    <p>${area.description}</p>
  `;
  return copy;
};

const renderAreaSvg = (area) => {
  const svg = createSvgElement("svg", {
    class: "area-path",
    viewBox: `0 0 ${SVG_WIDTH} ${area.height}`,
    preserveAspectRatio: "none",
    "data-area-id": area.id,
    "aria-hidden": "true",
    focusable: "false"
  });

  const d = area.path.mode === "freehand"
    ? area.path.d || buildFreehandPathD(area.path.smoothPoints || [], area.path.smoothing)
    : buildPathD(area.path.points);
  const shadow = createSvgElement("path", {
    class: "area-path__shadow",
    d,
    stroke: area.path.shadowColor,
    "stroke-width": String(area.path.strokeWidth + 10),
    "stroke-linecap": area.path.lineCap,
    "stroke-dasharray": area.path.lineStyle === "dashed" ? "28 20" : ""
  });
  const main = createSvgElement("path", {
    class: "area-path__main",
    d,
    stroke: area.path.strokeColor,
    "stroke-width": String(area.path.strokeWidth),
    "stroke-linecap": area.path.lineCap,
    "stroke-dasharray": area.path.lineStyle === "dashed" ? "28 20" : ""
  });

  svg.append(shadow, main);

  if (editorState.mode === "edit" && uiState.debugOverlay) {
    renderCurveDebugOverlay(svg, area);
  }

  if (editorState.mode === "edit" && editorState.activeTool === "freehand" && editorState.selectedAreaId === area.id) {
    svg.append(createSvgElement("path", {
      class: "freehand-preview-path",
      d: editorState.drawingPreviewPoints.length
        ? `M ${editorState.drawingPreviewPoints.map((point) => `${point.x} ${point.y}`).join(" L ")}`
        : ""
    }));
  }

  return svg;
};

const pointsToPolyline = (points) =>
  points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" ");

const appendDebugPolyline = (svg, points, className) => {
  if (!points?.length) {
    return;
  }

  svg.append(createSvgElement("polyline", {
    class: className,
    points: pointsToPolyline(points)
  }));
};

const appendDebugPoints = (svg, points, className, radius = 5) => {
  if (!points?.length) {
    return;
  }

  points.forEach((point) => {
    svg.append(createSvgElement("circle", {
      class: className,
      cx: String(point.x),
      cy: String(point.y),
      r: String(radius)
    }));
  });
};

const appendDebugTangents = (svg, area) => {
  const points = area.path.smoothedControlPoints?.length >= 2
    ? area.path.smoothedControlPoints
    : area.path.finalSmoothPoints || area.path.smoothPoints || [];
  if (points.length < 2) {
    return;
  }

  const pairs = [
    [points[0], points[1]],
    [points[points.length - 2], points[points.length - 1]]
  ];
  pairs.forEach(([start, end]) => {
    const vector = { x: end.x - start.x, y: end.y - start.y };
    const length = Math.hypot(vector.x, vector.y) || 1;
    const tangentLength = Math.min(110, length * 0.55);
    svg.append(createSvgElement("line", {
      class: "curve-debug__tangent",
      x1: String(start.x),
      y1: String(start.y),
      x2: String(Math.round(start.x + (vector.x / length) * tangentLength)),
      y2: String(Math.round(start.y + (vector.y / length) * tangentLength))
    }));
  });
};

const renderCurveDebugOverlay = (svg, area) => {
  if (area.id !== editorState.selectedAreaId) {
    return;
  }

  const debugData = curveDebugDataByArea.get(area.id);
  const rawPoints = debugData?.rawPointerPoints || area.path.rawPoints || [];
  const filteredPoints = debugData?.filteredPoints || area.path.filteredPoints || [];
  const resampledPoints = debugData?.resampledPoints || area.path.resampledPoints || [];
  const smoothedControlPoints = debugData?.smoothedControlPoints || area.path.smoothedControlPoints || [];
  const finalSplinePoints = debugData?.finalSmoothPoints || debugData?.finalSplinePoints || area.path.finalSmoothPoints || area.path.finalSplinePoints || [];

  if (uiState.debugLayers.raw) {
    appendDebugPolyline(svg, rawPoints, "curve-debug__raw");
    appendDebugPoints(svg, filteredPoints, "curve-debug__filtered", 3);
    appendDebugPoints(svg, resampledPoints, "curve-debug__resampled", 3);
  }
  if (uiState.debugLayers.final) {
    appendDebugPolyline(svg, finalSplinePoints, "curve-debug__final-samples");
  }
  if (uiState.debugLayers.anchors) {
    appendDebugPoints(svg, smoothedControlPoints, "curve-debug__control-point", 5);
  }
  if (uiState.debugLayers.tangents) {
    appendDebugTangents(svg, area);
  }
};

const renderCurveHandles = (svg, area) => {
  area.path.points.forEach((point) => {
    if (point.cpIn) {
      appendControlLine(svg, point, point.cpIn);
      appendCurveHandle(svg, area, point, "cpIn", point.cpIn);
    }
    if (point.cpOut) {
      appendControlLine(svg, point, point.cpOut);
      appendCurveHandle(svg, area, point, "cpOut", point.cpOut);
    }
    appendCurveHandle(svg, area, point, "anchor", point);
  });
};

const appendControlLine = (svg, point, handle) => {
  svg.append(createSvgElement("line", {
    class: "curve-control-line",
    x1: point.x,
    y1: point.y,
    x2: handle.x,
    y2: handle.y
  }));
};

const appendCurveHandle = (svg, area, point, handleType, handle) => {
  const circle = createSvgElement("circle", {
    class: `curve-handle curve-handle--${handleType}`,
    cx: handle.x,
    cy: handle.y,
    r: handleType === "anchor" ? 11 : 8,
    tabindex: "0",
    "data-area-id": area.id,
    "data-point-id": point.id,
    "data-handle-type": handleType
  });

  if (
    editorState.selectedAreaId === area.id &&
    editorState.selectedPointId === point.id &&
    editorState.selectedHandle === handleType
  ) {
    circle.classList.add("is-selected");
  }

  circle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    editorState.selectedAreaId = area.id;
    editorState.selectedPointId = point.id;
    editorState.selectedHandle = handleType;
    dragState = {
      kind: "curve",
      areaId: area.id,
      pointId: point.id,
      handleType,
      svgRect: svg.getBoundingClientRect(),
      svgWidth: SVG_WIDTH,
      svgHeight: area.height
    };
    circle.setPointerCapture(event.pointerId);
    renderEditorPanel();
    logHomepage("Started curve handle drag.", dragState);
  });

  svg.append(circle);
};

const renderAreaNodes = (area) => {
  const nodeLayer = document.createElement("div");
  nodeLayer.className = "journey-events";

  area.nodes.forEach((node) => {
    if (editorState.mode !== "edit" && editorState.view === "overview" && node.type === "minor") {
      return;
    }
    nodeLayer.append(renderNode(area, node));
  });

  return nodeLayer;
};

const renderNode = (area, node) => {
  const basePoint = node.anchorMode === "free"
    ? { x: node.x, y: node.y }
    : getPointAtPathT(area, node.pathT);
  node.x = basePoint.x;
  node.y = basePoint.y;

  const eventElement = document.createElement("article");
  eventElement.className = `journey-event journey-event--${node.type}`;
  eventElement.dataset.eventId = node.id;
  eventElement.dataset.eventType = node.type;
  eventElement.dataset.selected = String(editorState.selectedNodeId === node.id);
  eventElement.style.setProperty("--event-x", `${(basePoint.x / SVG_WIDTH) * 100}%`);
  eventElement.style.setProperty("--event-y", `${(basePoint.y / area.height) * 100}%`);
  eventElement.style.setProperty("--event-offset-x", `${node.offsetX}px`);
  eventElement.style.setProperty("--event-offset-y", `${node.offsetY}px`);
  eventElement.style.setProperty("--event-accent", node.style.color || getNodeColor(area, node));
  eventElement.dataset.side = node.cardSide || "right";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "journey-event__button";
  button.setAttribute("aria-label", `Open details for ${node.title}`);

  const dot = document.createElement("span");
  dot.className = "journey-event__dot";
  dot.setAttribute("aria-hidden", "true");

  const card = document.createElement("span");
  card.className = "journey-event__card";
  card.dataset.cardVariant = node.style.cardVariant || (node.type === "major" ? "large" : "compact");

  if (node.type === "major") {
    card.append(createPlaceholderImage());
  }

  const meta = document.createElement("span");
  meta.className = "journey-event__meta";
  meta.textContent = node.date;

  const title = document.createElement("strong");
  title.className = "journey-event__title";
  title.textContent = node.title;

  const description = document.createElement("span");
  description.className = "journey-event__description";
  description.textContent = node.description;

  card.append(meta, title, description);
  button.append(dot, card);
  eventElement.append(button);

  button.addEventListener("click", (event) => {
    if (editorState.mode === "edit") {
      event.preventDefault();
      if (uiState.lastPointerWasDrag) {
        uiState.lastPointerWasDrag = false;
        return;
      }
      selectNode(area.id, node.id, false);
      openContextPopover("node", { areaId: area.id, nodeId: node.id }, event.clientX, event.clientY);
      return;
    }
    openEventPopover(area.id, node.id);
  });

  const showNodePreview = (event) => {
    if (dragState || uiState.popover || uiState.contextMenu) {
      return;
    }
    uiState.hoverPreview = {
      areaId: area.id,
      nodeId: node.id,
      x: event.clientX + 14,
      y: event.clientY + 14
    };
    renderEditorPanel();
  };

  const hideNodePreview = () => {
    if (uiState.hoverPreview?.nodeId === node.id) {
      uiState.hoverPreview = null;
      renderEditorPanel();
    }
  };

  button.addEventListener("mouseenter", showNodePreview);
  button.addEventListener("pointerenter", showNodePreview);
  button.addEventListener("mouseleave", hideNodePreview);
  button.addEventListener("pointerleave", hideNodePreview);

  button.addEventListener("contextmenu", (event) => {
    if (editorState.mode !== "edit") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    editorState.selectedAreaId = area.id;
    editorState.selectedNodeId = node.id;
    uiState.contextMenu = {
      type: "node",
      areaId: area.id,
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY
    };
    uiState.popover = null;
    renderTimeline();
    renderEditorPanel();
    logHomepage("Opened node context menu.", { areaId: area.id, nodeId: node.id });
  });

  if (editorState.mode === "edit") {
    eventElement.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      selectNode(area.id, node.id, false);
      dragState = {
        kind: "node",
        areaId: area.id,
        nodeId: node.id,
        startX: event.clientX,
        startY: event.clientY,
        originalX: node.x,
        originalY: node.y,
        areaRect: eventElement.closest(".journey-area").getBoundingClientRect(),
        moved: false
      };
      uiState.hoverPreview = null;
      eventElement.setPointerCapture(event.pointerId);
      logHomepage("Started node drag.", { areaId: area.id, nodeId: node.id });
    });
  }

  return eventElement;
};

const getNodeColor = (area, node) =>
  node.type === "major" ? area.areaStyles.majorNodeColor : area.areaStyles.minorNodeColor;

const selectNode = (areaId, nodeId, rerender = true) => {
  editorState.selectedAreaId = areaId;
  editorState.selectedNodeId = nodeId;
  if (rerender) {
    renderTimeline();
  }
  renderEditorPanel();
  logHomepage("Selected timeline node.", { areaId, nodeId });
};

const renderAreaEditBadge = (area) => {
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "area-edit-badge";
  badge.textContent = area.title;
  badge.addEventListener("click", (event) => {
    event.stopPropagation();
    editorState.selectedAreaId = area.id;
    openContextPopover("area", { areaId: area.id }, event.clientX, event.clientY);
  });
  return badge;
};

const renderAreaResizeHandle = (area) => {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "area-resize-handle";
  handle.title = "拖动调整区域高度";
  handle.setAttribute("aria-label", `拖动调整 ${area.title} 区域高度`);
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const areaElement = handle.closest(".journey-area");
    dragState = {
      kind: "area-resize",
      areaId: area.id,
      startY: event.clientY,
      startHeight: area.height
    };
    uiState.lastPointerWasDrag = false;
    areaElement?.setPointerCapture(event.pointerId);
    logHomepage("Started area resize.", { areaId: area.id, height: area.height });
  });
  return handle;
};

const setActiveTool = (tool) => {
  editorState.activeTool = tool;
  editorState.drawingPreviewPoints = [];
  const root = document.querySelector(".timeline-home");
  if (root) {
    root.dataset.activeTool = tool;
  }
  renderTimeline();
  renderEditorPanel();
  logHomepage("Changed homepage editor active tool.", { tool });
};

const getAreaPointFromPointer = (event, areaElement, area) => {
  const rect = areaElement.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(SVG_WIDTH, Math.round(((event.clientX - rect.left) / rect.width) * SVG_WIDTH))),
    y: Math.max(0, Math.min(area.height, Math.round(((event.clientY - rect.top) / rect.height) * area.height)))
  };
};

const beginFreehandDrawing = (event, areaElement, area) => {
  event.preventDefault();
  event.stopPropagation();
  const firstPoint = getAreaPointFromPointer(event, areaElement, area);
  editorState.selectedAreaId = area.id;
  editorState.drawingPreviewPoints = [firstPoint];
  dragState = {
    kind: "freehand",
    areaId: area.id,
    areaRect: areaElement.getBoundingClientRect(),
    areaHeight: area.height,
    pointerId: event.pointerId
  };
  areaElement.setPointerCapture(event.pointerId);
  renderTimeline();
  logHomepage("Started freehand curve drawing.", { areaId: area.id, firstPoint });
};

const finishFreehandDrawing = () => {
  if (!dragState || dragState.kind !== "freehand") {
    return;
  }

  const area = getAreaById(dragState.areaId);
  const rawPoints = editorState.drawingPreviewPoints || [];
  if (!area || rawPoints.length < 3) {
    editorState.drawingPreviewPoints = [];
    showEditorMessage("曲线无效，请重新绘制。", true);
    logHomepage("Freehand curve drawing was too short.", {
      areaId: dragState.areaId,
      pointCount: rawPoints.length
    });
    return;
  }

  const previousPath = clone(area.path);
  const smoothing = { ...DEFAULT_SMOOTHING, ...(area.path.smoothing || {}) };
  const processed = processRawFreehandPoints(rawPoints, smoothing, { log: true });
  if (!processed.d || processed.smoothPoints.length < 3) {
    area.path = previousPath;
    editorState.drawingPreviewPoints = [];
    showEditorMessage("曲线无效，请重新绘制。", true);
    logHomepage("Freehand curve processing failed; previous path preserved.", {
      areaId: area.id,
      pointCount: rawPoints.length
    });
    return;
  }

  area.path = {
    ...area.path,
    mode: "freehand",
    rawPoints: processed.rawPoints,
    smoothPoints: processed.smoothPoints,
    d: processed.d,
    smoothing
  };
  alignAdjacentAreaPaths(editorState.areas, "freehand draw");
  area.nodes.forEach((node) => {
    if (node.anchorMode === "path") {
      const point = getPointAtPathT(area, node.pathT);
      node.x = point.x;
      node.y = point.y;
    }
  });
  editorState.drawingPreviewPoints = [];
  markDirty("freehand curve drawn");
  renderTimeline();
  renderEditorPanel();
  showEditorMessage("手绘曲线已自动平滑。");
  logHomepage("Completed freehand curve drawing.", {
    areaId: area.id,
    rawPointCount: processed.rawPoints.length,
    smoothPointCount: processed.smoothPoints.length
  });
};

const resmoothCurrentAreaCurve = () => {
  const area = getSelectedArea();
  if (!area.path.rawPoints || area.path.rawPoints.length < 3) {
    showEditorMessage("当前区域没有手绘曲线数据。", true);
    logHomepage("Resmooth skipped because the current area has no raw freehand data.", { areaId: area.id });
    return;
  }

  const processed = processRawFreehandPoints(area.path.rawPoints, area.path.smoothing, { log: true });
  area.path.mode = "freehand";
  area.path.smoothPoints = processed.smoothPoints;
  area.path.d = processed.d;
  alignAdjacentAreaPaths(editorState.areas, "resmooth");
  area.nodes.forEach((node) => {
    if (node.anchorMode === "path") {
      const point = getPointAtPathT(area, node.pathT);
      node.x = point.x;
      node.y = point.y;
    }
  });
  markDirty("freehand curve resmoothed");
  renderTimeline();
  renderEditorPanel();
  showEditorMessage("已重新平滑当前区域曲线。");
  logHomepage("Resmoothed current area freehand curve.", {
    areaId: area.id,
    smoothing: area.path.smoothing
  });
};

const updatePoint = (areaId, pointId, newX, newY) => {
  const area = getAreaById(areaId);
  const point = area?.path.points.find((item) => item.id === pointId);
  if (!area || !point) {
    return;
  }

  const deltaX = newX - point.x;
  const deltaY = newY - point.y;
  point.x = Math.max(0, Math.min(SVG_WIDTH, newX));
  point.y = Math.max(0, Math.min(area.height, newY));

  if (point.cpIn) {
    point.cpIn.x += deltaX;
    point.cpIn.y += deltaY;
  }
  if (point.cpOut) {
    point.cpOut.x += deltaX;
    point.cpOut.y += deltaY;
  }
  markDirty("curve anchor moved");
};

const updateControlPoint = (areaId, pointId, handleType, newX, newY) => {
  const area = getAreaById(areaId);
  const point = area?.path.points.find((item) => item.id === pointId);
  if (!area || !point || !point[handleType]) {
    return;
  }

  point[handleType].x = Math.max(0, Math.min(SVG_WIDTH, newX));
  point[handleType].y = Math.max(0, Math.min(area.height, newY));
  markDirty("curve control handle moved");
};

const addCurvePoint = () => {
  const area = getSelectedArea();
  const previous = area.path.points[area.path.points.length - 1];
  const y = Math.min(area.height - 36, Math.max(36, previous.y - 120));
  const id = `${area.id}-a${Date.now()}`;
  const point = {
    id,
    type: "anchor",
    x: previous.x,
    y,
    cpIn: { x: Math.max(0, previous.x - 180), y: Math.max(0, y - 90) },
    cpOut: { x: Math.min(SVG_WIDTH, previous.x + 180), y: Math.min(area.height, y + 90) }
  };

  area.path.points.splice(area.path.points.length - 1, 0, point);
  editorState.selectedPointId = id;
  editorState.selectedHandle = "anchor";
  markDirty("curve point added");
  renderTimeline();
  renderEditorPanel();
  logHomepage("Added curve point.", { areaId: area.id, pointId: id });
};

const deleteSelectedCurvePoint = () => {
  const area = getSelectedArea();
  if (area.path.points.length <= 2) {
    showEditorMessage("至少保留两个曲线点。", true);
    return;
  }

  const index = area.path.points.findIndex((point) => point.id === editorState.selectedPointId);
  if (index <= 0 || index === area.path.points.length - 1) {
    showEditorMessage("请选择中间曲线点后再删除。", true);
    return;
  }

  const [removed] = area.path.points.splice(index, 1);
  editorState.selectedPointId = area.path.points[Math.max(0, index - 1)].id;
  editorState.selectedHandle = "anchor";
  markDirty("curve point deleted");
  renderTimeline();
  renderEditorPanel();
  logHomepage("Deleted curve point.", { areaId: area.id, pointId: removed.id });
};

const resetCurrentAreaCurve = () => {
  const area = getSelectedArea();
  const defaultArea = DEFAULT_HOMEPAGE_EDITOR_STATE.areas.find((item) => item.id === area.id);
  area.path = clone(defaultArea.path);
  editorState.selectedPointId = area.path.points[1]?.id || area.path.points[0].id;
  editorState.selectedHandle = "anchor";
  markDirty("curve reset");
  renderTimeline();
  renderEditorPanel();
  logHomepage("Reset current area curve.", { areaId: area.id });
};

const addNodeAt = (areaId, x, y, type, anchorMode = "path") => {
  const area = getAreaById(areaId);
  if (!area) {
    return;
  }

  const nearest = anchorMode === "path" ? getNearestPathT(area, { x, y }) : null;
  const pathPoint = nearest ? getPointAtPathT(area, nearest.pathT) : { x, y };
  const id = `${type}-${Date.now()}`;
  const color = type === "major" ? area.areaStyles.majorNodeColor : area.areaStyles.minorNodeColor;
  const node = {
    id,
    type,
    title: type === "major" ? "Major Event New" : "Minor Event New",
    date: "2020",
    description: "This is a placeholder event.",
    imageType: "placeholder",
    anchorMode: nearest ? "path" : "free",
    pathT: nearest ? nearest.pathT : 0.5,
    x: pathPoint.x,
    y: pathPoint.y,
    offsetX: type === "major" ? 110 : 70,
    offsetY: type === "major" ? -48 : -16,
    cardSide: "right",
    style: {
      color,
      icon: "dot",
      cardVariant: type === "major" ? "large" : "compact"
    }
  };

  area.nodes.push(node);
  editorState.selectedAreaId = area.id;
  editorState.selectedNodeId = id;
  markDirty("node added");
  renderTimeline();
  renderEditorPanel();
  if (nearest && nearest.distance > 80) {
    showEditorMessage("已吸附到最近的曲线路径。");
  }
  logHomepage("Added path-aware node.", {
    areaId,
    nodeId: id,
    type,
    anchorMode: node.anchorMode,
    pathT: node.pathT,
    clickPoint: { x, y },
    snappedPoint: pathPoint
  });
};

const addNodeFromPanel = (type) => {
  editorState.addNodeType = type;
  setActiveTool("add-node");
  showEditorMessage("点击曲线附近添加节点。");
  logHomepage("Entered add-node tool.", { type });
};

const deleteSelectedNode = () => {
  const selected = getNodeById(editorState.selectedNodeId);
  if (!selected) {
    showEditorMessage("请先选择节点。", true);
    return;
  }

  if (!window.confirm("确认删除这个节点？")) {
    logHomepage("Node deletion cancelled.", { nodeId: selected.node.id });
    return;
  }

  selected.area.nodes = selected.area.nodes.filter((node) => node.id !== selected.node.id);
  editorState.selectedNodeId = selected.area.nodes[0]?.id || "";
  markDirty("node deleted");
  renderTimeline();
  renderEditorPanel();
  logHomepage("Deleted node.", {
    areaId: selected.area.id,
    nodeId: selected.node.id
  });
};

const saveToLocalStorage = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(editorState, null, 2));
  editorState.dirty = false;
  updateSaveStatus("已保存");
  logHomepage("Saved editable homepage data to localStorage.", {
    storageKey: STORAGE_KEY,
    bytes: localStorage.getItem(STORAGE_KEY).length
  });
};

const resetExampleData = () => {
  if (!window.confirm("确认重置主页时间线示例配置？")) {
    logHomepage("Reset example data cancelled.");
    return;
  }

  if (false && !editorState.resetConfirmPending) {
    editorState.resetConfirmPending = true;
    showEditorMessage("确认重置主页时间线示例配置？再次点击重置示例。", true);
    logHomepage("Reset example data confirmation requested.");
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  editorState = clone(DEFAULT_HOMEPAGE_EDITOR_STATE);
  editorState.mode = "edit";
  markDirty("example data reset");
  renderTimeline();
  renderEditorPanel();
  setEditorMode("edit");
  showEditorMessage("已重置示例配置。");
  logHomepage("Reset editable homepage data to defaults.");
};

const exportJson = () => {
  const textarea = document.querySelector("[data-editor-field='json']");
  if (textarea) {
    textarea.value = JSON.stringify(editorState, null, 2);
  }
  showEditorMessage("JSON 已导出到文本框。");
  logHomepage("Exported editor JSON.", {
    areaCount: editorState.areas.length
  });
};

const importJson = () => {
  const textarea = document.querySelector("[data-editor-field='json']");
  try {
    const parsed = JSON.parse(textarea.value);
    editorState = sanitizeState(parsed);
    editorState.mode = "edit";
    editorState.dirty = true;
    setEditorMode("edit");
    showEditorMessage("JSON 已导入。");
    logHomepage("Imported editor JSON.", {
      areaCount: editorState.areas.length
    });
  } catch (error) {
    showEditorMessage("JSON 格式无效，无法导入。", true);
    logHomepage("JSON import failed.", { error: error.message });
  }
};

const getCurveDebugExport = () => {
  const area = getSelectedArea();
  alignAdjacentAreaPaths(editorState.areas, "debug export");
  const debugData = curveDebugDataByArea.get(area.id) || {
    areaId: area.id,
    areaTitle: area.title,
    rawPointerPoints: area.path.rawPoints || [],
    filteredPoints: area.path.filteredPoints || area.path.rawPoints || [],
    resampledPoints: area.path.resampledPoints || [],
    smoothedControlPoints: area.path.smoothedControlPoints || [],
    finalSmoothPoints: area.path.finalSmoothPoints || area.path.smoothPoints || [],
    finalSplinePoints: area.path.finalSplinePoints || area.path.smoothPoints || [],
    finalSvgPath: area.path.finalSvgPath || area.path.d || "",
    engine: SIMPLE_SMOOTH_ENGINE,
    simpleSmoothSettings: normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing),
    diagnostics: area.path.simpleSmoothDiagnostics || {},
    boundaryDiagnostics: area.path.boundaryDiagnostics || []
  };
  const stats = debugData.diagnostics || {};

  return {
    exportedAt: new Date().toISOString(),
    page: "journey.html",
    selectedAreaId: area.id,
    selectedAreaOrder: area.order,
    engine: SIMPLE_SMOOTH_ENGINE,
    rawPointerPoints: debugData.rawPointerPoints || [],
    filteredPoints: debugData.filteredPoints || [],
    resampledPoints: debugData.resampledPoints || [],
    smoothedControlPoints: debugData.smoothedControlPoints || [],
    finalSmoothPoints: debugData.finalSmoothPoints || debugData.finalSplinePoints || [],
    finalSvgPath: debugData.finalSvgPath || "",
    simpleSmoothSettings: debugData.simpleSmoothSettings || normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing),
    stats: {
      rawPointCount: stats.rawPointCount || 0,
      resampledPointCount: stats.resampledPointCount || 0,
      smoothedControlPointCount: stats.smoothedControlPointCount || 0,
      finalPointCount: stats.finalPointCount || stats.finalSamplePointCount || 0,
      rawLength: stats.rawLength || 0,
      finalLength: stats.finalLength || 0,
      averageRawToFinalDeviation: stats.averageRawToFinalDeviation || 0,
      maxRawToFinalDeviation: stats.maxRawToFinalDeviation || 0,
      gaussianRadius: stats.gaussianRadius,
      gaussianSigma: stats.gaussianSigma,
      gaussianPasses: stats.gaussianPasses
    },
    boundaryDiagnostics: debugData.boundaryDiagnostics || [],
    boundaryConnections: getBoundaryConnectorDebugData()
  };
};

const writeCurveDebugJsonToPopover = (json) => {
  const textarea = document.querySelector("[data-curve-debug-json]");
  if (textarea) {
    textarea.value = json;
  }
};

const exportCurveDebugJson = () => {
  const debugExport = getCurveDebugExport();
  const json = JSON.stringify(debugExport, null, 2);
  writeCurveDebugJsonToPopover(json);

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `journey-curve-debug-${debugExport.selectedAreaId}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showEditorMessage("曲线调试数据已导出。");
  logHomepage("Exported front-end curve debug JSON.", {
    areaId: debugExport.selectedAreaId,
    rawPointCount: debugExport.rawPointerPoints.length,
    finalPointCount: debugExport.finalSmoothPoints.length
  });
};

const copyCurveDebugJson = async () => {
  const debugExport = getCurveDebugExport();
  const json = JSON.stringify(debugExport, null, 2);
  writeCurveDebugJsonToPopover(json);

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API is unavailable.");
    }
    await navigator.clipboard.writeText(json);
    showEditorMessage("曲线调试数据已复制。");
  } catch (error) {
    showEditorMessage("无法直接复制，调试数据已显示在文本框中。", true);
    logHomepage("Curve debug clipboard copy failed.", { error: error.message });
  }
};

const getContextEditorRoot = () => {
  let root = document.querySelector("#context-editor-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "context-editor-root";
    root.className = "context-editor-root";
    document.body.append(root);
  }
  return root;
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));

const renderEditorPanel = () => {
  const root = getContextEditorRoot();
  root.innerHTML = "";
  if (editorState.mode !== "edit") {
    if (uiState.hoverPreview) {
      root.append(renderNodeHoverPreview());
    }
    return;
  }

  root.append(renderFloatingToolbar());
  if (uiState.contextMenu) {
    root.append(renderContextMenu());
  }
  if (uiState.popover) {
    root.append(renderContextPopover());
  }
  if (uiState.hoverPreview) {
    root.append(renderNodeHoverPreview());
  }
};

const renderFloatingToolbar = () => {
  const toolbar = document.createElement("div");
  toolbar.className = "context-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "主页编辑工具栏");
  toolbar.innerHTML = `
    <button type="button" data-context-action="select" aria-pressed="${editorState.activeTool === "select"}">选择</button>
    <button type="button" data-context-action="draw" aria-pressed="${editorState.activeTool === "freehand"}">手绘曲线</button>
    <button type="button" data-context-action="curve-tuning">曲线调参</button>
    <button type="button" data-context-action="debug" aria-pressed="${uiState.debugOverlay}">调试曲线</button>
    ${uiState.debugOverlay ? `
      <button type="button" data-context-action="debug-raw" aria-pressed="${uiState.debugLayers.raw}">原始手绘</button>
      <button type="button" data-context-action="debug-anchors" aria-pressed="${uiState.debugLayers.anchors}">引导锚点</button>
      <button type="button" data-context-action="debug-final" aria-pressed="${uiState.debugLayers.final}">最终拟合曲线</button>
      <button type="button" data-context-action="debug-tangents" aria-pressed="${uiState.debugLayers.tangents}">边界切线</button>
    ` : ""}
    <button type="button" data-context-action="save">保存</button>
    <button type="button" data-context-action="data">数据</button>
    <span class="context-toolbar__status" data-editor-status>${editorState.dirty ? "未保存" : "已保存"}</span>
    <button type="button" data-context-action="exit">退出编辑</button>
  `;
  toolbar.querySelectorAll("[data-context-action]").forEach((button) => {
    button.addEventListener("click", () => handleContextAction(button.dataset.contextAction));
  });
  return toolbar;
};

const handleContextAction = (action) => {
  const actions = {
    select: () => setActiveTool("select"),
    draw: () => setActiveTool(editorState.activeTool === "freehand" ? "select" : "freehand"),
    "curve-tuning": () => openContextPopover("curve", { areaId: editorState.selectedAreaId }, window.innerWidth - 360, 72),
    debug: toggleCurveDebugOverlay,
    "debug-raw": () => toggleCurveDebugLayer("raw"),
    "debug-anchors": () => toggleCurveDebugLayer("anchors"),
    "debug-final": () => toggleCurveDebugLayer("final"),
    "debug-tangents": () => toggleCurveDebugLayer("tangents"),
    save: saveToLocalStorage,
    data: () => openContextPopover("data", {}, window.innerWidth - 360, 84),
    exit: () => setEditorMode("preview")
  };
  actions[action]?.();
  logHomepage("Handled floating toolbar action.", { action });
};

const toggleCurveDebugLayer = (layer) => {
  uiState.debugLayers[layer] = !uiState.debugLayers[layer];
  renderTimeline();
  renderEditorPanel();
  showEditorMessage(
    `\u66f2\u7ebf\u8c03\u8bd5\u5c42\u5df2${uiState.debugLayers[layer] ? "\u663e\u793a" : "\u9690\u85cf"}\u3002`
  );
  logHomepage("Toggled journey curve debug layer.", {
    layer,
    enabled: uiState.debugLayers[layer]
  });
};

const toggleCurveDebugOverlay = () => {
  uiState.debugOverlay = !uiState.debugOverlay;
  renderTimeline();
  renderEditorPanel();
  showEditorMessage(
    uiState.debugOverlay
      ? "\u66f2\u7ebf\u8c03\u8bd5\u53e0\u5c42\u5df2\u5f00\u542f\u3002"
      : "\u66f2\u7ebf\u8c03\u8bd5\u53e0\u5c42\u5df2\u5173\u95ed\u3002"
  );
  logHomepage("Toggled journey curve debug overlay.", {
    enabled: uiState.debugOverlay,
    selectedAreaId: editorState.selectedAreaId
  });
};

const openContextPopover = (type, payload = {}, x = 120, y = 120) => {
  uiState.contextMenu = null;
  uiState.hoverPreview = null;
  uiState.popover = { type, payload, x, y };
  renderEditorPanel();
  logHomepage("Opened contextual editor popover.", { type, payload });
};

const renderContextPopover = () => {
  const popover = document.createElement("section");
  popover.className = "context-popover";
  popover.dataset.popoverType = uiState.popover.type;
  const expectedWidth = uiState.popover.type === "curve" ? 520 : 330;
  const maxLeft = Math.max(12, window.innerWidth - expectedWidth - 12);
  const maxTop = Math.max(72, window.innerHeight - 220);
  popover.style.left = `${Math.min(maxLeft, Math.max(12, uiState.popover.x))}px`;
  popover.style.top = `${Math.min(maxTop, Math.max(72, uiState.popover.y))}px`;
  popover.setAttribute("role", "dialog");

  const renderers = {
    data: renderDataPopoverContent,
    hero: renderHeroPopoverContent,
    area: renderAreaPopoverContent,
    curve: renderCurvePopoverContent,
    node: renderNodePopoverContent
  };
  popover.innerHTML = renderers[uiState.popover.type]?.() || "";
  bindContextPopoverEvents(popover);
  return popover;
};

const renderPopoverHeader = (title) => `
  <div class="context-popover__header">
    <h2>${title}</h2>
    <button type="button" aria-label="关闭" data-popover-close>×</button>
  </div>
`;

const renderDataPopoverContent = () => `
  ${renderPopoverHeader("数据")}
  <p class="context-note">当前为本地编辑原型，配置仅保存在当前浏览器。</p>
  <div class="context-button-row">
    <button type="button" data-context-popover-action="save">保存到本地</button>
    <button type="button" data-context-popover-action="reset">重置示例</button>
  </div>
  <div class="context-button-row">
    <button type="button" data-context-popover-action="export">导出 JSON</button>
    <button type="button" data-context-popover-action="import">导入 JSON</button>
  </div>
  <textarea class="context-json" data-editor-field="json" placeholder="在这里粘贴或导出 JSON"></textarea>
  <p class="context-status" data-editor-status>${editorState.dirty ? "未保存" : "已保存"}</p>
`;

const renderHeroPopoverContent = () => {
  const hero = { colorA: "#fffdf8", colorB: "#fbf8f1", height: 340, align: "center", ...editorState.hero };
  return `
    ${renderPopoverHeader("Hero 设置")}
    <label>eyebrow text<input data-hero-field="eyebrow" value="${escapeHtml(hero.eyebrow)}"></label>
    <label>title text<input data-hero-field="title" value="${escapeHtml(hero.title)}"></label>
    <label>背景颜色 A<input type="color" data-hero-field="colorA" value="${hero.colorA}"></label>
    <label>背景颜色 B<input type="color" data-hero-field="colorB" value="${hero.colorB}"></label>
    <label>Hero 高度<input type="number" min="240" max="520" step="10" data-hero-field="height" value="${hero.height}"></label>
    <label>文字对齐<select data-hero-field="align">
      <option value="center" ${hero.align === "center" ? "selected" : ""}>center</option>
      <option value="left" ${hero.align === "left" ? "selected" : ""}>left</option>
    </select></label>
    <button type="button" data-context-popover-action="save">保存</button>
  `;
};

const renderAreaPopoverContent = () => {
  const area = getSelectedArea();
  return `
    ${renderPopoverHeader("区域设置")}
    <label>area title<input data-area-field="title" value="${escapeHtml(area.title)}"></label>
    <label>area description<textarea data-area-field="description">${escapeHtml(area.description)}</textarea></label>
    <label>区域高度<input type="number" min="360" max="1200" step="10" data-area-field="height" value="${area.height}"></label>
    <label>背景颜色 A<input type="color" data-area-background-field="colorA" value="${area.background.colorA}"></label>
    <label>背景颜色 B<input type="color" data-area-background-field="colorB" value="${area.background.colorB}"></label>
    <label>背景图案<select data-area-background-field="pattern">
      ${["none", "soft-hills", "soft-skyline", "soft-waves", "soft-abstract"].map((pattern) => `<option value="${pattern}" ${area.background.pattern === pattern ? "selected" : ""}>${pattern}</option>`).join("")}
    </select></label>
    <label>major 默认颜色<input type="color" data-area-style-field="majorNodeColor" value="${area.areaStyles.majorNodeColor}"></label>
    <label>minor 默认颜色<input type="color" data-area-style-field="minorNodeColor" value="${area.areaStyles.minorNodeColor}"></label>
    <button type="button" data-context-popover-action="save">保存</button>
  `;
};

const formatTuningValue = (value, slider) => {
  if (slider.step === 1) {
    return `${Math.round(value)}${slider.unit || ""}`;
  }
  return `${Number(value).toFixed(2)}${slider.unit || ""}`;
};

const getSelectedAreaDiagnostics = () => {
  const area = getSelectedArea();
  return (
    area.path.simpleSmoothDiagnostics ||
    area.path.diagnostics ||
    curveDebugDataByArea.get(area.id)?.diagnostics ||
    {}
  );
};

const renderTuningMetrics = () => {
  const diagnostics = getSelectedAreaDiagnostics();
  const metricRows = [
    ["\u539f\u59cb\u70b9", diagnostics.rawPointCount, ""],
    ["\u91c7\u6837\u70b9", diagnostics.resampledPointCount, ""],
    ["\u6700\u7ec8\u70b9", diagnostics.finalPointCount || diagnostics.finalSamplePointCount, ""],
    ["\u5e73\u5747\u504f\u79bb", diagnostics.averageRawToFinalDeviation, "px"],
    ["\u6700\u5927\u504f\u79bb", diagnostics.maxRawToFinalDeviation, "px"]
  ];

  return `
    <div class="journey-tuning-metrics" aria-label="\u66f2\u7ebf\u5e73\u6ed1\u6307\u6807">
      ${metricRows.map(([label, value, unit]) => `
        <div class="journey-tuning-metric">
          <span>${label}</span>
          <strong>${typeof value === "number" ? Math.round(value) : value ?? "-"}${unit}</strong>
        </div>
      `).join("")}
    </div>
  `;
};

const renderBoundaryConnectionControls = () => {
  const connection = getBoundaryConnection("area-01", "area-02");
  if (!connection) {
    return "";
  }

  const action = connection.enabled ? "disable" : "enable";
  const label = connection.enabled
    ? "\u53d6\u6d88 Area 01 \u2192 Area 02 \u8fde\u63a5\u4f18\u5316"
    : "\u786e\u8ba4 Area 01 \u2192 Area 02 \u4e1d\u6ed1\u8fde\u63a5";
  const status = connection.enabled
    ? "\u5df2\u542f\u7528\uff1a\u53ea\u5728\u4e24\u4e2a\u533a\u57df\u4ea4\u754c\u5904\u7ed8\u5236\u89c6\u89c9\u6865\u63a5\u5c42\u3002"
    : "\u672a\u542f\u7528\uff1a\u666e\u901a\u624b\u7ed8\u8def\u7ebf\u4ecd\u6309\u539f\u6765\u7684\u81ea\u52a8\u5e73\u6ed1\u903b\u8f91\u5904\u7406\u3002";

  return `
    <section class="journey-boundary-control" data-boundary-connection-id="${connection.id}">
      <h3>\u533a\u57df\u8fde\u63a5</h3>
      <p class="context-note">
        \u53ea\u4f18\u5316 Area 01 \u548c Area 02 \u4ea4\u754c\u5904\u7684\u89c6\u89c9\u6865\u63a5\uff1b
        \u4e0d\u8986\u76d6\u624b\u7ed8\u539f\u59cb\u70b9\u3001\u5e73\u6ed1\u70b9\u6216\u533a\u57df\u8def\u5f84\u6570\u636e\u3002
      </p>
      <button
        type="button"
        data-boundary-connection-action="${action}"
        data-boundary-connection-id="${connection.id}"
        aria-pressed="${connection.enabled}"
      >${label}</button>
      <p class="journey-boundary-control__status">${status}</p>
    </section>
  `;
};

const renderTuningSlider = (slider, smoothing) => {
  const value = smoothing[slider.key];
  return `
    <label class="journey-tuning-row" title="${escapeHtml(slider.hint)}">
      <span class="journey-tuning-label">${slider.label}</span>
      <input
        class="journey-tuning-slider"
        type="range"
        min="${slider.min}"
        max="${slider.max}"
        step="${slider.step}"
        data-path-smoothing-field="${slider.key}"
        value="${value}"
      >
      <span class="journey-tuning-value" data-smoothing-value="${slider.key}">
        ${formatTuningValue(value, slider)}
      </span>
      <small>${slider.hint}</small>
    </label>
  `;
};

const renderCurvePopoverContent = () => {
  const area = getSelectedArea();
  if (!area) {
    return `${renderPopoverHeader("\u624b\u7ed8\u66f2\u7ebf\u5e73\u6ed1")}<p class="context-note">\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u533a\u57df\u3002</p>`;
  }

  area.path.simpleSmooth = normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing);
  area.path.smoothing = area.path.simpleSmooth;
  const smoothing = area.path.simpleSmooth;

  return `
    ${renderPopoverHeader("\u624b\u7ed8\u66f2\u7ebf\u5e73\u6ed1")}
    <div class="journey-tuning-panel">
      <p class="context-note">
        \u5f53\u524d\u533a\u57df\uff1a<strong>${escapeHtml(area.title)}</strong>\u3002
        \u624b\u7ed8\u7ebf\u6761\u53ea\u8868\u793a\u5927\u65b9\u5411\uff1b
        \u7cfb\u7edf\u4f1a\u6309\u7b49\u8ddd\u91c7\u6837\u3001Gaussian \u5e73\u6ed1\u548c Catmull-Rom \u63d2\u503c\u751f\u6210\u6700\u7ec8\u66f2\u7ebf\u3002
      </p>
      <label class="journey-tuning-scope">
        \u5e94\u7528\u8303\u56f4
        <select data-curve-tuning-scope>
          <option value="current" ${uiState.tuningScope === "current" ? "selected" : ""}>\u53ea\u5e94\u7528\u5f53\u524d\u533a\u57df</option>
          <option value="all" ${uiState.tuningScope === "all" ? "selected" : ""}>\u5e94\u7528\u5230\u6240\u6709\u533a\u57df</option>
        </select>
      </label>
      <div class="journey-tuning-presets" aria-label="\u66f2\u7ebf\u5e73\u6ed1\u9884\u8bbe">
        ${Object.entries(CURVE_TUNING_PRESETS).map(([key, preset]) => `
          <button type="button" data-curve-preset="${key}">${preset.label}</button>
        `).join("")}
      </div>
      <div class="journey-tuning-grid">
        ${TUNING_SLIDERS.map((slider) => renderTuningSlider(slider, smoothing)).join("")}
      </div>
      ${renderTuningMetrics()}
      ${renderBoundaryConnectionControls()}
    </div>
    <label>\u66f2\u7ebf\u989c\u8272<input type="color" data-area-path-field="strokeColor" value="${area.path.strokeColor}"></label>
    <label>\u9634\u5f71\u989c\u8272<input data-area-path-field="shadowColor" value="${escapeHtml(area.path.shadowColor)}"></label>
    <label>\u66f2\u7ebf\u5bbd\u5ea6<input type="number" min="8" max="80" step="2" data-area-path-field="strokeWidth" value="${area.path.strokeWidth}"></label>
    <label>\u7ebf\u6761\u6837\u5f0f<select data-area-path-field="lineStyle">
      <option value="solid" ${area.path.lineStyle === "solid" ? "selected" : ""}>solid</option>
      <option value="dashed" ${area.path.lineStyle === "dashed" ? "selected" : ""}>dashed</option>
    </select></label>
    <div class="context-button-row">
      <button type="button" data-context-popover-action="resmooth">\u91cd\u65b0\u751f\u6210\u5e73\u6ed1\u66f2\u7ebf</button>
      <button type="button" data-context-popover-action="redraw">\u91cd\u753b\u5f53\u524d\u533a\u57df\u66f2\u7ebf</button>
      <button type="button" data-context-popover-action="export-curve-debug">\u5bfc\u51fa\u8c03\u8bd5\u6570\u636e</button>
      <button type="button" data-context-popover-action="copy-curve-debug">\u590d\u5236\u8c03\u8bd5\u6570\u636e</button>
    </div>
    <textarea class="context-json curve-debug-json" data-curve-debug-json readonly placeholder="\u66f2\u7ebf\u8c03\u8bd5 JSON \u4f1a\u663e\u793a\u5728\u8fd9\u91cc"></textarea>
  `;
};

const renderNodePopoverContent = () => {
  const selected = getNodeById(uiState.popover.payload.nodeId || editorState.selectedNodeId);
  if (!selected) {
    return `${renderPopoverHeader("节点设置")}<p class="context-note">请选择一个节点。</p>`;
  }
  const node = selected.node;
  return `
    ${renderPopoverHeader("节点设置")}
    <label>type<select data-node-field="type">
      <option value="major" ${node.type === "major" ? "selected" : ""}>major</option>
      <option value="minor" ${node.type === "minor" ? "selected" : ""}>minor</option>
    </select></label>
    <label>date<input data-node-field="date" value="${escapeHtml(node.date)}"></label>
    <label>title<input data-node-field="title" value="${escapeHtml(node.title)}"></label>
    <label>description<textarea data-node-field="description">${escapeHtml(node.description)}</textarea></label>
    <label>绑定方式<select data-node-field="anchorMode">
      <option value="path" ${node.anchorMode !== "free" ? "selected" : ""}>绑定曲线</option>
      <option value="free" ${node.anchorMode === "free" ? "selected" : ""}>自由放置</option>
    </select></label>
    <label>路径位置：${Math.round((Number.isFinite(node.pathT) ? node.pathT : 0.5) * 100)}%
      <input type="range" min="0" max="100" step="1" data-node-field="pathPercent" value="${Math.round((Number.isFinite(node.pathT) ? node.pathT : 0.5) * 100)}">
    </label>
    <label>offset X<input type="number" step="5" data-node-field="offsetX" value="${node.offsetX}"></label>
    <label>offset Y<input type="number" step="5" data-node-field="offsetY" value="${node.offsetY}"></label>
    <label>节点颜色<input type="color" data-node-style-field="color" value="${node.style.color}"></label>
    <div class="context-button-row">
      <button type="button" data-context-popover-action="save">保存</button>
      <button type="button" class="danger-button" data-context-popover-action="delete-node">删除节点</button>
    </div>
  `;
};

const bindContextPopoverEvents = (popover) => {
  popover.querySelector("[data-popover-close]")?.addEventListener("click", () => {
    uiState.popover = null;
    renderEditorPanel();
  });
  popover.querySelectorAll("[data-context-popover-action]").forEach((button) => {
    button.addEventListener("click", () => handleContextPopoverAction(button.dataset.contextPopoverAction));
  });
  popover.querySelectorAll("[data-hero-field]").forEach((field) => {
    field.addEventListener("input", () => updateHeroField(field));
    field.addEventListener("change", () => updateHeroField(field));
  });
  popover.querySelectorAll("[data-area-field]").forEach((field) => {
    field.addEventListener("input", () => updateAreaField(field));
  });
  popover.querySelectorAll("[data-area-background-field]").forEach((field) => {
    field.addEventListener("input", () => updateAreaBackgroundField(field));
  });
  popover.querySelectorAll("[data-area-style-field]").forEach((field) => {
    field.addEventListener("input", () => updateAreaStyleField(field));
  });
  popover.querySelectorAll("[data-area-path-field]").forEach((field) => {
    field.addEventListener("input", () => updateAreaPathField(field));
  });
  popover.querySelectorAll("[data-path-smoothing-field]").forEach((field) => {
    field.addEventListener("input", () => updatePathSmoothingField(field));
    field.addEventListener("change", () => updatePathSmoothingField(field, { rerenderPanel: true }));
  });
  popover.querySelector("[data-curve-tuning-scope]")?.addEventListener("change", (event) => {
    uiState.tuningScope = event.target.value === "all" ? "all" : "current";
    showEditorMessage(
      uiState.tuningScope === "all" ? "调参将应用到所有区域。" : "调参仅应用到当前区域。"
    );
    logHomepage("Changed curve tuning scope.", { scope: uiState.tuningScope });
  });
  popover.querySelectorAll("[data-curve-preset]").forEach((button) => {
    button.addEventListener("click", () => applyCurveTuningPreset(button.dataset.curvePreset));
  });
  popover.querySelectorAll("[data-boundary-connection-action]").forEach((button) => {
    button.addEventListener("click", () => handleBoundaryConnectionAction(
      button.dataset.boundaryConnectionAction,
      button.dataset.boundaryConnectionId
    ));
  });
  popover.querySelectorAll("[data-node-field]").forEach((field) => {
    field.addEventListener("input", () => updateNodeField(field));
    field.addEventListener("change", () => updateNodeField(field));
  });
  popover.querySelectorAll("[data-node-style-field]").forEach((field) => {
    field.addEventListener("input", () => updateNodeStyleField(field));
  });
};

const getPathMutationSnapshot = (areaIds) =>
  Object.fromEntries(areaIds.map((areaId) => {
    const area = getAreaById(areaId);
    return [
      areaId,
      JSON.stringify({
        rawPoints: area?.path.rawPoints || [],
        smoothPoints: area?.path.smoothPoints || [],
        finalSmoothPoints: area?.path.finalSmoothPoints || [],
        finalSvgPath: area?.path.finalSvgPath || "",
        d: area?.path.d || ""
      })
    ];
  }));

const handleBoundaryConnectionAction = (action, connectionId) => {
  const connection = getBoundaryConnections()[connectionId];
  if (!connection) {
    showEditorMessage("\u672a\u627e\u5230\u8fb9\u754c\u8fde\u63a5\u914d\u7f6e\u3002", true);
    return;
  }

  const beforeSnapshot = getPathMutationSnapshot([connection.fromAreaId, connection.toAreaId]);
  connection.enabled = action === "enable";
  markDirty(`boundary connector ${connection.enabled ? "enabled" : "disabled"}`);
  renderTimeline();
  renderEditorPanel();
  const afterSnapshot = getPathMutationSnapshot([connection.fromAreaId, connection.toAreaId]);
  const sourceDataUnchanged = Object.keys(beforeSnapshot).every(
    (areaId) => beforeSnapshot[areaId] === afterSnapshot[areaId]
  );
  showEditorMessage(
    connection.enabled
      ? "\u5df2\u542f\u7528 Area 01 \u2192 Area 02 \u89c6\u89c9\u8fde\u63a5\u5c42\u3002"
      : "\u5df2\u5173\u95ed Area 01 \u2192 Area 02 \u89c6\u89c9\u8fde\u63a5\u5c42\u3002"
  );
  logHomepage(`Toggled boundary-only journey connector. sourceDataUnchanged=${sourceDataUnchanged}`, {
    connectionId,
    enabled: connection.enabled,
    sourceDataUnchanged
  });
};

const handleContextPopoverAction = (action) => {
  const actions = {
    save: saveToLocalStorage,
    reset: resetExampleData,
    export: exportJson,
    import: importJson,
    resmooth: resmoothCurrentAreaCurve,
    redraw: () => setActiveTool("freehand"),
    "export-curve-debug": exportCurveDebugJson,
    "copy-curve-debug": copyCurveDebugJson,
    "delete-node": deleteSelectedNode
  };
  actions[action]?.();
  logHomepage("Handled context popover action.", { action });
};

const renderContextMenu = () => {
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${Math.min(window.innerWidth - 240, Math.max(8, uiState.contextMenu.x))}px`;
  menu.style.top = `${Math.min(window.innerHeight - 180, Math.max(8, uiState.contextMenu.y))}px`;
  menu.setAttribute("role", "menu");
  const type = uiState.contextMenu.type;
  if (type === "node") {
    menu.innerHTML = `
      <button type="button" data-context-menu-action="edit-node">节点设置</button>
      <button type="button" data-context-menu-action="delete-node">删除节点</button>
      <button type="button" data-context-menu-action="cancel">取消</button>
    `;
  } else {
    menu.innerHTML = `
      <button type="button" data-context-menu-action="add-major">添加大事件节点</button>
      <button type="button" data-context-menu-action="add-minor">添加小事件节点</button>
      <button type="button" data-context-menu-action="curve-settings">曲线设置</button>
      <button type="button" data-context-menu-action="area-settings">区域设置</button>
      <button type="button" data-context-menu-action="redraw">重画当前区域曲线</button>
      <button type="button" data-context-menu-action="cancel">取消</button>
    `;
  }
  menu.querySelectorAll("[data-context-menu-action]").forEach((button) => {
    button.addEventListener("click", () => handleContextMenuAction(button.dataset.contextMenuAction));
  });
  return menu;
};

const handleContextMenuAction = (action) => {
  const menu = uiState.contextMenu;
  if (!menu) {
    return;
  }
  if (action === "cancel") {
    uiState.contextMenu = null;
  } else if (action === "add-major" || action === "add-minor") {
    const area = getAreaById(menu.areaId);
    const point = getPointAtPathT(area, menu.pathT);
    addNodeAt(menu.areaId, point.x, point.y, action === "add-major" ? "major" : "minor", "path");
    const selected = getNodeById(editorState.selectedNodeId);
    uiState.contextMenu = null;
    if (selected) {
      openContextPopover("node", { areaId: selected.area.id, nodeId: selected.node.id }, menu.x, menu.y);
    }
  } else if (action === "curve-settings") {
    uiState.contextMenu = null;
    openContextPopover("curve", { areaId: menu.areaId }, menu.x, menu.y);
  } else if (action === "area-settings") {
    uiState.contextMenu = null;
    openContextPopover("area", { areaId: menu.areaId }, menu.x, menu.y);
  } else if (action === "redraw") {
    uiState.contextMenu = null;
    setActiveTool("freehand");
  } else if (action === "edit-node") {
    uiState.contextMenu = null;
    openContextPopover("node", { areaId: menu.areaId, nodeId: menu.nodeId }, menu.x, menu.y);
  } else if (action === "delete-node") {
    uiState.contextMenu = null;
    deleteSelectedNode();
  }
  renderEditorPanel();
  logHomepage("Handled contextual menu action.", { action });
};

const renderNodeHoverPreview = () => {
  const preview = document.createElement("aside");
  const area = getAreaById(uiState.hoverPreview.areaId);
  const node = area?.nodes.find((item) => item.id === uiState.hoverPreview.nodeId);
  if (!area || !node) {
    return preview;
  }
  preview.className = "node-hover-preview";
  preview.style.left = `${Math.min(window.innerWidth - 300, Math.max(10, uiState.hoverPreview.x))}px`;
  preview.style.top = `${Math.min(window.innerHeight - 210, Math.max(10, uiState.hoverPreview.y))}px`;
  preview.innerHTML = `
    <div class="placeholder-image" aria-hidden="true">Placeholder</div>
    <p class="node-hover-preview__type">${node.type === "major" ? "Major" : "Minor"}</p>
    <p class="node-hover-preview__date">${escapeHtml(node.date)}</p>
    <strong>${escapeHtml(node.title)}</strong>
    <p>${escapeHtml(node.description)}</p>
  `;
  return preview;
};

const updateHeroField = (field) => {
  editorState.hero = {
    colorA: "#fffdf8",
    colorB: "#fbf8f1",
    height: 340,
    align: "center",
    ...editorState.hero
  };
  editorState.hero[field.dataset.heroField] = field.type === "number" ? Number(field.value) : field.value;
  markDirty("hero field changed");
  renderHero();
  logHomepage("Updated hero field.", { field: field.dataset.heroField });
};

const renderLegacyEditorPanel = () => {
  const panel = document.querySelector("#homepage-editor");
  if (!panel || editorState.mode !== "edit") {
    return;
  }

  const area = getSelectedArea();
  const selected = getNodeById(editorState.selectedNodeId);
  const selectedNode = selected?.node;

  panel.innerHTML = `
    <div class="homepage-editor__header">
      <div>
        <p class="homepage-editor__eyebrow">本地原型</p>
        <h2>主页编辑器</h2>
      </div>
      <button type="button" class="homepage-editor__close" data-editor-action="preview">预览</button>
    </div>
    <p class="homepage-editor__note">${editorState.globalStyles.editorNote}</p>
    <p class="homepage-editor__status" data-editor-status>${editorState.dirty ? "未保存" : "已保存"}</p>

    <section class="editor-section">
      <h3>区域</h3>
      <label>选择区域
        <select data-editor-field="selectedAreaId">
          ${getOrderedAreas().map((item) => `
            <option value="${item.id}" ${item.id === area.id ? "selected" : ""}>${item.title}</option>
          `).join("")}
        </select>
      </label>
      <label>区域标题
        <input data-area-field="title" value="${area.title}">
      </label>
      <label>区域描述
        <textarea data-area-field="description">${area.description}</textarea>
      </label>
      <label>区域高度
        <input type="number" min="360" max="900" step="10" data-area-field="height" value="${area.height}">
      </label>
      <label>背景颜色 A
        <input type="color" data-area-background-field="colorA" value="${area.background.colorA}">
      </label>
      <label>背景颜色 B
        <input type="color" data-area-background-field="colorB" value="${area.background.colorB}">
      </label>
      <label>背景图案
        <select data-area-background-field="pattern">
          ${["none", "soft-hills", "soft-skyline", "soft-abstract", "soft-waves"].map((pattern) => `
            <option value="${pattern}" ${area.background.pattern === pattern ? "selected" : ""}>${pattern}</option>
          `).join("")}
        </select>
      </label>
    </section>

    <section class="editor-section">
      <h3>\u66f2\u7ebf</h3>
      <label>\u66f2\u7ebf\u989c\u8272
        <input type="color" data-area-path-field="strokeColor" value="${area.path.strokeColor}">
      </label>
      <label>\u66f2\u7ebf\u5bbd\u5ea6
        <input type="number" min="8" max="80" step="2" data-area-path-field="strokeWidth" value="${area.path.strokeWidth}">
      </label>
      <label>\u7ebf\u6761\u6837\u5f0f
        <select data-area-path-field="lineStyle">
          <option value="solid" ${area.path.lineStyle === "solid" ? "selected" : ""}>solid</option>
          <option value="dashed" ${area.path.lineStyle === "dashed" ? "selected" : ""}>dashed</option>
        </select>
      </label>
      ${TUNING_SLIDERS.map((slider) => `
        <label>${slider.label}
          <input
            type="range"
            min="${slider.min}"
            max="${slider.max}"
            step="${slider.step}"
            data-path-smoothing-field="${slider.key}"
            value="${normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing)[slider.key]}"
          >
        </label>
      `).join("")}
      <p class="editor-help">
        \u624b\u7ed8\u7ebf\u6761\u53ea\u8868\u8fbe\u5927\u65b9\u5411\uff1b
        \u7cfb\u7edf\u4f1a\u5bf9\u5b8c\u6574\u70b9\u5e8f\u5217\u505a\u7b49\u8ddd\u91c7\u6837\u3001Gaussian \u5e73\u6ed1\u548c Catmull-Rom \u63d2\u503c\u3002
      </p>
      <p class="editor-help">\u5f53\u524d\u5de5\u5177\uff1a${editorState.activeTool === "freehand" ? "\u624b\u7ed8\u66f2\u7ebf" : editorState.activeTool === "add-node" ? "\u6dfb\u52a0\u8282\u70b9" : "\u9009\u62e9"}</p>
      <div class="editor-button-row">
        <button type="button" class="homepage-editor__tool" data-editor-action="select-tool">\u9009\u62e9</button>
        <button type="button" class="homepage-editor__tool" data-editor-action="freehand">${editorState.activeTool === "freehand" ? "\u9000\u51fa\u624b\u7ed8" : "\u624b\u7ed8\u66f2\u7ebf"}</button>
        <button type="button" data-editor-action="resmooth">\u91cd\u65b0\u5e73\u6ed1</button>
      </div>
      ${editorState.activeTool === "freehand"
        ? "<p class=\"editor-help\">\\u5728\\u5f53\\u524d\\u533a\\u57df\\u5185\\u62d6\\u52a8\\u9f20\\u6807\\u7ed8\\u5236\\u66f2\\u7ebf\\uff0c\\u677e\\u5f00\\u540e\\u81ea\\u52a8\\u5e73\\u6ed1\\u3002</p>"
        : ""}
      <div class="editor-button-row">
        <button type="button" data-editor-action="add-point">\u6dfb\u52a0\u66f2\u7ebf\u70b9</button>
        <button type="button" data-editor-action="delete-point">\u5220\u9664\u9009\u4e2d\u66f2\u7ebf\u70b9</button>
        <button type="button" data-editor-action="reset-curve">\u91cd\u7f6e\u5f53\u524d\u533a\u57df\u66f2\u7ebf</button>
      </div>
    </section>

    <section class="editor-section">
      <h3>节点</h3>
      <div class="editor-button-row">
        <button type="button" data-editor-action="add-major">添加 major 节点</button>
        <button type="button" data-editor-action="add-minor">添加 minor 节点</button>
      </div>
      <label>点击区域添加节点类型
        <select data-editor-field="addNodeType">
          <option value="major" ${editorState.addNodeType === "major" ? "selected" : ""}>major</option>
          <option value="minor" ${editorState.addNodeType === "minor" ? "selected" : ""}>minor</option>
        </select>
      </label>
      ${selectedNode ? renderNodeEditor(selectedNode) : "<p class=\"editor-empty\">请选择一个节点。</p>"}
    </section>

    <section class="editor-section">
      <h3>数据</h3>
      <div class="editor-button-row">
        <button type="button" data-editor-action="save">保存到本地</button>
        <button type="button" data-editor-action="load">从本地加载</button>
        <button type="button" data-editor-action="reset">重置示例</button>
      </div>
      <div class="editor-button-row">
        <button type="button" data-editor-action="export">导出 JSON</button>
        <button type="button" data-editor-action="import">导入 JSON</button>
      </div>
      <textarea class="editor-json" data-editor-field="json" placeholder="在这里粘贴或导出 JSON"></textarea>
    </section>

    <p class="homepage-editor__mobile-note">建议在桌面端编辑曲线。</p>
  `;

  bindEditorPanelEvents(panel);
};

const renderNodeEditor = (node) => `
  <label>节点类型
    <select data-node-field="type">
      <option value="major" ${node.type === "major" ? "selected" : ""}>major</option>
      <option value="minor" ${node.type === "minor" ? "selected" : ""}>minor</option>
    </select>
  </label>
  <label>时间
    <input data-node-field="date" value="${node.date}">
  </label>
  <label>标题
    <input data-node-field="title" value="${node.title}">
  </label>
  <label>描述
    <textarea data-node-field="description">${node.description}</textarea>
  </label>
  <label>绑定方式
    <select data-node-field="anchorMode">
      <option value="path" ${node.anchorMode !== "free" ? "selected" : ""}>绑定曲线</option>
      <option value="free" ${node.anchorMode === "free" ? "selected" : ""}>自由放置</option>
    </select>
  </label>
  <label>路径位置：${Math.round((Number.isFinite(node.pathT) ? node.pathT : 0.5) * 100)}%
    <input type="range" min="0" max="100" step="1" data-node-field="pathPercent" value="${Math.round((Number.isFinite(node.pathT) ? node.pathT : 0.5) * 100)}">
  </label>
  <label>X
    <input type="number" min="0" max="1000" step="5" data-node-field="x" value="${node.x}">
  </label>
  <label>Y
    <input type="number" min="0" max="900" step="5" data-node-field="y" value="${node.y}">
  </label>
  <label>卡片 offsetX
    <input type="number" step="5" data-node-field="offsetX" value="${node.offsetX}">
  </label>
  <label>卡片 offsetY
    <input type="number" step="5" data-node-field="offsetY" value="${node.offsetY}">
  </label>
  <label>节点颜色
    <input type="color" data-node-style-field="color" value="${node.style.color}">
  </label>
  <label>卡片样式
    <select data-node-style-field="cardVariant">
      <option value="large" ${node.style.cardVariant === "large" ? "selected" : ""}>large</option>
      <option value="compact" ${node.style.cardVariant === "compact" ? "selected" : ""}>compact</option>
    </select>
  </label>
  <button type="button" class="danger-button" data-editor-action="delete-node">删除节点</button>
`;

const bindEditorPanelEvents = (panel) => {
  panel.querySelectorAll("[data-editor-action]").forEach((button) => {
    button.addEventListener("click", () => handleEditorAction(button.dataset.editorAction));
  });

  panel.querySelectorAll("[data-editor-field]").forEach((field) => {
    field.addEventListener("change", () => handleEditorField(field));
  });

  panel.querySelectorAll("[data-area-field]").forEach((field) => {
    field.addEventListener("input", () => updateAreaField(field));
  });

  panel.querySelectorAll("[data-area-background-field]").forEach((field) => {
    field.addEventListener("input", () => updateAreaBackgroundField(field));
  });

  panel.querySelectorAll("[data-area-path-field]").forEach((field) => {
    field.addEventListener("input", () => updateAreaPathField(field));
  });

  panel.querySelectorAll("[data-path-smoothing-field]").forEach((field) => {
    field.addEventListener("input", () => updatePathSmoothingField(field));
    field.addEventListener("change", () => updatePathSmoothingField(field));
  });

  panel.querySelectorAll("[data-node-field]").forEach((field) => {
    field.addEventListener("input", () => updateNodeField(field));
    field.addEventListener("change", () => updateNodeField(field));
  });

  panel.querySelectorAll("[data-node-style-field]").forEach((field) => {
    field.addEventListener("input", () => updateNodeStyleField(field));
    field.addEventListener("change", () => updateNodeStyleField(field));
  });
};

const handleEditorAction = (action) => {
  const actions = {
    preview: () => setEditorMode("preview"),
    "select-tool": () => setActiveTool("select"),
    freehand: () => setActiveTool(editorState.activeTool === "freehand" ? "select" : "freehand"),
    resmooth: resmoothCurrentAreaCurve,
    "add-point": addCurvePoint,
    "delete-point": deleteSelectedCurvePoint,
    "reset-curve": resetCurrentAreaCurve,
    "add-major": () => addNodeFromPanel("major"),
    "add-minor": () => addNodeFromPanel("minor"),
    "delete-node": deleteSelectedNode,
    save: saveToLocalStorage,
    load: () => {
      editorState = loadInitialState();
      editorState.mode = "edit";
      setEditorMode("edit");
      showEditorMessage("已从本地加载。");
    },
    reset: resetExampleData,
    export: exportJson,
    import: importJson
  };

  if (actions[action]) {
    actions[action]();
  }
};

const handleEditorField = (field) => {
  if (field.dataset.editorField === "selectedAreaId") {
    editorState.selectedAreaId = field.value;
    const area = getSelectedArea();
    editorState.selectedNodeId = area.nodes[0]?.id || "";
    editorState.selectedPointId = area.path.points[1]?.id || area.path.points[0].id;
    renderTimeline();
    renderEditorPanel();
  }

  if (field.dataset.editorField === "addNodeType") {
    editorState.addNodeType = field.value;
    editorState.activeTool = "add-node";
    const root = document.querySelector(".timeline-home");
    if (root) {
      root.dataset.activeTool = "add-node";
    }
    logHomepage("Changed add node type.", { type: field.value });
  }
};

const updateAreaField = (field) => {
  const area = getSelectedArea();
  const key = field.dataset.areaField;
  area[key] = field.type === "number" ? Number(field.value) : field.value;
  if (key === "height") {
    area.path.viewBox = `0 0 ${SVG_WIDTH} ${area.height}`;
  }
  markDirty(`area ${key} changed`);
  renderTimeline();
};

const updateAreaBackgroundField = (field) => {
  const area = getSelectedArea();
  area.background[field.dataset.areaBackgroundField] = field.value;
  markDirty("area background changed");
  renderTimeline();
};

const updateAreaStyleField = (field) => {
  const area = getSelectedArea();
  area.areaStyles[field.dataset.areaStyleField] = field.value;
  area.nodes.forEach((node) => {
    if (!node.style.color || node.style.color === getNodeColor(area, node)) {
      node.style.color = node.type === "major" ? area.areaStyles.majorNodeColor : area.areaStyles.minorNodeColor;
    }
  });
  markDirty("area node style changed");
  renderTimeline();
  renderEditorPanel();
  logHomepage("Updated area node style.", { areaId: area.id, field: field.dataset.areaStyleField });
};

const updateAreaPathField = (field) => {
  const area = getSelectedArea();
  const key = field.dataset.areaPathField;
  area.path[key] = field.type === "number" ? Number(field.value) : field.value;
  markDirty(`path ${key} changed`);
  renderTimeline();
};

const getCurveTuningTargetAreas = () =>
  uiState.tuningScope === "all" ? getOrderedAreas() : [getSelectedArea()].filter(Boolean);

const refreshTuningValueDisplay = (field) => {
  const slider = TUNING_SLIDERS.find((item) => item.key === field.dataset.pathSmoothingField);
  const valueDisplay = document.querySelector(`[data-smoothing-value="${field.dataset.pathSmoothingField}"]`);
  if (slider && valueDisplay) {
    valueDisplay.textContent = formatTuningValue(Number(field.value), slider);
  }
};

const regenerateAreaCurveFromSmoothing = (area) => {
  area.path.simpleSmooth = normalizeSmoothing(area.path.simpleSmooth || area.path.smoothing);
  area.path.smoothing = area.path.simpleSmooth;
  if (area.path.mode === "freehand" && area.path.rawPoints?.length >= 3) {
    const processed = processRawFreehandPoints(area.path.rawPoints, area.path.simpleSmooth, { log: true });
    if (processed?.smoothPoints?.length >= 3) {
      applyProcessedFreehandPath(area, processed, area.path.boundaryDiagnostics || []);
      alignAdjacentAreaPaths(editorState.areas, "smoothing control");
      area.nodes.forEach((node) => {
        if (node.anchorMode === "path") {
          const point = getPointAtPathT(area, node.pathT);
          node.x = point.x;
          node.y = point.y;
        }
      });
    }
    return;
  }

  rebuildAreaPathData(area);
  const source = getRoughLocalPointsForArea(area);
  const processed = processRawFreehandPoints(source, area.path.simpleSmooth, { log: true });
  if (processed?.smoothPoints?.length >= 3) {
    applyProcessedFreehandPath(area, processed, []);
  }
};

const applySmoothingSettingsToArea = (area, nextSmoothing) => {
  area.path.simpleSmooth = normalizeSmoothing({
    ...(area.path.simpleSmooth || area.path.smoothing || {}),
    ...nextSmoothing
  });
  area.path.smoothing = area.path.simpleSmooth;
  regenerateAreaCurveFromSmoothing(area);
};

const updatePathSmoothingField = (field, options = {}) => {
  const key = field.dataset.pathSmoothingField;
  const value = Number(field.value);
  const targetAreas = getCurveTuningTargetAreas();

  targetAreas.forEach((area) => {
    applySmoothingSettingsToArea(area, { [key]: value });
  });

  markDirty("path smoothing changed");
  refreshTuningValueDisplay(field);
  renderTimeline();
  if (options.rerenderPanel) {
    renderEditorPanel();
  } else {
    const metrics = document.querySelector(".journey-tuning-metrics");
    if (metrics) {
      metrics.outerHTML = renderTuningMetrics();
    }
  }
  logHomepage("Updated freehand smoothing configuration.", {
    field: key,
    value,
    scope: uiState.tuningScope,
    areaIds: targetAreas.map((area) => area.id)
  });
};

const applyCurveTuningPreset = (presetKey) => {
  const preset = CURVE_TUNING_PRESETS[presetKey];
  if (!preset) {
    return;
  }

  const targetAreas = getCurveTuningTargetAreas();
  targetAreas.forEach((area) => {
    applySmoothingSettingsToArea(area, preset.values);
  });
  markDirty(`curve tuning preset ${presetKey}`);
  renderTimeline();
  renderEditorPanel();
  showEditorMessage(`\u5df2\u5e94\u7528\u201c${preset.label}\u201d\u66f2\u7ebf\u9884\u8bbe\u3002`);
  logHomepage("Applied journey curve tuning preset.", {
    preset: presetKey,
    scope: uiState.tuningScope,
    areaIds: targetAreas.map((area) => area.id)
  });
};

const updateNodeField = (field) => {
  const selected = getNodeById(editorState.selectedNodeId);
  if (!selected) {
    return;
  }

  const key = field.dataset.nodeField;
  if (key === "anchorMode") {
    if (field.value === "path") {
      const nearest = getNearestPathT(selected.area, { x: selected.node.x, y: selected.node.y });
      selected.node.anchorMode = "path";
      selected.node.pathT = nearest.pathT;
      const point = getPointAtPathT(selected.area, nearest.pathT);
      selected.node.x = point.x;
      selected.node.y = point.y;
    } else {
      const point = getPointAtPathT(selected.area, selected.node.pathT);
      selected.node.anchorMode = "free";
      selected.node.x = point.x;
      selected.node.y = point.y;
    }
  } else if (key === "pathPercent") {
    selected.node.anchorMode = "path";
    selected.node.pathT = Math.max(0, Math.min(1, Number(field.value) / 100));
    const point = getPointAtPathT(selected.area, selected.node.pathT);
    selected.node.x = point.x;
    selected.node.y = point.y;
  } else {
    selected.node[key] = field.type === "number" ? Number(field.value) : field.value;
  }

  if (key === "type" && !selected.node.style.color) {
    selected.node.style.color = getNodeColor(selected.area, selected.node);
  }

  markDirty(`node ${key} changed`);
  renderTimeline();
};

const updateNodeStyleField = (field) => {
  const selected = getNodeById(editorState.selectedNodeId);
  if (!selected) {
    return;
  }

  selected.node.style[field.dataset.nodeStyleField] = field.value;
  markDirty("node style changed");
  renderTimeline();
};

const showEditorMessage = (message, isError = false) => {
  const status = document.querySelector("[data-editor-status]");
  if (status) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }
};

const updateSaveStatus = (message) => {
  const status = document.querySelector("[data-editor-status]");
  if (status) {
    status.textContent = message;
    status.dataset.error = "false";
  }
};

const closeEventPopover = () => {
  const popover = document.querySelector("#timeline-event-popover");
  if (!popover || popover.hidden) {
    return;
  }

  popover.hidden = true;
  popover.innerHTML = "";
  logHomepage("Closed event detail popover.");
};

function openEventPopover(areaId, nodeId) {
  const popover = document.querySelector("#timeline-event-popover");
  const area = getAreaById(areaId);
  const node = area?.nodes.find((item) => item.id === nodeId);

  if (!popover || !area || !node) {
    logHomepage("Event detail popover could not open.", { areaId, nodeId });
    return;
  }

  popover.innerHTML = `
    <section class="timeline-event-popover__panel">
      <div class="timeline-event-popover__top">
        <div>
          <p class="timeline-event-popover__type">
            ${node.type === "major" ? "Major Event" : "Minor Event"}
          </p>
          <h2 id="timeline-popover-title">${node.title}</h2>
        </div>
        <button
          type="button"
          class="timeline-event-popover__close"
          data-popover-close
          aria-label="Close event details"
        >x</button>
      </div>
      <div class="timeline-event-popover__body">
        <div class="placeholder-image" aria-hidden="true">Placeholder</div>
        <p class="timeline-event-popover__date">${node.date}</p>
        <p>${node.description}</p>
        <p>Area: ${area.title}</p>
      </div>
    </section>
  `;

  popover.hidden = false;
  popover.querySelector("[data-popover-close]").focus();
  logHomepage("Opened event detail popover.", {
    areaId,
    nodeId,
    type: node.type
  });
}

const handlePointerMove = (event) => {
  if (!dragState) {
    return;
  }

  if (dragState.kind === "freehand") {
    const area = getAreaById(dragState.areaId);
    if (!area) {
      return;
    }
    const point = {
      x: Math.max(0, Math.min(SVG_WIDTH, Math.round(((event.clientX - dragState.areaRect.left) / dragState.areaRect.width) * SVG_WIDTH))),
      y: Math.max(0, Math.min(area.height, Math.round(((event.clientY - dragState.areaRect.top) / dragState.areaRect.height) * area.height)))
    };
    const previous = editorState.drawingPreviewPoints[editorState.drawingPreviewPoints.length - 1];
    if (!previous || distanceBetweenPoints(previous, point) >= DRAW_POINT_MIN_DISTANCE) {
      editorState.drawingPreviewPoints.push(point);
      renderTimeline();
    }
    return;
  }

  if (dragState.kind === "curve") {
    const point = {
      x: Math.round(((event.clientX - dragState.svgRect.left) / dragState.svgRect.width) * dragState.svgWidth),
      y: Math.round(((event.clientY - dragState.svgRect.top) / dragState.svgRect.height) * dragState.svgHeight)
    };
    if (dragState.handleType === "anchor") {
      updatePoint(dragState.areaId, dragState.pointId, point.x, point.y);
    } else {
      updateControlPoint(dragState.areaId, dragState.pointId, dragState.handleType, point.x, point.y);
    }
    renderTimeline();
    return;
  }

  if (dragState.kind === "area-resize") {
    const area = getAreaById(dragState.areaId);
    if (!area) {
      return;
    }
    const nextHeight = Math.max(360, Math.min(1200, Math.round(dragState.startHeight + event.clientY - dragState.startY)));
    if (Math.abs(nextHeight - area.height) >= 2) {
      area.height = nextHeight;
      area.mobileHeight = Math.max(460, nextHeight);
      area.path.viewBox = `0 0 ${SVG_WIDTH} ${area.height}`;
      uiState.lastPointerWasDrag = true;
      markDirty("area resized");
      renderTimeline();
    }
    return;
  }

  if (dragState.kind === "node") {
    const selected = getNodeById(dragState.nodeId);
    const areaRect = dragState.areaRect;
    if (!selected) {
      return;
    }
    const area = selected.area;
    const point = {
      x: Math.max(0, Math.min(SVG_WIDTH, Math.round(((event.clientX - areaRect.left) / areaRect.width) * SVG_WIDTH))),
      y: Math.max(0, Math.min(area.height, Math.round(((event.clientY - areaRect.top) / areaRect.height) * area.height)))
    };
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) {
      dragState.moved = true;
      uiState.lastPointerWasDrag = true;
    }
    if (selected.node.anchorMode === "free") {
      selected.node.x = point.x;
      selected.node.y = point.y;
    } else {
      const nearest = getNearestPathT(area, point);
      selected.node.anchorMode = "path";
      selected.node.pathT = nearest.pathT;
      const pathPoint = getPointAtPathT(area, nearest.pathT);
      selected.node.x = pathPoint.x;
      selected.node.y = pathPoint.y;
    }
    markDirty("node dragged");
    renderTimeline();
    if (uiState.popover?.type === "node") {
      renderEditorPanel();
    }
  }
};

const handlePointerUp = () => {
  if (dragState) {
    if (dragState.kind === "freehand") {
      finishFreehandDrawing();
    }
    logHomepage("Completed drag interaction.", dragState);
    dragState = null;
    renderEditorPanel();
  }
};

const bindGlobalControls = () => {
  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.addEventListener("click", () => {
      setTimelineView(button.dataset.viewButton);
      renderTimeline();
    });
  });

  const toggle = document.querySelector("[data-editor-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      setEditorMode(editorState.mode === "edit" ? "preview" : "edit");
    });
  }

  const hero = document.querySelector(".timeline-hero");
  if (hero) {
    hero.addEventListener("click", (event) => {
      if (editorState.mode !== "edit" || event.target.closest(".timeline-hero__actions")) {
        return;
      }
      openContextPopover("hero", {}, event.clientX, event.clientY);
    });
    hero.addEventListener("contextmenu", (event) => {
      if (editorState.mode !== "edit" || event.target.closest(".timeline-hero__actions")) {
        return;
      }
      event.preventDefault();
      openContextPopover("hero", {}, event.clientX, event.clientY);
    });
  }

  const popover = document.querySelector("#timeline-event-popover");
  if (popover) {
    popover.addEventListener("click", (event) => {
      if (event.target === popover || event.target.closest("[data-popover-close]")) {
        closeEventPopover();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (uiState.popover) {
        uiState.popover = null;
        renderEditorPanel();
        return;
      }
      if (uiState.contextMenu) {
        uiState.contextMenu = null;
        renderEditorPanel();
        return;
      }
      if (uiState.hoverPreview) {
        uiState.hoverPreview = null;
        renderEditorPanel();
        return;
      }
      if (editorState.mode === "edit" && ["freehand", "add-node"].includes(editorState.activeTool)) {
        setActiveTool("select");
        return;
      }
      closeEventPopover();
    }
  });
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", handlePointerUp);

  window.addEventListener("resize", () => {
    renderTimeline();
  });

  logHomepage("Bound homepage editor controls.");
};

const initializeHomepageTimeline = () => {
  if (!document.querySelector("#journey-areas")) {
    logHomepage("Homepage editor skipped because timeline container is missing.");
    return;
  }

  editorState = loadInitialState();
  bindGlobalControls();
  renderTimeline();
  setEditorMode("preview");

  logHomepage("Initialized editable Curved Path Timeline Homepage prototype.", {
    storageKey: STORAGE_KEY,
    areaCount: editorState.areas.length,
    mode: editorState.mode
  });
};

document.addEventListener("DOMContentLoaded", () => {
  logHomepage("Static script loaded.", {
    page: document.body.dataset.page || "unknown"
  });
  initializeHomepageTimeline();
});
