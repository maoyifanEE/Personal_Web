const STORAGE_KEY = "personal_web_homepage_timeline_v1";
const SVG_WIDTH = 1000;
const DEFAULT_SMOOTHING = {
  enabled: true,
  strength: 0.78,
  simplification: 0.62,
  algorithmPriority: 0.88,
  minPointDistance: 14,
  resampleSpacing: 46,
  maxAnchors: 8,
  tangentSmoothing: 0.82,
  boundaryTangentSmoothing: 0.78
};
const DRAW_POINT_MIN_DISTANCE = 10;
const PATH_ALIGNMENT_HANDLE_DISTANCE = 96;

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
  ...DEFAULT_SMOOTHING,
  ...smoothing,
  strength: clamp(Number(smoothing.strength ?? DEFAULT_SMOOTHING.strength), 0, 1),
  simplification: clamp(Number(smoothing.simplification ?? DEFAULT_SMOOTHING.simplification), 0, 1),
  algorithmPriority: clamp(Number(smoothing.algorithmPriority ?? DEFAULT_SMOOTHING.algorithmPriority), 0, 1),
  minPointDistance: clamp(
    Number(smoothing.minPointDistance ?? DEFAULT_SMOOTHING.minPointDistance),
    4,
    48
  ),
  resampleSpacing: clamp(
    Number(smoothing.resampleSpacing ?? DEFAULT_SMOOTHING.resampleSpacing),
    16,
    120
  ),
  maxAnchors: Math.round(clamp(
    Number(smoothing.maxAnchors ?? DEFAULT_SMOOTHING.maxAnchors),
    4,
    12
  )),
  tangentSmoothing: clamp(
    Number(smoothing.tangentSmoothing ?? DEFAULT_SMOOTHING.tangentSmoothing),
    0,
    1
  ),
  boundaryTangentSmoothing: clamp(
    Number(smoothing.boundaryTangentSmoothing ?? DEFAULT_SMOOTHING.boundaryTangentSmoothing),
    0,
    1
  )
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

const catmullRomToBezierPath = (points, strength = 0.55) => {
  if (!points.length) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const tension = clamp(strength, 0, 1) / 6;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const cp1 = {
      x: Math.round(p1.x + (p2.x - p0.x) * tension),
      y: Math.round(p1.y + (p2.y - p0.y) * tension)
    };
    const cp2 = {
      x: Math.round(p2.x - (p3.x - p1.x) * tension),
      y: Math.round(p2.y - (p3.y - p1.y) * tension)
    };
    d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`;
  }
  return d;
};

const perpendicularDistance = (point, start, end) => {
  const length = distanceBetweenPoints(start, end);
  if (!length) {
    return distanceBetweenPoints(point, start);
  }
  return Math.abs(
    (end.y - start.y) * point.x -
    (end.x - start.x) * point.y +
    end.x * start.y -
    end.y * start.x
  ) / length;
};

const simplifyPoints = (points, tolerance) => {
  if (points.length <= 3) {
    return points;
  }

  let maxDistance = 0;
  let splitIndex = 0;
  const lastIndex = points.length - 1;

  for (let index = 1; index < lastIndex; index += 1) {
    const distance = perpendicularDistance(points[index], points[0], points[lastIndex]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }

  if (maxDistance > tolerance) {
    const first = simplifyPoints(points.slice(0, splitIndex + 1), tolerance);
    const second = simplifyPoints(points.slice(splitIndex), tolerance);
    return first.slice(0, -1).concat(second);
  }

  return [points[0], points[lastIndex]];
};

const filterJitterPoints = (points, minDistance = DRAW_POINT_MIN_DISTANCE) => {
  if (points.length <= 2) {
    return points;
  }
  const filtered = [points[0]];
  points.slice(1, -1).forEach((point) => {
    const previous = filtered[filtered.length - 1];
    if (distanceBetweenPoints(previous, point) >= minDistance) {
      filtered.push(point);
    }
  });
  filtered.push(points[points.length - 1]);
  return filtered;
};

const ensureUsefulCurvePoints = (points, referencePoints) => {
  if (points.length >= 3) {
    return points;
  }

  if (referencePoints.length < 3) {
    return referencePoints;
  }

  const middle = referencePoints[Math.floor(referencePoints.length / 2)];
  return [
    normalizePoint(referencePoints[0]),
    normalizePoint(middle),
    normalizePoint(referencePoints[referencePoints.length - 1])
  ];
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

const limitPointCount = (points, maxCount = 44) => {
  if (points.length <= maxCount) {
    return points;
  }

  const spacing = Math.max(1, (points.length - 1) / (maxCount - 1));
  return Array.from({ length: maxCount }, (_, index) => {
    if (index === maxCount - 1) {
      return points[points.length - 1];
    }
    return points[Math.round(index * spacing)];
  });
};

const pickHighValueAnchors = (points, maxAnchors) => {
  if (points.length <= maxAnchors) {
    return points;
  }

  const selected = new Set([0, points.length - 1]);
  while (selected.size < maxAnchors) {
    const ordered = [...selected].sort((first, second) => first - second);
    let bestIndex = -1;
    let bestScore = -1;

    for (let spanIndex = 0; spanIndex < ordered.length - 1; spanIndex += 1) {
      const startIndex = ordered[spanIndex];
      const endIndex = ordered[spanIndex + 1];
      if (endIndex - startIndex <= 1) {
        continue;
      }

      for (let index = startIndex + 1; index < endIndex; index += 1) {
        const distance = perpendicularDistance(points[index], points[startIndex], points[endIndex]);
        const spanBalance = Math.min(index - startIndex, endIndex - index);
        const score = distance + spanBalance * 0.04;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
    }

    if (bestIndex < 0) {
      break;
    }
    selected.add(bestIndex);
  }

  return [...selected]
    .sort((first, second) => first - second)
    .map((index) => points[index]);
};

const softenGuideAnchors = (anchors, smoothing) => {
  if (anchors.length <= 3) {
    return anchors;
  }

  const strength = smoothing.tangentSmoothing * smoothing.algorithmPriority;
  return anchors.map((anchor, index) => {
    if (index === 0 || index === anchors.length - 1) {
      return anchor;
    }

    const previous = anchors[index - 1];
    const next = anchors[index + 1];
    const turnDistance = perpendicularDistance(anchor, previous, next);
    const localSpan = Math.max(1, distanceBetweenPoints(previous, next));
    const turnRatio = clamp(turnDistance / localSpan, 0, 1);
    const midpoint = {
      x: (previous.x + next.x) / 2,
      y: (previous.y + next.y) / 2
    };
    const pull = clamp(0.18 + strength * 0.34 - turnRatio * 0.16, 0.08, 0.42);

    return {
      x: Math.round(anchor.x * (1 - pull) + midpoint.x * pull),
      y: Math.round(anchor.y * (1 - pull) + midpoint.y * pull)
    };
  });
};

const getSplineControls = (anchors, index, smoothing) => {
  const p0 = anchors[Math.max(0, index - 1)];
  const p1 = anchors[index];
  const p2 = anchors[index + 1];
  const p3 = anchors[Math.min(anchors.length - 1, index + 2)];
  const segmentLength = Math.max(1, distanceBetweenPoints(p1, p2));
  const strength = 0.2 + smoothing.strength * 0.26 + smoothing.algorithmPriority * 0.12;
  const tangentScale = clamp(strength * smoothing.tangentSmoothing, 0.12, 0.52);
  const maxHandle = segmentLength * (0.22 + smoothing.tangentSmoothing * 0.18);
  const incoming = {
    x: (p2.x - p0.x) * tangentScale,
    y: (p2.y - p0.y) * tangentScale
  };
  const outgoing = {
    x: (p3.x - p1.x) * tangentScale,
    y: (p3.y - p1.y) * tangentScale
  };
  const incomingLength = Math.hypot(incoming.x, incoming.y) || 1;
  const outgoingLength = Math.hypot(outgoing.x, outgoing.y) || 1;
  const incomingLimit = Math.min(1, maxHandle / incomingLength);
  const outgoingLimit = Math.min(1, maxHandle / outgoingLength);

  return {
    cp1: {
      x: Math.round(p1.x + incoming.x * incomingLimit),
      y: Math.round(p1.y + incoming.y * incomingLimit)
    },
    cp2: {
      x: Math.round(p2.x - outgoing.x * outgoingLimit),
      y: Math.round(p2.y - outgoing.y * outgoingLimit)
    }
  };
};

const buildSplinePathFromAnchors = (anchors, smoothing = DEFAULT_SMOOTHING) => {
  const normalizedSmoothing = normalizeSmoothing(smoothing);
  if (anchors.length < 3) {
    return buildFreehandPathD(anchors, normalizedSmoothing);
  }

  let d = `M ${anchors[0].x} ${anchors[0].y}`;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const { cp1, cp2 } = getSplineControls(anchors, index, normalizedSmoothing);
    const end = anchors[index + 1];
    d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;
  }
  return d;
};

const sampleBezierSegment = (p0, p1, p2, p3, steps = 10) =>
  Array.from({ length: steps }, (_, stepIndex) => {
    const t = (stepIndex + 1) / steps;
    return normalizePoint(getBezierPoint(p0, p1, p2, p3, t));
  });

const sampleSplineAnchors = (anchors, smoothing = DEFAULT_SMOOTHING) => {
  if (anchors.length < 2) {
    return anchors;
  }

  const normalizedSmoothing = normalizeSmoothing(smoothing);
  const samples = [anchors[0]];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const { cp1, cp2 } = getSplineControls(anchors, index, normalizedSmoothing);
    samples.push(...sampleBezierSegment(anchors[index], cp1, cp2, anchors[index + 1], 10));
  }
  return samples;
};

const getUnitVector = (vector, fallback = { x: 0, y: 1 }) => {
  const length = Math.hypot(vector.x, vector.y);
  if (!length) {
    return fallback;
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
};

const getCubicPoint = (segment, t) =>
  getBezierPoint(segment.p0, segment.cp1, segment.cp2, segment.p1, t);

const estimateEndpointTangent = (points, atEnd = false) => {
  if (points.length < 2) {
    return { x: 0, y: 1 };
  }

  if (atEnd) {
    const end = points[points.length - 1];
    const previous = points[Math.max(0, points.length - 4)];
    return getUnitVector({ x: end.x - previous.x, y: end.y - previous.y });
  }

  const start = points[0];
  const next = points[Math.min(points.length - 1, 3)];
  return getUnitVector({ x: next.x - start.x, y: next.y - start.y });
};

const createBezierSegment = (points) => {
  const p0 = normalizePoint(points[0]);
  const p1 = normalizePoint(points[points.length - 1]);
  const startTangent = estimateEndpointTangent(points, false);
  const endTangent = estimateEndpointTangent(points, true);
  const chordLength = Math.max(distanceBetweenPoints(p0, p1), getPolylineLength(points) * 0.28, 12);
  const handleLength = chordLength / 3;

  return {
    p0,
    cp1: {
      x: Math.round(p0.x + startTangent.x * handleLength),
      y: Math.round(p0.y + startTangent.y * handleLength)
    },
    cp2: {
      x: Math.round(p1.x - endTangent.x * handleLength),
      y: Math.round(p1.y - endTangent.y * handleLength)
    },
    p1
  };
};

const getSegmentFitError = (points, segment) => {
  if (points.length <= 2) {
    return { maxError: 0, splitIndex: 1 };
  }

  let maxError = 0;
  let splitIndex = Math.floor(points.length / 2);
  for (let index = 1; index < points.length - 1; index += 1) {
    const t = index / (points.length - 1);
    const curvePoint = getCubicPoint(segment, t);
    const distance = distanceBetweenPoints(points[index], curvePoint);
    if (distance > maxError) {
      maxError = distance;
      splitIndex = index;
    }
  }

  return { maxError, splitIndex };
};

const fitBezierSegmentsRecursive = (points, tolerance, maxSegments, segments = []) => {
  if (points.length < 2) {
    return segments;
  }

  const segment = createBezierSegment(points);
  const { maxError, splitIndex } = getSegmentFitError(points, segment);
  const canSplit = segments.length + 1 < maxSegments && splitIndex > 0 && splitIndex < points.length - 1;

  if (maxError <= tolerance || !canSplit) {
    segments.push(segment);
    return segments;
  }

  fitBezierSegmentsRecursive(points.slice(0, splitIndex + 1), tolerance, maxSegments, segments);
  fitBezierSegmentsRecursive(points.slice(splitIndex), tolerance, maxSegments, segments);
  return segments;
};

const getDirectionTurnAngle = (points, index) => {
  if (index <= 0 || index >= points.length - 1) {
    return 0;
  }

  const incoming = {
    x: points[index].x - points[index - 1].x,
    y: points[index].y - points[index - 1].y
  };
  const outgoing = {
    x: points[index + 1].x - points[index].x,
    y: points[index + 1].y - points[index].y
  };
  return getTangentAngleDifference(incoming, outgoing) || 0;
};

const extractShapeLandmarks = (points, smoothing) => {
  if (points.length <= 2) {
    return points;
  }

  const landmarkIndexes = new Set([0, points.length - 1]);
  const extrema = [
    { key: "x", mode: "min" },
    { key: "x", mode: "max" },
    { key: "y", mode: "min" },
    { key: "y", mode: "max" }
  ];

  extrema.forEach(({ key, mode }) => {
    let targetIndex = 0;
    points.forEach((point, index) => {
      if (
        (mode === "min" && point[key] < points[targetIndex][key]) ||
        (mode === "max" && point[key] > points[targetIndex][key])
      ) {
        targetIndex = index;
      }
    });
    landmarkIndexes.add(targetIndex);
  });

  const turnCandidates = points
    .map((point, index) => ({ index, angle: getDirectionTurnAngle(points, index) }))
    .filter((item) => item.index > 0 && item.index < points.length - 1 && item.angle >= 28)
    .sort((first, second) => second.angle - first.angle);
  const maxTurnLandmarks = Math.max(3, Math.round(3 + smoothing.algorithmPriority * 5));
  turnCandidates.slice(0, maxTurnLandmarks).forEach(({ index }) => landmarkIndexes.add(index));

  return [...landmarkIndexes]
    .sort((first, second) => first - second)
    .map((index) => points[index]);
};

const getPointSequenceIndexes = (points, selectedPoints) =>
  selectedPoints
    .map((selected) => points.findIndex((point) => distanceBetweenPoints(point, selected) <= 1))
    .filter((index) => index >= 0)
    .sort((first, second) => first - second);

const getTriangleDistance = (point, start, end) => {
  const lineLength = distanceBetweenPoints(start, end);
  if (!lineLength) {
    return distanceBetweenPoints(point, start);
  }

  return Math.abs(
    (end.y - start.y) * point.x -
    (end.x - start.x) * point.y +
    end.x * start.y -
    end.y * start.x
  ) / lineLength;
};

const removeRedundantWaypoints = (waypoints, minDistance = 72, maxAngle = 14, minCount = 5) => {
  if (waypoints.length <= 2) {
    return { waypoints, removed: 0 };
  }

  const reduced = [waypoints[0]];
  let removed = 0;

  for (let index = 1; index < waypoints.length - 1; index += 1) {
    const previous = reduced[reduced.length - 1];
    const current = waypoints[index];
    const next = waypoints[index + 1];
    const tooClose =
      distanceBetweenPoints(previous, current) < minDistance ||
      distanceBetweenPoints(current, next) < minDistance;
    const extremelyClose =
      distanceBetweenPoints(previous, current) < minDistance * 0.42 ||
      distanceBetweenPoints(current, next) < minDistance * 0.42;
    const nearlyCollinear = getDirectionTurnAngle([previous, current, next], 1) < maxAngle;

    if (
      extremelyClose ||
      (tooClose && nearlyCollinear && reduced.length + (waypoints.length - index) > minCount)
    ) {
      removed += 1;
      continue;
    }

    reduced.push(current);
  }

  reduced.push(waypoints[waypoints.length - 1]);
  return { waypoints: reduced, removed };
};

const extractDesignerWaypoints = (points, smoothing) => {
  if (points.length <= 2) {
    return {
      designerWaypoints: points.map(normalizePoint),
      redundantWaypointRemovalCount: 0
    };
  }

  const shapeLandmarks = extractShapeLandmarks(points, smoothing);
  const landmarkIndexes = new Set(getPointSequenceIndexes(points, shapeLandmarks));
  const targetCount = Math.max(5, Math.min(7, Math.round(7 - smoothing.algorithmPriority * 1.5)));

  while (landmarkIndexes.size > targetCount) {
    const indexes = [...landmarkIndexes].sort((first, second) => first - second);
    const removable = indexes
      .slice(1, -1)
      .map((index) => {
        const position = indexes.indexOf(index);
        const previous = points[indexes[position - 1]];
        const current = points[index];
        const next = points[indexes[position + 1]];
        return {
          index,
          score: getTriangleDistance(current, previous, next) +
            getDirectionTurnAngle([previous, current, next], 1) * 1.2
        };
      })
      .sort((first, second) => first.score - second.score);

    if (!removable.length) {
      break;
    }
    landmarkIndexes.delete(removable[0].index);
  }

  let waypoints = [...landmarkIndexes]
    .sort((first, second) => first - second)
    .map((index) => normalizePoint(points[index]));
  const reduced = removeRedundantWaypoints(waypoints, 56 + smoothing.algorithmPriority * 34, 12, 5);
  waypoints = reduced.waypoints;

  return {
    designerWaypoints: waypoints,
    shapeLandmarks: waypoints,
    redundantWaypointRemovalCount: reduced.removed
  };
};

const smoothTangentVectors = (vectors, passes = 2) => {
  let smoothed = vectors.map((vector) => getUnitVector(vector));
  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = smoothed.map((vector, index) => {
      if (index === 0 || index === smoothed.length - 1) {
        return vector;
      }
      return getUnitVector({
        x: vector.x * 0.5 + smoothed[index - 1].x * 0.25 + smoothed[index + 1].x * 0.25,
        y: vector.y * 0.5 + smoothed[index - 1].y * 0.25 + smoothed[index + 1].y * 0.25
      }, vector);
    });
  }
  return smoothed;
};

const getDesignerTangents = (waypoints, points, smoothing) => {
  if (waypoints.length < 2) {
    return [];
  }

  const tangents = waypoints.map((point, index) => {
    if (index === 0) {
      return estimateEndpointTangent(points, false);
    }
    if (index === waypoints.length - 1) {
      return estimateEndpointTangent(points, true);
    }

    const broad = getUnitVector({
      x: waypoints[index + 1].x - waypoints[index - 1].x,
      y: waypoints[index + 1].y - waypoints[index - 1].y
    });
    const rawNearest = findNearestPoint(points, point)?.point || point;
    const rawIndex = points.findIndex((item) => distanceBetweenPoints(item, rawNearest) <= 1);
    const local = rawIndex > 0 && rawIndex < points.length - 1
      ? getUnitVector({
        x: points[Math.min(points.length - 1, rawIndex + 2)].x - points[Math.max(0, rawIndex - 2)].x,
        y: points[Math.min(points.length - 1, rawIndex + 2)].y - points[Math.max(0, rawIndex - 2)].y
      }, broad)
      : broad;
    const broadWeight = 0.68 + smoothing.algorithmPriority * 0.2;
    return getUnitVector({
      x: broad.x * broadWeight + local.x * (1 - broadWeight),
      y: broad.y * broadWeight + local.y * (1 - broadWeight)
    }, broad);
  });

  return smoothTangentVectors(tangents, Math.round(1 + smoothing.strength * 2));
};

const getBoundedHandleLength = (point, tangent, length, direction, height) => {
  let bounded = length;
  const margin = 72;
  const vector = {
    x: tangent.x * direction,
    y: tangent.y * direction
  };

  if (vector.x > 0) {
    bounded = Math.min(bounded, (SVG_WIDTH + margin - point.x) / vector.x);
  } else if (vector.x < 0) {
    bounded = Math.min(bounded, (point.x + margin) / Math.abs(vector.x));
  }

  if (vector.y > 0) {
    bounded = Math.min(bounded, (height + margin - point.y) / vector.y);
  } else if (vector.y < 0) {
    bounded = Math.min(bounded, (point.y + margin) / Math.abs(vector.y));
  }

  return Math.max(18, Math.min(length, bounded - 2));
};

const buildDesignerBezierSegments = (waypoints, tangentVectors, smoothing, height) => {
  const segments = [];
  let handleClampCount = 0;
  const baseHandleScale = 0.28 + smoothing.strength * 0.12 + smoothing.algorithmPriority * 0.06;

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const p0 = waypoints[index];
    const p1 = waypoints[index + 1];
    const chordLength = distanceBetweenPoints(p0, p1);
    const previousChord = index > 0 ? distanceBetweenPoints(waypoints[index - 1], p0) : chordLength;
    const nextChord = index < waypoints.length - 2 ? distanceBetweenPoints(p1, waypoints[index + 2]) : chordLength;
    const outLimit = Math.min(chordLength * 0.48, previousChord * 0.42, 190);
    const inLimit = Math.min(chordLength * 0.48, nextChord * 0.42, 190);
    const targetOutLength = clamp(chordLength * baseHandleScale, 26, outLimit);
    const targetInLength = clamp(chordLength * baseHandleScale, 26, inLimit);
    const outLength = getBoundedHandleLength(p0, tangentVectors[index], targetOutLength, 1, height);
    const inLength = getBoundedHandleLength(p1, tangentVectors[index + 1], targetInLength, -1, height);
    if (outLength < targetOutLength || inLength < targetInLength || targetOutLength === outLimit || targetInLength === inLimit) {
      handleClampCount += 1;
    }

    segments.push({
      p0,
      cp1: {
        x: Math.round(p0.x + tangentVectors[index].x * outLength),
        y: Math.round(p0.y + tangentVectors[index].y * outLength)
      },
      cp2: {
        x: Math.round(p1.x - tangentVectors[index + 1].x * inLength),
        y: Math.round(p1.y - tangentVectors[index + 1].y * inLength)
      },
      p1
    });
  }

  return { segments, handleClampCount };
};

const getInternalJoinTangentMismatches = (segments) => {
  const mismatches = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const incoming = getBezierSegmentTangent(segments[index], "end");
    const outgoing = getBezierSegmentTangent(segments[index + 1], "start");
    mismatches.push(getTangentAngleDifference(incoming, outgoing) || 0);
  }
  return mismatches;
};

const buildPathDFromBezierSegments = (segments) => {
  if (!segments.length) {
    return "";
  }

  return segments.reduce((path, segment, index) => {
    const command = `C ${segment.cp1.x} ${segment.cp1.y} ${segment.cp2.x} ${segment.cp2.y} ${segment.p1.x} ${segment.p1.y}`;
    if (index === 0) {
      return `M ${segment.p0.x} ${segment.p0.y} ${command}`;
    }
    return `${path} ${command}`;
  }, "");
};

const sampleBezierSegments = (segments, stepsPerSegment = 28) => {
  if (!segments.length) {
    return [];
  }

  const samples = [segments[0].p0];
  segments.forEach((segment) => {
    samples.push(...sampleBezierSegment(segment.p0, segment.cp1, segment.cp2, segment.p1, stepsPerSegment));
  });
  return samples.map(normalizePoint);
};

const fitBoundedBezierPath = (points, smoothing) => {
  const {
    designerWaypoints,
    shapeLandmarks,
    redundantWaypointRemovalCount
  } = extractDesignerWaypoints(points, smoothing);
  const tangentVectors = getDesignerTangents(designerWaypoints, points, smoothing);
  const localHeight = Math.max(...points.map((point) => point.y), ...designerWaypoints.map((point) => point.y), 1);
  const { segments, handleClampCount } = buildDesignerBezierSegments(
    designerWaypoints,
    tangentVectors,
    smoothing,
    localHeight
  );

  const finalSplinePoints = sampleBezierSegments(segments);
  const deviationStats = getDeviationStats(points, finalSplinePoints);
  const curvatureStats = getCurvatureStats(finalSplinePoints);
  const internalJoinTangentMismatches = getInternalJoinTangentMismatches(segments);
  const maxInternalJoinTangentMismatchDeg = internalJoinTangentMismatches.length
    ? Math.max(...internalJoinTangentMismatches)
    : 0;
  const shapePreservationWarning =
    deviationStats.averageRawToFinalDeviation > 45 ||
    deviationStats.maxRawToFinalDeviation > 120;
  const smoothnessQualityPass =
    maxInternalJoinTangentMismatchDeg <= 8 &&
    curvatureStats.curvatureSpikeCount <= 3 &&
    !shapePreservationWarning;

  return {
    designerWaypoints,
    shapeLandmarks,
    tangentVectors,
    bezierSegments: segments,
    fittedBezierSegments: segments,
    finalSplinePoints,
    finalSvgPath: buildPathDFromBezierSegments(segments),
    diagnostics: {
      fittingModel: "designer-route-bezier",
      designerWaypointCount: designerWaypoints.length,
      shapeLandmarkCount: shapeLandmarks.length,
      fittedBezierSegmentCount: segments.length,
      finalSamplePointCount: finalSplinePoints.length,
      maxTurnAngleDeg: getMaxTurnAngle(finalSplinePoints),
      maxInternalJoinTangentMismatchDeg,
      internalJoinTangentMismatches,
      handleClampCount,
      redundantWaypointRemovalCount,
      ...curvatureStats,
      ...deviationStats,
      smoothnessQualityPass,
      shapePreservationWarning
    }
  };
};

const getBezierSegmentTangent = (segment, boundary) => {
  if (!segment) {
    return null;
  }

  if (boundary === "start") {
    return {
      x: segment.cp1.x - segment.p0.x,
      y: segment.cp1.y - segment.p0.y
    };
  }

  return {
    x: segment.p1.x - segment.cp2.x,
    y: segment.p1.y - segment.cp2.y
  };
};

const cloneBezierSegment = (segment) => ({
  p0: normalizePoint(segment.p0),
  cp1: normalizePoint(segment.cp1),
  cp2: normalizePoint(segment.cp2),
  p1: normalizePoint(segment.p1)
});

const getAreaPathSamplesForDiagnostics = (area) =>
  area.path.finalSplinePoints?.length
    ? area.path.finalSplinePoints
    : sampleBezierSegments(area.path.fittedBezierSegments || []);

const updateAreaDiagnosticsFromSegments = (area) => {
  const finalSplinePoints = sampleBezierSegments(area.path.fittedBezierSegments || []);
  const finalSvgPath = buildPathDFromBezierSegments(area.path.fittedBezierSegments || []);
  const rawPoints = area.path.rawPoints || [];
  const curvatureStats = getCurvatureStats(finalSplinePoints);
  const deviationStats = getDeviationStats(rawPoints, finalSplinePoints);
  const shapePreservationWarning =
    deviationStats.averageRawToFinalDeviation > 45 ||
    deviationStats.maxRawToFinalDeviation > 120;

  area.path.finalSplinePoints = finalSplinePoints;
  area.path.smoothPoints = finalSplinePoints;
  area.path.finalSvgPath = finalSvgPath;
  area.path.d = finalSvgPath;
  area.path.globalFitDiagnostics = {
    ...(area.path.globalFitDiagnostics || {}),
    fittingModel: "designer-route-bezier",
    areaId: area.id,
    rawPointCount: rawPoints.length,
    filteredPointCount: area.path.filteredPoints?.length || 0,
    resampledPointCount: area.path.resampledPoints?.length || 0,
    designerWaypointCount: area.path.designerWaypoints?.length || area.path.shapeLandmarks?.length || 0,
    shapeLandmarkCount: area.path.shapeLandmarks?.length || 0,
    fittedBezierSegmentCount: area.path.fittedBezierSegments?.length || 0,
    finalSamplePointCount: finalSplinePoints.length,
    maxTurnAngleDeg: getMaxTurnAngle(finalSplinePoints),
    maxInternalJoinTangentMismatchDeg: Math.max(
      0,
      ...getInternalJoinTangentMismatches(area.path.fittedBezierSegments || [])
    ),
    internalJoinTangentMismatches: getInternalJoinTangentMismatches(area.path.fittedBezierSegments || []),
    handleClampCount: area.path.globalFitDiagnostics?.handleClampCount || 0,
    redundantWaypointRemovalCount: area.path.globalFitDiagnostics?.redundantWaypointRemovalCount || 0,
    ...curvatureStats,
    ...deviationStats,
    smoothnessQualityPass:
      Math.max(0, ...getInternalJoinTangentMismatches(area.path.fittedBezierSegments || [])) <= 8 &&
      curvatureStats.curvatureSpikeCount <= 3 &&
      !shapePreservationWarning,
    shapePreservationWarning
  };
};

const canAcceptBoundaryHandleUpdate = (area, nextSegments) => {
  const rawPoints = area.path.rawPoints || [];
  const currentSamples = getAreaPathSamplesForDiagnostics(area);
  const currentDeviation = getDeviationStats(rawPoints, currentSamples);
  const nextSamples = sampleBezierSegments(nextSegments);
  const nextDeviation = getDeviationStats(rawPoints, nextSamples);

  if (nextDeviation.averageRawToFinalDeviation > 45 || nextDeviation.maxRawToFinalDeviation > 120) {
    return false;
  }

  return nextDeviation.maxRawToFinalDeviation <= currentDeviation.maxRawToFinalDeviation + 18;
};

const updateBoundarySegmentEndpoints = (previousArea, nextArea, sharedX) => {
  const previousSegments = (previousArea.path.fittedBezierSegments || []).map(cloneBezierSegment);
  const nextSegments = (nextArea.path.fittedBezierSegments || []).map(cloneBezierSegment);
  const previousSegment = previousSegments[previousSegments.length - 1];
  const nextSegment = nextSegments[0];

  if (!previousSegment || !nextSegment) {
    setAreaPathBoundaryPoint(previousArea, "end", { x: sharedX, y: previousArea.height });
    setAreaPathBoundaryPoint(nextArea, "start", { x: sharedX, y: 0 });
    return {
      previousSegments,
      nextSegments,
      tangentLimited: true
    };
  }

  previousSegment.p1 = { x: sharedX, y: previousArea.height };
  nextSegment.p0 = { x: sharedX, y: 0 };

  const previousBefore = previousSegment.cp2;
  const nextAfter = nextSegment.cp1;
  const incoming = getUnitVector({
    x: previousSegment.p1.x - previousBefore.x,
    y: previousSegment.p1.y - previousBefore.y
  });
  const outgoing = getUnitVector({
    x: nextAfter.x - nextSegment.p0.x,
    y: nextAfter.y - nextSegment.p0.y
  });
  const blended = getUnitVector({
    x: incoming.x + outgoing.x,
    y: incoming.y + outgoing.y
  }, incoming);
  const strength = Math.min(
    0.55,
    (
      normalizeSmoothing(previousArea.path.smoothing).boundaryTangentSmoothing +
      normalizeSmoothing(nextArea.path.smoothing).boundaryTangentSmoothing
    ) / 4
  );
  const previousHandleLength = Math.min(140, Math.max(28, distanceBetweenPoints(previousBefore, previousSegment.p1)));
  const nextHandleLength = Math.min(140, Math.max(28, distanceBetweenPoints(nextAfter, nextSegment.p0)));
  const candidatePrevious = previousSegments.map(cloneBezierSegment);
  const candidateNext = nextSegments.map(cloneBezierSegment);
  const candidatePreviousSegment = candidatePrevious[candidatePrevious.length - 1];
  const candidateNextSegment = candidateNext[0];

  candidatePreviousSegment.cp2 = {
    x: Math.round(previousSegment.cp2.x * (1 - strength) + (previousSegment.p1.x - blended.x * previousHandleLength) * strength),
    y: Math.round(previousSegment.cp2.y * (1 - strength) + (previousSegment.p1.y - blended.y * previousHandleLength) * strength)
  };
  candidateNextSegment.cp1 = {
    x: Math.round(nextSegment.cp1.x * (1 - strength) + (nextSegment.p0.x + blended.x * nextHandleLength) * strength),
    y: Math.round(nextSegment.cp1.y * (1 - strength) + (nextSegment.p0.y + blended.y * nextHandleLength) * strength)
  };

  const previousAccepted = canAcceptBoundaryHandleUpdate(previousArea, candidatePrevious);
  const nextAccepted = canAcceptBoundaryHandleUpdate(nextArea, candidateNext);

  previousArea.path.fittedBezierSegments = previousAccepted ? candidatePrevious : previousSegments;
  previousArea.path.bezierSegments = previousArea.path.fittedBezierSegments;
  nextArea.path.fittedBezierSegments = nextAccepted ? candidateNext : nextSegments;
  nextArea.path.bezierSegments = nextArea.path.fittedBezierSegments;

  return {
    previousSegments: previousArea.path.fittedBezierSegments,
    nextSegments: nextArea.path.fittedBezierSegments,
    tangentLimited: !previousAccepted || !nextAccepted
  };
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

const globalToLocalPoint = (point, layout) => ({
  x: Math.round(clamp(point.x, 0, SVG_WIDTH)),
  y: Math.round(clamp(point.y - layout.top, 0, layout.area.height))
});

const stripPointMeta = (point) => ({ x: Math.round(point.x), y: Math.round(point.y) });

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

const getPolylineLength = (points) => points.reduce((total, point, index) => {
  if (index === 0) {
    return 0;
  }
  return total + distanceBetweenPoints(points[index - 1], point);
}, 0);

const resampleByCount = (points, count) => {
  if (points.length <= 2 || count <= 2) {
    return points;
  }

  const totalLength = getPolylineLength(points);
  if (!totalLength) {
    return points;
  }

  const spacing = totalLength / (count - 1);
  return resamplePointsByDistance(points, spacing).slice(0, count - 1).concat(points[points.length - 1]);
};

const buildGlobalRoughRoute = (layouts) => {
  const route = [];
  const areaSources = new Map();

  layouts.forEach((layout) => {
    const localPoints = getRoughLocalPointsForArea(layout.area);
    const normalized = localPoints.length >= 2
      ? localPoints
      : [
        { x: SVG_WIDTH / 2, y: 0 },
        { x: SVG_WIDTH / 2, y: layout.area.height }
      ];
    const globalPoints = normalized.map((point) => localToGlobalPoint(point, layout));
    areaSources.set(layout.area.id, {
      localPoints: normalized,
      globalPoints
    });
    route.push(...globalPoints.map(stripPointMeta));
  });

  return {
    route: filterJitterPoints(route, 12),
    areaSources
  };
};

const buildBoundaryConstraints = (layouts, areaSources) => {
  const constraints = [
    {
      type: "start",
      areaId: layouts[0]?.area.id,
      point: stripPointMeta(areaSources.get(layouts[0]?.area.id)?.globalPoints[0] || { x: SVG_WIDTH / 2, y: 0 })
    }
  ];

  for (let index = 0; index < layouts.length - 1; index += 1) {
    const previousLayout = layouts[index];
    const nextLayout = layouts[index + 1];
    const previousSource = areaSources.get(previousLayout.area.id)?.globalPoints || [];
    const nextSource = areaSources.get(nextLayout.area.id)?.globalPoints || [];
    const previousEnd = previousSource[previousSource.length - 1] || {
      x: SVG_WIDTH / 2,
      y: previousLayout.bottom
    };
    const nextStart = nextSource[0] || {
      x: SVG_WIDTH / 2,
      y: nextLayout.top
    };
    const sharedX = Math.round(clamp((previousEnd.x + nextStart.x) / 2, 0, SVG_WIDTH));

    constraints.push({
      type: "boundary",
      previousAreaId: previousLayout.area.id,
      nextAreaId: nextLayout.area.id,
      point: { x: sharedX, y: previousLayout.bottom },
      endpointGapBefore: Math.round(distanceBetweenPoints(previousEnd, nextStart)),
      tangentBefore: null
    });
  }

  const lastLayout = layouts[layouts.length - 1];
  const lastSource = areaSources.get(lastLayout?.area.id)?.globalPoints || [];
  constraints.push({
    type: "end",
    areaId: lastLayout?.area.id,
    point: stripPointMeta(lastSource[lastSource.length - 1] || {
      x: SVG_WIDTH / 2,
      y: lastLayout?.bottom || 0
    })
  });

  return constraints;
};

const insertConstraintPoints = (points, constraints) => {
  const merged = [...points.map(stripPointMeta)];
  constraints.forEach((constraint) => {
    const nearest = findNearestPoint(merged, constraint.point);
    if (!nearest || nearest.distance > 2) {
      merged.push(stripPointMeta(constraint.point));
    }
  });
  return merged.sort((first, second) => first.y - second.y || first.x - second.x);
};

const isPointNearConstraint = (point, constraints, tolerance = 2) =>
  constraints.some((constraint) => distanceBetweenPoints(point, constraint.point) <= tolerance);

const extractGlobalControlPoints = (roughRoute, constraints, smoothing) => {
  const resampled = resamplePointsByDistance(roughRoute, smoothing.resampleSpacing + 60 * smoothing.algorithmPriority);
  const tolerance = 42 + smoothing.simplification * 110 + smoothing.algorithmPriority * 38;
  const simplified = ensureUsefulCurvePoints(simplifyPoints(resampled, tolerance), resampled);
  const targetCount = Math.max(
    constraints.length + 2,
    Math.min(24, constraints.length + smoothing.maxAnchors * 2)
  );
  const selected = pickHighValueAnchors(simplified, targetCount);
  return insertConstraintPoints(selected, constraints);
};

const fairGlobalControlPoints = (controlPoints, roughRoute, constraints, smoothing) => {
  let faired = controlPoints.map(stripPointMeta);
  const fixed = new Set();
  faired.forEach((point, index) => {
    if (index === 0 || index === faired.length - 1 || isPointNearConstraint(point, constraints)) {
      fixed.add(index);
    }
  });

  const iterations = Math.round(10 + smoothing.strength * 18 + smoothing.algorithmPriority * 16);
  const smoothWeight = 0.62 + smoothing.algorithmPriority * 0.25;
  const fidelityWeight = 0.08 + (1 - smoothing.algorithmPriority) * 0.18;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    faired = faired.map((point, index) => {
      if (fixed.has(index)) {
        const constraint = constraints.find((item) => distanceBetweenPoints(point, item.point) <= 2);
        return constraint ? stripPointMeta(constraint.point) : point;
      }

      const previous = faired[index - 1];
      const next = faired[index + 1];
      if (!previous || !next) {
        return point;
      }

      const average = {
        x: (previous.x + next.x) / 2,
        y: (previous.y + next.y) / 2
      };
      const nearestRough = findNearestPoint(roughRoute, point)?.point || point;
      return {
        x: Math.round(point.x * (1 - smoothWeight - fidelityWeight) + average.x * smoothWeight + nearestRough.x * fidelityWeight),
        y: Math.round(point.y * (1 - smoothWeight - fidelityWeight) + average.y * smoothWeight + nearestRough.y * fidelityWeight)
      };
    });
  }

  return faired.map((point) => ({
    x: Math.round(clamp(point.x, 0, SVG_WIDTH)),
    y: Math.round(point.y)
  }));
};

const getMaxTurnAngle = (points) => {
  let maxAngle = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = { x: current.x - previous.x, y: current.y - previous.y };
    const outgoing = { x: next.x - current.x, y: next.y - current.y };
    const angle = getTangentAngleDifference(incoming, outgoing);
    if (angle !== null) {
      maxAngle = Math.max(maxAngle, angle);
    }
  }
  return Math.round(maxAngle);
};

const getCurvatureStats = (points) => {
  const angleChanges = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = { x: current.x - previous.x, y: current.y - previous.y };
    const outgoing = { x: next.x - current.x, y: next.y - current.y };
    const angle = getTangentAngleDifference(incoming, outgoing);
    if (angle !== null) {
      angleChanges.push(angle);
    }
  }

  return {
    maxCurvatureEstimate: angleChanges.length ? Math.max(...angleChanges) : 0,
    curvatureSpikeCount: angleChanges.filter((angle) => angle > 36).length
  };
};

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

const splitGlobalSamplesByArea = (globalSamples, layouts, constraints) => {
  const samplesByArea = new Map(layouts.map((layout) => [layout.area.id, []]));

  globalSamples.forEach((point) => {
    const layout = layouts.find((item) => point.y >= item.top && point.y <= item.bottom)
      || layouts.reduce((nearest, item) => {
        const distance = Math.min(Math.abs(point.y - item.top), Math.abs(point.y - item.bottom));
        return !nearest || distance < nearest.distance ? { layout: item, distance } : nearest;
      }, null)?.layout;
    if (layout) {
      samplesByArea.get(layout.area.id).push(globalToLocalPoint(point, layout));
    }
  });

  layouts.forEach((layout, index) => {
    const areaSamples = samplesByArea.get(layout.area.id);
    const startConstraint = index === 0
      ? constraints[0]
      : constraints.find((constraint) => constraint.nextAreaId === layout.area.id);
    const endConstraint = index === layouts.length - 1
      ? constraints[constraints.length - 1]
      : constraints.find((constraint) => constraint.previousAreaId === layout.area.id);

    if (startConstraint) {
      areaSamples.unshift(globalToLocalPoint(startConstraint.point, layout));
    }
    if (endConstraint) {
      areaSamples.push(globalToLocalPoint(endConstraint.point, layout));
    }

    const cleaned = filterJitterPoints(areaSamples, 2);
    samplesByArea.set(layout.area.id, ensureUsefulCurvePoints(cleaned, areaSamples));
  });

  return samplesByArea;
};

const getTangentAroundY = (samples, boundaryY, side) => {
  const sorted = [...samples].sort((first, second) => first.y - second.y);
  if (side === "before") {
    const before = [...sorted].reverse().find((point) => point.y < boundaryY - 1);
    const at = [...sorted].reverse().find((point) => point.y <= boundaryY + 1);
    return before && at ? { x: at.x - before.x, y: at.y - before.y } : null;
  }

  const at = sorted.find((point) => point.y >= boundaryY - 1);
  const after = sorted.find((point) => point.y > boundaryY + 1);
  return at && after ? { x: after.x - at.x, y: after.y - at.y } : null;
};

const buildBoundaryDiagnosticsFromGlobal = (constraints, globalRoughRoute, globalFinalSamples) =>
  constraints
    .filter((constraint) => constraint.type === "boundary")
    .map((constraint) => {
      const beforeIncoming = getTangentAroundY(globalRoughRoute, constraint.point.y, "before");
      const beforeOutgoing = getTangentAroundY(globalRoughRoute, constraint.point.y, "after");
      const afterIncoming = getTangentAroundY(globalFinalSamples, constraint.point.y, "before");
      const afterOutgoing = getTangentAroundY(globalFinalSamples, constraint.point.y, "after");
      const before = getTangentAngleDifference(beforeIncoming, beforeOutgoing);
      const after = getTangentAngleDifference(afterIncoming, afterOutgoing);

      return {
        previousAreaId: constraint.previousAreaId,
        nextAreaId: constraint.nextAreaId,
        endpointGapBefore: constraint.endpointGapBefore,
        endpointGapAfter: 0,
        tangentAngleDifferenceBefore: before,
        tangentAngleDifferenceAfter: after,
        tangentImprovementDeg: before !== null && after !== null ? Math.max(0, before - after) : null,
        sharedConnectionPoint: stripPointMeta(constraint.point),
        note: after !== null && before !== null && after >= before
          ? "Global fairing kept this boundary tangent near the rough route; inspect overlay before tightening."
          : ""
      };
    });

const applyGlobalApproximatingRoute = (areas, reason = "render") => {
  const layouts = getAreaLayouts(areas);
  if (layouts.length === 0) {
    return;
  }

  layouts.forEach((layout) => rebuildAreaPathData(layout.area));
  const smoothing = normalizeSmoothing(layouts[0].area.path.smoothing);
  const { route: globalRawRoutePoints, areaSources } = buildGlobalRoughRoute(layouts);
  const constraints = buildBoundaryConstraints(layouts, areaSources);
  const globalRouteWithConstraints = insertConstraintPoints(globalRawRoutePoints, constraints);
  const globalControlPointsBeforeFairing = extractGlobalControlPoints(
    globalRouteWithConstraints,
    constraints,
    smoothing
  );
  const globalControlPointsAfterFairing = fairGlobalControlPoints(
    globalControlPointsBeforeFairing,
    globalRouteWithConstraints,
    constraints,
    smoothing
  );
  const globalFinalSamples = sampleSplineAnchors(globalControlPointsAfterFairing, smoothing);
  const samplesByArea = splitGlobalSamplesByArea(globalFinalSamples, layouts, constraints);
  const boundaryDiagnostics = buildBoundaryDiagnosticsFromGlobal(
    constraints,
    globalRouteWithConstraints,
    globalFinalSamples
  );
  const perAreaFinalPaths = {};
  const perAreaDiagnostics = {};

  layouts.forEach((layout) => {
    const localFinalSamples = samplesByArea.get(layout.area.id) || [];
    const localControls = limitPointCount(localFinalSamples, Math.max(5, smoothing.maxAnchors + 4));
    const d = buildSplinePathFromAnchors(localControls, layout.area.path.smoothing);
    const rawLocalPoints = areaSources.get(layout.area.id)?.localPoints || [];
    const localBoundaryDiagnostics = boundaryDiagnostics.filter(
      (diagnostic) =>
        diagnostic.previousAreaId === layout.area.id ||
        diagnostic.nextAreaId === layout.area.id
    );
    const curvatureStats = getCurvatureStats(localFinalSamples);
    const deviationStats = getDeviationStats(rawLocalPoints, localFinalSamples);
    const diagnostics = {
      areaId: layout.area.id,
      rawPointCount: rawLocalPoints.length,
      filteredPointCount: layout.area.path.filteredPoints?.length || 0,
      resampledPointCount: layout.area.path.resampledPoints?.length || 0,
      guideAnchorCount: layout.area.path.guideAnchors?.length || 0,
      finalControlPointCount: localControls.length,
      finalSamplePointCount: localFinalSamples.length,
      maxTurnAngleDeg: getMaxTurnAngle(localFinalSamples),
      ...curvatureStats,
      ...deviationStats
    };

    layout.area.path.mode = "freehand";
    layout.area.path.alignedAnchors = localControls;
    layout.area.path.finalSplinePoints = localFinalSamples;
    layout.area.path.smoothPoints = localFinalSamples;
    layout.area.path.finalSvgPath = d;
    layout.area.path.d = d;
    layout.area.path.boundaryDiagnostics = localBoundaryDiagnostics;
    layout.area.path.globalFitDiagnostics = diagnostics;
    perAreaFinalPaths[layout.area.id] = d;
    perAreaDiagnostics[layout.area.id] = diagnostics;
    setCurveDebugData(layout.area, {
      rawPoints: rawLocalPoints,
      filteredPoints: layout.area.path.filteredPoints || [],
      resampledPoints: layout.area.path.resampledPoints || [],
      guideAnchors: layout.area.path.guideAnchors || [],
      alignedAnchors: localControls,
      finalSplinePoints: localFinalSamples,
      finalSvgPath: d,
      d
    }, localBoundaryDiagnostics);
  });

  globalCurveDebugData = {
    generatedAt: new Date().toISOString(),
    reason,
    globalRawRoutePoints: globalRouteWithConstraints,
    globalControlPointsBeforeFairing,
    globalControlPointsAfterFairing,
    globalFinalSamples,
    perAreaFinalPaths,
    perAreaDiagnostics,
    boundaryDiagnostics,
    smoothingSettings: smoothing,
    debugMetrics: {
      finalControlPointCount: globalControlPointsAfterFairing.length,
      finalSamplePointCount: globalFinalSamples.length,
      maxTurnAngleDeg: getMaxTurnAngle(globalFinalSamples),
      ...getCurvatureStats(globalFinalSamples)
    }
  };

  logHomepage("Applied global approximating spline route fitting.", {
    reason,
    areaCount: layouts.length,
    controlPointCount: globalControlPointsAfterFairing.length,
    boundaryCount: boundaryDiagnostics.length
  });
};

const chaikinSmooth = (points, iterations = 2) => {
  if (points.length <= 2 || iterations <= 0) {
    return points;
  }
  let smoothed = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = [smoothed[0]];
    for (let index = 0; index < smoothed.length - 1; index += 1) {
      const current = smoothed[index];
      const following = smoothed[index + 1];
      next.push(
        {
          x: Math.round(current.x * 0.75 + following.x * 0.25),
          y: Math.round(current.y * 0.75 + following.y * 0.25)
        },
        {
          x: Math.round(current.x * 0.25 + following.x * 0.75),
          y: Math.round(current.y * 0.25 + following.y * 0.75)
        }
      );
    }
    next.push(smoothed[smoothed.length - 1]);
    smoothed = next;
  }
  return smoothed;
};

const buildFreehandPathD = (points, smoothing = DEFAULT_SMOOTHING) => {
  const normalizedSmoothing = normalizeSmoothing(smoothing);
  if (points.length < 3) {
    return points.length ? `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}` : "";
  }
  return catmullRomToBezierPath(points, normalizedSmoothing.strength);
};

const processRawFreehandPoints = (rawPoints, smoothing = DEFAULT_SMOOTHING, options = {}) => {
  if (rawPoints.length < 3) {
    return null;
  }

  const normalizedSmoothing = normalizeSmoothing(smoothing);
  const priority = normalizedSmoothing.algorithmPriority;
  const sourcePoints = rawPoints.map((point) => normalizePoint(point));
  const jitterFiltered = filterJitterPoints(
    sourcePoints,
    Math.max(DRAW_POINT_MIN_DISTANCE, normalizedSmoothing.minPointDistance + priority * 10)
  );
  const intentionSpacing = Math.max(12, normalizedSmoothing.resampleSpacing + priority * 8);
  const resampled = resamplePointsByDistance(jitterFiltered, intentionSpacing);
  const boundedFit = fitBoundedBezierPath(resampled, normalizedSmoothing);
  const designerWaypoints = boundedFit.designerWaypoints;
  const shapeLandmarks = boundedFit.shapeLandmarks;
  const tangentVectors = boundedFit.tangentVectors;
  const bezierSegments = boundedFit.bezierSegments;
  const fittedBezierSegments = boundedFit.fittedBezierSegments;
  const finalSplinePoints = boundedFit.finalSplinePoints;
  const finalSvgPath = boundedFit.finalSvgPath;
  const diagnostics = {
    ...boundedFit.diagnostics,
    sourcePointCount: sourcePoints.length,
    rawPointCount: sourcePoints.length,
    filteredPointCount: jitterFiltered.length,
    resampledPointCount: resampled.length,
    guideAnchorCount: designerWaypoints.length,
    finalSplinePointCount: finalSplinePoints.length,
    maxAnchors: normalizedSmoothing.maxAnchors,
    fittingModel: "designer-route-bezier"
  };

  if (options.log) {
    logHomepage("Fitted designer-route Bezier curve from freehand guide.", {
      ...diagnostics,
      smoothing: normalizedSmoothing
    });
  }

  return {
    rawPoints: sourcePoints,
    filteredPoints: jitterFiltered,
    resampledPoints: resampled,
    guideAnchors: designerWaypoints,
    designerWaypoints,
    shapeLandmarks,
    tangentVectors,
    bezierSegments,
    fittedBezierSegments,
    alignedAnchors: designerWaypoints,
    smoothPoints: finalSplinePoints,
    finalSplinePoints,
    finalSvgPath,
    boundaryDiagnostics: [],
    diagnostics,
    d: finalSvgPath
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
    guideAnchors: processed.guideAnchors || [],
    designerWaypoints: processed.designerWaypoints || processed.shapeLandmarks || processed.guideAnchors || [],
    shapeLandmarks: processed.shapeLandmarks || processed.guideAnchors || [],
    tangentVectors: processed.tangentVectors || [],
    bezierSegments: processed.bezierSegments || processed.fittedBezierSegments || [],
    fittedBezierSegments: processed.fittedBezierSegments || [],
    alignedAnchors: processed.alignedAnchors || processed.guideAnchors || [],
    finalSplinePoints: processed.finalSplinePoints || processed.smoothPoints || [],
    finalSvgPath: processed.finalSvgPath || processed.d || "",
    smoothingSettings: normalizeSmoothing(area.path.smoothing),
    boundaryDiagnostics,
    diagnostics: processed.diagnostics || area.path.globalFitDiagnostics || {}
  };

  curveDebugDataByArea.set(area.id, debugData);
};

const applyProcessedFreehandPath = (area, processed, boundaryDiagnostics = []) => {
  area.path.mode = "freehand";
  area.path.rawPoints = processed.rawPoints || [];
  area.path.filteredPoints = processed.filteredPoints || [];
  area.path.resampledPoints = processed.resampledPoints || [];
  area.path.guideAnchors = processed.guideAnchors || [];
  area.path.designerWaypoints = processed.designerWaypoints || processed.shapeLandmarks || processed.guideAnchors || [];
  area.path.shapeLandmarks = processed.shapeLandmarks || processed.guideAnchors || [];
  area.path.tangentVectors = processed.tangentVectors || [];
  area.path.bezierSegments = processed.bezierSegments || processed.fittedBezierSegments || [];
  area.path.fittedBezierSegments = processed.fittedBezierSegments || [];
  area.path.alignedAnchors = processed.alignedAnchors || processed.guideAnchors || [];
  area.path.smoothPoints = processed.smoothPoints || processed.finalSplinePoints || [];
  area.path.finalSplinePoints = processed.finalSplinePoints || area.path.smoothPoints;
  area.path.finalSvgPath = processed.finalSvgPath || processed.d;
  area.path.boundaryDiagnostics = boundaryDiagnostics;
  area.path.globalFitDiagnostics = processed.diagnostics || area.path.globalFitDiagnostics || {};
  area.path.d = processed.d || area.path.finalSvgPath || "";
  setCurveDebugData(area, processed, boundaryDiagnostics);
};

const rebuildAreaPathData = (area) => {
  area.path.smoothing = normalizeSmoothing(area.path.smoothing);
  area.path.viewBox = `0 0 ${SVG_WIDTH} ${area.height}`;

  if (area.path.mode === "freehand") {
    const source = area.path.rawPoints?.length >= 3
      ? area.path.rawPoints
      : area.path.smoothPoints || [];
    const processed = processRawFreehandPoints(source, area.path.smoothing);
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

  if (area.path.mode === "freehand" && area.path.fittedBezierSegments?.length) {
    const segments = area.path.fittedBezierSegments.map(cloneBezierSegment);
    if (boundary === "start") {
      segments[0].p0 = safePoint;
    } else {
      segments[segments.length - 1].p1 = safePoint;
    }
    area.path.fittedBezierSegments = segments;
    area.path.bezierSegments = segments;
    updateAreaDiagnosticsFromSegments(area);
    return true;
  }

  if (area.path.mode === "freehand" && area.path.smoothPoints?.length >= 2) {
    const alignedAnchors = (area.path.alignedAnchors?.length >= 2
      ? area.path.alignedAnchors
      : area.path.guideAnchors || area.path.smoothPoints).map((item) => normalizePoint(item));
    const targetIndex = boundary === "start" ? 0 : alignedAnchors.length - 1;
    alignedAnchors[targetIndex] = safePoint;
    area.path.alignedAnchors = alignedAnchors;
    area.path.finalSplinePoints = sampleSplineAnchors(alignedAnchors, area.path.smoothing);
    area.path.smoothPoints = area.path.finalSplinePoints;
    if (area.path.rawPoints?.length >= 2) {
      const rawTargetIndex = boundary === "start" ? 0 : area.path.rawPoints.length - 1;
      area.path.rawPoints[rawTargetIndex] = safePoint;
    }
    area.path.finalSvgPath = buildSplinePathFromAnchors(alignedAnchors, area.path.smoothing);
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

const getBoundaryTangent = (points, boundary) => {
  if (!points || points.length < 2) {
    return null;
  }

  const firstIndex = boundary === "start" ? 0 : points.length - 2;
  const secondIndex = boundary === "start" ? 1 : points.length - 1;
  const first = points[firstIndex];
  const second = points[secondIndex];
  return {
    x: second.x - first.x,
    y: second.y - first.y
  };
};

const getTangentAngleDifference = (first, second) => {
  if (!first || !second) {
    return null;
  }

  const firstAngle = Math.atan2(first.y, first.x);
  const secondAngle = Math.atan2(second.y, second.x);
  let difference = Math.abs((firstAngle - secondAngle) * 180 / Math.PI);
  if (difference > 180) {
    difference = 360 - difference;
  }
  return Math.round(difference);
};

const applyBoundaryTangentSmoothing = (previousArea, nextArea, sharedX) => {
  const previousAnchors = previousArea.path.alignedAnchors || previousArea.path.guideAnchors;
  const nextAnchors = nextArea.path.alignedAnchors || nextArea.path.guideAnchors;
  if (!previousAnchors?.length || !nextAnchors?.length) {
    smoothBezierBoundaryHandles(
      previousArea,
      nextArea,
      { x: sharedX, y: previousArea.height },
      { x: sharedX, y: 0 }
    );
    return;
  }

  const previousStrength = normalizeSmoothing(previousArea.path.smoothing).boundaryTangentSmoothing;
  const nextStrength = normalizeSmoothing(nextArea.path.smoothing).boundaryTangentSmoothing;
  const strength = (previousStrength + nextStrength) / 2;
  const previousGuide = previousAnchors[previousAnchors.length - 2];
  const nextGuide = nextAnchors[1];
  if (!previousGuide || !nextGuide) {
    return;
  }

  const blendedX = Math.round(previousGuide.x * 0.5 + nextGuide.x * 0.5);
  const previousIndex = previousAnchors.length - 2;
  previousAnchors[previousIndex] = {
    x: Math.round(previousGuide.x * (1 - strength * 0.35) + blendedX * strength * 0.35),
    y: Math.round(previousGuide.y * (1 - strength * 0.2) + previousArea.height * strength * 0.2)
  };
  nextAnchors[1] = {
    x: Math.round(nextGuide.x * (1 - strength * 0.35) + blendedX * strength * 0.35),
    y: Math.round(nextGuide.y * (1 - strength * 0.2))
  };
};

const finalizeAlignedAreaPath = (area, boundaryDiagnostics = []) => {
  if (area.path.mode === "freehand" && area.path.fittedBezierSegments?.length) {
    updateAreaDiagnosticsFromSegments(area);
    area.path.boundaryDiagnostics = boundaryDiagnostics;
    setCurveDebugData(area, {
      rawPoints: area.path.rawPoints || [],
      filteredPoints: area.path.filteredPoints || [],
      resampledPoints: area.path.resampledPoints || [],
      guideAnchors: area.path.guideAnchors || [],
      designerWaypoints: area.path.designerWaypoints || area.path.shapeLandmarks || area.path.guideAnchors || [],
      shapeLandmarks: area.path.shapeLandmarks || area.path.guideAnchors || [],
      tangentVectors: area.path.tangentVectors || [],
      bezierSegments: area.path.bezierSegments || area.path.fittedBezierSegments || [],
      fittedBezierSegments: area.path.fittedBezierSegments || [],
      alignedAnchors: area.path.alignedAnchors || [],
      finalSplinePoints: area.path.finalSplinePoints || [],
      finalSvgPath: area.path.finalSvgPath || "",
      diagnostics: area.path.globalFitDiagnostics || {},
      d: area.path.d
    }, boundaryDiagnostics);
    return;
  }

  area.path.boundaryDiagnostics = boundaryDiagnostics;
  area.path.d = buildPathD(area.path.points || []);
};

const smoothBezierBoundaryHandles = (previousArea, nextArea, previousPoint, nextPoint) => {
  const previousAnchors = previousArea.path.points || [];
  const nextAnchors = nextArea.path.points || [];
  const previousEnd = previousAnchors[previousAnchors.length - 1];
  const previousBefore = previousAnchors[previousAnchors.length - 2];
  const nextStart = nextAnchors[0];
  const nextAfter = nextAnchors[1];

  if (previousEnd && previousBefore) {
    const distance = Math.min(
      180,
      Math.max(PATH_ALIGNMENT_HANDLE_DISTANCE, distanceBetweenPoints(previousBefore, previousPoint) * 0.45)
    );
    const direction = {
      x: previousPoint.x - previousBefore.x,
      y: previousPoint.y - previousBefore.y
    };
    const length = Math.hypot(direction.x, direction.y) || 1;
    previousEnd.cpIn = {
      x: Math.round(clamp(previousPoint.x - (direction.x / length) * distance, 0, SVG_WIDTH)),
      y: Math.round(clamp(previousPoint.y - (direction.y / length) * distance, 0, previousArea.height))
    };
  }

  if (nextStart && nextAfter) {
    const distance = Math.min(
      180,
      Math.max(PATH_ALIGNMENT_HANDLE_DISTANCE, distanceBetweenPoints(nextPoint, nextAfter) * 0.45)
    );
    const direction = {
      x: nextAfter.x - nextPoint.x,
      y: nextAfter.y - nextPoint.y
    };
    const length = Math.hypot(direction.x, direction.y) || 1;
    nextStart.cpOut = {
      x: Math.round(clamp(nextPoint.x + (direction.x / length) * distance, 0, SVG_WIDTH)),
      y: Math.round(clamp(nextPoint.y + (direction.y / length) * distance, 0, nextArea.height))
    };
  }
};

const buildLocalBoundaryDiagnostics = (layouts) => {
  const boundaryDiagnostics = [];

  for (let index = 0; index < layouts.length - 1; index += 1) {
    const previousArea = layouts[index].area;
    const nextArea = layouts[index + 1].area;
    const previousLayout = layouts[index];
    const nextLayout = layouts[index + 1];
    const previousSegmentsBefore = (previousArea.path.fittedBezierSegments || []).map(cloneBezierSegment);
    const nextSegmentsBefore = (nextArea.path.fittedBezierSegments || []).map(cloneBezierSegment);
    const previousLastBefore = previousSegmentsBefore[previousSegmentsBefore.length - 1];
    const nextFirstBefore = nextSegmentsBefore[0];

    if (!previousLastBefore || !nextFirstBefore) {
      continue;
    }

    const previousEndBefore = previousLastBefore.p1;
    const nextStartBefore = nextFirstBefore.p0;
    const endpointGapBefore = Math.round(distanceBetweenPoints(
      localToGlobalPoint(previousEndBefore, previousLayout),
      localToGlobalPoint(nextStartBefore, nextLayout)
    ));
    const tangentBefore = getTangentAngleDifference(
      getBezierSegmentTangent(previousLastBefore, "end"),
      getBezierSegmentTangent(nextFirstBefore, "start")
    );
    const sharedX = Math.round(clamp((previousEndBefore.x + nextStartBefore.x) / 2, 0, SVG_WIDTH));
    const result = updateBoundarySegmentEndpoints(previousArea, nextArea, sharedX);

    updateAreaDiagnosticsFromSegments(previousArea);
    updateAreaDiagnosticsFromSegments(nextArea);

    const previousLastAfter = result.previousSegments[result.previousSegments.length - 1];
    const nextFirstAfter = result.nextSegments[0];
    const endpointGapAfter = previousLastAfter && nextFirstAfter
      ? Math.round(distanceBetweenPoints(
        localToGlobalPoint(previousLastAfter.p1, previousLayout),
        localToGlobalPoint(nextFirstAfter.p0, nextLayout)
      ))
      : null;
    const tangentAfter = getTangentAngleDifference(
      getBezierSegmentTangent(previousLastAfter, "end"),
      getBezierSegmentTangent(nextFirstAfter, "start")
    );

    boundaryDiagnostics.push({
      previousAreaId: previousArea.id,
      nextAreaId: nextArea.id,
      endpointGapBefore,
      endpointGapAfter,
      tangentAngleDifferenceBefore: tangentBefore,
      tangentAngleDifferenceAfter: tangentAfter,
      tangentImprovementDeg: tangentBefore !== null && tangentAfter !== null
        ? Math.max(0, tangentBefore - tangentAfter)
        : null,
      sharedConnectionPoint: {
        x: sharedX,
        previousY: previousArea.height,
        nextY: 0
      },
      boundaryTangentLimitedByShapePreservation: result.tangentLimited
    });
  }

  return boundaryDiagnostics;
};

const applyDesignerRouteBezierFitting = (areas, reason = "render") => {
  const layouts = getAreaLayouts(areas);
  const perAreaFinalPaths = {};
  const perAreaDiagnostics = {};

  layouts.forEach((layout) => {
    const area = layout.area;
    rebuildAreaPathData(area);

    const source = getRoughLocalPointsForArea(area);
    const processed = processRawFreehandPoints(source, area.path.smoothing);
    if (processed?.fittedBezierSegments?.length) {
      applyProcessedFreehandPath(area, processed, []);
    }
  });

  const boundaryDiagnostics = buildLocalBoundaryDiagnostics(layouts);

  layouts.forEach((layout) => {
    const localBoundaryDiagnostics = boundaryDiagnostics.filter(
      (diagnostic) =>
        diagnostic.previousAreaId === layout.area.id ||
        diagnostic.nextAreaId === layout.area.id
    );
    finalizeAlignedAreaPath(layout.area, localBoundaryDiagnostics);
    perAreaFinalPaths[layout.area.id] = layout.area.path.d;
    perAreaDiagnostics[layout.area.id] = layout.area.path.globalFitDiagnostics || {};
  });

  globalCurveDebugData = {
    generatedAt: new Date().toISOString(),
    reason,
    fittingModel: "designer-route-bezier",
    legacyGlobalFairing: {
      enabled: false,
      note: "The previous global fairing model is retained only as legacy code and is not used."
    },
    globalRawRoutePoints: [],
    globalControlPointsBeforeFairing: [],
    globalControlPointsAfterFairing: [],
    globalFinalSamples: [],
    perAreaFinalPaths,
    perAreaDiagnostics,
    boundaryDiagnostics,
    smoothingSettings: normalizeSmoothing(layouts[0]?.area.path.smoothing),
    debugMetrics: {
      fittingModel: "designer-route-bezier",
      areaCount: layouts.length,
      boundaryCount: boundaryDiagnostics.length,
      shapeWarnings: Object.values(perAreaDiagnostics)
        .filter((diagnostic) => diagnostic.shapePreservationWarning).length
    }
  };

  logHomepage("Applied designer-route Bezier fitting.", {
    reason,
    areaCount: layouts.length,
    boundaryCount: boundaryDiagnostics.length
  });
};

const alignAdjacentAreaPaths = (areas, reason = "render") => {
  applyDesignerRouteBezierFitting(areas, reason);
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
  getOrderedAreas().forEach((area, index) => {
    container.append(renderArea(area, index));
  });

  setTimelineView(editorState.view || "overview");
  logHomepage("Rendered editable timeline.", {
    areaCount: editorState.areas.length,
    nodeCount: editorState.areas.reduce((total, area) => total + area.nodes.length, 0),
    mode: editorState.mode
  });
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
  const segments = area.path.fittedBezierSegments || [];
  if (segments.length) {
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    [
      [firstSegment.p0, firstSegment.cp1],
      [lastSegment.p1, lastSegment.cp2]
    ].forEach(([start, handle]) => {
      const vector = { x: handle.x - start.x, y: handle.y - start.y };
      const length = Math.hypot(vector.x, vector.y) || 1;
      const tangentLength = Math.min(110, length * 0.75);
      svg.append(createSvgElement("line", {
        class: "curve-debug__tangent",
        x1: String(start.x),
        y1: String(start.y),
        x2: String(Math.round(start.x + (vector.x / length) * tangentLength)),
        y2: String(Math.round(start.y + (vector.y / length) * tangentLength))
      }));
    });
    return;
  }

  const anchors = area.path.alignedAnchors || area.path.guideAnchors || [];
  if (anchors.length < 2) {
    return;
  }

  const first = anchors[0];
  const second = anchors[1];
  const beforeLast = anchors[anchors.length - 2];
  const last = anchors[anchors.length - 1];
  [
    [first, second],
    [beforeLast, last]
  ].forEach(([start, end]) => {
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
  const guideAnchors = debugData?.guideAnchors || area.path.guideAnchors || [];
  const designerWaypoints =
    debugData?.designerWaypoints ||
    area.path.designerWaypoints ||
    debugData?.shapeLandmarks ||
    area.path.shapeLandmarks ||
    guideAnchors;
  const finalSplinePoints = debugData?.finalSplinePoints || area.path.finalSplinePoints || [];

  if (uiState.debugLayers.raw) {
    appendDebugPolyline(svg, rawPoints, "curve-debug__raw");
    appendDebugPoints(svg, filteredPoints, "curve-debug__filtered", 3);
    appendDebugPoints(svg, resampledPoints, "curve-debug__resampled", 3);
  }
  if (uiState.debugLayers.final) {
    appendDebugPolyline(svg, finalSplinePoints, "curve-debug__final-samples");
  }
  if (uiState.debugLayers.anchors) {
    appendDebugPoints(svg, designerWaypoints, "curve-debug__guide-anchor", 6);
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
    filteredPoints: area.path.filteredPoints || [],
    resampledPoints: area.path.resampledPoints || [],
    guideAnchors: area.path.guideAnchors || [],
    designerWaypoints: area.path.designerWaypoints || area.path.shapeLandmarks || area.path.guideAnchors || [],
    shapeLandmarks: area.path.shapeLandmarks || area.path.guideAnchors || [],
    tangentVectors: area.path.tangentVectors || [],
    bezierSegments: area.path.bezierSegments || area.path.fittedBezierSegments || [],
    fittedBezierSegments: area.path.fittedBezierSegments || [],
    alignedAnchors: area.path.alignedAnchors || [],
    finalSplinePoints: area.path.finalSplinePoints || area.path.smoothPoints || [],
    finalSvgPath: area.path.finalSvgPath || area.path.d || "",
    smoothingSettings: normalizeSmoothing(area.path.smoothing),
    boundaryDiagnostics: area.path.boundaryDiagnostics || []
  };

  return {
    exportedAt: new Date().toISOString(),
    page: "journey.html",
    selectedAreaId: area.id,
    selectedAreaOrder: area.order,
    globalRawRoutePoints: globalCurveDebugData?.globalRawRoutePoints || [],
    globalControlPointsBeforeFairing: globalCurveDebugData?.globalControlPointsBeforeFairing || [],
    globalControlPointsAfterFairing: globalCurveDebugData?.globalControlPointsAfterFairing || [],
    globalFinalSamples: globalCurveDebugData?.globalFinalSamples || [],
    perAreaFinalPaths: globalCurveDebugData?.perAreaFinalPaths || {},
    perAreaDiagnostics: globalCurveDebugData?.perAreaDiagnostics || {},
    rawPointerPoints: debugData.rawPointerPoints,
    filteredPoints: debugData.filteredPoints,
    resampledPoints: debugData.resampledPoints,
    guideAnchors: debugData.guideAnchors,
    designerWaypoints: debugData.designerWaypoints,
    shapeLandmarks: debugData.shapeLandmarks,
    tangentVectors: debugData.tangentVectors,
    bezierSegments: debugData.bezierSegments,
    fittedBezierSegments: debugData.fittedBezierSegments,
    alignedAnchors: debugData.alignedAnchors,
    finalSplinePoints: debugData.finalSplinePoints,
    finalSvgPath: debugData.finalSvgPath,
    smoothingSettings: debugData.smoothingSettings,
    boundaryDiagnostics: globalCurveDebugData?.boundaryDiagnostics || debugData.boundaryDiagnostics,
    debugMetrics: globalCurveDebugData?.debugMetrics || {}
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
    guideAnchorCount: debugExport.guideAnchors.length
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
  showEditorMessage(`曲线调试层已${uiState.debugLayers[layer] ? "显示" : "隐藏"}。`);
  logHomepage("Toggled journey curve debug layer.", {
    layer,
    enabled: uiState.debugLayers[layer]
  });
};

const toggleCurveDebugOverlay = () => {
  uiState.debugOverlay = !uiState.debugOverlay;
  renderTimeline();
  renderEditorPanel();
  showEditorMessage(uiState.debugOverlay ? "曲线调试叠层已开启。" : "曲线调试叠层已关闭。");
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
  popover.style.left = `${Math.min(window.innerWidth - 340, Math.max(12, uiState.popover.x))}px`;
  popover.style.top = `${Math.min(window.innerHeight - 220, Math.max(72, uiState.popover.y))}px`;
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

const renderCurvePopoverContent = () => {
  const area = getSelectedArea();
  return `
    ${renderPopoverHeader("曲线设置")}
    <label>曲线颜色<input type="color" data-area-path-field="strokeColor" value="${area.path.strokeColor}"></label>
    <label>阴影颜色<input data-area-path-field="shadowColor" value="${escapeHtml(area.path.shadowColor)}"></label>
    <label>曲线宽度<input type="number" min="8" max="80" step="2" data-area-path-field="strokeWidth" value="${area.path.strokeWidth}"></label>
    <label>线条样式<select data-area-path-field="lineStyle">
      <option value="solid" ${area.path.lineStyle === "solid" ? "selected" : ""}>solid</option>
      <option value="dashed" ${area.path.lineStyle === "dashed" ? "selected" : ""}>dashed</option>
    </select></label>
    <label>平滑程度<input type="range" min="0" max="1" step="0.05" data-path-smoothing-field="strength" value="${area.path.smoothing?.strength ?? DEFAULT_SMOOTHING.strength}"></label>
    <label>简化程度<input type="range" min="0" max="1" step="0.05" data-path-smoothing-field="simplification" value="${area.path.smoothing?.simplification ?? DEFAULT_SMOOTHING.simplification}"></label>
    <label>算法优先<input type="range" min="0" max="1" step="0.05" data-path-smoothing-field="algorithmPriority" value="${area.path.smoothing?.algorithmPriority ?? DEFAULT_SMOOTHING.algorithmPriority}"></label>
    <label>最大锚点数<input type="number" min="4" max="12" step="1" data-path-smoothing-field="maxAnchors" value="${area.path.smoothing?.maxAnchors ?? DEFAULT_SMOOTHING.maxAnchors}"></label>
    <label>切线平滑<input type="range" min="0" max="1" step="0.05" data-path-smoothing-field="tangentSmoothing" value="${area.path.smoothing?.tangentSmoothing ?? DEFAULT_SMOOTHING.tangentSmoothing}"></label>
    <p class="context-note">手绘线条只表示大方向；系统会拟合平滑曲线，但会尽量保留主要转折和整体形状。</p>
    <div class="context-button-row">
      <button type="button" data-context-popover-action="resmooth">重新平滑</button>
      <button type="button" data-context-popover-action="redraw">重画当前区域曲线</button>
      <button type="button" data-context-popover-action="export-curve-debug">导出曲线调试数据</button>
      <button type="button" data-context-popover-action="copy-curve-debug">复制调试数据</button>
    </div>
    <textarea class="context-json curve-debug-json" data-curve-debug-json readonly placeholder="曲线调试 JSON 会显示在这里"></textarea>
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
  });
  popover.querySelectorAll("[data-node-field]").forEach((field) => {
    field.addEventListener("input", () => updateNodeField(field));
    field.addEventListener("change", () => updateNodeField(field));
  });
  popover.querySelectorAll("[data-node-style-field]").forEach((field) => {
    field.addEventListener("input", () => updateNodeStyleField(field));
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
      <h3>曲线</h3>
      <label>曲线颜色
        <input type="color" data-area-path-field="strokeColor" value="${area.path.strokeColor}">
      </label>
      <label>曲线宽度
        <input type="number" min="8" max="80" step="2" data-area-path-field="strokeWidth" value="${area.path.strokeWidth}">
      </label>
      <label>线条样式
        <select data-area-path-field="lineStyle">
          <option value="solid" ${area.path.lineStyle === "solid" ? "selected" : ""}>solid</option>
          <option value="dashed" ${area.path.lineStyle === "dashed" ? "selected" : ""}>dashed</option>
        </select>
      </label>
      <label>平滑程度
        <input type="range" min="0" max="1" step="0.05" data-path-smoothing-field="strength" value="${area.path.smoothing?.strength ?? DEFAULT_SMOOTHING.strength}">
      </label>
      <label>简化程度
        <input type="range" min="0" max="1" step="0.05" data-path-smoothing-field="simplification" value="${area.path.smoothing?.simplification ?? DEFAULT_SMOOTHING.simplification}">
      </label>
      <label>算法优先
        <input type="range" min="0" max="1" step="0.05" data-path-smoothing-field="algorithmPriority" value="${area.path.smoothing?.algorithmPriority ?? DEFAULT_SMOOTHING.algorithmPriority}">
      </label>
      <p class="editor-help">手绘线条只表达大方向，最终曲线会由算法自动简化、平滑，并与相邻区域端点对齐。</p>
      <p class="editor-help">当前工具：${editorState.activeTool === "freehand" ? "手绘曲线" : editorState.activeTool === "add-node" ? "添加节点" : "选择"}</p>
      <div class="editor-button-row">
        <button type="button" class="homepage-editor__tool" data-editor-action="select-tool">选择</button>
        <button type="button" class="homepage-editor__tool" data-editor-action="freehand">${editorState.activeTool === "freehand" ? "退出手绘" : "手绘曲线"}</button>
        <button type="button" data-editor-action="resmooth">重新平滑</button>
      </div>
      ${editorState.activeTool === "freehand" ? "<p class=\"editor-help\">在当前区域内拖动鼠标绘制曲线，松开后自动平滑。</p>" : ""}
      <div class="editor-button-row">
        <button type="button" data-editor-action="add-point">添加曲线点</button>
        <button type="button" data-editor-action="delete-point">删除选中曲线点</button>
        <button type="button" data-editor-action="reset-curve">重置当前区域曲线</button>
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

const updatePathSmoothingField = (field) => {
  const area = getSelectedArea();
  area.path.smoothing = { ...DEFAULT_SMOOTHING, ...(area.path.smoothing || {}) };
  area.path.smoothing[field.dataset.pathSmoothingField] = Number(field.value);
  area.path.smoothing = normalizeSmoothing(area.path.smoothing);

  if (area.path.mode === "freehand" && area.path.rawPoints?.length >= 3) {
    const processed = processRawFreehandPoints(area.path.rawPoints, area.path.smoothing, { log: true });
    if (processed?.smoothPoints?.length >= 3) {
      area.path.smoothPoints = processed.smoothPoints;
      area.path.d = processed.d;
      alignAdjacentAreaPaths(editorState.areas, "smoothing control");
      area.nodes.forEach((node) => {
        if (node.anchorMode === "path") {
          const point = getPointAtPathT(area, node.pathT);
          node.x = point.x;
          node.y = point.y;
        }
      });
    }
  }

  markDirty("path smoothing changed");
  renderTimeline();
  logHomepage("Updated freehand smoothing configuration.", {
    areaId: area.id,
    smoothing: area.path.smoothing
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
