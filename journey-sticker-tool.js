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
    ACCEPTED_FOR_UPLOAD: "可上传",
    REVIEW_REQUIRED: "待人工确认",
    BLOCKED: "不建议使用",
    PASS: "通过",
    FAIL: "失败"
  };

  const clampByte = (value) => Math.max(0, Math.min(255, Number(value) || 0));

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

  function summarizeAlphaPixels(pixels, width, height) {
    const total = Math.max(0, Math.floor(width) * Math.floor(height));
    if (!pixels || total <= 0 || pixels.length < total * 4) {
      return {
        width: 0,
        height: 0,
        alphaMin: 0,
        alphaMax: 0,
        fullyTransparentCount: 0,
        fullyOpaqueCount: 0,
        semitransparentCount: 0,
        transparentFraction: 0,
        nonopaqueFraction: 0,
        borderNonzeroCount: 0,
        borderAlphaMax: 0
      };
    }

    let alphaMin = 255;
    let alphaMax = 0;
    let fullyTransparentCount = 0;
    let fullyOpaqueCount = 0;
    let semitransparentCount = 0;
    let borderNonzeroCount = 0;
    let borderAlphaMax = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = clampByte(pixels[((y * width) + x) * 4 + 3]);
        alphaMin = Math.min(alphaMin, alpha);
        alphaMax = Math.max(alphaMax, alpha);
        if (alpha === 0) {
          fullyTransparentCount += 1;
        } else if (alpha === 255) {
          fullyOpaqueCount += 1;
        } else {
          semitransparentCount += 1;
        }
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          if (alpha > 0) {
            borderNonzeroCount += 1;
          }
          borderAlphaMax = Math.max(borderAlphaMax, alpha);
        }
      }
    }

    return {
      width,
      height,
      alphaMin,
      alphaMax,
      fullyTransparentCount,
      fullyOpaqueCount,
      semitransparentCount,
      transparentFraction: fullyTransparentCount / total,
      nonopaqueFraction: (total - fullyOpaqueCount) / total,
      borderNonzeroCount,
      borderAlphaMax
    };
  }

  function analyzeImageElementAlpha(image) {
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

  root.JourneyStickerTool = {
    analyzeImageElementAlpha,
    formatPercent,
    statusLabel,
    summarizeAlphaPixels,
    verdictLabel
  };

  if (typeof module !== "undefined") {
    module.exports = root.JourneyStickerTool;
  }
})();
