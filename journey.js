const STORAGE_KEY = "personal_web_homepage_timeline_v1";
const SVG_WIDTH = 1000;
const DEFAULT_SMOOTHING = {
  enabled: true,
  strength: 0.55,
  simplification: 0.35
};
const DRAW_POINT_MIN_DISTANCE = 6;

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
let uiState = {
  popover: null,
  contextMenu: null,
  hoverPreview: null,
  lastPointerWasDrag: false
};

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
    migrateAreaNodes(migratedArea);
    return migratedArea;
  });

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
  if (points.length < 3) {
    return points.length ? `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}` : "";
  }
  return catmullRomToBezierPath(points, smoothing.strength);
};

const processRawFreehandPoints = (rawPoints, smoothing = DEFAULT_SMOOTHING) => {
  if (rawPoints.length < 3) {
    return null;
  }

  const jitterFiltered = filterJitterPoints(rawPoints, DRAW_POINT_MIN_DISTANCE);
  const resampled = resamplePointsByDistance(jitterFiltered, 18 + (1 - smoothing.strength) * 18);
  const tolerance = 2 + smoothing.simplification * 26;
  const simplified = simplifyPoints(resampled, tolerance);
  const iterations = Math.max(1, Math.min(3, Math.round(1 + smoothing.strength * 2)));
  const smoothPoints = chaikinSmooth(simplified, iterations);
  return {
    rawPoints,
    smoothPoints,
    d: buildFreehandPathD(smoothPoints, smoothing)
  };
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
    uiState = { popover: null, contextMenu: null, hoverPreview: null, lastPointerWasDrag: false };
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
  const processed = processRawFreehandPoints(rawPoints, smoothing);
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

  const processed = processRawFreehandPoints(area.path.rawPoints, area.path.smoothing);
  area.path.mode = "freehand";
  area.path.smoothPoints = processed.smoothPoints;
  area.path.d = processed.d;
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
    save: saveToLocalStorage,
    data: () => openContextPopover("data", {}, window.innerWidth - 360, 84),
    exit: () => setEditorMode("preview")
  };
  actions[action]?.();
  logHomepage("Handled floating toolbar action.", { action });
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
    <div class="context-button-row">
      <button type="button" data-context-popover-action="resmooth">重新平滑</button>
      <button type="button" data-context-popover-action="redraw">重画当前区域曲线</button>
    </div>
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
  markDirty("path smoothing changed");
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
