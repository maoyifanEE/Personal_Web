(() => {
  const root = typeof window !== "undefined" ? window : globalThis;
  const STATUS_LABELS = {
    not_configured: "未配置",
    configured: "已配置",
    compatible: "可用",
    invalid: "配置无效",
    incompatible: "协议不兼容"
  };

  const VERDICT_LABELS = {
    ACCEPTED_FOR_UPLOAD: "可加入草稿",
    REVIEW_REQUIRED: "待人工确认",
    BLOCKED: "已阻止",
    REJECTED: "已拒绝",
    PROCESSING: "处理中",
    PASS: "通过",
    WARNING: "警告",
    FAIL: "失败",
    PENDING: "待检测"
  };

  const REVIEW_ISSUES = [
    "VISIBLE_RECTANGLE",
    "HEAVY_WHITE_OR_GRAY_HALO",
    "BACKGROUND_REMAINS",
    "SUBJECT_DAMAGED",
    "TEXT_OR_FINE_DETAIL_DAMAGED",
    "CROP_OR_PADDING_WRONG",
    "OTHER"
  ];
  const PREVIEW_CONTEXTS = ["light", "dark", "web", "journey"];

  function clampByte(value) {
    return Math.max(0, Math.min(255, Number(value) || 0));
  }

  function statusLabel(state) {
    return STATUS_LABELS[state] || state || "未知";
  }

  function verdictLabel(value) {
    return VERDICT_LABELS[value] || value || "待确认";
  }

  function formatPercent(value) {
    if (!Number.isFinite(Number(value))) {
      return "-";
    }
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function sanitizeCssValue(value, fallback = "") {
    const text = String(value || "").trim();
    if (!text || text.length > 160) {
      return fallback;
    }
    return text.replace(/url\(([^)]*)\)/gi, "url([redacted])");
  }

  function computedStyleFor(element) {
    if (!element) {
      return {};
    }
    if (element.__computedStyle) {
      return element.__computedStyle;
    }
    const view = element.ownerDocument?.defaultView || root;
    if (typeof view.getComputedStyle === "function") {
      return view.getComputedStyle(element);
    }
    return {};
  }

  function rectFor(element) {
    if (typeof element?.getBoundingClientRect === "function") {
      return element.getBoundingClientRect();
    }
    return {
      width: Number(element?.renderedWidth || element?.clientWidth || 0),
      height: Number(element?.renderedHeight || element?.clientHeight || 0)
    };
  }

  function queryPreview(container, context, suffix = "") {
    return container?.querySelector?.(`[data-sticker-preview-context="${context}"]${suffix}`) || null;
  }

  function contextFailure(base, failureCode) {
    return {
      ...base,
      rendered: false,
      failureCode
    };
  }

  function emptyBox() {
    return { minX: null, minY: null, maxX: null, maxY: null };
  }

  function extendBox(box, x, y) {
    box.minX = box.minX === null ? x : Math.min(box.minX, x);
    box.minY = box.minY === null ? y : Math.min(box.minY, y);
    box.maxX = box.maxX === null ? x : Math.max(box.maxX, x);
    box.maxY = box.maxY === null ? y : Math.max(box.maxY, y);
  }

  function summarizeAlphaPixels(pixels, width, height) {
    const w = Math.max(0, Math.floor(width));
    const h = Math.max(0, Math.floor(height));
    const total = w * h;
    const expectedLength = total * 4;
    if (!pixels || total <= 0 || pixels.length < expectedLength) {
      return {
        width: 0,
        height: 0,
        totalPixels: 0,
        alphaMin: 0,
        alphaMax: 0,
        fullyTransparentCount: 0,
        fullyOpaqueCount: 0,
        semitransparentCount: 0,
        transparentFraction: 0,
        nonopaqueFraction: 0,
        topBorderNonzeroCount: 0,
        bottomBorderNonzeroCount: 0,
        leftBorderNonzeroCount: 0,
        rightBorderNonzeroCount: 0,
        borderNonzeroCount: 0,
        borderAlphaMax: 0,
        alphaBoundingBoxes: { gt0: emptyBox(), gt8: emptyBox(), gt32: emptyBox() },
        lowAlphaHazeSuspected: false,
        rectangularHazeSuspected: false,
        heavySemitransparentHaloWarning: false
      };
    }

    let alphaMin = 255;
    let alphaMax = 0;
    let fullyTransparentCount = 0;
    let fullyOpaqueCount = 0;
    let semitransparentCount = 0;
    let topBorderNonzeroCount = 0;
    let bottomBorderNonzeroCount = 0;
    let leftBorderNonzeroCount = 0;
    let rightBorderNonzeroCount = 0;
    let borderNonzeroCount = 0;
    let borderAlphaMax = 0;
    let lowAlphaCount = 0;
    const boxes = { gt0: emptyBox(), gt8: emptyBox(), gt32: emptyBox() };

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const alpha = clampByte(pixels[((y * w) + x) * 4 + 3]);
        alphaMin = Math.min(alphaMin, alpha);
        alphaMax = Math.max(alphaMax, alpha);
        if (alpha === 0) {
          fullyTransparentCount += 1;
        } else if (alpha === 255) {
          fullyOpaqueCount += 1;
        } else {
          semitransparentCount += 1;
          if (alpha <= 32) {
            lowAlphaCount += 1;
          }
        }
        if (alpha > 0) {
          extendBox(boxes.gt0, x, y);
        }
        if (alpha > 8) {
          extendBox(boxes.gt8, x, y);
        }
        if (alpha > 32) {
          extendBox(boxes.gt32, x, y);
        }
        if (y === 0 && alpha > 0) topBorderNonzeroCount += 1;
        if (y === h - 1 && alpha > 0) bottomBorderNonzeroCount += 1;
        if (x === 0 && alpha > 0) leftBorderNonzeroCount += 1;
        if (x === w - 1 && alpha > 0) rightBorderNonzeroCount += 1;
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
          if (alpha > 0) {
            borderNonzeroCount += 1;
          }
          borderAlphaMax = Math.max(borderAlphaMax, alpha);
        }
      }
    }

    const borderPixels = Math.max(1, (w * 2) + (h * 2) - 4);
    return {
      width: w,
      height: h,
      totalPixels: total,
      alphaMin,
      alphaMax,
      fullyTransparentCount,
      fullyOpaqueCount,
      semitransparentCount,
      transparentFraction: fullyTransparentCount / total,
      nonopaqueFraction: (total - fullyOpaqueCount) / total,
      topBorderNonzeroCount,
      bottomBorderNonzeroCount,
      leftBorderNonzeroCount,
      rightBorderNonzeroCount,
      borderNonzeroCount,
      borderAlphaMax,
      alphaBoundingBoxes: boxes,
      lowAlphaHazeSuspected: (lowAlphaCount / total) > 0.2,
      rectangularHazeSuspected: (borderNonzeroCount / borderPixels) > 0.35 && borderAlphaMax > 32,
      heavySemitransparentHaloWarning: (semitransparentCount / total) > 0.45
    };
  }

  function normalizeReviewIssues(values) {
    return [...new Set((values || []).map(String))].filter((value) => REVIEW_ISSUES.includes(value)).sort();
  }

  function isRunAcceptableForUpload(run) {
    const compatibility = run?.compatibility || {};
    return Boolean(
      run?.status === "ready_for_review" &&
      compatibility.contractCompatibility === "PASS" &&
      compatibility.resultIntegrity === "PASS" &&
      compatibility.alphaCompatibility === "PASS" &&
      compatibility.journeyRenderCompatibility === "PASS" &&
      compatibility.browserAnalysisCompatibility === "PASS" &&
      compatibility.toolQualityVerdict !== "FAIL" &&
      compatibility.overallHandoffVerdict === "REVIEW_REQUIRED"
    );
  }

  function canUploadAfterReview(run) {
    const compatibility = run?.compatibility || {};
    return Boolean(
      run?.userVisualVerdict === "ACCEPTED" &&
      compatibility.userVisualVerdict === "ACCEPTED" &&
      compatibility.overallHandoffVerdict === "ACCEPTED_FOR_UPLOAD"
    );
  }

  async function analyzeImageElementAlpha(image) {
    if (typeof document === "undefined") {
      return summarizeAlphaPixels(null, 0, 0);
    }
    const width = image?.naturalWidth || image?.width || 0;
    const height = image?.naturalHeight || image?.height || 0;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !width || !height) {
      return summarizeAlphaPixels(null, 0, 0);
    }
    context.drawImage(image, 0, 0, width, height);
    return summarizeAlphaPixels(context.getImageData(0, 0, width, height).data, width, height);
  }

  async function waitForPreviewImage(image) {
    if (!image) {
      return;
    }
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch (_error) {
          // The later matrix inspection records decode/layout failure.
        }
      }
      return;
    }
    if (typeof image.decode === "function") {
      try {
        await image.decode();
        return;
      } catch (_error) {
        // Fall back to event listeners when available.
      }
    }
    if (typeof image.addEventListener !== "function") {
      return;
    }
    await new Promise((resolve) => {
      const done = () => {
        image.removeEventListener("load", done);
        image.removeEventListener("error", done);
        resolve();
      };
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
      setTimeout(done, 1200);
    });
  }

  async function settleLayout() {
    if (typeof root.requestAnimationFrame !== "function") {
      return;
    }
    await new Promise((resolve) => root.requestAnimationFrame(() => resolve()));
  }

  async function inspectRenderedPreviewMatrix(container) {
    const matrix = {};
    const expectedNaturalWidth = Number(container?.dataset?.processedOutputNaturalWidth || 0);
    const expectedNaturalHeight = Number(container?.dataset?.processedOutputNaturalHeight || 0);
    for (const context of PREVIEW_CONTEXTS) {
      const frame = queryPreview(container, context);
      const image = queryPreview(container, context, " img[data-sticker-preview-image]") ||
        queryPreview(container, context, " img:not([data-sticker-preview-background])");
      await waitForPreviewImage(image);
      await settleLayout();
      const style = computedStyleFor(frame);
      const imageStyle = computedStyleFor(image);
      const frameRect = rectFor(frame);
      const imageRect = rectFor(image);
      const frameOpacity = Number(style.opacity ?? 1);
      const imageOpacity = Number(imageStyle.opacity ?? 1);
      const backgroundImage = String(style.backgroundImage || "none");
      const base = {
        rendered: false,
        imageComplete: Boolean(image?.complete),
        naturalWidth: Math.max(0, Math.floor(Number(image?.naturalWidth || 0))),
        naturalHeight: Math.max(0, Math.floor(Number(image?.naturalHeight || 0))),
        renderedWidth: Number(frameRect.width || 0),
        renderedHeight: Number(frameRect.height || 0),
        frameRenderedWidth: Number(frameRect.width || 0),
        frameRenderedHeight: Number(frameRect.height || 0),
        imageRenderedWidth: Number(imageRect.width || 0),
        imageRenderedHeight: Number(imageRect.height || 0),
        imageDisplay: sanitizeCssValue(imageStyle.display, "inline"),
        imageVisibility: sanitizeCssValue(imageStyle.visibility, "visible"),
        imageOpacity: Number.isFinite(imageOpacity) ? imageOpacity : 1,
        visible: Boolean(
          frame &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          frameOpacity > 0 &&
          Number(frameRect.width || 0) > 0 &&
          Number(frameRect.height || 0) > 0
        ),
        backgroundColor: sanitizeCssValue(style.backgroundColor, "rgba(0, 0, 0, 0)"),
        backgroundImagePresent: Boolean(backgroundImage && backgroundImage !== "none"),
        contextSource: sanitizeCssValue(frame?.dataset?.contextSource || "", "unknown"),
        evidenceSource: "browser-rendered-composite",
        journeyBackgroundImagePresent: frame?.dataset?.journeyBackgroundImagePresent === "true",
        journeyBackgroundImageComplete: frame?.dataset?.journeyBackgroundImageComplete === "true",
        journeyBackgroundNaturalWidth: Math.max(0, Math.floor(Number(frame?.dataset?.journeyBackgroundNaturalWidth || 0))),
        journeyBackgroundNaturalHeight: Math.max(0, Math.floor(Number(frame?.dataset?.journeyBackgroundNaturalHeight || 0))),
        journeyBackgroundObjectFit: sanitizeCssValue(frame?.dataset?.journeyBackgroundObjectFit || "", "none"),
        journeyBackgroundObjectPosition: sanitizeCssValue(frame?.dataset?.journeyBackgroundObjectPosition || "", "50% 50%"),
        journeyBackgroundOpacity: Number(frame?.dataset?.journeyBackgroundOpacity || 0),
        webBackgroundCaptureSupported: frame?.dataset?.webBackgroundCaptureSupported !== "false",
        failureCode: null
      };
      if (!frame) {
        matrix[context] = contextFailure(base, "CONTAINER_MISSING");
      } else if (!image) {
        matrix[context] = contextFailure(base, "IMAGE_MISSING");
      } else if (!base.imageComplete) {
        matrix[context] = contextFailure(base, "IMAGE_NOT_COMPLETE");
      } else if (base.naturalWidth <= 0 || base.naturalHeight <= 0) {
        matrix[context] = contextFailure(base, "ZERO_NATURAL_SIZE");
      } else if (
        expectedNaturalWidth > 0 &&
        expectedNaturalHeight > 0 &&
        (base.naturalWidth !== expectedNaturalWidth || base.naturalHeight !== expectedNaturalHeight)
      ) {
        matrix[context] = contextFailure(base, "PREVIEW_OUTPUT_DIMENSION_MISMATCH");
      } else if (base.frameRenderedWidth <= 0 || base.frameRenderedHeight <= 0) {
        matrix[context] = contextFailure(base, "ZERO_FRAME_RENDERED_SIZE");
      } else if (base.imageRenderedWidth <= 0 || base.imageRenderedHeight <= 0) {
        matrix[context] = contextFailure(base, "ZERO_IMAGE_RENDERED_SIZE");
      } else if (style.display === "none") {
        matrix[context] = contextFailure(base, "FRAME_DISPLAY_NONE");
      } else if (style.visibility === "hidden") {
        matrix[context] = contextFailure(base, "FRAME_VISIBILITY_HIDDEN");
      } else if (frameOpacity <= 0) {
        matrix[context] = contextFailure(base, "FRAME_OPACITY_ZERO");
      } else if (base.imageDisplay === "none") {
        matrix[context] = contextFailure(base, "IMAGE_DISPLAY_NONE");
      } else if (base.imageVisibility === "hidden") {
        matrix[context] = contextFailure(base, "IMAGE_VISIBILITY_HIDDEN");
      } else if (base.imageOpacity <= 0) {
        matrix[context] = contextFailure(base, "IMAGE_OPACITY_ZERO");
      } else if (!frame.dataset?.contextSource || frame.dataset.contextSource === "unknown") {
        matrix[context] = contextFailure(base, "CONTEXT_SOURCE_MISSING");
      } else if ((context === "web" || context === "journey") && frame.dataset.backgroundDerived !== "true") {
        matrix[context] = contextFailure(base, "BACKGROUND_CONTEXT_NOT_DERIVED");
      } else if (context === "journey" && frame.dataset.journeyBackgroundCaptureFailed === "true") {
        matrix[context] = contextFailure(base, "JOURNEY_BACKGROUND_CAPTURE_FAILED");
      } else {
        matrix[context] = {
          ...base,
          rendered: true,
          failureCode: null
        };
      }
    }
    return matrix;
  }

  function isPreviewMatrixComplete(matrix) {
    return PREVIEW_CONTEXTS.every((context) => matrix?.[context]?.rendered === true);
  }

  async function capturePreviewPng(frame) {
    if (typeof document === "undefined") {
      throw new Error("CAPTURE_UNSUPPORTED");
    }
    const image = frame?.querySelector?.("img[data-sticker-preview-image]") ||
      frame?.querySelector?.("img:not([data-sticker-preview-background])");
    const backgroundImage = frame?.querySelector?.("img[data-sticker-preview-background]");
    const style = computedStyleFor(frame);
    if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
      throw new Error("IMAGE_NOT_READY");
    }
    const cssBackgroundImage = String(style.backgroundImage || "none");
    if (cssBackgroundImage !== "none") {
      if (/gradient\(/i.test(cssBackgroundImage)) {
        throw new Error("CSS_GRADIENT_CAPTURE_UNSUPPORTED");
      }
      throw new Error("CSS_BACKGROUND_IMAGE_CAPTURE_UNSUPPORTED");
    }
    const rect = rectFor(frame);
    const width = Math.max(1, Math.min(1024, Math.round(rect.width || image.naturalWidth)));
    const height = Math.max(1, Math.min(1024, Math.round(rect.height || image.naturalHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("CANVAS_UNSUPPORTED");
    }
    context.fillStyle = sanitizeCssValue(style.backgroundColor, "rgba(255, 255, 255, 1)");
    context.fillRect(0, 0, width, height);
    if (backgroundImage) {
      if (!backgroundImage.complete || !backgroundImage.naturalWidth || !backgroundImage.naturalHeight) {
        throw new Error("JOURNEY_BACKGROUND_CAPTURE_FAILED");
      }
      context.globalAlpha = Number(frame?.dataset?.journeyBackgroundOpacity || 1);
      try {
        context.drawImage(backgroundImage, 0, 0, width, height);
      } catch (_error) {
        throw new Error("CROSS_ORIGIN_BACKGROUND_CAPTURE_BLOCKED");
      }
      context.globalAlpha = 1;
    }
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG_BLOB_FAILED"));
        } else {
          resolve(blob);
        }
      }, "image/png");
    });
  }

  root.JourneyStickerTool = {
    PREVIEW_CONTEXTS,
    REVIEW_ISSUES,
    analyzeImageElementAlpha,
    canUploadAfterReview,
    capturePreviewPng,
    formatPercent,
    inspectRenderedPreviewMatrix,
    isRunAcceptableForUpload,
    isPreviewMatrixComplete,
    normalizeReviewIssues,
    statusLabel,
    summarizeAlphaPixels,
    verdictLabel
  };

  if (typeof module !== "undefined") {
    module.exports = root.JourneyStickerTool;
  }
})();
