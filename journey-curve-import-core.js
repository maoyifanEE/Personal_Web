(function initJourneyCurveImportCore(globalScope) {
  "use strict";

  const MAX_IMPORT_POINTS = 10000;
  const MIN_IMPORT_POINTS = 2;
  const DEFAULT_COLOR_THRESHOLD = 45;
  const DEFAULT_ALPHA_THRESHOLD = 30;
  const MAX_COMPONENTS = 2000;
  const SOLID_COMPONENT_ERROR = "当前图片看起来是连续实线，自动识别暂不可靠。请使用透明底虚线/点线图片，或导入曲线 JSON。";
  const LOW_CONFIDENCE_ERROR = "曲线片段无法可靠连接。请使用单条、透明底、高对比度的虚线图片，或改用 JSON 导入。";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function median(values) {
    if (!values.length) {
      return 0;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function normalizeImportedPoints(points) {
    if (!Array.isArray(points)) {
      throw new Error("曲线 JSON 缺少 points 数组。");
    }
    if (points.length < MIN_IMPORT_POINTS) {
      throw new Error("曲线至少需要 2 个点。");
    }
    if (points.length > MAX_IMPORT_POINTS) {
      throw new Error("曲线点数过多，请减少到 10000 个以内。");
    }
    return points.map((point, index) => {
      const x = finiteNumber(point && point.x);
      const y = finiteNumber(point && point.y);
      if (x === null || y === null) {
        throw new Error(`第 ${index + 1} 个点不是有效坐标。`);
      }
      return { x, y };
    });
  }

  function parseCurveJsonText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("JSON 格式无效，请检查文件内容。");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("曲线 JSON 必须是一个对象。");
    }

    const coordinateSpace = parsed.coordinateSpace || "source-pixels";
    const points = normalizeImportedPoints(parsed.points);
    let sourceWidth = finiteNumber(parsed.source?.width ?? parsed.sourceWidth);
    let sourceHeight = finiteNumber(parsed.source?.height ?? parsed.sourceHeight);

    if (coordinateSpace === "normalized") {
      points.forEach((point, index) => {
        if (point.x < -0.001 || point.x > 1.001 || point.y < -0.001 || point.y > 1.001) {
          throw new Error(`第 ${index + 1} 个归一化坐标超出 0..1 范围。`);
        }
      });
      sourceWidth = sourceWidth || 1;
      sourceHeight = sourceHeight || 1;
    } else if (coordinateSpace === "source-pixels") {
      if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error("source-pixels 坐标需要有效的源宽高。");
      }
      if (sourceWidth > 100000 || sourceHeight > 100000) {
        throw new Error("源图片尺寸不合理。");
      }
    } else {
      throw new Error("不支持的 coordinateSpace。");
    }

    return {
      version: typeof parsed.version === "string" ? parsed.version : "minimal",
      coordinateSpace,
      source: {
        width: sourceWidth,
        height: sourceHeight
      },
      points
    };
  }

  function sampleCornerBackground(data, width, height) {
    const patch = Math.max(2, Math.min(12, Math.floor(Math.min(width, height) * 0.04)));
    const samples = [];
    const origins = [
      [0, 0],
      [Math.max(0, width - patch), 0],
      [0, Math.max(0, height - patch)],
      [Math.max(0, width - patch), Math.max(0, height - patch)]
    ];
    origins.forEach(([startX, startY]) => {
      for (let y = startY; y < Math.min(height, startY + patch); y += 1) {
        for (let x = startX; x < Math.min(width, startX + patch); x += 1) {
          const offset = (y * width + x) * 4;
          samples.push([data[offset], data[offset + 1], data[offset + 2]]);
        }
      }
    });
    return {
      r: median(samples.map((sample) => sample[0])),
      g: median(samples.map((sample) => sample[1])),
      b: median(samples.map((sample) => sample[2]))
    };
  }

  function buildForegroundMask(imageData, options = {}) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
      throw new Error("图片像素数据无效。");
    }
    const { data, width, height } = imageData;
    const alphaThreshold = finiteNumber(options.alphaThreshold) ?? DEFAULT_ALPHA_THRESHOLD;
    const colorThreshold = finiteNumber(options.colorThreshold) ?? DEFAULT_COLOR_THRESHOLD;
    const pixelCount = width * height;
    const mask = new Uint8Array(pixelCount);
    let transparentCount = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      if (data[index * 4 + 3] < 245) {
        transparentCount += 1;
      }
    }
    const transparentMode = transparentCount / Math.max(1, pixelCount) > 0.01;
    const background = transparentMode ? null : sampleCornerBackground(data, width, height);
    let foregroundCount = 0;

    for (let index = 0; index < pixelCount; index += 1) {
      const offset = index * 4;
      let foreground = false;
      if (transparentMode) {
        foreground = data[offset + 3] >= alphaThreshold;
      } else {
        const dr = data[offset] - background.r;
        const dg = data[offset + 1] - background.g;
        const db = data[offset + 2] - background.b;
        foreground = Math.hypot(dr, dg, db) >= colorThreshold;
      }
      if (foreground) {
        mask[index] = 1;
        foregroundCount += 1;
      }
    }

    return {
      mask,
      width,
      height,
      mode: transparentMode ? "alpha" : "opaque",
      background,
      foregroundCount
    };
  }

  function findConnectedComponents(maskInput, width, height, options = {}) {
    const mask = maskInput.mask || maskInput;
    const maxComponents = options.maxComponents || MAX_COMPONENTS;
    const minArea = Math.max(1, Math.floor(options.minArea || 2));
    const visited = new Uint8Array(width * height);
    const components = [];
    const queue = [];
    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1]
    ];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const startIndex = y * width + x;
        if (!mask[startIndex] || visited[startIndex]) {
          continue;
        }
        let area = 0;
        let sumX = 0;
        let sumY = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        queue.length = 0;
        queue.push(startIndex);
        visited[startIndex] = 1;

        for (let head = 0; head < queue.length; head += 1) {
          const current = queue[head];
          const cx = current % width;
          const cy = Math.floor(current / width);
          area += 1;
          sumX += cx;
          sumY += cy;
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
          neighbors.forEach(([dx, dy]) => {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
              return;
            }
            const next = ny * width + nx;
            if (mask[next] && !visited[next]) {
              visited[next] = 1;
              queue.push(next);
            }
          });
        }

        if (area >= minArea) {
          const componentWidth = maxX - minX + 1;
          const componentHeight = maxY - minY + 1;
          components.push({
            id: `component-${components.length + 1}`,
            area,
            centroid: { x: sumX / area, y: sumY / area },
            bbox: { minX, minY, maxX, maxY },
            width: componentWidth,
            height: componentHeight,
            aspectRatio: componentWidth / Math.max(1, componentHeight),
            fillRatio: area / Math.max(1, componentWidth * componentHeight)
          });
          if (components.length > maxComponents) {
            throw new Error("识别到的片段过多，请使用更干净的图片。");
          }
        }
      }
    }

    if (!components.length) {
      throw new Error("没有识别到可导入的曲线片段。");
    }

    const areas = components.map((component) => component.area);
    const medianArea = median(areas);
    const tinyCutoff = Math.max(minArea, medianArea * 0.12);
    const filtered = components.filter((component) => component.area >= tinyCutoff);
    if (!filtered.length) {
      throw new Error("曲线片段太少，无法导入。");
    }
    return filtered.map((component, index) => ({ ...component, id: `component-${index + 1}` }));
  }

  function detectStartMarker(components, options = {}) {
    if (!components.length) {
      return null;
    }
    const medianArea = median(components.map((component) => component.area));
    const maxEdgeDistance = options.maxEdgeDistance || Infinity;
    let best = null;
    components.forEach((component) => {
      const squareRatio = Math.min(component.width, component.height) / Math.max(component.width, component.height);
      const nearEdge = Math.min(
        component.bbox.minX,
        component.bbox.minY,
        Math.abs((options.width || 0) - component.bbox.maxX),
        Math.abs((options.height || 0) - component.bbox.maxY)
      ) <= maxEdgeDistance;
      const markerScore = (component.area / Math.max(1, medianArea)) * squareRatio * component.fillRatio;
      if (
        component.area >= medianArea * 3 &&
        squareRatio >= 0.55 &&
        component.fillRatio >= 0.22 &&
        (!options.preferEdge || nearEdge) &&
        (!best || markerScore > best.score)
      ) {
        best = { component, score: markerScore };
      }
    });
    return best?.component || null;
  }

  function orderRouteComponents(components, options = {}) {
    if (!components.length) {
      throw new Error("没有可排序的曲线片段。");
    }
    const marker = options.startMarker || null;
    const routeComponents = marker
      ? components.filter((component) => component.id !== marker.id)
      : components.slice();
    if (!routeComponents.length) {
      throw new Error("只识别到起点标记，没有识别到曲线片段。");
    }
    if (routeComponents.length === 1) {
      const points = marker
        ? [{ ...marker.centroid }, { ...routeComponents[0].centroid }]
        : [{ ...routeComponents[0].centroid }];
      return { points, usedCount: routeComponents.length, confidence: 1, components: routeComponents };
    }

    const startComponent = marker
      ? routeComponents.reduce((best, component) =>
        pointDistance(component.centroid, marker.centroid) < pointDistance(best.centroid, marker.centroid) ? component : best
      )
      : routeComponents.reduce((best, component) =>
        component.centroid.y < best.centroid.y ||
        (component.centroid.y === best.centroid.y && component.centroid.x < best.centroid.x) ? component : best
      );
    const unvisited = new Set(routeComponents.map((component) => component.id));
    const byId = new Map(routeComponents.map((component) => [component.id, component]));
    const ordered = [];
    let current = startComponent;
    let previousDirection = marker
      ? {
        x: current.centroid.x - marker.centroid.x,
        y: current.centroid.y - marker.centroid.y
      }
      : null;

    while (current && unvisited.size) {
      ordered.push(current);
      unvisited.delete(current.id);
      if (!unvisited.size) {
        break;
      }
      const candidates = [...unvisited].map((id) => byId.get(id))
        .map((component) => {
          const dx = component.centroid.x - current.centroid.x;
          const dy = component.centroid.y - current.centroid.y;
          const d = Math.hypot(dx, dy);
          let anglePenalty = 0;
          if (previousDirection && d > 0.000001) {
            const prevLength = Math.hypot(previousDirection.x, previousDirection.y) || 1;
            const dot = ((previousDirection.x / prevLength) * (dx / d)) + ((previousDirection.y / prevLength) * (dy / d));
            anglePenalty = (1 - clamp(dot, -1, 1)) * d * 0.55;
          }
          return {
            component,
            distance: d,
            score: d + anglePenalty
          };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 8);
      const next = candidates[0]?.component || null;
      if (!next) {
        break;
      }
      previousDirection = {
        x: next.centroid.x - current.centroid.x,
        y: next.centroid.y - current.centroid.y
      };
      current = next;
    }

    const points = marker
      ? [{ ...marker.centroid }, ...ordered.map((component) => ({ ...component.centroid }))]
      : ordered.map((component) => ({ ...component.centroid }));
    const validation = validateOrderedRoute(points, {
      minPoints: 2,
      maxGapFactor: options.maxGapFactor || 7
    });
    if (!validation.ok) {
      const error = new Error(LOW_CONFIDENCE_ERROR);
      error.code = "LOW_CONFIDENCE";
      error.validation = validation;
      throw error;
    }
    return {
      points,
      usedCount: ordered.length,
      confidence: validation.confidence,
      components: ordered,
      validation
    };
  }

  function validateOrderedRoute(points, options = {}) {
    if (!Array.isArray(points) || points.length < (options.minPoints || 2)) {
      return { ok: false, reason: "too-few-points", confidence: 0 };
    }
    if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      return { ok: false, reason: "non-finite-point", confidence: 0 };
    }
    const gaps = [];
    for (let index = 1; index < points.length; index += 1) {
      gaps.push(pointDistance(points[index - 1], points[index]));
    }
    const medianGap = median(gaps.filter((gap) => gap > 0));
    const maxGap = Math.max(...gaps);
    if (!Number.isFinite(medianGap) || medianGap <= 0) {
      return { ok: false, reason: "zero-length-route", confidence: 0 };
    }
    const maxGapFactor = options.maxGapFactor || 7;
    if (maxGap > medianGap * maxGapFactor && maxGap > 24) {
      return {
        ok: false,
        reason: "large-gap",
        medianGap,
        maxGap,
        confidence: clamp((medianGap * maxGapFactor) / maxGap, 0, 1)
      };
    }
    return {
      ok: true,
      medianGap,
      maxGap,
      confidence: clamp(1 - (maxGap / Math.max(1, medianGap * maxGapFactor)) * 0.25, 0.1, 1)
    };
  }

  function mapCurvePoints(points, sourceSize, targetSize, fitMode = "stretch") {
    const sourceWidth = finiteNumber(sourceSize?.width);
    const sourceHeight = finiteNumber(sourceSize?.height);
    const targetWidth = finiteNumber(targetSize?.width);
    const targetHeight = finiteNumber(targetSize?.height);
    if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
      throw new Error("源尺寸或目标画布尺寸无效。");
    }
    let scaleX = targetWidth / sourceWidth;
    let scaleY = targetHeight / sourceHeight;
    let offsetX = 0;
    let offsetY = 0;
    if (fitMode === "contain") {
      const scale = Math.min(scaleX, scaleY);
      scaleX = scale;
      scaleY = scale;
      offsetX = (targetWidth - sourceWidth * scale) / 2;
      offsetY = (targetHeight - sourceHeight * scale) / 2;
    } else if (fitMode !== "stretch") {
      throw new Error("不支持的映射方式。");
    }
    return normalizeImportedPoints(points).map((point) => ({
      x: clamp((point.x * scaleX) + offsetX, 0, targetWidth),
      y: clamp((point.y * scaleY) + offsetY, 0, targetHeight)
    }));
  }

  function reverseCurvePoints(points) {
    return normalizeImportedPoints(points).slice().reverse();
  }

  function buildImportedStroke(points, options = {}) {
    const normalized = normalizeImportedPoints(points);
    return {
      id: options.id || `stroke-${Date.now().toString(36)}`,
      points: normalized,
      width: clamp(Math.round(finiteNumber(options.width) || 8), 2, 40),
      createdAt: options.now || new Date().toISOString(),
      updatedAt: options.now || new Date().toISOString()
    };
  }

  function traceMaskToRoute(maskResult, options = {}) {
    const components = findConnectedComponents(maskResult.mask || maskResult, maskResult.width, maskResult.height, options);
    if (components.length === 1) {
      const error = new Error(SOLID_COMPONENT_ERROR);
      error.code = "SOLID_UNSUPPORTED";
      throw error;
    }
    const marker = detectStartMarker(components, {
      width: maskResult.width,
      height: maskResult.height,
      preferEdge: false,
      maxEdgeDistance: Math.max(maskResult.width, maskResult.height) * 0.25
    });
    const ordered = orderRouteComponents(components, {
      startMarker: marker,
      maxGapFactor: options.maxGapFactor || 7
    });
    return {
      points: ordered.points,
      components,
      marker,
      orderedComponents: ordered.components,
      usedCount: ordered.usedCount,
      confidence: ordered.confidence,
      validation: ordered.validation
    };
  }

  const api = {
    MAX_IMPORT_POINTS,
    SOLID_COMPONENT_ERROR,
    LOW_CONFIDENCE_ERROR,
    parseCurveJsonText,
    buildForegroundMask,
    findConnectedComponents,
    detectStartMarker,
    orderRouteComponents,
    validateOrderedRoute,
    mapCurvePoints,
    reverseCurvePoints,
    normalizeImportedPoints,
    buildImportedStroke,
    traceMaskToRoute
  };

  globalScope.JourneyCurveImportCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
