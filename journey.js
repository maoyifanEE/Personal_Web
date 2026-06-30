const STORAGE_KEY = "journeySketchCanvasStateV1";
const SCHEMA_VERSION = "sketch-canvas-v1";
const CANVAS_WIDTH = 1000;
const DEFAULT_CANVAS_HEIGHT = 2400;
const MIN_CANVAS_HEIGHT = 800;
const MAX_CANVAS_HEIGHT = 6000;
const MIN_STROKE_POINTS = 2;
const STICKER_MIN_WIDTH_PERCENT = 4;
const STICKER_MAX_WIDTH_PERCENT = 90;

const root = document.querySelector(".timeline-home");
const canvasHost = document.querySelector("#journey-areas");
const editorRoot = document.querySelector("#context-editor-root");
const eventPopover = document.querySelector("#timeline-event-popover");

const logJourney = (message, detail = {}) => {
  console.info(`[journey-sketch] ${message}`, detail);
};

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const nowIso = () => new Date().toISOString();
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalizePoint = (point) => ({
  x: clamp(normalizeNumber(point?.x, 0), 0, CANVAS_WIDTH),
  y: clamp(normalizeNumber(point?.y, 0), 0, state?.canvas?.height || DEFAULT_CANVAS_HEIGHT)
});

const defaultSketchState = () => ({
  version: SCHEMA_VERSION,
  view: "overview",
  mode: "preview",
  dirty: false,
  canvas: {
    width: CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
    background: {
      imageSrc: "",
      fit: "cover",
      positionX: 50,
      positionY: 50,
      opacity: 1
    },
    strokes: [],
    nodes: [],
    stickers: [],
    nextNodeNumber: 1
  },
  editor: {
    activeTool: "draw",
    selectedNodeId: null,
    selectedStickerId: null,
    selectedStrokeId: null,
    showCurveSettings: false,
    showSamples: false,
    lineWidth: 8,
    smoothSpacing: 6,
    smoothIterations: 2,
    snapRadius: 34,
    eraseRadius: 22,
    endpointTolerance: 8
  }
});

let state = defaultSketchState();
let dragState = null;
let rawDrawPoints = [];
let startSnap = null;
let currentPointer = null;
let lastGeometryTestResult = null;
let journeyAuthState = {
  authenticated: false,
  roles: [],
  permissions: []
};
let journeyCanEdit = false;

function canEditJourney() {
  return Boolean(journeyCanEdit);
}

function guardJourneyMutation(action) {
  if (canEditJourney()) {
    return true;
  }
  dragState = null;
  rawDrawPoints = [];
  startSnap = null;
  currentPointer = null;
  if (state.mode === "edit") {
    state.mode = "preview";
  }
  logJourney("Blocked Journey edit mutation without homepage:edit permission.", { action });
  return false;
}

async function loadJourneyAuthState() {
  if (!window.PersonalWebAuth) {
    logJourney("Auth helper unavailable; journey editor remains read-only.");
    return;
  }
  try {
    journeyAuthState = await window.PersonalWebAuth.getCurrentAuthState({ force: true });
    journeyCanEdit =
      window.PersonalWebAuth.hasRole(journeyAuthState, "admin") ||
      window.PersonalWebAuth.hasPermission(journeyAuthState, "homepage:edit");
    logJourney("Loaded journey auth state.", {
      authenticated: journeyAuthState.authenticated,
      canEdit: journeyCanEdit,
      roles: journeyAuthState.roles
    });
  } catch (error) {
    journeyCanEdit = false;
    logJourney("Failed to load journey auth state; editor remains read-only.", {
      error: error.message
    });
  }
}

const sanitizeBackground = (background = {}) => ({
  imageSrc: typeof background.imageSrc === "string" ? background.imageSrc : "",
  fit: ["cover", "contain", "fill"].includes(background.fit) ? background.fit : "cover",
  positionX: clamp(normalizeNumber(background.positionX, 50), 0, 100),
  positionY: clamp(normalizeNumber(background.positionY, 50), 0, 100),
  opacity: clamp(normalizeNumber(background.opacity, 1), 0, 1)
});

const sanitizeStroke = (stroke = {}) => {
  const points = Array.isArray(stroke.points)
    ? removeNearDuplicatePoints(stroke.points.map(normalizePoint), 0.5)
    : [];
  if (points.length < MIN_STROKE_POINTS) {
    return null;
  }
  return {
    id: typeof stroke.id === "string" && stroke.id ? stroke.id : makeId("stroke"),
    points,
    width: clamp(Math.round(normalizeNumber(stroke.width, state.editor.lineWidth || 8)), 2, 40),
    createdAt: typeof stroke.createdAt === "string" ? stroke.createdAt : nowIso(),
    updatedAt: typeof stroke.updatedAt === "string" ? stroke.updatedAt : nowIso()
  };
};

const sanitizeNode = (node = {}) => ({
  id: typeof node.id === "string" && node.id ? node.id : `N${state.canvas.nextNodeNumber.toString().padStart(3, "0")}`,
  label: typeof node.label === "string" && node.label ? node.label : node.id || "Node",
  x: clamp(normalizeNumber(node.x, 0), 0, CANVAS_WIDTH),
  y: clamp(normalizeNumber(node.y, 0), 0, state.canvas.height),
  strokeId: typeof node.strokeId === "string" ? node.strokeId : null,
  segmentIndex: Number.isFinite(Number(node.segmentIndex)) ? Math.max(0, Math.round(Number(node.segmentIndex))) : null,
  componentId: typeof node.componentId === "string" ? node.componentId : null,
  createdAt: typeof node.createdAt === "string" ? node.createdAt : nowIso(),
  updatedAt: typeof node.updatedAt === "string" ? node.updatedAt : nowIso()
});

const sanitizeSticker = (sticker = {}) => ({
  id: typeof sticker.id === "string" && sticker.id ? sticker.id : makeId("sticker"),
  imageSrc: typeof sticker.imageSrc === "string" ? sticker.imageSrc : "",
  xPercent: clamp(normalizeNumber(sticker.xPercent, 50), -20, 120),
  yPercent: clamp(normalizeNumber(sticker.yPercent, 30), -20, 120),
  widthPercent: clamp(normalizeNumber(sticker.widthPercent, 18), STICKER_MIN_WIDTH_PERCENT, STICKER_MAX_WIDTH_PERCENT),
  rotation: clamp(normalizeNumber(sticker.rotation, 0), -720, 720),
  zIndex: Math.round(clamp(normalizeNumber(sticker.zIndex, 30), 1, 200)),
  createdAt: typeof sticker.createdAt === "string" ? sticker.createdAt : nowIso(),
  updatedAt: typeof sticker.updatedAt === "string" ? sticker.updatedAt : nowIso()
});

const sanitizeState = (raw) => {
  const fallback = defaultSketchState();
  if (!raw || raw.version !== SCHEMA_VERSION || !raw.canvas) {
    logJourney("Ignoring old Journey editor state and using a clean sketch canvas.", {
      oldVersion: raw?.version || "missing"
    });
    return fallback;
  }

  const merged = {
    ...fallback,
    view: raw.view === "details" ? "details" : "overview",
    mode: raw.mode === "edit" ? "edit" : "preview",
    canvas: {
      ...fallback.canvas,
      ...(raw.canvas || {})
    },
    editor: {
      ...fallback.editor,
      ...(raw.editor || {})
    }
  };

  merged.canvas.width = CANVAS_WIDTH;
  merged.canvas.height = Math.round(clamp(normalizeNumber(merged.canvas.height, DEFAULT_CANVAS_HEIGHT), MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT));
  merged.canvas.background = sanitizeBackground(merged.canvas.background);
  merged.canvas.strokes = Array.isArray(merged.canvas.strokes)
    ? merged.canvas.strokes.map(sanitizeStroke).filter(Boolean)
    : [];
  merged.canvas.stickers = Array.isArray(merged.canvas.stickers)
    ? merged.canvas.stickers.map(sanitizeSticker).filter((sticker) => sticker.imageSrc)
    : [];
  merged.canvas.nextNodeNumber = Math.max(1, Math.round(normalizeNumber(merged.canvas.nextNodeNumber, 1)));
  merged.canvas.nodes = Array.isArray(merged.canvas.nodes)
    ? merged.canvas.nodes.map(sanitizeNode)
    : [];

  merged.editor.activeTool = ["draw", "erase", "select"].includes(merged.editor.activeTool)
    ? merged.editor.activeTool
    : "draw";
  merged.editor.lineWidth = Math.round(clamp(normalizeNumber(merged.editor.lineWidth, 8), 2, 40));
  merged.editor.smoothSpacing = Math.round(clamp(normalizeNumber(merged.editor.smoothSpacing, 6), 3, 36));
  merged.editor.smoothIterations = Math.round(clamp(normalizeNumber(merged.editor.smoothIterations, 2), 0, 6));
  merged.editor.snapRadius = Math.round(clamp(normalizeNumber(merged.editor.snapRadius, 34), 8, 100));
  merged.editor.eraseRadius = Math.round(clamp(normalizeNumber(merged.editor.eraseRadius, 22), 4, 90));
  merged.editor.endpointTolerance = Math.round(clamp(normalizeNumber(merged.editor.endpointTolerance, 8), 2, 40));
  merged.editor.selectedNodeId = merged.canvas.nodes.some((node) => node.id === merged.editor.selectedNodeId)
    ? merged.editor.selectedNodeId
    : null;
  merged.editor.selectedStickerId = merged.canvas.stickers.some((sticker) => sticker.id === merged.editor.selectedStickerId)
    ? merged.editor.selectedStickerId
    : null;

  state = merged;
  reattachAllNodes();
  merged.dirty = false;
  return merged;
};

const loadInitialState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeState(raw ? JSON.parse(raw) : null);
  } catch (error) {
    logJourney("Failed to load sketch canvas state. Falling back to a blank canvas.", { error: error.message });
    return defaultSketchState();
  }
};

const markDirty = (reason) => {
  if (!guardJourneyMutation(reason || "markDirty")) {
    return;
  }
  state.dirty = true;
  logJourney("State changed.", { reason });
  updateStatus(reason === "saved" ? "已保存" : "未保存");
};

const saveToLocalStorage = () => {
  if (!guardJourneyMutation("saveToLocalStorage")) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
  state.dirty = false;
  updateStatus("已保存");
  logJourney("Saved sketch canvas state.", {
    storageKey: STORAGE_KEY,
    strokes: state.canvas.strokes.length,
    nodes: state.canvas.nodes.length,
    stickers: state.canvas.stickers.length
  });
};

const clearCanvasState = () => {
  if (!guardJourneyMutation("clearCanvasState")) {
    return;
  }
  if (!window.confirm("确认清空画布上的背景、贴纸、线条和节点吗？")) {
    logJourney("Canvas clear cancelled.");
    return;
  }
  state.canvas.background = sanitizeBackground();
  state.canvas.strokes = [];
  state.canvas.nodes = [];
  state.canvas.stickers = [];
  state.canvas.nextNodeNumber = 1;
  state.editor.selectedNodeId = null;
  state.editor.selectedStickerId = null;
  state.editor.selectedStrokeId = null;
  markDirty("canvas cleared");
  render();
  showMessage("画布已清空。");
};

function removeNearDuplicatePoints(points, minDistance = 1.5) {
  const cleaned = [];
  points.forEach((point) => {
    const normalized = { x: Number(point.x), y: Number(point.y) };
    if (!Number.isFinite(normalized.x) || !Number.isFinite(normalized.y)) {
      return;
    }
    if (!cleaned.length || distance(cleaned[cleaned.length - 1], normalized) >= minDistance) {
      cleaned.push(normalized);
    }
  });
  return cleaned;
}

function pointSegmentProjection(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) {
    return { point: { ...start }, distance: distance(point, start), t: 0 };
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return { point: projected, distance: distance(point, projected), t };
}

function segmentIntersectsCircle(start, end, center, radius) {
  return pointSegmentProjection(center, start, end).distance <= radius;
}

function resamplePolyline(points, spacing = 6) {
  if (!points.length) {
    return [];
  }
  const first = { ...points[0] };
  const last = { ...points[points.length - 1] };
  const source = removeNearDuplicatePoints(points, 0.5);
  if (source.length <= 2 || spacing <= 0) {
    return source.length ? [{ ...first }, ...source.slice(1, -1), { ...last }] : [];
  }

  const result = [{ ...first }];
  let previous = source[0];
  let carried = 0;

  for (let index = 1; index < source.length; index += 1) {
    const current = source[index];
    const segmentLength = distance(previous, current);
    if (segmentLength <= 0.000001) {
      previous = current;
      continue;
    }
    let target = spacing - carried;
    while (target <= segmentLength) {
      const ratio = target / segmentLength;
      result.push({
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio
      });
      target += spacing;
    }
    carried = segmentLength - (target - spacing);
    previous = current;
  }

  if (distance(result[result.length - 1], last) > 0.5) {
    result.push({ ...last });
  } else {
    result[result.length - 1] = { ...last };
  }
  return result;
}

function chaikinSmooth(points, iterations = 2, preserveEndpoints = true) {
  let current = removeNearDuplicatePoints(points, 0.5);
  if (current.length < 3) {
    return current;
  }
  for (let pass = 0; pass < Math.max(0, iterations); pass += 1) {
    if (current.length < 3) {
      break;
    }
    const next = [];
    if (preserveEndpoints) {
      next.push(current[0]);
    }
    for (let index = 0; index < current.length - 1; index += 1) {
      const a = current[index];
      const b = current[index + 1];
      next.push(
        { x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y },
        { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y }
      );
    }
    if (preserveEndpoints) {
      next.push(current[current.length - 1]);
    }
    current = next;
  }
  return current;
}

function smoothDrawnPoints(rawPoints, spacing = 6, smoothIterations = 2) {
  const cleaned = removeNearDuplicatePoints(rawPoints, 2);
  if (cleaned.length <= 2) {
    return cleaned;
  }
  const first = { ...cleaned[0] };
  const last = { ...cleaned[cleaned.length - 1] };
  const sampled = resamplePolyline(cleaned, spacing);
  const smoothed = chaikinSmooth(sampled, smoothIterations, true);
  smoothed[0] = first;
  smoothed[smoothed.length - 1] = last;
  return resamplePolyline(smoothed, Math.max(3, spacing * 0.75));
}

const appendWithoutDuplicate = (target, source) => {
  source.forEach((point) => {
    if (!target.length || distance(target[target.length - 1], point) > 0.5) {
      target.push({ ...point });
    }
  });
};

const pointsEndingAtEndpoint = (stroke, endpoint) =>
  endpoint === "end" ? stroke.points.map((point) => ({ ...point })) : stroke.points.slice().reverse().map((point) => ({ ...point }));

const pointsStartingAtEndpoint = (stroke, endpoint) =>
  endpoint === "start" ? stroke.points.map((point) => ({ ...point })) : stroke.points.slice().reverse().map((point) => ({ ...point }));

const strokeById = (strokeId) => state.canvas.strokes.find((stroke) => stroke.id === strokeId) || null;

function findNearestEndpoint(point, radius = state.editor.snapRadius) {
  let best = null;
  state.canvas.strokes.forEach((stroke) => {
    if (stroke.points.length < 2) {
      return;
    }
    [
      ["start", stroke.points[0]],
      ["end", stroke.points[stroke.points.length - 1]]
    ].forEach(([endpoint, endpointPoint]) => {
      const d = distance(point, endpointPoint);
      if (d <= radius && (!best || d < best.distance)) {
        best = {
          point: { ...endpointPoint },
          strokeId: stroke.id,
          endpoint,
          distance: d
        };
      }
    });
  });
  return best;
}

function addOrMergeStroke(rawPoints, startEndpointSnap, endEndpointSnap) {
  let points = removeNearDuplicatePoints(rawPoints, 1);
  if (points.length < 2) {
    return null;
  }

  let startStroke = startEndpointSnap ? strokeById(startEndpointSnap.strokeId) : null;
  let endStroke = endEndpointSnap ? strokeById(endEndpointSnap.strokeId) : null;
  if (!startStroke) {
    startEndpointSnap = null;
  }
  if (!endStroke) {
    endEndpointSnap = null;
  }

  if (!startEndpointSnap && !endEndpointSnap) {
    points = smoothDrawnPoints(points, state.editor.smoothSpacing, state.editor.smoothIterations);
    const stroke = {
      id: makeId("stroke"),
      points,
      width: state.editor.lineWidth,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.canvas.strokes.push(stroke);
    reattachAllNodes();
    logJourney("Added independent stroke.", { strokeId: stroke.id, pointCount: points.length });
    return stroke;
  }

  const merged = [];
  const sourceIds = new Set();
  if (startEndpointSnap && startStroke) {
    sourceIds.add(startStroke.id);
    appendWithoutDuplicate(merged, pointsEndingAtEndpoint(startStroke, startEndpointSnap.endpoint));
    appendWithoutDuplicate(merged, points.slice(1));
  } else {
    appendWithoutDuplicate(merged, points);
  }
  if (endEndpointSnap && endStroke && !sourceIds.has(endStroke.id)) {
    sourceIds.add(endStroke.id);
    appendWithoutDuplicate(merged, pointsStartingAtEndpoint(endStroke, endEndpointSnap.endpoint).slice(1));
  }

  const outerFirst = merged[0] ? { ...merged[0] } : null;
  const outerLast = merged[merged.length - 1] ? { ...merged[merged.length - 1] } : null;
  let smoothMerged = smoothDrawnPoints(merged, state.editor.smoothSpacing, Math.max(1, state.editor.smoothIterations + 1));
  if (outerFirst && smoothMerged.length) {
    smoothMerged[0] = outerFirst;
  }
  if (outerLast && smoothMerged.length) {
    smoothMerged[smoothMerged.length - 1] = outerLast;
  }
  if (smoothMerged.length < 2) {
    return null;
  }

  state.canvas.strokes = state.canvas.strokes.filter((stroke) => !sourceIds.has(stroke.id));
  const stroke = {
    id: makeId("stroke"),
    points: smoothMerged,
    width: state.editor.lineWidth,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.canvas.strokes.push(stroke);
  reattachAllNodes();
  logJourney("Merged endpoint-snapped stroke.", {
    strokeId: stroke.id,
    removedStrokeIds: [...sourceIds],
    pointCount: stroke.points.length
  });
  return stroke;
}

function endpointConnectionCounts(endpointTolerance = state.editor.endpointTolerance) {
  const endpoints = [];
  state.canvas.strokes.forEach((stroke) => {
    if (stroke.points.length >= 2) {
      endpoints.push({ strokeId: stroke.id, endpoint: "start", point: stroke.points[0] });
      endpoints.push({ strokeId: stroke.id, endpoint: "end", point: stroke.points[stroke.points.length - 1] });
    }
  });
  const counts = new Map(endpoints.map((item) => [`${item.strokeId}:${item.endpoint}`, 0]));
  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      if (distance(endpoints[i].point, endpoints[j].point) <= endpointTolerance) {
        counts.set(`${endpoints[i].strokeId}:${endpoints[i].endpoint}`, counts.get(`${endpoints[i].strokeId}:${endpoints[i].endpoint}`) + 1);
        counts.set(`${endpoints[j].strokeId}:${endpoints[j].endpoint}`, counts.get(`${endpoints[j].strokeId}:${endpoints[j].endpoint}`) + 1);
      }
    }
  }
  return counts;
}

function eraseAt(center, radius = state.editor.eraseRadius) {
  let changed = false;
  const nextStrokes = [];
  state.canvas.strokes.forEach((stroke) => {
    if (stroke.points.length < 2) {
      return;
    }
    const chunks = [];
    let chunk = [stroke.points[0]];
    let erasedThisStroke = false;
    for (let index = 0; index < stroke.points.length - 1; index += 1) {
      const start = stroke.points[index];
      const end = stroke.points[index + 1];
      const hit = distance(start, center) <= radius ||
        distance(end, center) <= radius ||
        segmentIntersectsCircle(start, end, center, radius);
      if (hit) {
        erasedThisStroke = true;
        if (chunk.length >= 2) {
          chunks.push(chunk);
        }
        chunk = [end];
      } else {
        if (!chunk.length) {
          chunk = [start];
        }
        if (distance(chunk[chunk.length - 1], end) > 0.5) {
          chunk.push(end);
        }
      }
    }
    if (chunk.length >= 2) {
      chunks.push(chunk);
    }
    if (erasedThisStroke) {
      changed = true;
      chunks.forEach((chunkPoints) => {
        const cleaned = removeNearDuplicatePoints(chunkPoints, 1);
        if (cleaned.length >= 2) {
          nextStrokes.push({
            id: makeId("stroke"),
            points: cleaned,
            width: stroke.width,
            createdAt: stroke.createdAt,
            updatedAt: nowIso()
          });
        }
      });
    } else {
      nextStrokes.push(stroke);
    }
  });
  if (changed) {
    state.canvas.strokes = nextStrokes;
    reattachAllNodes();
    logJourney("Erased stroke segment and rebuilt fragments.", {
      remainingStrokes: state.canvas.strokes.length
    });
  }
  return changed;
}

function buildComponents(endpointTolerance = state.editor.endpointTolerance) {
  const parent = new Map(state.canvas.strokes.map((stroke) => [stroke.id, stroke.id]));
  const find = (id) => {
    let rootId = id;
    while (parent.get(rootId) !== rootId) {
      rootId = parent.get(rootId);
    }
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, rootId);
      current = next;
    }
    return rootId;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  };
  const endpoints = [];
  state.canvas.strokes.forEach((stroke) => {
    if (stroke.points.length >= 2) {
      endpoints.push({ strokeId: stroke.id, point: stroke.points[0] });
      endpoints.push({ strokeId: stroke.id, point: stroke.points[stroke.points.length - 1] });
    }
  });
  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      if (endpoints[i].strokeId !== endpoints[j].strokeId && distance(endpoints[i].point, endpoints[j].point) <= endpointTolerance) {
        union(endpoints[i].strokeId, endpoints[j].strokeId);
      }
    }
  }
  return Object.fromEntries([...parent.keys()].map((id) => [id, find(id)]));
}

function strokeIdsInComponent(componentId) {
  if (!componentId) {
    return new Set();
  }
  const components = buildComponents();
  return new Set(Object.entries(components).filter(([, id]) => id === componentId).map(([strokeId]) => strokeId));
}

function nearestProjection(point, optionalStrokeIds = null) {
  const components = buildComponents();
  let best = null;
  state.canvas.strokes.forEach((stroke) => {
    if (optionalStrokeIds && !optionalStrokeIds.has(stroke.id)) {
      return;
    }
    for (let index = 0; index < stroke.points.length - 1; index += 1) {
      const projection = pointSegmentProjection(point, stroke.points[index], stroke.points[index + 1]);
      if (!best || projection.distance < best.distance) {
        best = {
          point: projection.point,
          distance: projection.distance,
          strokeId: stroke.id,
          segmentIndex: index,
          componentId: components[stroke.id] || stroke.id
        };
      }
    }
  });
  return best;
}

function addNodeNear(point) {
  const projection = nearestProjection(point);
  if (!projection || projection.distance > 90) {
    return null;
  }
  const nodeId = `N${state.canvas.nextNodeNumber.toString().padStart(3, "0")}`;
  state.canvas.nextNodeNumber += 1;
  const node = {
    id: nodeId,
    label: nodeId,
    x: projection.point.x,
    y: projection.point.y,
    strokeId: projection.strokeId,
    segmentIndex: projection.segmentIndex,
    componentId: projection.componentId,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.canvas.nodes.push(node);
  state.editor.selectedNodeId = node.id;
  state.editor.selectedStickerId = null;
  logJourney("Created node on nearest stroke.", node);
  return node;
}

function moveNodeAlongComponent(node, pointer) {
  const componentId = node.componentId || buildComponents()[node.strokeId];
  const strokeIds = componentId ? strokeIdsInComponent(componentId) : null;
  const projection = nearestProjection(pointer, strokeIds?.size ? strokeIds : null);
  if (!projection) {
    return null;
  }
  Object.assign(node, {
    x: projection.point.x,
    y: projection.point.y,
    strokeId: projection.strokeId,
    segmentIndex: projection.segmentIndex,
    componentId: projection.componentId,
    updatedAt: nowIso()
  });
  return projection;
}

function reattachAllNodes() {
  state.canvas.nodes.forEach((node) => {
    const projection = nearestProjection(node);
    if (!projection) {
      Object.assign(node, {
        strokeId: null,
        segmentIndex: null,
        componentId: null
      });
      return;
    }
    Object.assign(node, {
      x: projection.point.x,
      y: projection.point.y,
      strokeId: projection.strokeId,
      segmentIndex: projection.segmentIndex,
      componentId: projection.componentId,
      updatedAt: nowIso()
    });
  });
}

function getSketchCanvasElement() {
  const canvas = document.querySelector(".journey-sketch-canvas");
  return canvas;
}

function getSketchCoordinateSurface() {
  return document.querySelector(".journey-sketch-strokes");
}

function getSketchCoordinateRect() {
  return getSketchCoordinateSurface()?.getBoundingClientRect() || getSketchCanvasElement()?.getBoundingClientRect() || null;
}

function transformClientPointWithMatrix(event, matrix) {
  return {
    x: (matrix.a * event.clientX) + (matrix.c * event.clientY) + matrix.e,
    y: (matrix.b * event.clientX) + (matrix.d * event.clientY) + matrix.f
  };
}

function clientPointToCanvasPoint(event) {
  const svg = getSketchCoordinateSurface();
  const matrix = svg?.getScreenCTM?.();
  if (svg && matrix) {
    const inverse = matrix.inverse();
    const transformed = transformClientPointWithMatrix(event, inverse);
    if (Number.isFinite(transformed.x) && Number.isFinite(transformed.y)) {
      return clampCanvasPoint({
        x: transformed.x,
        y: transformed.y
      });
    }
  }

  const rect = getSketchCoordinateRect();
  if (!rect) {
    return clampCanvasPoint({
      x: 0,
      y: 0
    });
  }
  return clampCanvasPoint({
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * state.canvas.height
  });
}

function clampCanvasPoint(point) {
  return {
    x: clamp(Math.round(point.x), 0, CANVAS_WIDTH),
    y: clamp(Math.round(point.y), 0, state.canvas.height)
  };
}

function canvasPointToCssPercent(point) {
  return {
    xPercent: (point.x / CANVAS_WIDTH) * 100,
    yPercent: (point.y / state.canvas.height) * 100
  };
}

function cssPercentToCanvasPoint(xPercent, yPercent) {
  return {
    x: (xPercent / 100) * CANVAS_WIDTH,
    y: (yPercent / 100) * state.canvas.height
  };
}

function strokePathD(points) {
  if (!points.length) {
    return "";
  }
  return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" L ")}`;
}

function render() {
  if (!root || !canvasHost) {
    return;
  }
  if (!canEditJourney() && state.mode === "edit") {
    state.mode = "preview";
    logJourney("Blocked edit mode because current user cannot edit journey.");
  }
  root.dataset.view = state.view;
  root.dataset.editorMode = state.mode;
  root.dataset.activeTool = state.editor.activeTool;
  root.dataset.canEdit = String(canEditJourney());
  const editorToggle = document.querySelector("[data-editor-toggle]");
  if (editorToggle) {
    editorToggle.hidden = !canEditJourney();
    editorToggle.setAttribute("aria-disabled", String(!canEditJourney()));
  }
  canvasHost.innerHTML = "";

  const canvas = document.createElement("section");
  canvas.className = "journey-sketch-canvas";
  canvas.style.setProperty("--canvas-height", `${state.canvas.height}px`);
  canvas.style.setProperty("--canvas-width", `${CANVAS_WIDTH}`);
  canvas.addEventListener("pointerdown", handleCanvasPointerDown);
  canvas.addEventListener("pointermove", handleCanvasPointerMove);
  canvas.addEventListener("pointerup", handleCanvasPointerUp);
  canvas.addEventListener("pointercancel", handleCanvasPointerUp);
  canvas.addEventListener("contextmenu", handleCanvasContextMenu);
  canvas.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (state.mode === "edit") {
      canvas.classList.add("is-drag-over");
    }
  });
  canvas.addEventListener("dragleave", () => canvas.classList.remove("is-drag-over"));
  canvas.addEventListener("drop", handleCanvasDrop);

  canvas.append(
    renderBackgroundLayer(),
    renderStickerLayer(),
    renderStrokeLayer(),
    renderNodeLayer(),
    renderInteractionLayer()
  );
  canvasHost.append(canvas);
  renderEditorPanel();
}

function renderBackgroundLayer() {
  const layer = document.createElement("div");
  layer.className = "journey-sketch-background";
  if (state.canvas.background.imageSrc) {
    const image = document.createElement("img");
    image.src = state.canvas.background.imageSrc;
    image.alt = "";
    image.decoding = "async";
    image.style.objectFit = state.canvas.background.fit;
    image.style.objectPosition = `${state.canvas.background.positionX}% ${state.canvas.background.positionY}%`;
    image.style.opacity = String(state.canvas.background.opacity);
    layer.append(image);
  }
  return layer;
}

function renderStrokeLayer() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("journey-sketch-strokes");
  svg.setAttribute("viewBox", `0 0 ${CANVAS_WIDTH} ${state.canvas.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const endpointCounts = endpointConnectionCounts();
  state.canvas.strokes.forEach((stroke) => {
    const d = strokePathD(stroke.points);
    if (!d) {
      return;
    }
    const shadow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shadow.setAttribute("class", "journey-sketch-stroke-shadow");
    shadow.setAttribute("d", d);
    shadow.setAttribute("stroke-width", String(stroke.width + 10));
    const main = document.createElementNS("http://www.w3.org/2000/svg", "path");
    main.setAttribute("class", "journey-sketch-stroke-main");
    main.setAttribute("d", d);
    main.setAttribute("stroke-width", String(stroke.width));
    svg.append(shadow, main);
    if (state.mode === "edit") {
      [
        ["start", stroke.points[0]],
        ["end", stroke.points[stroke.points.length - 1]]
      ].forEach(([endpoint, point]) => {
        if ((endpointCounts.get(`${stroke.id}:${endpoint}`) || 0) > 0) {
          return;
        }
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("class", "journey-sketch-endpoint");
        circle.setAttribute("cx", point.x);
        circle.setAttribute("cy", point.y);
        circle.setAttribute("r", "7");
        svg.append(circle);
      });
    }
    if (state.mode === "edit" && state.editor.showSamples) {
      stroke.points.forEach((point) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("class", "journey-sketch-sample");
        circle.setAttribute("cx", point.x);
        circle.setAttribute("cy", point.y);
        circle.setAttribute("r", "2.5");
        svg.append(circle);
      });
    }
  });

  if (state.mode === "edit" && rawDrawPoints.length >= 2) {
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
    preview.setAttribute("class", "journey-sketch-preview-line");
    preview.setAttribute("d", strokePathD(rawDrawPoints));
    preview.setAttribute("stroke-width", String(state.editor.lineWidth));
    svg.append(preview);
  }
  if (state.mode === "edit" && state.editor.activeTool === "draw" && currentPointer) {
    const snap = findNearestEndpoint(currentPointer, state.editor.snapRadius);
    if (snap) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", "journey-sketch-snap-hint");
      circle.setAttribute("cx", snap.point.x);
      circle.setAttribute("cy", snap.point.y);
      circle.setAttribute("r", state.editor.snapRadius);
      svg.append(circle);
    }
  }
  if (state.mode === "edit" && state.editor.activeTool === "erase" && currentPointer) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", "journey-sketch-eraser-preview");
    circle.setAttribute("cx", currentPointer.x);
    circle.setAttribute("cy", currentPointer.y);
    circle.setAttribute("r", state.editor.eraseRadius);
    svg.append(circle);
  }
  return svg;
}

function renderNodeLayer() {
  const layer = document.createElement("div");
  layer.className = "journey-sketch-nodes";
  state.canvas.nodes.forEach((node) => {
    if (!node.strokeId) {
      return;
    }
    const nodeElement = document.createElement("button");
    nodeElement.type = "button";
    nodeElement.className = "journey-sketch-node";
    nodeElement.dataset.nodeId = node.id;
    nodeElement.dataset.selected = String(state.editor.selectedNodeId === node.id);
    nodeElement.style.left = `${(node.x / CANVAS_WIDTH) * 100}%`;
    nodeElement.style.top = `${(node.y / state.canvas.height) * 100}%`;
    nodeElement.innerHTML = `<span>${escapeHtml(node.label || node.id)}</span>`;
    nodeElement.addEventListener("pointerdown", (event) => startNodeDrag(event, node.id));
    nodeElement.addEventListener("click", (event) => {
      event.stopPropagation();
      selectNode(node.id);
    });
    layer.append(nodeElement);
  });
  return layer;
}

function renderStickerLayer() {
  const layer = document.createElement("div");
  layer.className = "journey-sketch-stickers";
  state.canvas.stickers
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .forEach((sticker) => {
      const wrap = document.createElement("div");
      wrap.className = "journey-sketch-sticker";
      wrap.dataset.stickerId = sticker.id;
      wrap.dataset.selected = String(state.editor.selectedStickerId === sticker.id);
      wrap.style.left = `${sticker.xPercent}%`;
      wrap.style.top = `${sticker.yPercent}%`;
      wrap.style.width = `${sticker.widthPercent}%`;
      wrap.style.zIndex = String(sticker.zIndex);
      wrap.style.transform = `translate(-50%, -50%) rotate(${sticker.rotation}deg)`;
      wrap.addEventListener("pointerdown", (event) => startStickerDrag(event, sticker.id, "move"));
      const image = document.createElement("img");
      image.src = sticker.imageSrc;
      image.alt = "";
      image.draggable = false;
      wrap.append(image);
      if (state.mode === "edit" && state.editor.selectedStickerId === sticker.id) {
        ["nw", "ne", "sw", "se"].forEach((corner) => {
          const handle = document.createElement("span");
          handle.className = `journey-sticker-handle journey-sticker-handle--${corner}`;
          handle.addEventListener("pointerdown", (event) => startStickerDrag(event, sticker.id, "resize"));
          wrap.append(handle);
        });
        const rotate = document.createElement("span");
        rotate.className = "journey-sticker-rotate";
        rotate.addEventListener("pointerdown", (event) => startStickerDrag(event, sticker.id, "rotate"));
        wrap.append(rotate);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "journey-sticker-delete";
        del.textContent = "删除";
        del.addEventListener("click", (event) => {
          event.stopPropagation();
          deleteSelectedSticker();
        });
        wrap.append(del);
      }
      layer.append(wrap);
    });
  return layer;
}

function renderInteractionLayer() {
  const layer = document.createElement("div");
  layer.className = "journey-sketch-interaction";
  return layer;
}

function renderEditorPanel() {
  if (!editorRoot) {
    return;
  }
  editorRoot.innerHTML = "";
  if (state.mode !== "edit" || !canEditJourney()) {
    return;
  }
  const toolbar = document.createElement("section");
  toolbar.className = "journey-sketch-toolbar";
  toolbar.innerHTML = `
    <div class="journey-sketch-toolbar__row">
      <button type="button" data-tool="draw" aria-pressed="${state.editor.activeTool === "draw"}">手绘</button>
      <button type="button" data-tool="erase" aria-pressed="${state.editor.activeTool === "erase"}">橡皮擦</button>
      <button type="button" data-tool="select" aria-pressed="${state.editor.activeTool === "select"}">节点/选择</button>
      <button type="button" data-action="upload-background">上传背景</button>
      <button type="button" data-action="clear-background">清除背景</button>
      <button type="button" data-action="upload-sticker">上传贴纸</button>
      <button type="button" data-action="save">保存</button>
      <button type="button" data-action="clear">清空画布</button>
      <button type="button" data-action="exit">退出编辑</button>
    </div>
    <label class="journey-sketch-height">
      画布高度
      <input type="range" min="${MIN_CANVAS_HEIGHT}" max="${MAX_CANVAS_HEIGHT}" step="50" data-setting="height" value="${state.canvas.height}">
      <input type="number" min="${MIN_CANVAS_HEIGHT}" max="${MAX_CANVAS_HEIGHT}" step="50" data-setting="height" value="${state.canvas.height}">
    </label>
    <details class="journey-sketch-curve-settings" ${state.editor.showCurveSettings ? "open" : ""}>
      <summary>曲线参数</summary>
      ${renderSettingSlider("lineWidth", "线宽", 2, 40, 1)}
      ${renderSettingSlider("smoothSpacing", "平滑间距", 3, 36, 1)}
      ${renderSettingSlider("smoothIterations", "平滑次数", 0, 6, 1)}
      ${renderSettingSlider("snapRadius", "吸附半径", 8, 100, 1)}
      ${renderSettingSlider("eraseRadius", "橡皮擦半径", 4, 90, 1)}
      ${renderSettingSlider("endpointTolerance", "端点容差", 2, 40, 1)}
      <label class="journey-sketch-check">
        <input type="checkbox" data-setting="showSamples" ${state.editor.showSamples ? "checked" : ""}>
        显示采样点
      </label>
    </details>
    <div class="journey-sketch-node-panel">
      ${renderSelectedNodePanel()}
    </div>
    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden data-file-input="background">
    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden data-file-input="sticker">
    <p class="journey-sketch-status" data-editor-status>${state.dirty ? "未保存" : "已保存"}</p>
  `;
  toolbar.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });
  toolbar.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleToolbarAction(button.dataset.action));
  });
  toolbar.querySelectorAll("[data-setting]").forEach((field) => {
    field.addEventListener("input", () => updateSetting(field));
    field.addEventListener("change", () => updateSetting(field));
  });
  toolbar.querySelector("details")?.addEventListener("toggle", (event) => {
    if (!guardJourneyMutation("toggleCurveSettings")) {
      return;
    }
    state.editor.showCurveSettings = event.currentTarget.open;
  });
  toolbar.querySelectorAll("[data-file-input]").forEach((input) => {
    input.addEventListener("change", () => handleFileInput(input));
  });
  toolbar.querySelector("[data-node-label]")?.addEventListener("input", (event) => updateSelectedNodeLabel(event.target.value));
  toolbar.querySelector("[data-node-action='delete']")?.addEventListener("click", deleteSelectedNode);
  editorRoot.append(toolbar);
}

function renderSettingSlider(key, label, min, max, step) {
  return `
    <label class="journey-sketch-setting">
      <span>${label}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" data-setting="${key}" value="${state.editor[key]}">
      <strong>${state.editor[key]}</strong>
    </label>
  `;
}

function renderSelectedNodePanel() {
  const node = selectedNode();
  if (!node) {
    return "<p>右键点击线条附近创建节点。</p>";
  }
  return `
    <label>
      节点 ID
      <input value="${escapeHtml(node.id)}" readonly>
    </label>
    <label>
      标签
      <input data-node-label value="${escapeHtml(node.label)}">
    </label>
    <dl>
      <div><dt>x / y</dt><dd>${Math.round(node.x)} / ${Math.round(node.y)}</dd></div>
      <div><dt>strokeId</dt><dd>${shortId(node.strokeId)}</dd></div>
      <div><dt>segmentIndex</dt><dd>${node.segmentIndex ?? "-"}</dd></div>
      <div><dt>componentId</dt><dd>${shortId(node.componentId)}</dd></div>
    </dl>
    <button type="button" class="danger-button" data-node-action="delete">删除节点</button>
  `;
}

function setTool(tool) {
  if (!guardJourneyMutation(`setTool:${tool}`)) {
    return;
  }
  state.editor.activeTool = tool;
  currentPointer = null;
  rawDrawPoints = [];
  startSnap = null;
  dragState = null;
  logJourney("Changed active sketch tool.", { tool });
  render();
}

function updateSetting(field) {
  if (!guardJourneyMutation("updateSetting")) {
    return;
  }
  const key = field.dataset.setting;
  if (key === "height") {
    state.canvas.height = Math.round(clamp(Number(field.value), MIN_CANVAS_HEIGHT, MAX_CANVAS_HEIGHT));
  } else if (key === "showSamples") {
    state.editor.showSamples = field.checked;
  } else {
    state.editor[key] = Math.round(Number(field.value));
  }
  markDirty(`setting ${key} changed`);
  render();
}

function handleToolbarAction(action) {
  if (action !== "exit" && !guardJourneyMutation(`toolbar:${action}`)) {
    return;
  }
  const fileInput = document.querySelector(`[data-file-input='${action === "upload-background" ? "background" : "sticker"}']`);
  const actions = {
    "upload-background": () => fileInput?.click(),
    "clear-background": clearBackground,
    "upload-sticker": () => fileInput?.click(),
    save: saveToLocalStorage,
    clear: clearCanvasState,
    exit: () => {
      state.mode = "preview";
      render();
    }
  };
  actions[action]?.();
}

function clearBackground() {
  if (!guardJourneyMutation("clearBackground")) {
    return;
  }
  state.canvas.background = {
    imageSrc: "",
    fit: "cover"
  };
  markDirty("background cleared");
  showMessage("背景已清除。");
  render();
}

function handleFileInput(input) {
  if (!guardJourneyMutation(`fileInput:${input.dataset.fileInput || "unknown"}`)) {
    input.value = "";
    return;
  }
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  readImageFile(file).then((dataUrl) => {
    if (input.dataset.fileInput === "background") {
      state.canvas.background.imageSrc = dataUrl;
      markDirty("background uploaded");
      showMessage("背景已载入。");
    } else {
      addSticker(dataUrl);
      showMessage("贴纸已添加。");
    }
    input.value = "";
    render();
  }).catch((error) => {
    showMessage("图片读取失败，请重试。", true);
    logJourney("Image file read failed.", { error: error.message });
  });
}

function handleCanvasDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("is-drag-over");
  if (state.mode !== "edit" || !guardJourneyMutation("handleCanvasDrop")) {
    return;
  }
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }
  readImageFile(file).then((dataUrl) => {
    if (event.shiftKey) {
      state.canvas.background.imageSrc = dataUrl;
      markDirty("background dropped");
      showMessage("背景已载入。");
    } else {
      const point = canvasPointToCssPercent(clientPointToCanvasPoint(event));
      addSticker(dataUrl, point);
      showMessage("贴纸已添加。按住 Shift 拖入图片可设为背景。");
    }
    render();
  }).catch((error) => {
    showMessage("图片读取失败，请重试。", true);
    logJourney("Dropped image read failed.", { error: error.message });
  });
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Unsupported file type"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function addSticker(imageSrc, position = { xPercent: 50, yPercent: 30 }) {
  if (!guardJourneyMutation("addSticker")) {
    return;
  }
  const sticker = sanitizeSticker({
    imageSrc,
    ...position,
    widthPercent: 18,
    zIndex: 30 + state.canvas.stickers.length
  });
  state.canvas.stickers.push(sticker);
  state.editor.selectedStickerId = sticker.id;
  state.editor.selectedNodeId = null;
  markDirty("sticker added");
  logJourney("Added sticker.", { stickerId: sticker.id });
}

function handleCanvasPointerDown(event) {
  if (state.mode !== "edit" || event.button !== 0 || !guardJourneyMutation("handleCanvasPointerDown")) {
    return;
  }
  if (event.target.closest(".journey-sketch-sticker") || event.target.closest(".journey-sketch-node")) {
    return;
  }
  const point = clientPointToCanvasPoint(event);
  if (state.editor.activeTool === "draw") {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startSnap = findNearestEndpoint(point, state.editor.snapRadius);
    rawDrawPoints = [startSnap ? { ...startSnap.point } : point];
    currentPointer = point;
    dragState = { kind: "draw" };
    showMessage(startSnap ? "起点已吸附到端点。" : "正在手绘。");
    render();
  } else if (state.editor.activeTool === "erase") {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    currentPointer = point;
    dragState = { kind: "erase" };
    if (eraseAt(point, state.editor.eraseRadius)) {
      markDirty("stroke erased");
    }
    render();
  } else {
    state.editor.selectedNodeId = null;
    state.editor.selectedStickerId = null;
    render();
  }
}

function handleCanvasPointerMove(event) {
  if (state.mode !== "edit" || !guardJourneyMutation("handleCanvasPointerMove")) {
    return;
  }
  const point = clientPointToCanvasPoint(event);
  currentPointer = point;
  if (!dragState) {
    if (["draw", "erase"].includes(state.editor.activeTool)) {
      render();
    }
    return;
  }
  if (dragState.kind === "draw") {
    const previous = rawDrawPoints[rawDrawPoints.length - 1];
    if (!previous || distance(previous, point) >= 3) {
      rawDrawPoints.push(point);
      render();
    }
  } else if (dragState.kind === "erase") {
    if (eraseAt(point, state.editor.eraseRadius)) {
      markDirty("stroke erased");
    }
    render();
  }
}

function handleCanvasPointerUp(event) {
  if (!dragState) {
    return;
  }
  if (!guardJourneyMutation("handleCanvasPointerUp")) {
    return;
  }
  const point = clientPointToCanvasPoint(event);
  if (dragState.kind === "draw") {
    const endSnap = findNearestEndpoint(point, state.editor.snapRadius);
    const endPoint = endSnap ? { ...endSnap.point } : point;
    if (distance(rawDrawPoints[rawDrawPoints.length - 1], endPoint) > 0.5) {
      rawDrawPoints.push(endPoint);
    } else {
      rawDrawPoints[rawDrawPoints.length - 1] = endPoint;
    }
    const stroke = addOrMergeStroke(rawDrawPoints, startSnap, endSnap);
    if (stroke) {
      markDirty("stroke drawn");
      showMessage(endSnap || startSnap ? "线条已吸附并合并。" : "线条已添加。");
    }
  } else if (dragState.kind === "erase") {
    reattachAllNodes();
    markDirty("erase completed");
    showMessage("擦除完成。");
  }
  dragState = null;
  rawDrawPoints = [];
  startSnap = null;
  currentPointer = null;
  render();
}

function handleCanvasContextMenu(event) {
  event.preventDefault();
  if (state.mode !== "edit" || !guardJourneyMutation("handleCanvasContextMenu")) {
    return;
  }
  if (!state.canvas.strokes.length) {
    showMessage("请先画一条线，再在线上创建节点。", true);
    return;
  }
  const node = addNodeNear(clientPointToCanvasPoint(event));
  if (!node) {
    showMessage("请在离线条更近的位置创建节点。", true);
    return;
  }
  state.editor.activeTool = "select";
  markDirty("node created");
  render();
  showMessage(`已创建节点 ${node.id}。`);
}

function startNodeDrag(event, nodeId) {
  if (state.mode !== "edit" || !guardJourneyMutation("startNodeDrag")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const node = state.canvas.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return;
  }
  state.editor.selectedNodeId = node.id;
  state.editor.selectedStickerId = null;
  dragState = { kind: "node", nodeId: node.id };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  render();
}

function startStickerDrag(event, stickerId, mode) {
  if (state.mode !== "edit" || !guardJourneyMutation("startStickerDrag")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const sticker = state.canvas.stickers.find((item) => item.id === stickerId);
  if (!sticker) {
    return;
  }
  state.editor.selectedStickerId = sticker.id;
  state.editor.selectedNodeId = null;
  const center = cssPercentToCanvasPoint(sticker.xPercent, sticker.yPercent);
  dragState = {
    kind: "sticker",
    mode,
    stickerId,
    startPoint: clientPointToCanvasPoint(event),
    startSticker: clone(sticker),
    center
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  render();
}

window.addEventListener("pointermove", (event) => {
  if (!dragState || state.mode !== "edit" || !guardJourneyMutation("windowPointerMove")) {
    return;
  }
  const point = clientPointToCanvasPointSafe(event);
  if (!point) {
    return;
  }
  if (dragState.kind === "node") {
    const node = state.canvas.nodes.find((item) => item.id === dragState.nodeId);
    if (node) {
      moveNodeAlongComponent(node, point);
      markDirty("node dragged");
      render();
    }
  } else if (dragState.kind === "sticker") {
    updateStickerDrag(point);
    markDirty("sticker transformed");
    render();
  }
});

window.addEventListener("pointerup", () => {
  if (!dragState) {
    return;
  }
  if (!guardJourneyMutation("windowPointerUp")) {
    return;
  }
  if (dragState?.kind === "node") {
    showMessage("节点已沿线移动。");
  } else if (dragState?.kind === "sticker") {
    showMessage("贴纸已调整。");
  }
  if (dragState?.kind === "node" || dragState?.kind === "sticker") {
    dragState = null;
    render();
  }
});

window.addEventListener("keydown", (event) => {
  if (state.mode !== "edit" || !["Delete", "Backspace"].includes(event.key) || !guardJourneyMutation("deleteKey")) {
    return;
  }
  if (state.editor.selectedNodeId) {
    event.preventDefault();
    deleteSelectedNode();
  } else if (state.editor.selectedStickerId) {
    event.preventDefault();
    deleteSelectedSticker();
  }
});

function clientPointToCanvasPointSafe(event) {
  if (!getSketchCoordinateSurface() && !getSketchCanvasElement()) {
    return null;
  }
  return clientPointToCanvasPoint(event);
}

function updateStickerDrag(point) {
  if (!guardJourneyMutation("updateStickerDrag")) {
    return;
  }
  const sticker = state.canvas.stickers.find((item) => item.id === dragState.stickerId);
  if (!sticker) {
    return;
  }
  if (dragState.mode === "move") {
    Object.assign(sticker, canvasPointToCssPercent(point));
  } else if (dragState.mode === "resize") {
    const startDistance = Math.max(1, distance(dragState.startPoint, dragState.center));
    const currentDistance = Math.max(1, distance(point, dragState.center));
    sticker.widthPercent = clamp(
      dragState.startSticker.widthPercent * (currentDistance / startDistance),
      STICKER_MIN_WIDTH_PERCENT,
      STICKER_MAX_WIDTH_PERCENT
    );
  } else if (dragState.mode === "rotate") {
    const startAngle = Math.atan2(dragState.startPoint.y - dragState.center.y, dragState.startPoint.x - dragState.center.x);
    const currentAngle = Math.atan2(point.y - dragState.center.y, point.x - dragState.center.x);
    sticker.rotation = dragState.startSticker.rotation + ((currentAngle - startAngle) * 180) / Math.PI;
  }
  sticker.updatedAt = nowIso();
}

function selectNode(nodeId) {
  if (!guardJourneyMutation("selectNode")) {
    return;
  }
  state.editor.selectedNodeId = nodeId;
  state.editor.selectedStickerId = null;
  state.editor.activeTool = "select";
  render();
}

function selectedNode() {
  return state.canvas.nodes.find((node) => node.id === state.editor.selectedNodeId) || null;
}

function updateSelectedNodeLabel(label) {
  if (!guardJourneyMutation("updateSelectedNodeLabel")) {
    return;
  }
  const node = selectedNode();
  if (!node) {
    return;
  }
  node.label = label || node.id;
  node.updatedAt = nowIso();
  markDirty("node label changed");
  render();
}

function deleteSelectedNode() {
  if (!guardJourneyMutation("deleteSelectedNode")) {
    return;
  }
  if (!state.editor.selectedNodeId) {
    return;
  }
  state.canvas.nodes = state.canvas.nodes.filter((node) => node.id !== state.editor.selectedNodeId);
  state.editor.selectedNodeId = null;
  markDirty("node deleted");
  render();
  showMessage("节点已删除。");
}

function deleteSelectedSticker() {
  if (!guardJourneyMutation("deleteSelectedSticker")) {
    return;
  }
  if (!state.editor.selectedStickerId) {
    return;
  }
  state.canvas.stickers = state.canvas.stickers.filter((sticker) => sticker.id !== state.editor.selectedStickerId);
  state.editor.selectedStickerId = null;
  markDirty("sticker deleted");
  render();
  showMessage("贴纸已删除。");
}

function showMessage(message, isError = false) {
  const status = document.querySelector("[data-editor-status]");
  if (status) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }
  logJourney(isError ? "Editor warning." : "Editor message.", { message });
}

function updateStatus(message) {
  const status = document.querySelector("[data-editor-status]");
  if (status) {
    status.textContent = message;
    status.dataset.error = "false";
  }
}

function shortId(value) {
  if (!value) {
    return "-";
  }
  return String(value).length > 14 ? `${String(value).slice(0, 14)}…` : String(value);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));
}

function openEventPopover(nodeId) {
  const node = state.canvas.nodes.find((item) => item.id === nodeId);
  if (!eventPopover || !node) {
    return;
  }
  eventPopover.innerHTML = `
    <section class="timeline-event-popover__panel">
      <div class="timeline-event-popover__top">
        <div>
          <p class="timeline-event-popover__type">Sketch Node</p>
          <h2 id="timeline-popover-title">${escapeHtml(node.label || node.id)}</h2>
        </div>
        <button type="button" class="timeline-event-popover__close" data-popover-close aria-label="Close event details">x</button>
      </div>
      <div class="timeline-event-popover__body">
        <p>节点：${escapeHtml(node.id)}</p>
        <p>x / y：${Math.round(node.x)} / ${Math.round(node.y)}</p>
        <p>stroke：${escapeHtml(shortId(node.strokeId))}</p>
        <p>segment：${node.segmentIndex ?? "-"}</p>
      </div>
    </section>
  `;
  eventPopover.hidden = false;
  eventPopover.querySelector("[data-popover-close]")?.addEventListener("click", closeEventPopover);
}

function closeEventPopover() {
  if (!eventPopover) {
    return;
  }
  eventPopover.hidden = true;
  eventPopover.innerHTML = "";
}

function installGlobalControls() {
  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.viewButton === "details" ? "details" : "overview";
      document.querySelectorAll("[data-view-button]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      render();
    });
  });
  document.querySelector("[data-editor-toggle]")?.addEventListener("click", () => {
    if (!canEditJourney()) {
      logJourney("Ignored editor toggle because current user lacks homepage:edit.");
      return;
    }
    state.mode = state.mode === "edit" ? "preview" : "edit";
    render();
  });
  document.addEventListener("click", (event) => {
    if (event.target?.matches("[data-popover-close]")) {
      closeEventPopover();
    }
  });
}

function runGeometryTests() {
  const oldState = state;
  state = defaultSketchState();
  const raw = [{ x: 10, y: 10 }, { x: 40, y: 80 }, { x: 90, y: 10 }];
  const smooth = smoothDrawnPoints(raw, 6, 2);
  const endpointPass = distance(smooth[0], raw[0]) < 0.01 && distance(smooth[smooth.length - 1], raw[raw.length - 1]) < 0.01;
  const strokeA = addOrMergeStroke(raw, null, null);
  const snap = findNearestEndpoint(strokeA.points[strokeA.points.length - 1], 34);
  const strokeB = addOrMergeStroke([
    { ...snap.point },
    { x: 140, y: 60 },
    { x: 180, y: 80 }
  ], snap, null);
  const mergePass = state.canvas.strokes.length === 1 && strokeB.points.length > strokeA.points.length;
  const node = addNodeNear({ x: 70, y: 35 });
  const nodePass = Boolean(node?.strokeId);
  eraseAt(strokeB.points[Math.floor(strokeB.points.length / 2)], 18);
  const erasePass = state.canvas.strokes.length >= 1;
  if (node) {
    moveNodeAlongComponent(node, { x: 170, y: 70 });
  }
  const dragPass = !node || Boolean(node.strokeId);
  lastGeometryTestResult = {
    endpointPass,
    mergePass,
    nodePass,
    erasePass,
    dragPass,
    pass: endpointPass && mergePass && nodePass && erasePass && dragPass
  };
  state = oldState;
  logJourney("Ran sketch geometry tests.", lastGeometryTestResult);
  return lastGeometryTestResult;
}

function getLayerRects() {
  const pick = (selector) => {
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom
    };
  };

  return {
    canvas: pick(".journey-sketch-canvas"),
    strokes: pick(".journey-sketch-strokes"),
    nodes: pick(".journey-sketch-nodes"),
    stickers: pick(".journey-sketch-stickers"),
    background: pick(".journey-sketch-background"),
    interaction: pick(".journey-sketch-interaction")
  };
}

window.__journeySketchDebug = {
  runGeometryTests,
  getState: () => clone(state),
  getLastGeometryTestResult: () => clone(lastGeometryTestResult),
  getLayerRects,
  testPointerMapping: (clientX, clientY) => clientPointToCanvasPoint({ clientX, clientY })
};

async function initializeJourney() {
  installGlobalControls();
  state = loadInitialState();
  await loadJourneyAuthState();
  render();
  logJourney("Initialized sketch canvas editor.", {
    version: state.version,
    strokes: state.canvas.strokes.length,
    nodes: state.canvas.nodes.length,
    stickers: state.canvas.stickers.length,
    canEdit: canEditJourney()
  });
}

initializeJourney();
