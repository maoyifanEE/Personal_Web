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

  function completePreviewMatrix() {
    return { light: true, dark: true, web: true, journey: true };
  }

  root.JourneyStickerTool = {
    REVIEW_ISSUES,
    analyzeImageElementAlpha,
    canUploadAfterReview,
    completePreviewMatrix,
    formatPercent,
    isRunAcceptableForUpload,
    normalizeReviewIssues,
    statusLabel,
    summarizeAlphaPixels,
    verdictLabel
  };

  if (typeof module !== "undefined") {
    module.exports = root.JourneyStickerTool;
  }
})();
