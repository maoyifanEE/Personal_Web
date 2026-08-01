const STORAGE_KEY = "journeySketchCanvasStateV1";
const JOURNEY_CANVAS_SYNC_KEY = "personalWebJourneyCanvasUpdatedAt";
const JOURNEY_CANVAS_SYNC_CHANNEL = "personal-web-journey-canvas-sync";
const SCHEMA_VERSION = "sketch-canvas-v1";
const REMOTE_CANVAS_PATH = "/homepage/canvas";
const REMOTE_CANVAS_RESET_PATH = "/homepage/canvas/reset";
const PUBLISH_BUNDLE_EXPORT_PATH = "/homepage/publish-bundle/export";
const HOMEPAGE_MEDIA_PATH = "/homepage/media";
const STICKER_TOOL_PATH = "/sticker-tool";
const CURVE_IMPORT_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
const CURVE_IMPORT_MAX_DECODED_SIDE = 4096;
const CURVE_IMPORT_MAX_PROCESSING_SIDE = 2048;
const CURVE_IMPORT_MAX_PROCESSING_PIXELS = 1200000;
const EDITOR_SIDEBAR_BREAKPOINT_PX = 900;
const EDITOR_SIDEBAR_ID = "journey-editor-sidebar";
const CANVAS_WIDTH = 1000;
const DEFAULT_CANVAS_HEIGHT = 2400;
const MIN_CANVAS_HEIGHT = 800;
const MAX_CANVAS_HEIGHT = 6000;
const MIN_STROKE_POINTS = 2;
const STICKER_MIN_WIDTH_PERCENT = 4;
const STICKER_MAX_WIDTH_PERCENT = 600;
const STICKER_MIN_ASPECT_RATIO = 0.05;
const STICKER_MAX_ASPECT_RATIO = 20;
const DEFAULT_ROUTE_STYLE = Object.freeze({
  color: "#8B8CF6",
  width: 4,
  dashed: true,
  dashLength: 12,
  dashGap: 10
});
const DEFAULT_NODE_STYLE = Object.freeze({
  color: "#8B8CF6",
  size: 42,
  ring: "double",
  glow: "soft"
});
const NODE_COLOR_OPTIONS = ["#8B8CF6", "#7C3AED", "#22C55E", "#F97316", "#EC4899", "#06B6D4", "#FACC15"];
const MIN_NODE_SIZE = 24;
const MAX_NODE_SIZE = 72;
const MIN_PREVIEW_THUMBNAILS = 1;
const MAX_PREVIEW_THUMBNAILS = 10;
const DEFAULT_PREVIEW_THUMBNAILS = 4;
const NODE_HOVER_CLOSE_DELAY_MS = 220;

const root = document.querySelector(".timeline-home");
const canvasHost = document.querySelector("#journey-areas");
const editorRoot = document.querySelector("#context-editor-root");
const eventPopover = document.querySelector("#timeline-event-popover");
const routeParams = new URLSearchParams(window.location.search);
const journeyRouteEditRequested = routeParams.get("edit") === "1";

const logJourney = (message, detail = {}) => {
  if (window.PersonalWebDebug?.log) {
    window.PersonalWebDebug.log("info", `journey.${message.replace(/\s+/g, "_").toLowerCase()}`, detail);
  }
  console.info(`[journey-sketch] ${message}`, detail);
};

const journeyEventTargetSummary = (target) => ({
  targetTag: target?.tagName?.toLowerCase() || "",
  targetClass: typeof target?.className === "string" ? target.className : "",
  stickerId: target?.closest?.("[data-sticker-id]")?.dataset?.stickerId || null
});

const journeyHitTestSummary = (event) => {
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  return {
    hitTestTopTag: hit?.tagName?.toLowerCase() || "",
    hitTestTopClass: typeof hit?.className === "string" ? hit.className : "",
    hitTestTopStickerId: hit?.closest?.("[data-sticker-id]")?.dataset?.stickerId || null
  };
};

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const nowIso = () => new Date().toISOString();
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const apiBaseUrl = () => window.PersonalWebAuth?.apiBaseUrl || "http://127.0.0.1:8000/api";

const normalizeOptionalMediaId = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const transparentColors = new Set(["transparent", "rgba(0, 0, 0, 0)"]);

const hasPaintedBackground = (styles) =>
  Boolean(styles) &&
  (!transparentColors.has(styles.backgroundColor) ||
    (styles.backgroundImage && styles.backgroundImage !== "none"));

const hasVisibleStyleValue = (value) => Boolean(value && value !== "none");

const sourceCategoryForSticker = (sticker) => {
  if (normalizeOptionalMediaId(sticker?.mediaId)) {
    return "homepage-media";
  }
  if (typeof sticker?.imageSrc === "string" && sticker.imageSrc) {
    return "local-draft";
  }
  return "missing-source";
};

function logStickerRenderCreated(sticker, selected) {
  const key = [
    sticker.id,
    state.mode,
    state.editor.activeTool,
    selected ? "selected" : "unselected",
    sourceCategoryForSticker(sticker)
  ].join("|");
  if (stickerRenderLogKeys.has(key)) {
    return;
  }
  stickerRenderLogKeys.add(key);
  logJourney("sticker.render.created", {
    itemType: "sticker",
    selected,
    editorMode: state.mode,
    publicOrEdit: state.mode === "edit" ? "edit" : "public",
    activeTool: state.editor.activeTool,
    renderedDimensions: {
      widthPercent: sticker.widthPercent,
      aspectRatio: sticker.aspectRatio || 1
    },
    sourceCategory: sourceCategoryForSticker(sticker),
    requestRunId: JOURNEY_INSTANCE_ID
  });
}

function logStickerRenderStyleSnapshots(canvas) {
  if (!canvas || typeof window.getComputedStyle !== "function") {
    return;
  }
  canvas.querySelectorAll(".journey-sketch-sticker").forEach((wrapper) => {
    const image = wrapper.querySelector("img");
    if (!image) {
      return;
    }
    const imageStyles = window.getComputedStyle(image);
    const wrapperStyles = window.getComputedStyle(wrapper);
    const imageRect = image.getBoundingClientRect();
    const selected = wrapper.classList.contains("is-selected");
    const styleFlags = {
      imageHasBackground: hasPaintedBackground(imageStyles),
      imageHasBoxShadow: hasVisibleStyleValue(imageStyles.boxShadow),
      imageHasFilter: hasVisibleStyleValue(imageStyles.filter),
      wrapperHasBackground: hasPaintedBackground(wrapperStyles),
      wrapperHasBoxShadow: hasVisibleStyleValue(wrapperStyles.boxShadow),
      wrapperHasFilter: hasVisibleStyleValue(wrapperStyles.filter)
    };
    const key = [
      wrapper.dataset.stickerId || "",
      state.mode,
      state.editor.activeTool,
      selected ? "selected" : "unselected",
      Object.values(styleFlags).join(",")
    ].join("|");
    if (stickerRenderStyleSnapshotKeys.has(key)) {
      return;
    }
    stickerRenderStyleSnapshotKeys.add(key);
    const details = {
      itemType: "sticker",
      selected,
      editorMode: state.mode,
      publicOrEdit: state.mode === "edit" ? "edit" : "public",
      activeTool: state.editor.activeTool,
      renderedDimensions: {
        width: Math.round(imageRect.width),
        height: Math.round(imageRect.height)
      },
      classNames: {
        wrapper: Array.from(wrapper.classList),
        image: Array.from(image.classList)
      },
      styleSourceCategory: "journey-sketch-sticker",
      ...styleFlags,
      requestRunId: JOURNEY_INSTANCE_ID
    };
    logJourney("sticker.render.style_snapshot", details);
    if (
      styleFlags.imageHasBackground ||
      styleFlags.imageHasBoxShadow ||
      styleFlags.imageHasFilter ||
      styleFlags.wrapperHasBackground ||
      styleFlags.wrapperHasBoxShadow ||
      styleFlags.wrapperHasFilter
    ) {
      logJourney("sticker.render.artifact_check", {
        ...details,
        diagnosticResult: "sticker_render_chain_has_visual_effect"
      });
    }
  });
}

function logStickerSelectionChanged(previousStickerId, nextStickerId, reason) {
  if (previousStickerId === nextStickerId) {
    return;
  }
  logJourney("sticker.selection.changed", {
    itemType: "sticker",
    selected: Boolean(nextStickerId),
    previousSelected: Boolean(previousStickerId),
    editorMode: state.mode,
    activeTool: state.editor.activeTool,
    reason,
    requestRunId: JOURNEY_INSTANCE_ID
  });
}

const homepageMediaPublicFileUrl = (mediaId) => {
  const normalizedId = normalizeOptionalMediaId(mediaId);
  return normalizedId ? `${apiBaseUrl()}${HOMEPAGE_MEDIA_PATH}/${normalizedId}/file` : "";
};

const homepageMediaAdminFileUrl = (mediaId) => {
  const normalizedId = normalizeOptionalMediaId(mediaId);
  return normalizedId ? `${apiBaseUrl()}${HOMEPAGE_MEDIA_PATH}/${normalizedId}/admin-file` : "";
};

const stickerImageSrc = (sticker, options = {}) => {
  const useAdminPreview = Boolean(options.useAdminPreview);
  const mediaUrl = useAdminPreview
    ? homepageMediaAdminFileUrl(sticker?.mediaId)
    : homepageMediaPublicFileUrl(sticker?.mediaId);
  return mediaUrl || (typeof sticker?.imageSrc === "string" ? sticker.imageSrc : "");
};

const nodeGalleryImageSrc = (image, options = {}) => {
  const useAdminPreview = Boolean(options.useAdminPreview);
  return useAdminPreview
    ? homepageMediaAdminFileUrl(image?.mediaId)
    : homepageMediaPublicFileUrl(image?.mediaId);
};

function sanitizeHexColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

function clampAspectRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 1;
  }
  return clamp(number, STICKER_MIN_ASPECT_RATIO, STICKER_MAX_ASPECT_RATIO);
}

function normalizeOptionalDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

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
    routeStyle: { ...DEFAULT_ROUTE_STYLE },
    defaultNodeStyle: { ...DEFAULT_NODE_STYLE },
    maxPreviewThumbnails: DEFAULT_PREVIEW_THUMBNAILS,
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
    endpointTolerance: 8,
    nodeStyleTemplate: null
  }
});

let state = defaultSketchState();
let dragState = null;
let rawDrawPoints = [];
let startSnap = null;
let currentPointer = null;
let lastGeometryTestResult = null;
let editorFocusMode = false;
let editorZoom = 1;
let editorSidebarCollapsed = false;
let editorSidebarDrawerOpen = false;
let editorSidebarInitializedForEdit = false;
let curveImportState = null;
let curveImportUndoSnapshot = null;
let journeyCanvasSyncChannel = null;
const stickerRenderLogKeys = new Set();
const stickerRenderStyleSnapshotKeys = new Set();
const JOURNEY_INSTANCE_ID = makeId("journey-tab");
const EDITOR_ZOOM_MIN = 0.15;
const EDITOR_ZOOM_MAX = 1;
let journeyAuthState = {
  authenticated: false,
  roles: [],
  permissions: []
};
let journeyHasEditPermission = false;
let journeyCanEdit = false;
let nodeGalleryUploadState = {
  uploading: false
};
let stickerToolState = {
  statusLoaded: false,
  status: null,
  busy: false,
  sourceFile: null,
  sourcePreviewUrl: "",
  outputPreviewUrl: "",
  run: null,
  browserAlpha: null,
  configInput: "",
  error: "",
  message: "",
  accepted: false
};
let remoteCanvasMeta = {
  loaded: false,
  exists: false,
  revision: 0,
  updatedAt: null,
  updatedByUserId: null,
  status: "正在读取已保存画布...",
  saving: false,
  warning: false
};
let publishBundleExportMeta = {
  exporting: false
};
let nodeHoverState = {
  nodeId: null,
  imageIndex: 0,
  closeTimer: null
};

function canEditJourney() {
  return Boolean(journeyRouteEditRequested && journeyCanEdit);
}

function canPublishJourney() {
  return Boolean(journeyHasEditPermission);
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
  logJourney("Blocked Journey edit mutation without homepage:edit permission or edit route.", {
    action,
    editRequested: journeyRouteEditRequested,
    hasEditPermission: journeyHasEditPermission
  });
  return false;
}

async function loadJourneyAuthState() {
  if (!journeyRouteEditRequested) {
    logJourney("Skipped journey auth state for public read-only route.", {
      editRequested: journeyRouteEditRequested
    });
    return;
  }
  if (!window.PersonalWebAuth) {
    logJourney("Auth helper unavailable; journey editor remains read-only.");
    return;
  }
  try {
    journeyAuthState = await window.PersonalWebAuth.getCurrentAuthState({ force: true });
    journeyHasEditPermission =
      window.PersonalWebAuth.hasRole(journeyAuthState, "admin") ||
      window.PersonalWebAuth.hasPermission(journeyAuthState, "homepage:edit");
    journeyCanEdit = journeyRouteEditRequested && journeyHasEditPermission;
    logJourney("Loaded journey auth state.", {
      authenticated: journeyAuthState.authenticated,
      editRequested: journeyRouteEditRequested,
      hasEditPermission: journeyHasEditPermission,
      canEdit: journeyCanEdit,
      roles: journeyAuthState.roles
    });
  } catch (error) {
    journeyHasEditPermission = false;
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

const sanitizeRouteStyle = (style = {}) => {
  const width = normalizeNumber(style.width, DEFAULT_ROUTE_STYLE.width);
  const dashLength = normalizeNumber(style.dashLength, DEFAULT_ROUTE_STYLE.dashLength);
  const dashGap = normalizeNumber(style.dashGap, DEFAULT_ROUTE_STYLE.dashGap);
  const looksLikeLegacyChunkyDefault =
    Math.round(width) === 10 &&
    Math.round(dashLength) === 18 &&
    Math.round(dashGap) === 16;
  return {
    color: sanitizeHexColor(style.color, DEFAULT_ROUTE_STYLE.color),
    width: Math.round(clamp(
      looksLikeLegacyChunkyDefault ? DEFAULT_ROUTE_STYLE.width : width,
      2,
      18
    )),
    dashed: style.dashed === undefined ? DEFAULT_ROUTE_STYLE.dashed : Boolean(style.dashed),
    dashLength: Math.round(clamp(
      looksLikeLegacyChunkyDefault ? DEFAULT_ROUTE_STYLE.dashLength : dashLength,
      4,
      28
    )),
    dashGap: Math.round(clamp(
      looksLikeLegacyChunkyDefault ? DEFAULT_ROUTE_STYLE.dashGap : dashGap,
      4,
      28
    ))
  };
};

const sanitizeNodeStyle = (style = {}) => {
  const color = sanitizeHexColor(style.color, DEFAULT_NODE_STYLE.color);
  const rawSize = normalizeNumber(style.size, DEFAULT_NODE_STYLE.size);
  const looksLikeLegacyDefault =
    Math.round(rawSize) === 34 &&
    color.toLowerCase() === DEFAULT_NODE_STYLE.color.toLowerCase();
  return {
    color,
    size: Math.round(clamp(
      looksLikeLegacyDefault ? DEFAULT_NODE_STYLE.size : rawSize,
      MIN_NODE_SIZE,
      MAX_NODE_SIZE
    )),
    ring: ["double", "simple"].includes(style.ring) ? style.ring : DEFAULT_NODE_STYLE.ring,
    glow: ["none", "soft"].includes(style.glow) ? style.glow : DEFAULT_NODE_STYLE.glow
  };
};

const sanitizeGalleryImage = (image = {}) => {
  const mediaId = normalizeOptionalMediaId(image.mediaId);
  if (!mediaId) {
    return null;
  }
  return {
    mediaId,
    alt: typeof image.alt === "string" ? image.alt.slice(0, 120) : "",
    caption: typeof image.caption === "string" ? image.caption.slice(0, 180) : ""
  };
};

const sanitizeGalleryImages = (images = []) => Array.isArray(images)
  ? images.map(sanitizeGalleryImage).filter(Boolean).slice(0, 24)
  : [];

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

const sanitizeNode = (node = {}) => {
  const fallbackId = `N${state.canvas.nextNodeNumber.toString().padStart(3, "0")}`;
  const id = typeof node.id === "string" && node.id ? node.id : fallbackId;
  const label = typeof node.label === "string" && node.label ? node.label : id;
  return {
    id,
    label,
    title: typeof node.title === "string" && node.title ? node.title : label,
    subtitle: typeof node.subtitle === "string" ? node.subtitle.slice(0, 160) : "",
    meta: typeof node.meta === "string" ? node.meta.slice(0, 160) : "",
    description: typeof node.description === "string" ? node.description.slice(0, 400) : "",
    x: clamp(normalizeNumber(node.x, 0), 0, CANVAS_WIDTH),
    y: clamp(normalizeNumber(node.y, 0), 0, state.canvas.height),
    strokeId: typeof node.strokeId === "string" ? node.strokeId : null,
    segmentIndex: Number.isFinite(Number(node.segmentIndex)) ? Math.max(0, Math.round(Number(node.segmentIndex))) : null,
    componentId: typeof node.componentId === "string" ? node.componentId : null,
    style: sanitizeNodeStyle(node.style || state.canvas.defaultNodeStyle),
    galleryImages: sanitizeGalleryImages(node.galleryImages),
    createdAt: typeof node.createdAt === "string" ? node.createdAt : nowIso(),
    updatedAt: typeof node.updatedAt === "string" ? node.updatedAt : nowIso()
  };
};

const sanitizeSticker = (sticker = {}) => {
  const naturalWidth = normalizeOptionalDimension(sticker.naturalWidth);
  const naturalHeight = normalizeOptionalDimension(sticker.naturalHeight);
  const derivedAspectRatio = naturalWidth && naturalHeight
    ? naturalWidth / naturalHeight
    : sticker.aspectRatio;
  return {
    id: typeof sticker.id === "string" && sticker.id ? sticker.id : makeId("sticker"),
    imageSrc: typeof sticker.imageSrc === "string" ? sticker.imageSrc : "",
    mediaId: normalizeOptionalMediaId(sticker.mediaId),
    mediaType: sticker.mediaType === "image" ? "image" : null,
    mediaTitle: typeof sticker.mediaTitle === "string" ? sticker.mediaTitle : "",
    mediaFilename: typeof sticker.mediaFilename === "string" ? sticker.mediaFilename : "",
    source: sticker.source === "homepage-media" ? "homepage-media" : "local-draft",
    uploadStatus: sticker.uploadStatus === "uploaded" ? "uploaded" : "",
    xPercent: clamp(normalizeNumber(sticker.xPercent, 50), -20, 120),
    yPercent: clamp(normalizeNumber(sticker.yPercent, 30), -20, 120),
    widthPercent: clamp(normalizeNumber(sticker.widthPercent, 18), STICKER_MIN_WIDTH_PERCENT, STICKER_MAX_WIDTH_PERCENT),
    rotation: clamp(normalizeNumber(sticker.rotation, 0), -720, 720),
    zIndex: Math.round(clamp(normalizeNumber(sticker.zIndex, 30), 1, 200)),
    aspectRatio: clampAspectRatio(derivedAspectRatio),
    naturalWidth,
    naturalHeight,
    createdAt: typeof sticker.createdAt === "string" ? sticker.createdAt : nowIso(),
    updatedAt: typeof sticker.updatedAt === "string" ? sticker.updatedAt : nowIso()
  };
};

const stickerOrderFallback = (sticker, index) => {
  const created = Date.parse(sticker.createdAt || "");
  return Number.isFinite(created) ? created : index;
};

function getOrderedStickers(stickers = state.canvas.stickers) {
  return stickers
    .map((sticker, index) => ({ sticker, index }))
    .sort((a, b) => {
      const zDiff = normalizeNumber(a.sticker.zIndex, a.index) - normalizeNumber(b.sticker.zIndex, b.index);
      if (zDiff !== 0) {
        return zDiff;
      }
      const createdDiff = stickerOrderFallback(a.sticker, a.index) - stickerOrderFallback(b.sticker, b.index);
      return createdDiff || a.index - b.index;
    })
    .map((entry) => entry.sticker);
}

function normalizeStickerZOrder(stickers = state.canvas.stickers) {
  const ordered = getOrderedStickers(stickers);
  ordered.forEach((sticker, index) => {
    sticker.zIndex = index;
  });
  state.canvas.stickers = ordered;
  return ordered;
}

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
  merged.canvas.routeStyle = sanitizeRouteStyle(merged.canvas.routeStyle);
  merged.canvas.defaultNodeStyle = sanitizeNodeStyle(merged.canvas.defaultNodeStyle);
  merged.canvas.maxPreviewThumbnails = Math.round(clamp(
    normalizeNumber(merged.canvas.maxPreviewThumbnails, DEFAULT_PREVIEW_THUMBNAILS),
    MIN_PREVIEW_THUMBNAILS,
    MAX_PREVIEW_THUMBNAILS
  ));
  merged.canvas.strokes = Array.isArray(merged.canvas.strokes)
    ? merged.canvas.strokes.map(sanitizeStroke).filter(Boolean)
    : [];
  merged.canvas.stickers = Array.isArray(merged.canvas.stickers)
    ? merged.canvas.stickers.map(sanitizeSticker).filter((sticker) => sticker.mediaId || sticker.imageSrc)
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
  merged.editor.nodeStyleTemplate = merged.editor.nodeStyleTemplate
    ? sanitizeNodeStyle(merged.editor.nodeStyleTemplate)
    : null;
  merged.editor.selectedNodeId = merged.canvas.nodes.some((node) => node.id === merged.editor.selectedNodeId)
    ? merged.editor.selectedNodeId
    : null;
  merged.editor.selectedStickerId = merged.canvas.stickers.some((sticker) => sticker.id === merged.editor.selectedStickerId)
    ? merged.editor.selectedStickerId
    : null;

  state = merged;
  normalizeStickerZOrder();
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

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    logJourney("Failed to parse canvas API JSON response.", { error: error.message });
    return {};
  }
};

const buildPersistedCanvasPayload = () => {
  normalizeStickerZOrder();
  return {
    version: SCHEMA_VERSION,
    canvas: clone(state.canvas)
  };
};

const containsDataUrl = (value) => {
  if (typeof value === "string") {
    return value.trim().toLowerCase().startsWith("data:");
  }
  if (Array.isArray(value)) {
    return value.some(containsDataUrl);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(containsDataUrl);
  }
  return false;
};

const canvasContainsDataUrl = (canvasPayload) => containsDataUrl(canvasPayload);

const validateCanvasForRemoteSave = (payload) => {
  if (canvasContainsDataUrl(payload)) {
    logJourney("Blocked remote canvas save because local Data URL media is still present.");
    return {
      valid: false,
      message: "当前画布包含本地图片草稿，不能保存到数据库。请使用上传贴纸。"
    };
  }
  return { valid: true, message: "" };
};

const applyRemoteCanvasState = (remote, options = {}) => {
  const preserveMode = Boolean(options.preserveMode);
  const nextMode = preserveMode ? state.mode : "preview";
  if (!remote?.exists || !remote.canvas_data || typeof remote.canvas_data !== "object") {
    remoteCanvasMeta = {
      ...remoteCanvasMeta,
      loaded: true,
      exists: false,
      revision: 0,
      status: "数据库暂无已保存画布，当前显示空画布或本地缓存。",
      warning: false
    };
    logJourney("Remote canvas is empty; local cache remains fallback only.");
    return false;
  }

  const remotePayload = remote.canvas_data.version && remote.canvas_data.canvas
    ? remote.canvas_data
    : {
        version: remote.schema_version || SCHEMA_VERSION,
        canvas: remote.canvas_data
      };

  state = sanitizeState({
    version: remote.schema_version || remotePayload.version || SCHEMA_VERSION,
    view: state.view,
    mode: nextMode,
    canvas: remotePayload.canvas,
    editor: state.editor
  });
  remoteCanvasMeta = {
    loaded: true,
    exists: true,
    revision: Number(remote.revision) || 0,
    updatedAt: remote.updated_at || null,
    updatedByUserId: remote.updated_by_user_id || null,
    status: `已加载保存画布，revision ${Number(remote.revision) || 0}`,
    warning: false
  };
  logJourney("Applied remote canvas state.", {
    revision: remoteCanvasMeta.revision,
    strokes: state.canvas.strokes.length,
    nodes: state.canvas.nodes.length,
    stickers: state.canvas.stickers.length
  });
  return true;
};

const fetchRemoteCanvasState = async (options = {}) => {
  try {
    const response = await fetch(`${apiBaseUrl()}${REMOTE_CANVAS_PATH}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "X-Request-ID": makeId("journey-read")
      }
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail || `Remote canvas request failed: ${response.status}`);
    }
    applyRemoteCanvasState(body, options);
    return body;
  } catch (error) {
    remoteCanvasMeta = {
      ...remoteCanvasMeta,
      loaded: false,
      status: "后端不可用，当前显示本地缓存预览。",
      warning: true
    };
    logJourney("Remote canvas unavailable; using localStorage fallback.", { error: error.message });
    return null;
  }
};

const reloadRemoteCanvasState = async () => {
  updateRemoteStatus("正在重新读取数据库画布...", false);
  const remote = await fetchRemoteCanvasState();
  if (remote) {
    showMessage("已重新加载保存画布。");
  } else {
    showMessage("数据库画布读取失败，当前仍显示本地缓存。", true);
  }
  render();
};

const canvasErrorMessage = (response, body) => {
  if (response.status === 401) {
    return "请先登录后再保存画布。";
  }
  if (response.status === 403) {
    return "当前账号没有 homepage:edit 权限，不能保存画布。";
  }
  if (response.status === 409) {
    return "数据库版本已变化，请刷新页面后再保存。";
  }
  if (response.status === 400) {
    return body.detail || "画布数据未通过后端校验。";
  }
  return body.detail || `数据库请求失败：${response.status}`;
};

const saveRemoteCanvasState = async () => {
  if (!guardJourneyMutation("saveRemoteCanvasState")) {
    updateRemoteStatus("当前路由或账号没有保存权限。请从 Hub 的首页画布编辑入口进入。", true);
    return;
  }
  if (remoteCanvasMeta.saving) {
    logJourney("Ignored duplicate canvas save while request is already running.");
    return;
  }
  const payload = buildPersistedCanvasPayload();
  const validation = validateCanvasForRemoteSave(payload);
  if (!validation.valid) {
    updateRemoteStatus(validation.message, true);
    showMessage(validation.message, true);
    return;
  }
  if (!window.PersonalWebAuth?.authFetch) {
    updateRemoteStatus("认证服务不可用，无法保存画布。", true);
    return;
  }

  remoteCanvasMeta.saving = true;
  updateRemoteStatus("保存中...", false);
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(REMOTE_CANVAS_PATH, {
      method: "PUT",
      body: JSON.stringify({
        canvasKey: "default",
        schemaVersion: SCHEMA_VERSION,
        canvasData: payload,
        baseRevision: remoteCanvasMeta.revision || 0
      })
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      const message = canvasErrorMessage(response, body);
      throw new Error(message);
    }
    remoteCanvasMeta = {
      loaded: true,
      exists: true,
      revision: Number(body.revision) || 0,
      updatedAt: body.updated_at || null,
      updatedByUserId: body.updated_by_user_id || null,
      status: `画布已保存，revision ${Number(body.revision) || 0}`,
      saving: false,
      warning: false
    };
    clearLocalCanvasCache();
    state.dirty = false;
    updateRemoteStatus(remoteCanvasMeta.status, false);
    updateStatus("画布已保存，公开预览将读取最新版本。");
    notifyJourneyCanvasSaved(remoteCanvasMeta.revision);
    showMessage("画布已保存，公开预览将读取最新版本。");
    logJourney("Saved remote canvas state.", { revision: remoteCanvasMeta.revision });
  } catch (error) {
    remoteCanvasMeta.saving = false;
    updateRemoteStatus(`保存失败：${error.message}`, true);
    showMessage("保存失败，请检查登录状态或稍后重试。", true);
    logJourney("Remote canvas save failed.", { error: error.message });
  } finally {
    remoteCanvasMeta.saving = false;
    renderEditorPanel();
  }
};

const contentDispositionFilename = (headerValue) => {
  const value = headerValue || "";
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/"/g, ""));
    } catch (error) {
      logJourney("Failed to decode UTF-8 content disposition filename.", { error: error.message });
    }
  }
  const asciiMatch = value.match(/filename="?([^";]+)"?/i);
  return asciiMatch ? asciiMatch[1] : "";
};

const downloadBlob = (blob, filename) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "homepage-publish-bundle.zip";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

const exportPublishBundle = async () => {
  if (!guardJourneyMutation("exportPublishBundle")) {
    updateRemoteStatus("当前路由或账号没有导出发布包的权限。", true);
    return;
  }
  if (state.dirty) {
    const message = "画布有未保存修改，请先点击 保存画布，再导出发布包。";
    updateRemoteStatus(message, true);
    showMessage(message, true);
    return;
  }
  if (!window.PersonalWebAuth?.authFetch) {
    updateRemoteStatus("认证服务不可用，无法导出发布包。", true);
    return;
  }
  if (publishBundleExportMeta.exporting) {
    logJourney("Ignored duplicate publish bundle export request.");
    return;
  }

  publishBundleExportMeta.exporting = true;
  updateRemoteStatus("正在导出发布包...", false);
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(PUBLISH_BUNDLE_EXPORT_PATH, {
      method: "POST"
    });
    if (!response.ok) {
      const body = await parseJsonResponse(response);
      const detail = body.detail || `请求失败：${response.status}`;
      if (response.status === 403 && /production/i.test(detail)) {
        throw new Error("生产环境已禁用本地发布包导出。");
      }
      throw new Error(detail);
    }

    const blob = await response.blob();
    const filename =
      response.headers.get("X-Homepage-Bundle-Filename") ||
      contentDispositionFilename(response.headers.get("Content-Disposition")) ||
      "homepage-publish-bundle.zip";
    const homepageItemsScope = response.headers.get("X-Homepage-Bundle-Items-Scope") || "excluded";
    const mediaCount = response.headers.get("X-Homepage-Bundle-Media-Count") || "0";
    const fileCount = response.headers.get("X-Homepage-Bundle-File-Count") || "0";
    const warningCount = response.headers.get("X-Homepage-Bundle-Warning-Count") || "0";

    downloadBlob(blob, filename);
    const message = `导出成功：已下载发布包。媒体 ${mediaCount}，文件 ${fileCount}，警告 ${warningCount}。`;
    updateRemoteStatus(message, false);
    showMessage("导出成功：已下载发布包。");
    logJourney("Exported homepage publish bundle.", {
      filename,
      homepageItemsScope,
      mediaCount,
      fileCount,
      warningCount
    });
  } catch (error) {
    const message = `导出失败：${error.message}`;
    updateRemoteStatus(message, true);
    showMessage(message, true);
    logJourney("Homepage publish bundle export failed.", { error: error.message });
  } finally {
    publishBundleExportMeta.exporting = false;
    renderEditorPanel();
  }
};

const resetRemoteCanvasState = async () => {
  if (!guardJourneyMutation("resetRemoteCanvasState")) {
    updateRemoteStatus("当前路由或账号没有重置保存画布的权限。", true);
    return;
  }
  if (!window.confirm("确认重置数据库中的已保存首页画布吗？本地缓存不会被删除。")) {
    logJourney("Remote canvas reset cancelled.");
    return;
  }
  updateRemoteStatus("正在重置数据库发布画布...", false);
  try {
    const response = await window.PersonalWebAuth.authFetch(REMOTE_CANVAS_RESET_PATH, {
      method: "POST",
      body: JSON.stringify({ canvasKey: "default" })
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(canvasErrorMessage(response, body));
    }
    remoteCanvasMeta = {
      loaded: true,
      exists: false,
      revision: 0,
      updatedAt: null,
      updatedByUserId: null,
      status: "数据库保存画布已重置。",
      warning: false
    };
    updateRemoteStatus(remoteCanvasMeta.status, false);
    showMessage("数据库保存画布已重置。");
    logJourney("Reset remote canvas state.");
  } catch (error) {
    updateRemoteStatus(`重置失败：${error.message}`, true);
    showMessage("重置数据库发布画布失败。", true);
    logJourney("Remote canvas reset failed.", { error: error.message });
  }
};
const markDirty = (reason) => {
  if (!guardJourneyMutation(reason || "markDirty")) {
    return;
  }
  state.dirty = true;
  logJourney("State changed.", { reason });
  updateStatus(reason === "saved" ? "画布已保存，公开预览将读取最新版本。" : "有未保存的画布修改。");
};

const saveToLocalStorage = ({ skipGuard = false, silent = false } = {}) => {
  if (!skipGuard && !guardJourneyMutation("saveToLocalStorage")) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
  state.dirty = false;
  updateStatus("画布缓存已更新。");
  logJourney("Updated local Journey canvas cache.", {
    storageKey: STORAGE_KEY,
    strokes: state.canvas.strokes.length,
    nodes: state.canvas.nodes.length,
    stickers: state.canvas.stickers.length
  });
  if (!silent) {
    showMessage("本地缓存已更新；公开预览仍以数据库保存版本为准。");
  }
};

function clearLocalCanvasCache() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    logJourney("Cleared local Journey canvas cache after database save.", { storageKey: STORAGE_KEY });
  } catch (error) {
    logJourney("Failed to clear local Journey canvas cache.", { error: error.message });
  }
}

function notifyJourneyCanvasSaved(revision) {
  const payload = {
    type: "journey-canvas-saved",
    revision,
    timestamp: Date.now(),
    sourceId: JOURNEY_INSTANCE_ID
  };
  if (journeyCanvasSyncChannel) {
    journeyCanvasSyncChannel.postMessage(payload);
  }
  try {
    window.localStorage.setItem(JOURNEY_CANVAS_SYNC_KEY, JSON.stringify(payload));
  } catch (error) {
    logJourney("Failed to write Journey canvas sync marker.", { error: error.message });
  }
  logJourney("Notified same-origin Journey views about saved canvas.", payload);
}

async function handleJourneyCanvasSavedNotification(payload = {}) {
  if (payload.sourceId === JOURNEY_INSTANCE_ID || payload.type !== "journey-canvas-saved") {
    return;
  }
  if (state.mode === "edit" && state.dirty) {
    updateRemoteStatus("其他页面已保存新画布；当前页面有未保存修改，请保存或刷新后再继续。", true);
    logJourney("Skipped canvas auto-refresh because this editor has unsaved changes.", payload);
    return;
  }
  logJourney("Refreshing Journey canvas after same-origin save notification.", payload);
  await fetchRemoteCanvasState({ preserveMode: state.mode === "edit" });
  render();
}

function installJourneyCanvasSync() {
  if ("BroadcastChannel" in window) {
    journeyCanvasSyncChannel = new BroadcastChannel(JOURNEY_CANVAS_SYNC_CHANNEL);
    journeyCanvasSyncChannel.addEventListener("message", (event) => {
      handleJourneyCanvasSavedNotification(event.data);
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== JOURNEY_CANVAS_SYNC_KEY || !event.newValue) {
      return;
    }
    try {
      handleJourneyCanvasSavedNotification(JSON.parse(event.newValue));
    } catch (error) {
      logJourney("Ignored invalid Journey canvas sync marker.", { error: error.message });
    }
  });
}

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

function finalizeStrokePoints(rawPoints, options = {}) {
  const spacing = normalizeNumber(options.spacing, state.editor.smoothSpacing);
  const smoothIterations = normalizeNumber(options.smoothIterations, state.editor.smoothIterations);
  const points = removeNearDuplicatePoints(rawPoints, 1);
  if (points.length < MIN_STROKE_POINTS) {
    return [];
  }
  return smoothDrawnPoints(points, spacing, smoothIterations);
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
    points = finalizeStrokePoints(points);
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
  let smoothMerged = finalizeStrokePoints(merged, {
    smoothIterations: Math.max(1, state.editor.smoothIterations + 1)
  });
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
  const inheritedStyle = sanitizeNodeStyle(state.editor.nodeStyleTemplate || state.canvas.defaultNodeStyle);
  const node = {
    id: nodeId,
    label: nodeId,
    title: nodeId,
    subtitle: "",
    meta: "",
    description: "",
    x: projection.point.x,
    y: projection.point.y,
    strokeId: projection.strokeId,
    segmentIndex: projection.segmentIndex,
    componentId: projection.componentId,
    style: inheritedStyle,
    galleryImages: [],
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

function normalizeEditorZoom(value) {
  return clamp(normalizeNumber(value, 1), EDITOR_ZOOM_MIN, EDITOR_ZOOM_MAX);
}

function setEditorZoom(value, reason = "manual") {
  const nextZoom = normalizeEditorZoom(value);
  editorZoom = nextZoom;
  logJourney("Updated Journey editor visual zoom.", {
    reason,
    zoom: editorZoom,
    focusMode: editorFocusMode
  });
  render();
  scheduleFocusCanvasStageSizeSync();
}

function enterEditorFocusMode() {
  if (!guardJourneyMutation("enterEditorFocusMode")) {
    return;
  }
  editorFocusMode = true;
  editorZoom = normalizeEditorZoom(editorZoom);
  closeEventPopover();
  logJourney("Entered Journey focus drawing mode.", {
    activeTool: state.editor.activeTool,
    zoom: editorZoom
  });
  render();
  scheduleFocusCanvasStageSizeSync();
}

function exitEditorFocusMode(reason = "button") {
  if (!editorFocusMode && editorZoom === 1) {
    return;
  }
  editorFocusMode = false;
  editorZoom = 1;
  logJourney("Exited Journey focus drawing mode.", { reason });
  render();
}

function applyFullMapZoom() {
  if (!editorFocusMode) {
    editorFocusMode = true;
  }
  const focusBar = document.querySelector(".journey-focus-controls");
  const focusBarHeight = focusBar?.getBoundingClientRect?.().height || 56;
  const availableWidth = Math.max(1, window.innerWidth - 48);
  const availableHeight = Math.max(1, window.innerHeight - focusBarHeight - 72);
  const scaleX = availableWidth / CANVAS_WIDTH;
  const scaleY = availableHeight / Math.max(1, state.canvas.height);
  const nextZoom = normalizeEditorZoom(Math.min(scaleX, scaleY));
  editorZoom = nextZoom;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  logJourney("Applied Journey full-map editor zoom.", {
    availableWidth,
    availableHeight,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: state.canvas.height,
    zoom: editorZoom
  });
  render();
  scheduleFocusCanvasStageSizeSync();
}

function syncFocusCanvasStageSize() {
  const stage = document.querySelector(".journey-focus-stage");
  const canvas = document.querySelector(".journey-focus-stage .journey-sketch-canvas");
  if (!stage || !canvas) {
    return;
  }
  const realWidth = canvas.offsetWidth || CANVAS_WIDTH;
  const realHeight = canvas.offsetHeight || state.canvas.height;
  const scaledWidth = Math.max(1, Math.round(realWidth * editorZoom));
  const scaledHeight = Math.max(1, Math.round(realHeight * editorZoom));
  stage.style.width = `${scaledWidth}px`;
  stage.style.height = `${scaledHeight}px`;
  stage.style.setProperty("--focus-stage-width", `${scaledWidth}px`);
  stage.style.setProperty("--focus-stage-height", `${scaledHeight}px`);
  logJourney("Synced Journey focus stage layout size.", {
    realWidth,
    realHeight,
    scaledWidth,
    scaledHeight,
    zoom: editorZoom
  });
}

function scheduleFocusCanvasStageSizeSync() {
  if (!editorFocusMode) {
    return;
  }
  window.requestAnimationFrame(() => {
    syncFocusCanvasStageSize();
  });
}

function isNarrowEditorViewport() {
  return window.innerWidth <= EDITOR_SIDEBAR_BREAKPOINT_PX;
}

function resetEditorSidebarSessionIfNeeded() {
  if (state.mode === "edit" && canEditJourney()) {
    return;
  }
  editorSidebarDrawerOpen = false;
  editorSidebarInitializedForEdit = false;
}

function ensureEditorSidebarInitialState() {
  if (state.mode !== "edit" || !canEditJourney() || editorSidebarInitializedForEdit) {
    return;
  }
  editorSidebarCollapsed = isNarrowEditorViewport();
  editorSidebarDrawerOpen = false;
  editorSidebarInitializedForEdit = true;
  logJourney("Initialized Journey editor sidebar state.", {
    collapsed: editorSidebarCollapsed,
    narrowViewport: isNarrowEditorViewport()
  });
}

function applyEditorSidebarLayoutState() {
  if (!root || !editorRoot) {
    return;
  }
  const editMode = state.mode === "edit" && canEditJourney();
  const focusMode = editorFocusMode && editMode;
  const narrow = isNarrowEditorViewport();
  if (!editMode || focusMode) {
    editorSidebarDrawerOpen = false;
  } else if (!narrow) {
    editorSidebarDrawerOpen = false;
  } else if (!editorSidebarCollapsed) {
    editorSidebarDrawerOpen = true;
  }
  root.dataset.editorSidebarCollapsed = String(Boolean(editMode && editorSidebarCollapsed));
  root.dataset.editorSidebarDrawerOpen = String(Boolean(editMode && editorSidebarDrawerOpen));
  editorRoot.classList.toggle("is-collapsed", Boolean(editMode && editorSidebarCollapsed));
  editorRoot.classList.toggle("is-drawer-open", Boolean(editMode && editorSidebarDrawerOpen));

  const sidebar = editorRoot.querySelector(`#${EDITOR_SIDEBAR_ID}`);
  const rail = editorRoot.querySelector("[data-editor-sidebar-rail]");
  const backdrop = editorRoot.querySelector("[data-editor-sidebar-backdrop]");
  const collapseButton = editorRoot.querySelector("[data-editor-sidebar-collapse]");
  const expandButton = editorRoot.querySelector("[data-editor-sidebar-expand]");
  const sidebarHidden = !editMode || focusMode || editorSidebarCollapsed;
  const railHidden = !editMode || focusMode || !editorSidebarCollapsed;
  if (sidebar) {
    sidebar.hidden = sidebarHidden;
  }
  if (rail) {
    rail.hidden = railHidden;
  }
  if (backdrop) {
    backdrop.hidden = !(editMode && !focusMode && narrow && editorSidebarDrawerOpen);
  }
  if (collapseButton) {
    collapseButton.setAttribute("aria-expanded", String(!sidebarHidden));
  }
  if (expandButton) {
    expandButton.setAttribute("aria-expanded", String(!editorSidebarCollapsed));
  }
}

function setEditorSidebarCollapsed(collapsed, reason = "toggle") {
  if (state.mode !== "edit" || !canEditJourney()) {
    return;
  }
  const nextCollapsed = Boolean(collapsed);
  editorSidebarCollapsed = nextCollapsed;
  editorSidebarDrawerOpen = isNarrowEditorViewport() && !nextCollapsed;
  applyEditorSidebarLayoutState();
  logJourney("Updated Journey editor sidebar visibility.", {
    collapsed: editorSidebarCollapsed,
    drawerOpen: editorSidebarDrawerOpen,
    reason
  });
}

function closeEditorSidebarDrawer(reason = "close") {
  if (!editorSidebarDrawerOpen) {
    return;
  }
  editorSidebarCollapsed = true;
  editorSidebarDrawerOpen = false;
  applyEditorSidebarLayoutState();
  logJourney("Closed Journey editor sidebar drawer.", { reason });
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
  if (state.mode !== "edit" && (editorFocusMode || editorZoom !== 1)) {
    editorFocusMode = false;
    editorZoom = 1;
    logJourney("Reset Journey editor focus zoom outside edit mode.");
  }
  resetEditorSidebarSessionIfNeeded();
  ensureEditorSidebarInitialState();
  root.dataset.view = state.view;
  root.dataset.editorMode = state.mode;
  root.dataset.activeTool = state.editor.activeTool;
  root.dataset.canEdit = String(canEditJourney());
  root.dataset.focusMode = String(editorFocusMode && state.mode === "edit" && canEditJourney());
  root.dataset.editorSidebarCollapsed = String(editorSidebarCollapsed && state.mode === "edit" && canEditJourney());
  root.dataset.editorSidebarDrawerOpen = String(editorSidebarDrawerOpen && state.mode === "edit" && canEditJourney());
  root.style.setProperty("--editor-zoom", String(editorZoom));
  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.viewButton === state.view));
  });
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
  canvas.style.setProperty("--editor-zoom", String(editorZoom));
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
  if (editorFocusMode && state.mode === "edit" && canEditJourney()) {
    const viewport = document.createElement("div");
    viewport.className = "journey-focus-viewport";
    const stage = document.createElement("div");
    stage.className = "journey-focus-stage";
    stage.style.width = `${Math.round(CANVAS_WIDTH * editorZoom)}px`;
    stage.style.height = `${Math.round(state.canvas.height * editorZoom)}px`;
    stage.append(canvas);
    viewport.append(stage);
    canvasHost.append(viewport);
  } else {
    canvasHost.append(canvas);
  }
  logStickerRenderStyleSnapshots(canvas);
  renderEditorPanel();
  scheduleFocusCanvasStageSizeSync();
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
  const routeStyle = sanitizeRouteStyle(state.canvas.routeStyle);
  const dashValue = routeStyle.dashed ? `${routeStyle.dashLength} ${routeStyle.dashGap}` : "";
  const endpointCounts = endpointConnectionCounts();
  state.canvas.strokes.forEach((stroke) => {
    const d = strokePathD(stroke.points);
    if (!d) {
      return;
    }
    const shadow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shadow.setAttribute("class", "journey-sketch-stroke-shadow");
    shadow.setAttribute("d", d);
    shadow.setAttribute("stroke", routeStyle.color);
    shadow.setAttribute("stroke-width", String(routeStyle.width + 5));
    const main = document.createElementNS("http://www.w3.org/2000/svg", "path");
    main.setAttribute("class", "journey-sketch-stroke-main");
    main.setAttribute("d", d);
    main.setAttribute("stroke", routeStyle.color);
    main.setAttribute("stroke-width", String(routeStyle.width));
    if (dashValue) {
      main.setAttribute("stroke-dasharray", dashValue);
    }
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
        circle.setAttribute("r", "4.5");
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
    nodeElement.classList.toggle("is-selected", state.editor.selectedNodeId === node.id);
    nodeElement.style.left = `${(node.x / CANVAS_WIDTH) * 100}%`;
    nodeElement.style.top = `${(node.y / state.canvas.height) * 100}%`;
    nodeElement.style.setProperty("--node-color", node.style.color);
    nodeElement.style.setProperty("--node-size", `${node.style.size}px`);
    nodeElement.innerHTML = `
      <span class="journey-sketch-node__dot" aria-hidden="true"></span>
      <span class="journey-sketch-node__label">${escapeHtml(node.label || node.title || node.id)}</span>
    `;
    nodeElement.addEventListener("pointerenter", () => showNodeHoverPopup(node.id, nodeElement));
    nodeElement.addEventListener("pointerleave", scheduleNodeHoverClose);
    nodeElement.addEventListener("mouseenter", () => showNodeHoverPopup(node.id, nodeElement));
    nodeElement.addEventListener("mouseleave", scheduleNodeHoverClose);
    nodeElement.addEventListener("focus", () => showNodeHoverPopup(node.id, nodeElement));
    nodeElement.addEventListener("blur", scheduleNodeHoverClose);
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
  getOrderedStickers()
    .forEach((sticker) => {
      const selected = state.editor.selectedStickerId === sticker.id;
      const wrap = document.createElement("div");
      wrap.className = "journey-sketch-sticker";
      wrap.dataset.stickerId = sticker.id;
      wrap.dataset.selected = String(selected);
      wrap.classList.toggle("is-selected", selected);
      wrap.style.left = `${sticker.xPercent}%`;
      wrap.style.top = `${sticker.yPercent}%`;
      wrap.style.width = `${sticker.widthPercent}%`;
      wrap.style.setProperty("--sticker-aspect-ratio", String(sticker.aspectRatio || 1));
      wrap.style.zIndex = String(sticker.zIndex);
      wrap.style.transform = `translate(-50%, -50%) rotate(${sticker.rotation}deg)`;
      wrap.addEventListener("pointerdown", (event) => {
        if (event.target.closest("[data-sticker-control='true']")) {
          logJourney("sticker.control.pointerdown_ignored_by_wrapper", {
            stickerId: sticker.id,
            controlClass: event.target?.className || "",
            controlAction: event.target?.dataset?.stickerAction || null
          });
          return;
        }
        startStickerDrag(event, sticker.id, "move");
      });
      const image = document.createElement("img");
      image.src = stickerImageSrc(sticker, { useAdminPreview: canEditJourney() && state.mode === "edit" });
      image.alt = "";
      image.draggable = false;
      wrap.append(image);
      logStickerRenderCreated(sticker, selected);
      if (state.mode === "edit" && selected) {
        ["nw", "ne", "sw", "se"].forEach((corner) => {
          const handle = document.createElement("span");
          handle.className = `journey-sticker-resize journey-sticker-resize--${corner}`;
          handle.dataset.stickerControl = "true";
          handle.addEventListener("pointerdown", (event) => startStickerDrag(event, sticker.id, "resize"));
          wrap.append(handle);
        });
        const rotate = document.createElement("span");
        rotate.className = "journey-sticker-rotate";
        rotate.dataset.stickerControl = "true";
        rotate.addEventListener("pointerdown", (event) => startStickerDrag(event, sticker.id, "rotate"));
        wrap.append(rotate);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "journey-sticker-delete";
        del.dataset.stickerControl = "true";
        del.dataset.stickerAction = "delete";
        del.textContent = "删除";
        del.addEventListener("pointerdown", (event) => {
          logJourney("sticker.delete_control.pointerdown", {
            stickerId: sticker.id,
            selectedStickerId: state.editor.selectedStickerId,
            ...journeyEventTargetSummary(event.target),
            pointerType: event.pointerType,
            button: event.button,
            ...journeyHitTestSummary(event)
          });
          event.preventDefault();
          event.stopPropagation();
        });
        del.addEventListener("click", (event) => {
          logJourney("sticker.delete_control.click", {
            stickerId: sticker.id,
            selectedStickerId: state.editor.selectedStickerId,
            defaultPrevented: event.defaultPrevented,
            eventPhase: event.eventPhase,
            ...journeyEventTargetSummary(event.target)
          });
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

function renderFocusControls() {
  const controls = document.createElement("section");
  controls.className = "journey-focus-controls";
  controls.setAttribute("aria-label", "Journey focus drawing controls");
  controls.innerHTML = `
    <span class="journey-focus-controls__status">专注绘制 · ${Math.round(editorZoom * 100)}%</span>
    <button type="button" data-focus-tool="draw" aria-pressed="${state.editor.activeTool === "draw"}">手绘</button>
    <button type="button" data-focus-tool="erase" aria-pressed="${state.editor.activeTool === "erase"}">橡皮擦</button>
    <button type="button" data-focus-zoom="0.25" aria-pressed="${editorZoom === 0.25}">25%</button>
    <button type="button" data-focus-zoom="0.5" aria-pressed="${editorZoom === 0.5}">50%</button>
    <button type="button" data-focus-zoom="0.75" aria-pressed="${editorZoom === 0.75}">75%</button>
    <button type="button" data-focus-zoom="1" aria-pressed="${editorZoom === 1}">100%</button>
    <button type="button" data-focus-action="full-map">显示全图</button>
    <button type="button" data-focus-action="exit">退出专注</button>
  `;
  controls.querySelectorAll("[data-focus-zoom]").forEach((button) => {
    button.addEventListener("click", () => setEditorZoom(Number(button.dataset.focusZoom), "focus-control"));
  });
  controls.querySelectorAll("[data-focus-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.focusTool));
  });
  controls.querySelector("[data-focus-action='full-map']")?.addEventListener("click", applyFullMapZoom);
  controls.querySelector("[data-focus-action='exit']")?.addEventListener("click", () => exitEditorFocusMode("button"));
  return controls;
}

function curveImportCore() {
  return window.JourneyCurveImportCore || null;
}

function resetCurveImportState() {
  if (curveImportState?.objectUrl) {
    URL.revokeObjectURL(curveImportState.objectUrl);
  }
  curveImportState = {
    open: false,
    busy: false,
    fileName: "",
    fileType: "",
    file: null,
    objectUrl: "",
    source: null,
    result: null,
    error: "",
    reverse: false,
    fitMode: "stretch",
    sensitivity: 45
  };
}

function openCurveImportDialog() {
  if (!guardJourneyMutation("openCurveImportDialog")) {
    return;
  }
  if (!curveImportState) {
    resetCurveImportState();
  }
  curveImportState.open = true;
  render();
}

function closeCurveImportDialog() {
  if (curveImportState?.objectUrl) {
    URL.revokeObjectURL(curveImportState.objectUrl);
  }
  curveImportState = null;
  render();
}

function setCurveImportError(message) {
  if (!curveImportState) {
    resetCurveImportState();
  }
  curveImportState.error = message;
  curveImportState.busy = false;
  curveImportState.result = null;
  render();
}

function validateCurveImportFile(file) {
  if (!file) {
    throw new Error("请选择 PNG、WebP、JPG 或 JSON 文件。");
  }
  if (file.size > CURVE_IMPORT_FILE_LIMIT_BYTES) {
    throw new Error("文件超过 10 MB，请选择更小的曲线文件。");
  }
  const name = file.name || "";
  const extension = name.toLowerCase().split(".").pop() || "";
  const imageTypes = new Set(["png", "webp", "jpg", "jpeg"]);
  const isJson = extension === "json" || file.type === "application/json";
  const isRaster = imageTypes.has(extension) || ["image/png", "image/webp", "image/jpeg"].includes(file.type);
  if (!isJson && !isRaster) {
    throw new Error("暂不支持该文件类型，请选择 PNG、WebP、JPG 或 JSON。");
  }
  return isJson ? "json" : "raster";
}

function decodeImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败，请换一张图片重试。"));
    image.decoding = "async";
    image.src = url;
  });
}

async function decodeCurveImportImage(file) {
  const objectUrl = URL.createObjectURL(file);
  let bitmap = null;
  try {
    if (window.createImageBitmap) {
      bitmap = await createImageBitmap(file);
      return {
        objectUrl,
        width: bitmap.width,
        height: bitmap.height,
        drawTo(context, width, height) {
          context.drawImage(bitmap, 0, 0, width, height);
        },
        close() {
          bitmap?.close?.();
        }
      };
    }
    const image = await decodeImageElement(objectUrl);
    return {
      objectUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      drawTo(context, width, height) {
        context.drawImage(image, 0, 0, width, height);
      },
      close() {}
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    bitmap?.close?.();
    throw error;
  }
}

function processingScaleForImage(width, height) {
  const sideScale = Math.min(1, CURVE_IMPORT_MAX_PROCESSING_SIDE / Math.max(width, height));
  const pixelScale = Math.min(1, Math.sqrt(CURVE_IMPORT_MAX_PROCESSING_PIXELS / Math.max(1, width * height)));
  return Math.min(sideScale, pixelScale);
}

async function parseCurveImportRaster(file) {
  const core = curveImportCore();
  if (!core) {
    throw new Error("曲线导入模块未加载，请刷新页面后重试。");
  }
  const decoded = await decodeCurveImportImage(file);
  try {
    if (
      decoded.width <= 0 ||
      decoded.height <= 0 ||
      decoded.width > CURVE_IMPORT_MAX_DECODED_SIDE ||
      decoded.height > CURVE_IMPORT_MAX_DECODED_SIDE
    ) {
      throw new Error("图片尺寸超出限制，请使用最长边不超过 4096 像素的图片。");
    }
    const scale = processingScaleForImage(decoded.width, decoded.height);
    const processWidth = Math.max(1, Math.round(decoded.width * scale));
    const processHeight = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = processWidth;
    canvas.height = processHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("浏览器无法读取图片像素。");
    }
    context.clearRect(0, 0, processWidth, processHeight);
    decoded.drawTo(context, processWidth, processHeight);
    const imageData = context.getImageData(0, 0, processWidth, processHeight);
    const mask = core.buildForegroundMask(imageData, {
      colorThreshold: curveImportState.sensitivity
    });
    const traced = core.traceMaskToRoute(mask, {
      minArea: 2,
      maxComponents: 2000
    });
    const sourcePoints = traced.points.map((point) => ({
      x: point.x / scale,
      y: point.y / scale
    }));
    return {
      kind: "raster",
      objectUrl: decoded.objectUrl,
      source: {
        width: decoded.width,
        height: decoded.height
      },
      process: {
        width: processWidth,
        height: processHeight,
        scale
      },
      points: sourcePoints,
      stats: {
        componentCount: traced.components.length,
        usedCount: traced.usedCount,
        pointCount: sourcePoints.length,
        confidence: traced.confidence,
        mode: mask.mode,
        foregroundCount: mask.foregroundCount,
        markerDetected: Boolean(traced.marker)
      }
    };
  } catch (error) {
    URL.revokeObjectURL(decoded.objectUrl);
    throw error;
  } finally {
    decoded.close();
  }
}

async function parseCurveImportJson(file) {
  const core = curveImportCore();
  if (!core) {
    throw new Error("曲线导入模块未加载，请刷新页面后重试。");
  }
  const parsed = core.parseCurveJsonText(await file.text());
  const points = parsed.coordinateSpace === "normalized"
    ? parsed.points.map((point) => ({
      x: point.x * parsed.source.width,
      y: point.y * parsed.source.height
    }))
    : parsed.points;
  return {
    kind: "json",
    objectUrl: "",
    source: parsed.source,
    points,
    stats: {
      componentCount: 0,
      usedCount: points.length,
      pointCount: points.length,
      confidence: 1,
      mode: "json",
      foregroundCount: 0,
      markerDetected: false
    }
  };
}

async function handleCurveImportFileInput(input) {
  if (!guardJourneyMutation("curveImportFileInput")) {
    input.value = "";
    return;
  }
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  try {
    if (!curveImportState) {
      resetCurveImportState();
    }
    const fileType = validateCurveImportFile(file);
    if (curveImportState.objectUrl) {
      URL.revokeObjectURL(curveImportState.objectUrl);
    }
    Object.assign(curveImportState, {
      busy: true,
      error: "",
      result: null,
      fileName: file.name || "unnamed",
      fileType,
      file,
      objectUrl: "",
      open: true
    });
    render();
    const result = fileType === "json"
      ? await parseCurveImportJson(file)
      : await parseCurveImportRaster(file);
    curveImportState.objectUrl = result.objectUrl || "";
    curveImportState.source = result.source;
    curveImportState.result = result;
    curveImportState.busy = false;
    curveImportState.error = "";
    logJourney("Parsed curve import file.", {
      fileType,
      pointCount: result.points.length,
      source: result.source,
      stats: result.stats
    });
    render();
  } catch (error) {
    setCurveImportError(error.message || "曲线导入失败，请检查文件。");
    logJourney("Curve import parsing failed.", {
      fileName: file.name,
      error: error.message
    });
  } finally {
    input.value = "";
  }
}

async function reparseCurveImportFile() {
  if (!curveImportState?.file) {
    showMessage("请先选择曲线文件。", true);
    return;
  }
  await handleCurveImportFileInput({
    files: [curveImportState.file],
    value: "",
    dataset: { fileInput: "curve-import" }
  });
}

function currentCurveImportSourcePoints() {
  const points = curveImportState?.result?.points || [];
  return curveImportState?.reverse ? points.slice().reverse() : points.slice();
}

function currentCurveImportMappedPoints() {
  const core = curveImportCore();
  if (!core || !curveImportState?.result || !curveImportState.source) {
    return [];
  }
  return core.mapCurvePoints(currentCurveImportSourcePoints(), curveImportState.source, {
    width: CANVAS_WIDTH,
    height: state.canvas.height
  }, curveImportState.fitMode);
}

function createCurveImportStroke() {
  const core = curveImportCore();
  if (!core) {
    throw new Error("曲线导入模块未加载，请刷新页面后重试。");
  }
  const mapped = currentCurveImportMappedPoints();
  const finalized = finalizeStrokePoints(mapped);
  if (finalized.length < MIN_STROKE_POINTS) {
    throw new Error("导入曲线点数不足，无法生成路线。");
  }
  const stroke = sanitizeStroke(core.buildImportedStroke(finalized, {
    id: makeId("stroke"),
    width: state.editor.lineWidth,
    now: nowIso()
  }));
  if (!stroke) {
    throw new Error("导入曲线无法生成有效路线。");
  }
  return stroke;
}

function createCurveImportUndoSnapshot() {
  return {
    strokes: clone(state.canvas.strokes),
    nodes: clone(state.canvas.nodes),
    selectedStrokeId: state.editor.selectedStrokeId,
    selectedNodeId: state.editor.selectedNodeId,
    selectedStickerId: state.editor.selectedStickerId
  };
}

function applyCurveImport(mode) {
  if (!guardJourneyMutation(`applyCurveImport:${mode}`)) {
    return;
  }
  if (!curveImportState?.result) {
    showMessage("请先选择并解析曲线文件。", true);
    return;
  }
  if (mode === "replace") {
    const confirmed = window.confirm(
      "这会替换当前所有路线，但不会删除节点和贴纸。节点将重新吸附到导入后的路线。该操作尚未保存，可使用“撤销导入”恢复。"
    );
    if (!confirmed) {
      return;
    }
  }
  try {
    const stroke = createCurveImportStroke();
    curveImportUndoSnapshot = createCurveImportUndoSnapshot();
    if (mode === "replace") {
      state.canvas.strokes = [stroke];
    } else {
      state.canvas.strokes.push(stroke);
    }
    state.editor.selectedStrokeId = stroke.id;
    state.editor.selectedNodeId = null;
    state.editor.selectedStickerId = null;
    reattachAllNodes();
    markDirty("curve imported");
    showMessage("曲线已导入到当前草稿，尚未保存。确认效果后请点击“保存画布”。");
    render();
  } catch (error) {
    showMessage(error.message || "曲线导入失败。", true);
    logJourney("Curve import apply failed.", { error: error.message });
  }
}

function undoCurveImport() {
  if (!guardJourneyMutation("undoCurveImport")) {
    return;
  }
  if (!curveImportUndoSnapshot) {
    showMessage("没有可撤销的导入。", true);
    return;
  }
  state.canvas.strokes = clone(curveImportUndoSnapshot.strokes);
  state.canvas.nodes = clone(curveImportUndoSnapshot.nodes);
  state.editor.selectedStrokeId = curveImportUndoSnapshot.selectedStrokeId;
  state.editor.selectedNodeId = curveImportUndoSnapshot.selectedNodeId;
  state.editor.selectedStickerId = curveImportUndoSnapshot.selectedStickerId;
  curveImportUndoSnapshot = null;
  markDirty("curve import undone");
  showMessage("已撤销本次导入，尚未保存。");
  render();
}

function renderCurveImportPreview(container) {
  const result = curveImportState?.result;
  if (!result || !curveImportState.source) {
    return;
  }
  const points = currentCurveImportSourcePoints();
  const source = curveImportState.source;
  const preview = document.createElement("div");
  preview.className = "journey-curve-import-preview";
  preview.style.setProperty("--source-aspect", String(source.width / source.height));
  if (curveImportState.objectUrl) {
    const image = document.createElement("img");
    image.src = curveImportState.objectUrl;
    image.alt = "";
    preview.append(image);
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${source.width} ${source.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  polyline.setAttribute("class", "journey-curve-import-preview-line");
  svg.append(polyline);
  if (points.length) {
    const start = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    start.setAttribute("cx", String(points[0].x));
    start.setAttribute("cy", String(points[0].y));
    start.setAttribute("r", String(Math.max(source.width, source.height) * 0.012));
    start.setAttribute("class", "journey-curve-import-preview-start");
    svg.append(start);
    const end = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const endPoint = points[points.length - 1];
    end.setAttribute("cx", String(endPoint.x));
    end.setAttribute("cy", String(endPoint.y));
    end.setAttribute("r", String(Math.max(source.width, source.height) * 0.012));
    end.setAttribute("class", "journey-curve-import-preview-end");
    svg.append(end);
  }
  preview.append(svg);
  container.append(preview);
}

function renderCurveImportDialog() {
  if (!curveImportState?.open || state.mode !== "edit" || !canEditJourney()) {
    return null;
  }
  const overlay = document.createElement("section");
  overlay.className = "journey-curve-import-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "journey-curve-import-title");

  const panel = document.createElement("div");
  panel.className = "journey-curve-import-panel";
  overlay.append(panel);

  const header = document.createElement("div");
  header.className = "journey-curve-import-header";
  const title = document.createElement("h2");
  title.id = "journey-curve-import-title";
  title.textContent = "导入曲线";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "取消";
  closeButton.addEventListener("click", closeCurveImportDialog);
  header.append(title, closeButton);

  const fileLabel = document.createElement("label");
  fileLabel.className = "journey-curve-import-file";
  fileLabel.textContent = "选择 PNG / WebP / JPG / JSON";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/png,image/webp,image/jpeg,.json,application/json";
  fileInput.addEventListener("change", () => handleCurveImportFileInput(fileInput));
  fileLabel.append(fileInput);

  const meta = document.createElement("dl");
  meta.className = "journey-curve-import-meta";
  const sourceText = curveImportState.source
    ? `${Math.round(curveImportState.source.width)} × ${Math.round(curveImportState.source.height)}`
    : "未选择";
  const aspectWarning = curveImportState.source &&
    Math.abs((curveImportState.source.width / curveImportState.source.height) - (CANVAS_WIDTH / state.canvas.height)) > 0.02
    ? "源图片与当前画布比例不同。完整映射会产生拉伸；可改用保持比例并居中。"
    : "";
  meta.innerHTML = `
    <div><dt>文件</dt><dd data-import-file-name></dd></div>
    <div><dt>源文件</dt><dd>${escapeHtml(sourceText)}</dd></div>
    <div><dt>当前画布</dt><dd>${CANVAS_WIDTH} × ${state.canvas.height}</dd></div>
  `;
  meta.querySelector("[data-import-file-name]").textContent = curveImportState.fileName || "未选择";

  const controls = document.createElement("div");
  controls.className = "journey-curve-import-controls";
  controls.innerHTML = `
    <label>
      <span>映射方式</span>
      <select data-curve-import-fit>
        <option value="stretch" ${curveImportState.fitMode === "stretch" ? "selected" : ""}>完整映射到画布</option>
        <option value="contain" ${curveImportState.fitMode === "contain" ? "selected" : ""}>保持比例并居中</option>
      </select>
    </label>
    <label>
      <span>识别灵敏度</span>
      <input type="range" min="20" max="90" step="1" value="${curveImportState.sensitivity}" data-curve-import-sensitivity ${curveImportState.fileType === "json" ? "disabled" : ""}>
      <strong>${curveImportState.sensitivity}</strong>
    </label>
    <label class="journey-curve-import-check">
      <input type="checkbox" data-curve-import-reverse ${curveImportState.reverse ? "checked" : ""}>
      反转方向
    </label>
    <button type="button" data-curve-import-reparse ${curveImportState.file ? "" : "disabled"}>重新解析</button>
  `;
  controls.querySelector("[data-curve-import-fit]").addEventListener("change", (event) => {
    curveImportState.fitMode = event.target.value;
    render();
  });
  controls.querySelector("[data-curve-import-reverse]").addEventListener("change", (event) => {
    curveImportState.reverse = event.target.checked;
    render();
  });
  controls.querySelector("[data-curve-import-sensitivity]").addEventListener("change", () => {
    curveImportState.sensitivity = Number(controls.querySelector("[data-curve-import-sensitivity]").value);
    render();
  });
  controls.querySelector("[data-curve-import-reparse]").addEventListener("click", reparseCurveImportFile);

  const previewWrap = document.createElement("div");
  previewWrap.className = "journey-curve-import-preview-wrap";
  renderCurveImportPreview(previewWrap);

  const status = document.createElement("p");
  status.className = "journey-curve-import-status";
  status.dataset.error = String(Boolean(curveImportState.error));
  if (curveImportState.busy) {
    status.textContent = "正在本地解析曲线...";
  } else if (curveImportState.error) {
    status.textContent = curveImportState.error;
  } else if (curveImportState.result) {
    const stats = curveImportState.result.stats;
    status.textContent = `已生成中心线：${stats.pointCount} 点，片段 ${stats.componentCount}，置信度 ${Math.round(stats.confidence * 100)}%。`;
  } else {
    status.textContent = "请选择文件。预览不会修改画布。";
  }

  const warning = document.createElement("p");
  warning.className = "journey-curve-import-warning";
  warning.textContent = aspectWarning;
  warning.hidden = !aspectWarning;

  const actions = document.createElement("div");
  actions.className = "journey-curve-import-actions";
  actions.innerHTML = `
    <button type="button" data-curve-import-action="add" ${curveImportState.result ? "" : "disabled"}>新增到画布</button>
    <button type="button" data-curve-import-action="replace" ${curveImportState.result ? "" : "disabled"}>替换现有曲线</button>
    <button type="button" data-curve-import-action="undo" ${curveImportUndoSnapshot ? "" : "disabled"}>撤销导入</button>
    <button type="button" data-curve-import-action="cancel">取消</button>
  `;
  actions.querySelector("[data-curve-import-action='add']").addEventListener("click", () => applyCurveImport("add"));
  actions.querySelector("[data-curve-import-action='replace']").addEventListener("click", () => applyCurveImport("replace"));
  actions.querySelector("[data-curve-import-action='undo']").addEventListener("click", undoCurveImport);
  actions.querySelector("[data-curve-import-action='cancel']").addEventListener("click", closeCurveImportDialog);

  const details = document.createElement("details");
  details.className = "journey-curve-import-details";
  const stats = curveImportState.result?.stats;
  details.innerHTML = `
    <summary>诊断信息</summary>
    <dl>
      <div><dt>处理模式</dt><dd>${escapeHtml(stats?.mode || "-")}</dd></div>
      <div><dt>前景像素</dt><dd>${escapeHtml(String(stats?.foregroundCount || 0))}</dd></div>
      <div><dt>起点标记</dt><dd>${stats?.markerDetected ? "已检测" : "未检测"}</dd></div>
      <div><dt>已用片段</dt><dd>${escapeHtml(String(stats?.usedCount || 0))}</dd></div>
    </dl>
  `;

  panel.append(header, fileLabel, meta, warning, controls, previewWrap, status, actions, details);
  return overlay;
}

function stickerToolBridge() {
  return window.JourneyStickerTool || {};
}

function releaseStickerToolPreview(url) {
  if (url && typeof URL !== "undefined") {
    URL.revokeObjectURL(url);
  }
}

function resetStickerToolRunState() {
  releaseStickerToolPreview(stickerToolState.sourcePreviewUrl);
  releaseStickerToolPreview(stickerToolState.outputPreviewUrl);
  stickerToolState = {
    ...stickerToolState,
    busy: false,
    sourceFile: null,
    sourcePreviewUrl: "",
    outputPreviewUrl: "",
    run: null,
    browserAlpha: null,
    configInput: stickerToolState.configInput,
    error: "",
    message: "",
    accepted: false
  };
}

function renderStickerToolPanel() {
  const bridge = stickerToolBridge();
  const status = stickerToolState.status || {};
  const run = stickerToolState.run || {};
  const compatibility = run.compatibility || {};
  const alpha = stickerToolState.browserAlpha || {};
  const statusLabel = bridge.statusLabel?.(status.state) || status.state || "未检查";
  const verdictLabel = bridge.verdictLabel?.(compatibility.overallHandoffVerdict) ||
    compatibility.overallHandoffVerdict ||
    "待处理";
  const alphaPercent = bridge.formatPercent?.(alpha.transparentFraction) || "-";
  const outputUrl = stickerToolState.outputPreviewUrl || (run.outputUrl ? `${apiBaseUrl()}${run.outputUrl}` : "");

  return `
    <details class="journey-sticker-tool-panel" ${stickerToolState.statusLoaded || stickerToolState.run ? "open" : ""}>
      <summary>贴纸预处理</summary>
      <p class="journey-sticker-tool-hint">
        本地调用 Sticker_Preprocessor 生成透明 PNG。接受结果前不会上传媒体，也不会保存画布。
      </p>
      <div class="journey-sticker-tool-actions">
        <button type="button" data-sticker-tool-action="status" ${stickerToolState.busy ? "disabled" : ""}>检查工具</button>
        <button type="button" data-sticker-tool-action="select-file" ${stickerToolState.busy ? "disabled" : ""}>选择图片处理</button>
      </div>
      <label class="journey-sticker-tool-config">
        <span>本机工具目录</span>
        <input
          type="text"
          data-sticker-tool-config-input
          value="${escapeHtml(stickerToolState.configInput)}"
          placeholder="例如 C:\\Users\\...\\Sticker_Preprocessor"
          autocomplete="off"
        >
      </label>
      <div class="journey-sticker-tool-actions">
        <button type="button" data-sticker-tool-action="save-config" ${stickerToolState.busy ? "disabled" : ""}>保存本机配置</button>
        <button type="button" data-sticker-tool-action="clear-config" ${stickerToolState.busy ? "disabled" : ""}>清除配置</button>
      </div>
      <dl class="journey-sticker-tool-status">
        <div><dt>工具状态</dt><dd>${escapeHtml(statusLabel)}</dd></div>
        <div><dt>配置来源</dt><dd>${escapeHtml(status.source || "-")}</dd></div>
        <div><dt>数据模式</dt><dd>${escapeHtml(status.dataProfile || "-")}</dd></div>
        <div><dt>协议</dt><dd>${escapeHtml(status.contractVersion || run.contractVersion || "-")}</dd></div>
        <div><dt>处理结果</dt><dd>${escapeHtml(verdictLabel)}</dd></div>
        <div><dt>透明像素</dt><dd>${escapeHtml(alphaPercent)}</dd></div>
      </dl>
      <div class="journey-sticker-tool-preview-grid">
        <figure>
          <figcaption>原图</figcaption>
          ${stickerToolState.sourcePreviewUrl ? `<img src="${escapeHtml(stickerToolState.sourcePreviewUrl)}" alt="待处理贴纸原图">` : "<span>未选择</span>"}
        </figure>
        <figure>
          <figcaption>处理结果</figcaption>
          ${outputUrl ? `<img src="${escapeHtml(outputUrl)}" alt="Sticker_Preprocessor 处理结果" data-sticker-tool-output-preview>` : "<span>暂无结果</span>"}
        </figure>
      </div>
      <div class="journey-sticker-tool-actions">
        <button type="button" data-sticker-tool-action="accept" ${run.outputUrl && !stickerToolState.busy ? "" : "disabled"}>接受并加入草稿</button>
        <button type="button" data-sticker-tool-action="reject" ${run.bridgeRunId && !stickerToolState.busy ? "" : "disabled"}>拒绝结果</button>
        <button type="button" data-sticker-tool-action="bundle" ${run.bridgeRunId && !stickerToolState.busy ? "" : "disabled"}>导出联动诊断包</button>
      </div>
      <p class="journey-sticker-tool-message" data-error="${Boolean(stickerToolState.error)}">
        ${escapeHtml(stickerToolState.error || stickerToolState.message || "工具按需调用；普通启动不依赖它。")}
      </p>
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-file-input="sticker-tool">
    </details>
  `;
}

async function refreshStickerToolStatus() {
  if (!guardJourneyMutation("stickerToolStatus")) {
    return;
  }
  if (!window.PersonalWebAuth?.authFetch) {
    stickerToolState.error = "认证服务不可用，无法检查外部工具。";
    renderEditorPanel();
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在检查本机 Sticker_Preprocessor...";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/status`, { method: "GET" });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail?.message || body.detail || `工具检查失败：${response.status}`);
    }
    stickerToolState.statusLoaded = true;
    stickerToolState.status = body;
    stickerToolState.message = body.state === "compatible"
      ? "本机工具可用。"
      : "本机工具尚未可用，请检查路径或协议版本。";
    logJourney("Sticker_Preprocessor status checked.", {
      state: body.state,
      dataProfile: body.dataProfile,
      source: body.source,
      pathFingerprint: body.pathFingerprint
    });
  } catch (error) {
    stickerToolState.error = error.message || "工具检查失败。";
    logJourney("Sticker_Preprocessor status check failed.", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function saveStickerToolConfig() {
  if (!guardJourneyMutation("stickerToolSaveConfig")) {
    return;
  }
  const toolRoot = stickerToolState.configInput.trim();
  if (!toolRoot) {
    stickerToolState.error = "请输入本机 Sticker_Preprocessor 目录。";
    renderEditorPanel();
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在保存并验证本机工具配置...";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/config`, {
      method: "POST",
      body: JSON.stringify({ toolRoot })
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail?.message || body.detail || `保存配置失败：${response.status}`);
    }
    stickerToolState.statusLoaded = true;
    stickerToolState.status = body;
    stickerToolState.message = "本机工具配置已保存。";
    logJourney("Sticker_Preprocessor local config saved.", {
      source: body.source,
      pathFingerprint: body.pathFingerprint
    });
    await refreshStickerToolStatus();
  } catch (error) {
    stickerToolState.error = error.message || "保存配置失败。";
    logJourney("Sticker_Preprocessor config save failed.", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function clearStickerToolConfig() {
  if (!guardJourneyMutation("stickerToolClearConfig")) {
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在清除本机工具配置...";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/config`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const body = await parseJsonResponse(response);
      throw new Error(body.detail?.message || body.detail || `清除配置失败：${response.status}`);
    }
    stickerToolState.configInput = "";
    stickerToolState.status = null;
    stickerToolState.statusLoaded = false;
    stickerToolState.message = "已清除本机工具配置。";
    logJourney("Sticker_Preprocessor local config cleared.");
    await refreshStickerToolStatus();
  } catch (error) {
    stickerToolState.error = error.message || "清除配置失败。";
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function handleStickerToolFileInput(input) {
  if (!guardJourneyMutation("stickerToolFileInput")) {
    input.value = "";
    return;
  }
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  if (!file.type?.startsWith("image/")) {
    stickerToolState.error = "请选择图片文件。";
    renderEditorPanel();
    return;
  }
  if (!window.PersonalWebAuth?.authFetch) {
    stickerToolState.error = "认证服务不可用，无法调用外部工具。";
    renderEditorPanel();
    return;
  }
  resetStickerToolRunState();
  stickerToolState.sourceFile = file;
  stickerToolState.sourcePreviewUrl = URL.createObjectURL(file);
  stickerToolState.busy = true;
  stickerToolState.message = "正在本机预处理贴纸...";
  renderEditorPanel();
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "auto");
    formData.append("ai_model", "silueta");
    formData.append("alpha_matting", "false");
    formData.append("padding_pixels", "8");
    formData.append("alpha_crop_threshold", "8");
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/runs`, {
      method: "POST",
      body: formData
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail?.message || body.detail || `贴纸预处理失败：${response.status}`);
    }
    stickerToolState.run = body;
    await loadStickerToolOutputPreview(body);
    stickerToolState.message = "处理完成。请预览后选择接受或拒绝。";
    logJourney("Sticker_Preprocessor run ready for review.", {
      bridgeRunId: body.bridgeRunId,
      status: body.status,
      verdict: body.compatibility?.overallHandoffVerdict
    });
  } catch (error) {
    stickerToolState.error = error.message || "贴纸预处理失败。";
    logJourney("Sticker_Preprocessor run failed.", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function loadStickerToolOutputPreview(run) {
  if (!run?.outputUrl || !window.PersonalWebAuth?.authFetch) {
    return;
  }
  const response = await window.PersonalWebAuth.authFetch(run.outputUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`读取预处理结果失败：${response.status}`);
  }
  const blob = await response.blob();
  releaseStickerToolPreview(stickerToolState.outputPreviewUrl);
  stickerToolState.outputPreviewUrl = URL.createObjectURL(blob);
  stickerToolState.browserAlpha = await analyzeStickerToolBlobAlpha(blob);
}

function analyzeStickerToolBlobAlpha(blob) {
  return new Promise((resolve) => {
    const bridge = stickerToolBridge();
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    const finish = (result) => {
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    image.onload = () => {
      try {
        finish(bridge.analyzeImageElementAlpha?.(image) || {});
      } catch (error) {
        logJourney("Sticker_Preprocessor browser alpha analysis failed.", { error: error.message });
        finish({});
      }
    };
    image.onerror = () => finish({});
    image.src = objectUrl;
  });
}

async function reviewStickerToolRun(verdict) {
  if (!guardJourneyMutation(`stickerToolReview:${verdict}`) || !stickerToolState.run?.bridgeRunId) {
    return null;
  }
  const response = await window.PersonalWebAuth.authFetch(
    `${STICKER_TOOL_PATH}/runs/${stickerToolState.run.bridgeRunId}/review`,
    {
      method: "POST",
      body: JSON.stringify({ verdict })
    }
  );
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(body.detail?.message || body.detail || `审核结果记录失败：${response.status}`);
  }
  stickerToolState.run = body;
  return body;
}

async function acceptStickerToolResult() {
  if (!stickerToolState.run?.outputUrl || stickerToolState.busy) {
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在接受结果并上传为首页媒体...";
  renderEditorPanel();
  try {
    await reviewStickerToolRun("accepted");
    const response = await window.PersonalWebAuth.authFetch(stickerToolState.run.outputUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`读取处理结果失败：${response.status}`);
    }
    const blob = await response.blob();
    const baseName = stickerToolState.sourceFile?.name?.replace(/\.[^.]+$/, "") || "processed-sticker";
    const file = new File([blob], `${baseName}-processed.png`, { type: "image/png" });
    await addPersistentStickerFromFile(file);
    stickerToolState.accepted = true;
    stickerToolState.message = "已加入当前草稿。请点击“保存画布”后才会发布到公开预览。";
    logJourney("Accepted Sticker_Preprocessor output into Journey draft.", {
      bridgeRunId: stickerToolState.run?.bridgeRunId,
      stickerCount: state.canvas.stickers.length
    });
    render();
  } catch (error) {
    stickerToolState.error = error.message || "接受处理结果失败。";
    logJourney("Accepting Sticker_Preprocessor output failed.", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    render();
  }
}

async function rejectStickerToolResult() {
  if (!stickerToolState.run?.bridgeRunId || stickerToolState.busy) {
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  renderEditorPanel();
  try {
    await reviewStickerToolRun("rejected");
    stickerToolState.message = "已拒绝本次结果；未上传媒体。";
    logJourney("Rejected Sticker_Preprocessor output.", {
      bridgeRunId: stickerToolState.run?.bridgeRunId
    });
  } catch (error) {
    stickerToolState.error = error.message || "拒绝结果失败。";
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function downloadStickerToolBundle() {
  if (!stickerToolState.run?.bridgeRunId || stickerToolState.busy) {
    return;
  }
  const confirmed = window.confirm(
    "联动诊断包会包含本次输入图片、处理结果和诊断数据。仅在你确认需要分享给排查人员时导出。"
  );
  if (!confirmed) {
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(
      `${STICKER_TOOL_PATH}/runs/${stickerToolState.run.bridgeRunId}/diagnostic-bundle`,
      { method: "POST" }
    );
    if (!response.ok) {
      const body = await parseJsonResponse(response);
      throw new Error(body.detail?.message || body.detail || `诊断包导出失败：${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sticker-tool-${stickerToolState.run.bridgeRunId.slice(0, 8)}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    stickerToolState.message = "已生成联动诊断包。";
  } catch (error) {
    stickerToolState.error = error.message || "诊断包导出失败。";
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

function handleStickerToolAction(action) {
  const actions = {
    status: refreshStickerToolStatus,
    "select-file": () => document.querySelector("[data-file-input='sticker-tool']")?.click(),
    "save-config": saveStickerToolConfig,
    "clear-config": clearStickerToolConfig,
    accept: acceptStickerToolResult,
    reject: rejectStickerToolResult,
    bundle: downloadStickerToolBundle
  };
  actions[action]?.();
}

function stickerToolEvent(name, detail = {}) {
  logJourney(`sticker_tool.${name}`, detail);
}

function stickerToolCanAccept(run = stickerToolState.run) {
  return Boolean(stickerToolBridge().isRunAcceptableForUpload?.(run));
}

function stickerToolReviewIssueCheckboxes() {
  const bridge = stickerToolBridge();
  const issues = bridge.REVIEW_ISSUES || [];
  const labels = {
    VISIBLE_RECTANGLE: "可见矩形边",
    HEAVY_WHITE_OR_GRAY_HALO: "白边/灰边较重",
    BACKGROUND_REMAINS: "背景残留",
    SUBJECT_DAMAGED: "主体受损",
    TEXT_OR_FINE_DETAIL_DAMAGED: "文字或细节受损",
    CROP_OR_PADDING_WRONG: "裁切或留白不合适",
    OTHER: "其他"
  };
  return issues.map((code) => `
    <label class="journey-sticker-tool-issue">
      <input type="checkbox" value="${escapeHtml(code)}" data-sticker-tool-issue>
      <span>${escapeHtml(labels[code] || code)}</span>
    </label>
  `).join("");
}

function renderStickerToolPanel() {
  const bridge = stickerToolBridge();
  const status = stickerToolState.status || {};
  const run = stickerToolState.run || {};
  const compatibility = run.compatibility || {};
  const alpha = stickerToolState.browserAlpha || {};
  const statusLabel = bridge.statusLabel?.(status.state) || status.state || "未检查";
  const verdictLabel = bridge.verdictLabel?.(compatibility.overallHandoffVerdict) ||
    compatibility.overallHandoffVerdict ||
    "待处理";
  const alphaPercent = bridge.formatPercent?.(alpha.transparentFraction) || "-";
  const outputUrl = stickerToolState.outputPreviewUrl || (run.outputUrl ? `${apiBaseUrl()}${run.outputUrl}` : "");
  const acceptDisabled = stickerToolState.busy || !stickerToolCanAccept(run);
  const runState = run.status || "-";
  const previewLabels = [
    ["light", "浅色背景"],
    ["dark", "深色背景"],
    ["web", "Web 页面背景"],
    ["journey", "当前 Journey 背景"]
  ];

  return `
    <details class="journey-sticker-tool-panel" ${stickerToolState.statusLoaded || stickerToolState.run ? "open" : ""}>
      <summary>贴纸预处理</summary>
      <p class="journey-sticker-tool-hint">
        本地调用 Sticker_Preprocessor 生成透明 PNG。结果通过机器校验、浏览器校验和人工确认前，不会上传媒体，也不会保存画布。
      </p>
      <div class="journey-sticker-tool-actions">
        <button type="button" data-sticker-tool-action="status" ${stickerToolState.busy ? "disabled" : ""}>检查工具</button>
        <button type="button" data-sticker-tool-action="select-file" ${stickerToolState.busy ? "disabled" : ""}>选择图片处理</button>
      </div>
      <label class="journey-sticker-tool-config">
        <span>本机工具目录</span>
        <input
          type="text"
          data-sticker-tool-config-input
          value="${escapeHtml(stickerToolState.configInput)}"
          placeholder="例如 C:\\Users\\...\\Sticker_Preprocessor"
          autocomplete="off"
        >
      </label>
      <div class="journey-sticker-tool-actions">
        <button type="button" data-sticker-tool-action="save-config" ${stickerToolState.busy ? "disabled" : ""}>保存本机配置</button>
        <button type="button" data-sticker-tool-action="clear-config" ${stickerToolState.busy ? "disabled" : ""}>清除配置</button>
      </div>
      <dl class="journey-sticker-tool-status">
        <div><dt>工具状态</dt><dd>${escapeHtml(statusLabel)}</dd></div>
        <div><dt>运行状态</dt><dd>${escapeHtml(runState)}</dd></div>
        <div><dt>配置来源</dt><dd>${escapeHtml(status.source || run.toolConfigSource || "-")}</dd></div>
        <div><dt>数据模式</dt><dd>${escapeHtml(status.dataProfile || run.dataProfile || "-")}</dd></div>
        <div><dt>协议</dt><dd>${escapeHtml(status.contractVersion || run.contractVersion || "-")}</dd></div>
        <div><dt>联动结论</dt><dd>${escapeHtml(verdictLabel)}</dd></div>
        <div><dt>透明像素</dt><dd>${escapeHtml(alphaPercent)}</dd></div>
      </dl>
      <div class="journey-sticker-tool-preview-grid">
        <figure>
          <figcaption>原图</figcaption>
          ${stickerToolState.sourcePreviewUrl ? `<img src="${escapeHtml(stickerToolState.sourcePreviewUrl)}" alt="待处理贴纸原图">` : "<span>未选择</span>"}
        </figure>
        <figure>
          <figcaption>处理结果</figcaption>
          ${outputUrl ? `<img src="${escapeHtml(outputUrl)}" alt="Sticker_Preprocessor 处理结果" data-sticker-tool-output-preview>` : "<span>暂无结果</span>"}
        </figure>
      </div>
      <div class="journey-sticker-tool-preview-grid journey-sticker-tool-preview-matrix">
        ${previewLabels.map(([key, label]) => `
          <figure data-preview-context="${key}">
            <figcaption>${label}</figcaption>
            ${outputUrl ? `<img src="${escapeHtml(outputUrl)}" alt="${label}预览">` : "<span>暂无结果</span>"}
          </figure>
        `).join("")}
      </div>
      <fieldset class="journey-sticker-tool-issues">
        <legend>拒绝原因</legend>
        ${stickerToolReviewIssueCheckboxes()}
      </fieldset>
      <div class="journey-sticker-tool-actions">
        <button type="button" data-sticker-tool-action="accept" ${acceptDisabled ? "disabled" : ""}>接受并加入草稿</button>
        <button type="button" data-sticker-tool-action="reject" ${run.bridgeRunId && !stickerToolState.busy ? "" : "disabled"}>拒绝结果</button>
        <button type="button" data-sticker-tool-action="bundle" ${run.bridgeRunId && !stickerToolState.busy ? "" : "disabled"}>导出联动诊断包</button>
      </div>
      <p class="journey-sticker-tool-message" data-error="${Boolean(stickerToolState.error)}">
        ${escapeHtml(stickerToolState.error || stickerToolState.message || "工具按需调用；普通启动不依赖它。")}
      </p>
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-file-input="sticker-tool">
    </details>
  `;
}

async function refreshStickerToolStatus() {
  if (!guardJourneyMutation("stickerToolStatus")) {
    return;
  }
  if (!window.PersonalWebAuth?.authFetch) {
    stickerToolState.error = "认证服务不可用，无法检查外部工具。";
    renderEditorPanel();
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在检查本机 Sticker_Preprocessor...";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/status`, { method: "GET" });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail?.message || body.detail || `工具检查失败：${response.status}`);
    }
    stickerToolState.statusLoaded = true;
    stickerToolState.status = body;
    stickerToolState.message = body.state === "compatible"
      ? "本机工具可用。"
      : "本机工具尚未可用，请检查路径或协议版本。";
    stickerToolEvent("status.checked", { state: body.state, dataProfile: body.dataProfile, source: body.source });
  } catch (error) {
    stickerToolState.error = error.message || "工具检查失败。";
    stickerToolEvent("status.failed", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function saveStickerToolConfig() {
  if (!guardJourneyMutation("stickerToolSaveConfig")) {
    return;
  }
  const toolRoot = stickerToolState.configInput.trim();
  if (!toolRoot) {
    stickerToolState.error = "请输入本机 Sticker_Preprocessor 目录。";
    renderEditorPanel();
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在保存并验证本机工具配置...";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/config`, {
      method: "POST",
      body: JSON.stringify({ toolRoot })
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail?.message || body.detail || `保存配置失败：${response.status}`);
    }
    stickerToolState.statusLoaded = true;
    stickerToolState.status = body;
    stickerToolState.message = "本机工具配置已保存。";
    stickerToolEvent("config.saved", { source: body.source });
    await refreshStickerToolStatus();
  } catch (error) {
    stickerToolState.error = error.message || "保存配置失败。";
    stickerToolEvent("config.failed", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function clearStickerToolConfig() {
  if (!guardJourneyMutation("stickerToolClearConfig")) {
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在清除本机工具配置...";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/config`, { method: "DELETE" });
    if (!response.ok) {
      const body = await parseJsonResponse(response);
      throw new Error(body.detail?.message || body.detail || `清除配置失败：${response.status}`);
    }
    stickerToolState.configInput = "";
    stickerToolState.status = null;
    stickerToolState.statusLoaded = false;
    stickerToolState.message = "已清除本机工具配置。";
    stickerToolEvent("config.cleared");
    await refreshStickerToolStatus();
  } catch (error) {
    stickerToolState.error = error.message || "清除配置失败。";
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function handleStickerToolFileInput(input) {
  if (!guardJourneyMutation("stickerToolFileInput")) {
    input.value = "";
    return;
  }
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  if (!file.type?.startsWith("image/")) {
    stickerToolState.error = "请选择图片文件。";
    renderEditorPanel();
    return;
  }
  if (!window.PersonalWebAuth?.authFetch) {
    stickerToolState.error = "认证服务不可用，无法调用外部工具。";
    renderEditorPanel();
    return;
  }
  resetStickerToolRunState();
  stickerToolState.sourceFile = file;
  stickerToolState.sourcePreviewUrl = URL.createObjectURL(file);
  stickerToolState.busy = true;
  stickerToolState.message = "已提交本机预处理任务，正在排队...";
  renderEditorPanel();
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "auto");
    formData.append("ai_model", "silueta");
    formData.append("alpha_matting", "false");
    formData.append("padding_pixels", "8");
    formData.append("alpha_crop_threshold", "8");
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/runs`, {
      method: "POST",
      body: formData
    });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail?.message || body.detail || `贴纸预处理提交失败：${response.status}`);
    }
    stickerToolState.run = body;
    stickerToolEvent("run.state_changed", { bridgeRunId: body.bridgeRunId, nextState: body.status });
    await pollStickerToolRun(body.bridgeRunId);
  } catch (error) {
    stickerToolState.error = error.message || "贴纸预处理失败。";
    stickerToolEvent("run.failed", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function pollStickerToolRun(bridgeRunId) {
  let lastState = stickerToolState.run?.status || "";
  for (let attempt = 0; attempt < 160; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 8 ? 500 : 1000));
    const response = await window.PersonalWebAuth.authFetch(`${STICKER_TOOL_PATH}/runs/${bridgeRunId}`, { method: "GET" });
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(body.detail?.message || body.detail || `读取处理状态失败：${response.status}`);
    }
    stickerToolState.run = body;
    if (body.status !== lastState) {
      stickerToolEvent("run.state_changed", { bridgeRunId, previousState: lastState, nextState: body.status });
      lastState = body.status;
      renderEditorPanel();
    }
    if (body.status === "ready_for_review" || ["blocked", "failed", "rejected", "accepted"].includes(body.status)) {
      if (body.outputUrl) {
        await loadStickerToolOutputPreview(body);
      }
      stickerToolState.message = body.status === "ready_for_review"
        ? "机器校验通过，请预览后选择接受或拒绝。"
        : `处理结束：${body.status}`;
      return body;
    }
  }
  throw new Error("处理轮询超时。");
}

async function loadStickerToolOutputPreview(run) {
  if (!run?.outputUrl || !window.PersonalWebAuth?.authFetch) {
    return;
  }
  const response = await window.PersonalWebAuth.authFetch(run.outputUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`读取预处理结果失败：${response.status}`);
  }
  const blob = await response.blob();
  releaseStickerToolPreview(stickerToolState.outputPreviewUrl);
  stickerToolState.outputPreviewUrl = URL.createObjectURL(blob);
  stickerToolState.browserAlpha = await analyzeStickerToolBlobAlpha(blob);
  stickerToolEvent("output.decoded", { bridgeRunId: run.bridgeRunId });
  stickerToolEvent("alpha.analyzed", {
    bridgeRunId: run.bridgeRunId,
    transparentFraction: stickerToolState.browserAlpha.transparentFraction
  });
  await submitStickerToolBrowserAnalysis(run.bridgeRunId);
}

function analyzeStickerToolBlobAlpha(blob) {
  return new Promise((resolve) => {
    const bridge = stickerToolBridge();
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    const finish = (result) => {
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    image.onload = async () => {
      try {
        finish(await bridge.analyzeImageElementAlpha?.(image) || {});
      } catch (error) {
        stickerToolEvent("alpha.failed", { error: error.message });
        finish({});
      }
    };
    image.onerror = () => finish({});
    image.src = objectUrl;
  });
}

async function submitStickerToolBrowserAnalysis(bridgeRunId) {
  const bridge = stickerToolBridge();
  const previewMatrix = bridge.completePreviewMatrix?.() || { light: true, dark: true, web: true, journey: true };
  const payload = {
    alpha: stickerToolState.browserAlpha,
    previewMatrix,
    frontendEvents: [
      { event: "journey.sticker_tool.output.decoded" },
      { event: "journey.sticker_tool.alpha.analyzed" },
      { event: "journey.sticker_tool.preview_matrix.completed" }
    ]
  };
  const response = await window.PersonalWebAuth.authFetch(
    `${STICKER_TOOL_PATH}/runs/${bridgeRunId}/analysis`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(body.detail?.message || body.detail || `浏览器校验提交失败：${response.status}`);
  }
  stickerToolState.run = body;
  stickerToolEvent("alpha.submitted", { bridgeRunId });
  stickerToolEvent("preview_matrix.completed", { bridgeRunId, previewMatrix });
  renderEditorPanel();
}

function selectedStickerToolIssueCodes() {
  return Array.from(document.querySelectorAll("[data-sticker-tool-issue]:checked"))
    .map((input) => input.value);
}

async function reviewStickerToolRun(visualVerdict, issueCodes = []) {
  if (!guardJourneyMutation(`stickerToolReview:${visualVerdict}`) || !stickerToolState.run?.bridgeRunId) {
    return null;
  }
  const response = await window.PersonalWebAuth.authFetch(
    `${STICKER_TOOL_PATH}/runs/${stickerToolState.run.bridgeRunId}/review`,
    {
      method: "POST",
      body: JSON.stringify({ visualVerdict, issueCodes })
    }
  );
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(body.detail?.message || body.detail || `审核结果记录失败：${response.status}`);
  }
  stickerToolState.run = body;
  return body;
}

async function acceptStickerToolResult() {
  if (!stickerToolState.run?.outputUrl || stickerToolState.busy) {
    return;
  }
  if (!stickerToolCanAccept(stickerToolState.run)) {
    stickerToolState.error = "结果尚未通过上传前校验，不能加入草稿。";
    stickerToolEvent("acceptance.blocked", { bridgeRunId: stickerToolState.run.bridgeRunId });
    renderEditorPanel();
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  stickerToolState.message = "正在接受结果并上传为 Journey 贴纸媒体...";
  renderEditorPanel();
  try {
    const reviewed = await reviewStickerToolRun("accepted", []);
    if (!stickerToolBridge().canUploadAfterReview?.(reviewed)) {
      stickerToolEvent("acceptance.blocked", { bridgeRunId: reviewed?.bridgeRunId });
      throw new Error("后端未返回 ACCEPTED_FOR_UPLOAD，已阻止上传。");
    }
    const response = await window.PersonalWebAuth.authFetch(reviewed.outputUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`读取处理结果失败：${response.status}`);
    }
    stickerToolEvent("upload.requested", { bridgeRunId: reviewed.bridgeRunId });
    const blob = await response.blob();
    const baseName = stickerToolState.sourceFile?.name?.replace(/\.[^.]+$/, "") || "processed-sticker";
    const file = new File([blob], `${baseName}-processed.png`, { type: "image/png" });
    await addPersistentStickerFromFile(file);
    stickerToolState.accepted = true;
    stickerToolState.message = "已加入当前草稿。请点击“保存画布”后才会发布到公开预览。";
    stickerToolEvent("upload.succeeded", { bridgeRunId: reviewed.bridgeRunId });
    stickerToolEvent("draft.added", { bridgeRunId: reviewed.bridgeRunId, stickerCount: state.canvas.stickers.length });
    stickerToolEvent("canvas.auto_save_skipped", { bridgeRunId: reviewed.bridgeRunId });
    render();
  } catch (error) {
    stickerToolState.error = error.message || "接受处理结果失败。";
    stickerToolEvent("upload.failed", { error: error.message });
  } finally {
    stickerToolState.busy = false;
    render();
  }
}

async function rejectStickerToolResult() {
  if (!stickerToolState.run?.bridgeRunId || stickerToolState.busy) {
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  renderEditorPanel();
  try {
    const issueCodes = selectedStickerToolIssueCodes();
    await reviewStickerToolRun("rejected", issueCodes);
    stickerToolState.message = "已拒绝本次结果；未上传媒体。";
    stickerToolEvent("visual_review.rejected", {
      bridgeRunId: stickerToolState.run?.bridgeRunId,
      issueCodes
    });
  } catch (error) {
    stickerToolState.error = error.message || "拒绝结果失败。";
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

async function downloadStickerToolBundle() {
  if (!stickerToolState.run?.bridgeRunId || stickerToolState.busy) {
    return;
  }
  const confirmed = window.confirm(
    "联动诊断包会包含本次输入图片、处理结果和诊断数据。仅在你确认需要分享给排查人员时导出。"
  );
  if (!confirmed) {
    return;
  }
  stickerToolState.busy = true;
  stickerToolState.error = "";
  renderEditorPanel();
  try {
    const response = await window.PersonalWebAuth.authFetch(
      `${STICKER_TOOL_PATH}/runs/${stickerToolState.run.bridgeRunId}/diagnostic-bundle`,
      { method: "POST" }
    );
    if (!response.ok) {
      const body = await parseJsonResponse(response);
      throw new Error(body.detail?.message || body.detail || `诊断包导出失败：${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sticker-tool-${stickerToolState.run.bridgeRunId.slice(0, 8)}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    stickerToolState.message = "已生成联动诊断包。";
  } catch (error) {
    stickerToolState.error = error.message || "诊断包导出失败。";
  } finally {
    stickerToolState.busy = false;
    renderEditorPanel();
  }
}

function handleStickerToolAction(action) {
  const actions = {
    status: refreshStickerToolStatus,
    "select-file": () => document.querySelector("[data-file-input='sticker-tool']")?.click(),
    "save-config": saveStickerToolConfig,
    "clear-config": clearStickerToolConfig,
    accept: acceptStickerToolResult,
    reject: rejectStickerToolResult,
    bundle: downloadStickerToolBundle
  };
  actions[action]?.();
}

function renderEditorPanel() {
  if (!editorRoot) {
    return;
  }
  editorRoot.innerHTML = "";
  if (state.mode !== "edit" || !canEditJourney()) {
    applyEditorSidebarLayoutState();
    return;
  }
  if (editorFocusMode) {
    editorRoot.append(renderFocusControls());
    applyEditorSidebarLayoutState();
    return;
  }
  ensureEditorSidebarInitialState();

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "journey-editor-sidebar-backdrop";
  backdrop.dataset.editorSidebarBackdrop = "true";
  backdrop.setAttribute("aria-label", "关闭编辑栏");
  backdrop.addEventListener("click", () => closeEditorSidebarDrawer("backdrop"));

  const rail = document.createElement("aside");
  rail.className = "journey-editor-sidebar-rail";
  rail.dataset.editorSidebarRail = "true";
  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "journey-editor-sidebar-expand";
  expandButton.dataset.editorSidebarExpand = "true";
  expandButton.setAttribute("aria-controls", EDITOR_SIDEBAR_ID);
  expandButton.setAttribute("aria-expanded", String(!editorSidebarCollapsed));
  expandButton.textContent = "展开编辑栏";
  expandButton.addEventListener("click", () => setEditorSidebarCollapsed(false, "expand-button"));
  rail.append(expandButton);

  const sidebar = document.createElement("aside");
  sidebar.id = EDITOR_SIDEBAR_ID;
  sidebar.className = "journey-editor-sidebar";
  sidebar.setAttribute("aria-label", "Journey editor sidebar");

  const sidebarHeader = document.createElement("div");
  sidebarHeader.className = "journey-editor-sidebar__header";
  sidebarHeader.innerHTML = `
    <div>
      <p class="journey-editor-sidebar__eyebrow">Journey editor</p>
      <h2>编辑栏</h2>
    </div>
  `;
  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.className = "journey-editor-sidebar-collapse";
  collapseButton.dataset.editorSidebarCollapse = "true";
  collapseButton.setAttribute("aria-controls", EDITOR_SIDEBAR_ID);
  collapseButton.setAttribute("aria-expanded", "true");
  collapseButton.textContent = "收起编辑栏";
  collapseButton.addEventListener("click", () => setEditorSidebarCollapsed(true, "collapse-button"));
  sidebarHeader.append(collapseButton);

  const sidebarBody = document.createElement("div");
  sidebarBody.className = "journey-editor-sidebar__body";

  const toolbar = document.createElement("section");
  toolbar.className = "journey-sketch-toolbar";
  toolbar.innerHTML = `
    <div class="journey-sketch-toolbar__row">
      <button type="button" data-tool="draw" aria-pressed="${state.editor.activeTool === "draw"}">手绘</button>
      <button type="button" data-tool="erase" aria-pressed="${state.editor.activeTool === "erase"}">橡皮擦</button>
      <button type="button" data-tool="select" aria-pressed="${state.editor.activeTool === "select"}">选择/编辑</button>
      <button type="button" data-action="enter-focus">专注绘制</button>
      <button type="button" data-action="import-curve">导入曲线</button>
      <button type="button" data-action="upload-sticker">上传贴纸</button>
      <button type="button" data-action="preprocess-sticker">预处理贴纸</button>
      <button type="button" data-action="save-canvas" ${remoteCanvasMeta.saving ? "disabled" : ""}>
        ${remoteCanvasMeta.saving ? "保存中..." : "保存画布"}
      </button>
      <button type="button" data-action="export-publish-bundle" ${publishBundleExportMeta.exporting ? "disabled" : ""}>
        ${publishBundleExportMeta.exporting ? "导出中..." : "导出发布包"}
      </button>
      <button type="button" data-action="clear">清空画布</button>
      <button type="button" data-action="exit">退出编辑</button>
    </div>
    <p class="journey-sketch-save-hint">
      保存画布后，公开预览会读取最新版本。
    </p>
    ${renderSelectedStickerActions()}
    ${renderStickerToolPanel()}
    <p class="journey-sketch-tool-hint" data-tool-hint>
      ${escapeHtml(activeToolHint())}
    </p>
    <label class="journey-sketch-height">
      画布高度
      <input type="range" min="${MIN_CANVAS_HEIGHT}" max="${MAX_CANVAS_HEIGHT}" step="50" data-setting="height" value="${state.canvas.height}">
      <input type="number" min="${MIN_CANVAS_HEIGHT}" max="${MAX_CANVAS_HEIGHT}" step="50" data-setting="height" value="${state.canvas.height}">
    </label>
    <details class="journey-route-style-settings" open>
      <summary>路线与节点样式</summary>
      ${renderRouteStyleControls()}
      <label class="journey-sketch-setting">
        <span>预览图最多数</span>
        <input type="range" min="${MIN_PREVIEW_THUMBNAILS}" max="${MAX_PREVIEW_THUMBNAILS}" step="1" data-setting="maxPreviewThumbnails" value="${state.canvas.maxPreviewThumbnails}">
        <strong>${state.canvas.maxPreviewThumbnails}</strong>
      </label>
    </details>
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
    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden data-file-input="sticker">
    <p class="journey-sketch-remote-status" data-remote-status data-error="${remoteCanvasMeta.warning}">
      ${escapeHtml(remoteCanvasMeta.status)}
    </p>
    <p class="journey-sketch-status" data-editor-status>${state.dirty ? "有未保存的画布修改。" : "画布已保存，公开预览将读取最新版本。"}</p>
  `;
  toolbar.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });
  toolbar.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleToolbarAction(button.dataset.action));
  });
  toolbar.querySelectorAll("[data-sticker-tool-action]").forEach((button) => {
    button.addEventListener("click", () => handleStickerToolAction(button.dataset.stickerToolAction));
  });
  toolbar.querySelector("[data-sticker-tool-config-input]")?.addEventListener("input", (event) => {
    stickerToolState.configInput = event.currentTarget.value;
  });
  toolbar.querySelectorAll("[data-sticker-action]").forEach((button) => {
    button.addEventListener("click", () => handleSelectedStickerAction(button.dataset.stickerAction));
  });
  toolbar.querySelectorAll("[data-setting]").forEach((field) => {
    field.addEventListener("input", () => updateSetting(field));
    field.addEventListener("change", () => updateSetting(field));
  });
  toolbar.querySelector(".journey-sketch-curve-settings")?.addEventListener("toggle", (event) => {
    if (!guardJourneyMutation("toggleCurveSettings")) {
      return;
    }
    state.editor.showCurveSettings = event.currentTarget.open;
  });
  toolbar.querySelectorAll("[data-file-input]").forEach((input) => {
    if (input.dataset.fileInput === "sticker-tool") {
      input.addEventListener("change", () => handleStickerToolFileInput(input));
    } else {
      input.addEventListener("change", () => handleFileInput(input));
    }
  });
  sidebarBody.append(toolbar);
  sidebar.append(sidebarHeader, sidebarBody);
  editorRoot.append(backdrop, rail, sidebar);
  const importDialog = renderCurveImportDialog();
  if (importDialog) {
    editorRoot.append(importDialog);
  }
  renderSelectedNodeEditor(sidebarBody);
  applyEditorSidebarLayoutState();
}

function bindSelectedNodeEditor(panel) {
  panel.querySelector("[data-node-label]")?.addEventListener("input", (event) => updateSelectedNodeLabel(event.target.value));
  panel.querySelectorAll("[data-node-field]").forEach((field) => {
    field.addEventListener("input", () => updateSelectedNodeField(field));
    field.addEventListener("change", () => updateSelectedNodeField(field));
  });
  panel.querySelectorAll("[data-node-style]").forEach((field) => {
    field.addEventListener("click", () => updateSelectedNodeStyle(field));
    field.addEventListener("input", () => updateSelectedNodeStyle(field));
    field.addEventListener("change", () => updateSelectedNodeStyle(field));
  });
  panel.querySelectorAll("[data-gallery-action]").forEach((button) => {
    button.addEventListener("click", () => handleSelectedNodeGalleryAction(button));
  });
  panel.querySelectorAll("[data-gallery-field]").forEach((field) => {
    field.addEventListener("input", () => updateSelectedNodeGalleryField(field));
    field.addEventListener("change", () => updateSelectedNodeGalleryField(field));
  });
  panel.querySelector("[data-node-gallery-file]")?.addEventListener("change", (event) => {
    handleNodeGalleryFileInput(event.currentTarget);
  });
  panel.querySelector("[data-node-action='copy-style']")?.addEventListener("click", copySelectedNodeStyle);
  panel.querySelector("[data-node-action='set-default-style']")?.addEventListener("click", setSelectedNodeStyleAsDefault);
  panel.querySelector("[data-node-action='delete']")?.addEventListener("click", deleteSelectedNode);
}

function renderSelectedNodeEditor(container = editorRoot) {
  if (
    state.mode !== "edit" ||
    state.editor.activeTool !== "select" ||
    !selectedNode() ||
    !container
  ) {
    return;
  }
  const panel = document.createElement("aside");
  panel.className = "journey-sketch-node-panel journey-sketch-node-panel--floating";
  panel.setAttribute("aria-label", "Selected journey node editor");
  panel.innerHTML = renderSelectedNodePanelV2();
  bindSelectedNodeEditor(panel);
  container.append(panel);
}

function renderSelectedStickerActions() {
  const sticker = selectedSticker();
  if (state.editor.activeTool !== "select" || !sticker) {
    return "";
  }
  return `
    <div class="journey-sketch-sticker-actions" data-selected-sticker-actions>
      <p class="journey-sketch-sticker-actions__hint">
        已选中贴纸：可移动、缩放、旋转、删除、调整图层或铺满画布。
      </p>
      <button type="button" data-sticker-action="backward">下移一层</button>
      <button type="button" data-sticker-action="forward">上移一层</button>
      <button type="button" data-sticker-action="to-back">置于底层</button>
      <button type="button" data-sticker-action="to-front">置于顶层</button>
      <button type="button" data-sticker-action="cover-canvas">铺满画布</button>
    </div>
  `;
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

function renderRouteStyleControls() {
  const style = sanitizeRouteStyle(state.canvas.routeStyle);
  return `
    <div class="journey-route-style-grid">
      <label class="journey-sketch-setting">
        <span>路线颜色</span>
        <input type="color" data-setting="routeColor" value="${style.color}">
        <strong>${escapeHtml(style.color)}</strong>
      </label>
      <label class="journey-sketch-setting">
        <span>路线粗细</span>
        <input type="range" min="2" max="18" step="1" data-setting="routeWidth" value="${style.width}">
        <strong>${style.width}</strong>
      </label>
      <label class="journey-sketch-check">
        <input type="checkbox" data-setting="routeDashed" ${style.dashed ? "checked" : ""}>
        虚线路线
      </label>
      <label class="journey-sketch-setting">
        <span>虚线长度</span>
        <input type="range" min="4" max="28" step="1" data-setting="routeDashLength" value="${style.dashLength}">
        <strong>${style.dashLength}</strong>
      </label>
      <label class="journey-sketch-setting">
        <span>虚线间隔</span>
        <input type="range" min="4" max="28" step="1" data-setting="routeDashGap" value="${style.dashGap}">
        <strong>${style.dashGap}</strong>
      </label>
    </div>
  `;
}

function renderNodeColorSwatches(node) {
  return NODE_COLOR_OPTIONS.map((color) => `
    <button
      type="button"
      class="journey-node-color-swatch"
      data-node-style="color"
      data-color="${color}"
      aria-pressed="${node.style.color.toLowerCase() === color.toLowerCase()}"
      style="--swatch-color: ${color}"
      title="${color}"
    ></button>
  `).join("");
}

function renderNodeGalleryList(node) {
  if (!node.galleryImages.length) {
    return "<p class=\"journey-node-gallery-empty\">暂无节点图片。点击“上传节点图片”后会自动添加到这里。</p>";
  }
  return `
    <ul class="journey-node-gallery-list">
      ${node.galleryImages.map((image, index) => `
        <li>
          <img src="${escapeHtml(nodeGalleryImageSrc(image, { useAdminPreview: true }))}" alt="${escapeHtml(image.alt || `node image ${index + 1}`)}">
          <div class="journey-node-gallery-list__body">
            <strong>${escapeHtml(image.alt || `图片 ${index + 1}`)}</strong>
            <input
              type="text"
              data-gallery-field="caption"
              data-gallery-index="${index}"
              value="${escapeHtml(image.caption || "")}"
              placeholder="图片说明"
            >
          </div>
          <div class="journey-node-gallery-list__actions">
            <button type="button" data-gallery-action="move-up" data-gallery-index="${index}" ${index === 0 ? "disabled" : ""}>上移</button>
            <button type="button" data-gallery-action="move-down" data-gallery-index="${index}" ${index === node.galleryImages.length - 1 ? "disabled" : ""}>下移</button>
            <button type="button" data-gallery-action="remove" data-gallery-index="${index}">移除</button>
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function activeToolHint() {
  if (state.editor.activeTool === "select") {
    if (selectedSticker()) {
      return "已选中贴纸：可移动、缩放、旋转、删除、调整图层或铺满画布。";
    }
    return "选择/编辑模式：点击贴纸后可拖动、缩放、旋转、删除或调整图层。";
  }
  if (state.editor.activeTool === "erase") {
    return "橡皮擦模式：拖动画布会擦除线条，贴纸不会被移动、缩放或旋转。";
  }
  return "手绘模式：拖动画布会绘制线条，贴纸不会被移动、缩放或旋转。";
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

function renderSelectedNodePanelV2() {
  const node = selectedNode();
  if (!node) {
    return "<p>右键点击路线附近创建节点。新节点会继承当前默认节点样式。</p>";
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
    <label>
      标题
      <input data-node-field="title" value="${escapeHtml(node.title || node.label || node.id)}">
    </label>
    <label>
      副标题 / 日期
      <input data-node-field="meta" value="${escapeHtml(node.meta || node.subtitle || "")}">
    </label>
    <label>
      描述
      <textarea data-node-field="description" rows="2">${escapeHtml(node.description || "")}</textarea>
    </label>
    <div class="journey-node-style-controls">
      <p>节点样式</p>
      <div class="journey-node-color-grid">
        ${renderNodeColorSwatches(node)}
        <input type="color" data-node-style="color" value="${node.style.color}" aria-label="自定义节点颜色">
      </div>
      <label class="journey-sketch-setting">
        <span>节点大小</span>
        <input type="range" min="${MIN_NODE_SIZE}" max="${MAX_NODE_SIZE}" step="1" data-node-style="size" value="${node.style.size}">
        <strong>${node.style.size}</strong>
      </label>
      <div class="journey-node-style-actions">
        <button type="button" data-node-action="copy-style">复制节点样式</button>
        <button type="button" data-node-action="set-default-style">设为默认样式</button>
      </div>
    </div>
    <div class="journey-node-gallery-editor">
      <p>节点图片</p>
      <div class="journey-node-gallery-add">
        <button type="button" data-gallery-action="upload" ${nodeGalleryUploadState.uploading ? "disabled" : ""}>
          ${nodeGalleryUploadState.uploading ? "正在上传节点图片..." : "上传节点图片"}
        </button>
        <input type="file" accept="image/*" multiple hidden data-node-gallery-file>
      </div>
      <p class="journey-node-gallery-help">图片会上传为首页媒体，并自动作为 mediaId 引用保存到节点图库。请再点击“保存画布”发布引用。</p>
      ${renderNodeGalleryList(node)}
    </div>
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
  if (tool !== "select") {
    state.editor.selectedNodeId = null;
    state.editor.selectedStickerId = null;
    state.editor.selectedStrokeId = null;
  }
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
  } else if (key === "maxPreviewThumbnails") {
    state.canvas.maxPreviewThumbnails = Math.round(clamp(
      Number(field.value),
      MIN_PREVIEW_THUMBNAILS,
      MAX_PREVIEW_THUMBNAILS
    ));
  } else if (key === "routeColor") {
    state.canvas.routeStyle.color = sanitizeHexColor(field.value, DEFAULT_ROUTE_STYLE.color);
  } else if (key === "routeWidth") {
    state.canvas.routeStyle.width = Math.round(clamp(Number(field.value), 2, 18));
  } else if (key === "routeDashed") {
    state.canvas.routeStyle.dashed = field.checked;
  } else if (key === "routeDashLength") {
    state.canvas.routeStyle.dashLength = Math.round(clamp(Number(field.value), 4, 28));
  } else if (key === "routeDashGap") {
    state.canvas.routeStyle.dashGap = Math.round(clamp(Number(field.value), 4, 28));
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
  const stickerFileInput = document.querySelector("[data-file-input='sticker']");
  const actions = {
    "enter-focus": enterEditorFocusMode,
    "import-curve": openCurveImportDialog,
    "upload-sticker": () => stickerFileInput?.click(),
    "preprocess-sticker": () => {
      refreshStickerToolStatus();
      document.querySelector("[data-file-input='sticker-tool']")?.click();
    },
    "save-canvas": saveRemoteCanvasState,
    "export-publish-bundle": exportPublishBundle,
    clear: clearCanvasState,
    exit: () => {
      exitEditorFocusMode("editor-exit");
      state.mode = "preview";
      render();
    }
  };
  actions[action]?.();
}

function handleSelectedStickerAction(action) {
  logJourney("sticker.action.requested", {
    action,
    selectedStickerId: state.editor.selectedStickerId,
    activeTool: state.editor.activeTool,
    editMode: state.mode
  });
  if (!guardJourneyMutation(`stickerAction:${action}`)) {
    return;
  }
  if (state.editor.activeTool !== "select" || !selectedSticker()) {
    logJourney("Ignored sticker layer action without selected sticker.", {
      action,
      activeTool: state.editor.activeTool
    });
    return;
  }
  const actions = {
    forward: moveSelectedStickerForward,
    backward: moveSelectedStickerBackward,
    "to-front": moveSelectedStickerToFront,
    "to-back": moveSelectedStickerToBack,
    "cover-canvas": coverSelectedStickerCanvas,
    delete: deleteSelectedSticker
  };
  actions[action]?.();
}

async function handleFileInput(input) {
  if (!guardJourneyMutation(`fileInput:${input.dataset.fileInput || "unknown"}`)) {
    input.value = "";
    return;
  }
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  try {
    await addPersistentStickerFromFile(file);
    showMessage("贴纸已上传为媒体文件并添加到画布。");
    render();
  } catch (error) {
    showMessage(error.message || "图片处理失败，请重试。", true);
    logJourney("Image file handling failed.", {
      inputType: input.dataset.fileInput,
      error: error.message
    });
  } finally {
    input.value = "";
  }
}

async function handleCanvasDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("is-drag-over");
  if (state.mode !== "edit" || !guardJourneyMutation("handleCanvasDrop")) {
    return;
  }
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }
  const point = canvasPointToCssPercent(clientPointToCanvasPoint(event));

  try {
    await addPersistentStickerFromFile(file, point);
    showMessage("贴纸已上传为媒体文件并添加到画布；如需背景效果，请选择贴纸后使用置于底层或铺满画布。");
    render();
  } catch (error) {
    showMessage(error.message || "拖入图片处理失败，请重试。", true);
    logJourney("Dropped image handling failed.", { error: error.message });
  }
}

function loadImageDimensions(file) {
  return new Promise((resolve) => {
    if (!file || typeof URL === "undefined" || !file.type?.startsWith("image/")) {
      resolve({ naturalWidth: null, naturalHeight: null, aspectRatio: 1 });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const finish = (result) => {
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    image.onload = () => {
      const naturalWidth = normalizeOptionalDimension(image.naturalWidth);
      const naturalHeight = normalizeOptionalDimension(image.naturalHeight);
      finish({
        naturalWidth,
        naturalHeight,
        aspectRatio: naturalWidth && naturalHeight ? clampAspectRatio(naturalWidth / naturalHeight) : 1
      });
    };
    image.onerror = () => {
      logJourney("Failed to measure sticker image dimensions; using square fallback.", {
        filename: file.name,
        mimeType: file.type
      });
      finish({ naturalWidth: null, naturalHeight: null, aspectRatio: 1 });
    };
    image.src = objectUrl;
  });
}

async function uploadJourneyStickerMedia(file) {
  return uploadJourneyImageMedia(file, {
    title: file?.name || "Journey sticker",
    description: "Journey sticker media upload",
    invalidTypeMessage: "只支持上传图片贴纸。",
    authMessage: "认证服务不可用，无法上传贴纸媒体。",
    failurePrefix: "贴纸媒体上传失败",
    invalidResponseMessage: "贴纸媒体上传返回的数据无效。",
    logLabel: "Journey sticker media"
  });
}

async function uploadJourneyNodeGalleryMedia(file) {
  return uploadJourneyImageMedia(file, {
    title: file?.name || "Journey node image",
    description: "Journey node gallery image upload",
    invalidTypeMessage: "只支持上传节点图片。",
    authMessage: "认证服务不可用，无法上传节点图片。",
    failurePrefix: "节点图片上传失败",
    invalidResponseMessage: "节点图片上传返回的数据无效。",
    logLabel: "Journey node gallery media"
  });
}

async function uploadJourneyImageMedia(file, options = {}) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error(options.invalidTypeMessage || "只支持上传图片。");
  }
  if (!window.PersonalWebAuth?.authFetch) {
    throw new Error(options.authMessage || "认证服务不可用，无法上传图片。");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", options.title || file.name || "Journey image");
  formData.append("description", options.description || "Journey image upload");
  formData.append("sort_order", "0");

  logJourney(`Uploading ${options.logLabel || "Journey image media"}.`, {
    filename: file.name,
    mimeType: file.type,
    size: file.size
  });
  const response = await window.PersonalWebAuth.authFetch(HOMEPAGE_MEDIA_PATH, {
    method: "POST",
    body: formData
  });
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(body.detail || `${options.failurePrefix || "图片上传失败"}：${response.status}`);
  }
  if (body.mediaType !== "image" || !normalizeOptionalMediaId(body.id)) {
    throw new Error(options.invalidResponseMessage || "图片上传返回的数据无效。");
  }
  logJourney(`Uploaded ${options.logLabel || "Journey image media"}.`, {
    mediaId: body.id,
    filename: body.originalFilename || body.title || file.name
  });
  return body;
}

async function addPersistentStickerFromFile(file, position = { xPercent: 50, yPercent: 30 }) {
  const [dimensions, media] = await Promise.all([
    loadImageDimensions(file),
    uploadJourneyStickerMedia(file)
  ]);
  addSticker({
    mediaId: media.id,
    mediaType: "image",
    mediaTitle: media.title || file.name || "",
    mediaFilename: media.originalFilename || file.name || "",
    source: "homepage-media",
    uploadStatus: "uploaded",
    naturalWidth: dimensions.naturalWidth,
    naturalHeight: dimensions.naturalHeight,
    aspectRatio: dimensions.aspectRatio
  }, position);
}

function addSticker(imageSource, position = { xPercent: 50, yPercent: 30 }) {
  if (!guardJourneyMutation("addSticker")) {
    return;
  }
  const sticker = sanitizeSticker({
    ...(typeof imageSource === "string" ? { imageSrc: imageSource } : imageSource),
    ...position,
    widthPercent: 18,
    zIndex: state.canvas.stickers.length
  });
  state.canvas.stickers.push(sticker);
  normalizeStickerZOrder();
  state.editor.selectedStickerId = sticker.id;
  state.editor.selectedNodeId = null;
  state.editor.selectedStrokeId = null;
  state.editor.activeTool = "select";
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
    const previousStickerId = state.editor.selectedStickerId;
    state.editor.selectedNodeId = null;
    state.editor.selectedStickerId = null;
    logStickerSelectionChanged(previousStickerId, null, "canvas_pointer_down");
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
  if (state.editor.activeTool !== "select") {
    logJourney("Ignored sticker edit outside select mode.", {
      stickerId,
      mode,
      activeTool: state.editor.activeTool
    });
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const sticker = state.canvas.stickers.find((item) => item.id === stickerId);
  if (!sticker) {
    return;
  }
  const previousStickerId = state.editor.selectedStickerId;
  state.editor.selectedStickerId = sticker.id;
  state.editor.selectedNodeId = null;
  state.editor.selectedStrokeId = null;
  logStickerSelectionChanged(previousStickerId, sticker.id, mode);
  logJourney("Selected sticker in select mode.", { stickerId: sticker.id, mode });
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
  logJourney("Started sticker edit drag.", { stickerId: sticker.id, mode });
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

window.addEventListener("resize", () => {
  scheduleFocusCanvasStageSizeSync();
  applyEditorSidebarLayoutState();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editorFocusMode) {
    event.preventDefault();
    exitEditorFocusMode("escape");
    return;
  }
  if (event.key === "Escape" && editorSidebarDrawerOpen) {
    event.preventDefault();
    closeEditorSidebarDrawer("escape");
    return;
  }
  if (state.mode !== "edit" || !["Delete", "Backspace"].includes(event.key) || !guardJourneyMutation("deleteKey")) {
    return;
  }
  if (state.editor.activeTool !== "select") {
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

function selectedSticker() {
  return state.canvas.stickers.find((sticker) => sticker.id === state.editor.selectedStickerId) || null;
}

function reorderSelectedSticker(targetIndex) {
  const selectedId = state.editor.selectedStickerId;
  const ordered = normalizeStickerZOrder();
  const currentIndex = ordered.findIndex((sticker) => sticker.id === selectedId);
  if (currentIndex < 0) {
    return false;
  }
  const nextIndex = clamp(targetIndex, 0, ordered.length - 1);
  if (nextIndex === currentIndex) {
    return false;
  }
  const [sticker] = ordered.splice(currentIndex, 1);
  ordered.splice(nextIndex, 0, sticker);
  ordered.forEach((item, index) => {
    item.zIndex = index;
  });
  state.canvas.stickers = ordered;
  state.editor.selectedStickerId = selectedId;
  sticker.updatedAt = nowIso();
  markDirty("sticker layer changed");
  logJourney("Changed selected sticker z-order.", {
    stickerId: selectedId,
    fromIndex: currentIndex,
    toIndex: nextIndex
  });
  render();
  return true;
}

function moveSelectedStickerForward() {
  const ordered = normalizeStickerZOrder();
  const index = ordered.findIndex((sticker) => sticker.id === state.editor.selectedStickerId);
  if (reorderSelectedSticker(index + 1)) {
    showMessage("贴纸已上移一层。有未保存的画布修改。");
  }
}

function moveSelectedStickerBackward() {
  const ordered = normalizeStickerZOrder();
  const index = ordered.findIndex((sticker) => sticker.id === state.editor.selectedStickerId);
  if (reorderSelectedSticker(index - 1)) {
    showMessage("贴纸已下移一层。有未保存的画布修改。");
  }
}

function moveSelectedStickerToFront() {
  if (reorderSelectedSticker(state.canvas.stickers.length - 1)) {
    showMessage("贴纸已置于顶层。有未保存的画布修改。");
  }
}

function moveSelectedStickerToBack() {
  if (reorderSelectedSticker(0)) {
    showMessage("贴纸已置于底层。有未保存的画布修改。");
  }
}

function coverSelectedStickerCanvas() {
  const sticker = selectedSticker();
  if (!sticker) {
    return;
  }
  const canvasAspect = CANVAS_WIDTH / Math.max(1, state.canvas.height);
  const stickerAspect = clampAspectRatio(sticker.aspectRatio || 1);
  const widthPercent = stickerAspect >= canvasAspect
    ? 100 * (stickerAspect / canvasAspect)
    : 100;
  sticker.xPercent = 50;
  sticker.yPercent = 50;
  sticker.widthPercent = clamp(widthPercent, STICKER_MIN_WIDTH_PERCENT, STICKER_MAX_WIDTH_PERCENT);
  sticker.rotation = 0;
  sticker.updatedAt = nowIso();
  markDirty("sticker covered canvas");
  logJourney("Covered Journey canvas with selected sticker.", {
    stickerId: sticker.id,
    canvasAspect,
    stickerAspect,
    widthPercent: sticker.widthPercent
  });
  render();
  showMessage("贴纸已铺满画布，可继续移动、缩放或置于底层。有未保存的画布修改。");
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
}

function updateSelectedNodeField(field) {
  if (!guardJourneyMutation("updateSelectedNodeField")) {
    return;
  }
  const node = selectedNode();
  if (!node) {
    return;
  }
  const key = field.dataset.nodeField;
  if (!["title", "subtitle", "meta", "description"].includes(key)) {
    return;
  }
  node[key] = String(field.value || "").slice(0, key === "description" ? 400 : 160);
  if (key === "title" && !node.label) {
    node.label = node.title || node.id;
  }
  node.updatedAt = nowIso();
  markDirty(`node ${key} changed`);
}

function updateSelectedNodeStyle(field) {
  if (!guardJourneyMutation("updateSelectedNodeStyle")) {
    return;
  }
  const node = selectedNode();
  if (!node) {
    return;
  }
  const key = field.dataset.nodeStyle;
  if (key === "color") {
    node.style.color = sanitizeHexColor(field.dataset.color || field.value, DEFAULT_NODE_STYLE.color);
  } else if (key === "size") {
    node.style.size = Math.round(clamp(Number(field.value), MIN_NODE_SIZE, MAX_NODE_SIZE));
  }
  node.style = sanitizeNodeStyle(node.style);
  node.updatedAt = nowIso();
  markDirty(`node style ${key} changed`);
  render();
}

function copySelectedNodeStyle() {
  if (!guardJourneyMutation("copySelectedNodeStyle")) {
    return;
  }
  const node = selectedNode();
  if (!node) {
    return;
  }
  state.editor.nodeStyleTemplate = sanitizeNodeStyle(node.style);
  showMessage("已复制节点样式；之后新建节点会继承该样式。");
  logJourney("Copied selected node style.", { nodeId: node.id, style: state.editor.nodeStyleTemplate });
  render();
}

function setSelectedNodeStyleAsDefault() {
  if (!guardJourneyMutation("setSelectedNodeStyleAsDefault")) {
    return;
  }
  const node = selectedNode();
  if (!node) {
    return;
  }
  state.canvas.defaultNodeStyle = sanitizeNodeStyle(node.style);
  state.editor.nodeStyleTemplate = sanitizeNodeStyle(node.style);
  markDirty("default node style changed");
  showMessage("已设为默认节点样式。");
  render();
}

function handleSelectedNodeGalleryAction(button) {
  if (!guardJourneyMutation("handleSelectedNodeGalleryAction")) {
    return;
  }
  const node = selectedNode();
  if (!node) {
    showMessage("请先选择一个节点。", true);
    return;
  }
  const action = button.dataset.galleryAction;
  if (action === "upload") {
    if (nodeGalleryUploadState.uploading) {
      return;
    }
    const fileInput = button.closest(".journey-node-gallery-editor")?.querySelector("[data-node-gallery-file]");
    fileInput?.click();
  } else if (action === "remove") {
    const index = Number(button.dataset.galleryIndex);
    node.galleryImages = node.galleryImages.filter((_, itemIndex) => itemIndex !== index);
    node.updatedAt = nowIso();
    markDirty("node gallery image removed");
    render();
  } else if (action === "move-up" || action === "move-down") {
    const index = Number(button.dataset.galleryIndex);
    const nextIndex = action === "move-up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= node.galleryImages.length) {
      return;
    }
    const images = [...node.galleryImages];
    const [image] = images.splice(index, 1);
    images.splice(nextIndex, 0, image);
    node.galleryImages = sanitizeGalleryImages(images);
    node.updatedAt = nowIso();
    markDirty("node gallery image reordered");
    render();
  }
}

function updateSelectedNodeGalleryField(field) {
  if (!guardJourneyMutation("updateSelectedNodeGalleryField")) {
    return;
  }
  const node = selectedNode();
  if (!node) {
    return;
  }
  const index = Number(field.dataset.galleryIndex);
  const image = node.galleryImages[index];
  if (!image) {
    return;
  }
  if (field.dataset.galleryField === "caption") {
    image.caption = field.value.slice(0, 180);
  }
  node.updatedAt = nowIso();
  markDirty("node gallery image updated");
}

async function handleNodeGalleryFileInput(input) {
  if (!guardJourneyMutation("handleNodeGalleryFileInput")) {
    input.value = "";
    return;
  }
  const node = selectedNode();
  if (!node) {
    showMessage("请先选择一个节点。", true);
    input.value = "";
    return;
  }
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length) {
    showMessage("未选择图片。", true);
    return;
  }
  const invalidFile = files.find((file) => !file.type?.startsWith("image/"));
  if (invalidFile) {
    showMessage(`不支持的文件类型：${invalidFile.name || invalidFile.type || "unknown"}`, true);
    return;
  }
  if (nodeGalleryUploadState.uploading) {
    showMessage("节点图片正在上传，请稍后。", true);
    return;
  }

  nodeGalleryUploadState.uploading = true;
  showMessage("正在上传节点图片...");
  render();
  const uploadedImages = [];
  try {
    for (const file of files) {
      const media = await uploadJourneyNodeGalleryMedia(file);
      const mediaId = normalizeOptionalMediaId(media.id);
      if (!mediaId) {
        throw new Error("节点图片上传返回缺少 mediaId。");
      }
      uploadedImages.push({
        mediaId,
        alt: media.title || media.originalFilename || file.name || node.title || node.label || node.id,
        caption: ""
      });
    }
    const currentNode = selectedNode();
    if (!currentNode || currentNode.id !== node.id) {
      throw new Error("上传完成前选中的节点已变化，请重新选择节点后再添加图片。");
    }
    currentNode.galleryImages = sanitizeGalleryImages([
      ...currentNode.galleryImages,
      ...uploadedImages
    ]);
    currentNode.updatedAt = nowIso();
    markDirty("node gallery image uploaded");
    showMessage("图片已上传并添加到节点，请保存画布。");
    logJourney("Added uploaded node gallery images.", {
      nodeId: currentNode.id,
      mediaIds: uploadedImages.map((image) => image.mediaId)
    });
  } catch (error) {
    showMessage(`节点图片上传失败：${error.message}`, true);
    logJourney("Node gallery image upload failed.", { error: error.message });
  } finally {
    nodeGalleryUploadState.uploading = false;
    render();
  }
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
  const stickerCountBefore = state.canvas.stickers.length;
  const selectedStickerId = state.editor.selectedStickerId;
  const mutationAllowed = guardJourneyMutation("deleteSelectedSticker");
  logJourney("sticker.delete.requested", {
    selectedStickerId,
    stickerCountBefore,
    activeTool: state.editor.activeTool,
    mutationAllowed
  });
  if (!mutationAllowed) {
    logJourney("sticker.delete.blocked", {
      reason: "not_authorized",
      selectedStickerId,
      stickerCount: stickerCountBefore
    });
    return;
  }
  if (state.editor.activeTool !== "select") {
    logJourney("sticker.delete.blocked", {
      reason: "not_select_mode",
      selectedStickerId,
      stickerCount: stickerCountBefore
    });
    return;
  }
  if (!selectedStickerId) {
    logJourney("sticker.delete.blocked", {
      reason: "no_selected_sticker",
      selectedStickerId,
      stickerCount: stickerCountBefore
    });
    return;
  }
  if (!state.canvas.stickers.some((sticker) => sticker.id === selectedStickerId)) {
    logJourney("sticker.delete.blocked", {
      reason: "selected_sticker_not_found",
      selectedStickerId,
      stickerCount: stickerCountBefore
    });
    return;
  }
  logJourney("Deleting selected sticker.", { stickerId: selectedStickerId });
  state.canvas.stickers = state.canvas.stickers.filter((sticker) => sticker.id !== selectedStickerId);
  state.editor.selectedStickerId = null;
  markDirty("sticker deleted");
  render();
  logJourney("sticker.delete.succeeded", {
    deletedStickerId: selectedStickerId,
    stickerCountBefore,
    stickerCountAfter: state.canvas.stickers.length,
    selectedStickerIdAfter: state.editor.selectedStickerId,
    dirtyStateAfter: state.dirty
  });
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

function updateRemoteStatus(message, isError = false) {
  remoteCanvasMeta.status = message;
  remoteCanvasMeta.warning = Boolean(isError);
  const status = document.querySelector("[data-remote-status]");
  if (status) {
    status.textContent = message;
    status.dataset.error = String(isError);
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

function clearNodeHoverCloseTimer() {
  if (nodeHoverState.closeTimer) {
    window.clearTimeout(nodeHoverState.closeTimer);
    nodeHoverState.closeTimer = null;
  }
}

function shouldSuppressNodeHover() {
  return Boolean(
    dragState ||
    (state.mode === "edit" && ["draw", "erase"].includes(state.editor.activeTool))
  );
}

function visibleGalleryImages(node) {
  return sanitizeGalleryImages(node?.galleryImages);
}

function findNodeElement(nodeId) {
  return Array.from(document.querySelectorAll(".journey-sketch-node"))
    .find((element) => element.dataset.nodeId === nodeId) || null;
}

function renderNodeGallery(node) {
  const images = visibleGalleryImages(node);
  const maxThumbs = Math.round(clamp(
    normalizeNumber(state.canvas.maxPreviewThumbnails, DEFAULT_PREVIEW_THUMBNAILS),
    MIN_PREVIEW_THUMBNAILS,
    MAX_PREVIEW_THUMBNAILS
  ));
  if (!images.length) {
    return `
      <div class="timeline-event-popover__empty-image">
        <span>暂无图片</span>
      </div>
    `;
  }
  const safeIndex = ((nodeHoverState.imageIndex % images.length) + images.length) % images.length;
  nodeHoverState.imageIndex = safeIndex;
  const active = images[safeIndex];
  const imageSrc = nodeGalleryImageSrc(active, { useAdminPreview: canEditJourney() && state.mode === "edit" });
  const thumbs = images.slice(0, maxThumbs);
  const moreCount = Math.max(0, images.length - thumbs.length);
  return `
    <div class="timeline-event-popover__gallery" data-node-gallery>
      <div class="timeline-event-popover__image-wrap">
        <button type="button" class="timeline-event-popover__arrow" data-gallery-action="prev" aria-label="上一张">‹</button>
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(active.alt || node.title || node.label || node.id)}">
        <button type="button" class="timeline-event-popover__arrow" data-gallery-action="next" aria-label="下一张">›</button>
      </div>
      ${active.caption ? `<p class="timeline-event-popover__caption">${escapeHtml(active.caption)}</p>` : ""}
      <div class="timeline-event-popover__thumbs">
        ${thumbs.map((image, index) => `
          <button type="button" data-gallery-thumb="${index}" aria-pressed="${index === safeIndex}">
            <img src="${escapeHtml(nodeGalleryImageSrc(image, { useAdminPreview: canEditJourney() && state.mode === "edit" }))}" alt="${escapeHtml(image.alt || `preview ${index + 1}`)}">
          </button>
        `).join("")}
        ${moreCount ? `<span class="timeline-event-popover__more">+${moreCount}</span>` : ""}
      </div>
      <p class="timeline-event-popover__counter">${safeIndex + 1} / ${images.length}</p>
    </div>
  `;
}

function showNodeHoverPopup(nodeId, anchorElement = null, options = {}) {
  if (shouldSuppressNodeHover()) {
    return;
  }
  const node = state.canvas.nodes.find((item) => item.id === nodeId);
  if (!eventPopover || !node) {
    return;
  }
  clearNodeHoverCloseTimer();
  if (nodeHoverState.nodeId !== nodeId || options.resetIndex) {
    nodeHoverState.imageIndex = 0;
  }
  nodeHoverState.nodeId = nodeId;
  eventPopover.innerHTML = `
    <section class="timeline-event-popover__panel">
      <div class="timeline-event-popover__top">
        <div>
          <p class="timeline-event-popover__type">Journey Node</p>
          <h2 id="timeline-popover-title">${escapeHtml(node.title || node.label || node.id)}</h2>
          ${node.meta || node.subtitle ? `<p class="timeline-event-popover__date">${escapeHtml(node.meta || node.subtitle)}</p>` : ""}
        </div>
        <button type="button" class="timeline-event-popover__close" data-popover-close aria-label="关闭节点预览">×</button>
      </div>
      <div class="timeline-event-popover__body">
        ${renderNodeGallery(node)}
        ${node.description ? `<p>${escapeHtml(node.description)}</p>` : ""}
      </div>
    </section>
  `;
  eventPopover.hidden = false;
  eventPopover.dataset.nodeId = node.id;
  eventPopover.onpointerenter = clearNodeHoverCloseTimer;
  eventPopover.onpointerleave = scheduleNodeHoverClose;
  eventPopover.querySelector("[data-popover-close]")?.addEventListener("click", closeEventPopover);
  eventPopover.querySelector("[data-gallery-action='prev']")?.addEventListener("click", (event) => {
    event.stopPropagation();
    stepNodeGallery(-1);
  });
  eventPopover.querySelector("[data-gallery-action='next']")?.addEventListener("click", (event) => {
    event.stopPropagation();
    stepNodeGallery(1);
  });
  eventPopover.querySelectorAll("[data-gallery-thumb]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      nodeHoverState.imageIndex = Number(button.dataset.galleryThumb) || 0;
      showNodeHoverPopup(nodeId, anchorElement);
    });
  });
  positionNodeHoverPopup(anchorElement || findNodeElement(node.id));
}

function stepNodeGallery(delta) {
  const node = state.canvas.nodes.find((item) => item.id === nodeHoverState.nodeId);
  const images = visibleGalleryImages(node);
  if (!node || !images.length) {
    return;
  }
  nodeHoverState.imageIndex = (nodeHoverState.imageIndex + delta + images.length) % images.length;
  showNodeHoverPopup(node.id);
}

function positionNodeHoverPopup(anchorElement) {
  const panel = eventPopover?.querySelector(".timeline-event-popover__panel");
  if (!eventPopover || !panel || !anchorElement) {
    return;
  }
  const anchorRect = anchorElement.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const margin = 18;
  const gap = 18;
  let left = anchorRect.right + gap;
  if (left + panelRect.width + margin > window.innerWidth) {
    left = anchorRect.left - panelRect.width - gap;
  }
  left = clamp(left, margin, Math.max(margin, window.innerWidth - panelRect.width - margin));
  let top = anchorRect.top + (anchorRect.height / 2) - (panelRect.height / 2);
  top = clamp(top, margin, Math.max(margin, window.innerHeight - panelRect.height - margin));
  eventPopover.style.setProperty("--popover-left", `${Math.round(left)}px`);
  eventPopover.style.setProperty("--popover-top", `${Math.round(top)}px`);
  eventPopover.dataset.side = left < anchorRect.left ? "left" : "right";
}

function scheduleNodeHoverClose() {
  clearNodeHoverCloseTimer();
  nodeHoverState.closeTimer = window.setTimeout(() => {
    closeEventPopover();
  }, NODE_HOVER_CLOSE_DELAY_MS);
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
  clearNodeHoverCloseTimer();
  nodeHoverState.nodeId = null;
  nodeHoverState.imageIndex = 0;
  eventPopover.hidden = true;
  eventPopover.innerHTML = "";
  eventPopover.onpointerenter = null;
  eventPopover.onpointerleave = null;
  delete eventPopover.dataset.nodeId;
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
    if (state.mode !== "edit") {
      exitEditorFocusMode("editor-toggle");
    }
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
  getEditorViewportState: () => ({ focusMode: editorFocusMode, zoom: editorZoom }),
  getLayerRects,
  testPointerMapping: (clientX, clientY) => clientPointToCanvasPoint({ clientX, clientY })
};

async function initializeJourney() {
  installGlobalControls();
  installJourneyCanvasSync();
  state = loadInitialState();
  await loadJourneyAuthState();
  await fetchRemoteCanvasState();
  render();
  logJourney("Initialized sketch canvas editor.", {
    version: state.version,
    remoteRevision: remoteCanvasMeta.revision,
    remoteExists: remoteCanvasMeta.exists,
    strokes: state.canvas.strokes.length,
    nodes: state.canvas.nodes.length,
    stickers: state.canvas.stickers.length,
    canEdit: canEditJourney()
  });
}

initializeJourney();
