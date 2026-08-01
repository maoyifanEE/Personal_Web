const assert = require("assert");
const fs = require("fs");
const path = require("path");
const tool = require("../journey-sticker-tool.js");

function rgbaPixels(alphas) {
  const pixels = new Uint8ClampedArray(alphas.length * 4);
  alphas.forEach((alpha, index) => {
    pixels[(index * 4)] = 20;
    pixels[(index * 4) + 1] = 120;
    pixels[(index * 4) + 2] = 130;
    pixels[(index * 4) + 3] = alpha;
  });
  return pixels;
}

const metrics = tool.summarizeAlphaPixels(
  rgbaPixels([
    0, 255,
    32, 255
  ]),
  2,
  2
);

assert.strictEqual(metrics.width, 2);
assert.strictEqual(metrics.height, 2);
assert.strictEqual(metrics.totalPixels, 4);
assert.strictEqual(metrics.fullyTransparentCount, 1);
assert.strictEqual(metrics.fullyOpaqueCount, 2);
assert.strictEqual(metrics.semitransparentCount, 1);
assert.strictEqual(metrics.borderNonzeroCount, 3);
assert.strictEqual(metrics.alphaBoundingBoxes.gt0.minX, 0);
assert.strictEqual(metrics.alphaBoundingBoxes.gt0.maxX, 1);

assert.deepStrictEqual(
  tool.normalizeReviewIssues(["OTHER", "BAD", "VISIBLE_RECTANGLE", "OTHER"]),
  ["OTHER", "VISIBLE_RECTANGLE"]
);

const reviewReadyRun = {
  status: "ready_for_review",
  compatibility: {
    contractCompatibility: "PASS",
    resultIntegrity: "PASS",
    alphaCompatibility: "PASS",
    journeyRenderCompatibility: "PASS",
    browserAnalysisCompatibility: "PASS",
    toolQualityVerdict: "PASS",
    overallHandoffVerdict: "REVIEW_REQUIRED"
  }
};

assert.strictEqual(tool.isRunAcceptableForUpload(reviewReadyRun), true);
assert.strictEqual(
  tool.isRunAcceptableForUpload({
    ...reviewReadyRun,
    compatibility: {
      ...reviewReadyRun.compatibility,
      browserAnalysisCompatibility: "PENDING"
    }
  }),
  false
);

assert.strictEqual(
  tool.canUploadAfterReview({
    userVisualVerdict: "ACCEPTED",
    compatibility: {
      userVisualVerdict: "ACCEPTED",
      overallHandoffVerdict: "ACCEPTED_FOR_UPLOAD"
    }
  }),
  true
);

function fakeFrame(context, overrides = {}) {
  const image = overrides.image === undefined ? {
    complete: true,
    naturalWidth: 80,
    naturalHeight: 60,
    dataset: {},
    __computedStyle: {
      display: overrides.imageDisplay || "block",
      visibility: overrides.imageVisibility || "visible",
      opacity: overrides.imageOpacity ?? "1"
    },
    getBoundingClientRect: () => ({
      width: overrides.imageRenderedWidth ?? 100,
      height: overrides.imageRenderedHeight ?? 75
    })
  } : overrides.image;
  const frame = {
    dataset: {
      contextSource: overrides.contextSource,
      backgroundDerived: overrides.backgroundDerived ?? "true",
      journeyBackgroundImagePresent: overrides.journeyBackgroundImagePresent ?? "false",
      journeyBackgroundImageComplete: overrides.journeyBackgroundImageComplete ?? "false",
      journeyBackgroundNaturalWidth: overrides.journeyBackgroundNaturalWidth ?? "0",
      journeyBackgroundNaturalHeight: overrides.journeyBackgroundNaturalHeight ?? "0",
      journeyBackgroundObjectFit: overrides.journeyBackgroundObjectFit || "",
      journeyBackgroundObjectPosition: overrides.journeyBackgroundObjectPosition || "",
      journeyBackgroundOpacity: overrides.journeyBackgroundOpacity || "",
      journeyBackgroundCaptureFailed: overrides.journeyBackgroundCaptureFailed ?? "false"
    },
    __computedStyle: {
      display: overrides.display || "block",
      visibility: overrides.visibility || "visible",
      opacity: overrides.opacity ?? "1",
      backgroundColor: overrides.backgroundColor || "rgb(255, 255, 255)",
      backgroundImage: overrides.backgroundImage || "none"
    },
    getBoundingClientRect: () => ({
      width: overrides.renderedWidth ?? 120,
      height: overrides.renderedHeight ?? 120
    }),
    querySelector: (selector) => selector.includes("img") ? image : null
  };
  return [context, frame];
}

function fakeContainer(entries, options = {}) {
  const frames = Object.fromEntries(entries);
  return {
    dataset: {
      processedOutputNaturalWidth: String(options.processedOutputNaturalWidth || ""),
      processedOutputNaturalHeight: String(options.processedOutputNaturalHeight || "")
    },
    querySelector(selector) {
      const match = selector.match(/data-sticker-preview-context="([^"]+)"/);
      const context = match?.[1];
      if (!context || !frames[context]) {
        return null;
      }
      if (selector.includes(" img")) {
        return frames[context].querySelector("img");
      }
      return frames[context];
    }
  };
}

async function runPreviewTests() {
  const valid = fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]);
  const validMatrix = await tool.inspectRenderedPreviewMatrix(valid);
  assert.strictEqual(tool.isPreviewMatrixComplete(validMatrix), true);
  assert.strictEqual(validMatrix.light.rendered, true);
  assert.strictEqual(validMatrix.web.contextSource, "web-computed");

  const journeyBackground = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", {
      contextSource: "journey-computed",
      journeyBackgroundImagePresent: "true",
      journeyBackgroundImageComplete: "true",
      journeyBackgroundNaturalWidth: "640",
      journeyBackgroundNaturalHeight: "360",
      journeyBackgroundObjectFit: "cover",
      journeyBackgroundObjectPosition: "50% 50%",
      journeyBackgroundOpacity: "0.75"
    })
  ]));
  assert.strictEqual(journeyBackground.journey.rendered, true);
  assert.strictEqual(journeyBackground.journey.journeyBackgroundImagePresent, true);
  assert.strictEqual(journeyBackground.journey.journeyBackgroundObjectFit, "cover");

  const missingContainer = await tool.inspectRenderedPreviewMatrix(null);
  assert.strictEqual(missingContainer.light.rendered, false);
  assert.strictEqual(missingContainer.light.failureCode, "CONTAINER_MISSING");

  const missingImage = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", image: null }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(missingImage.light.failureCode, "IMAGE_MISSING");

  const notComplete = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", image: { complete: false, naturalWidth: 80, naturalHeight: 60 } }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(notComplete.light.failureCode, "IMAGE_NOT_COMPLETE");

  const zeroNatural = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", image: { complete: true, naturalWidth: 0, naturalHeight: 60 } }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(zeroNatural.light.failureCode, "ZERO_NATURAL_SIZE");

  const wrongNatural = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", image: {
      complete: true,
      naturalWidth: 48,
      naturalHeight: 48,
      __computedStyle: { display: "block", visibility: "visible", opacity: "1" },
      getBoundingClientRect: () => ({ width: 100, height: 100 })
    } }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ], { processedOutputNaturalWidth: 80, processedOutputNaturalHeight: 60 }));
  assert.strictEqual(wrongNatural.light.failureCode, "PREVIEW_OUTPUT_DIMENSION_MISMATCH");

  const zeroRendered = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", renderedWidth: 0 }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(zeroRendered.light.failureCode, "ZERO_FRAME_RENDERED_SIZE");

  const displayNone = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", display: "none" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(displayNone.light.failureCode, "FRAME_DISPLAY_NONE");

  const hidden = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", visibility: "hidden" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(hidden.light.failureCode, "FRAME_VISIBILITY_HIDDEN");

  const transparent = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", opacity: "0" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(transparent.light.failureCode, "FRAME_OPACITY_ZERO");

  const imageDisplayNone = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", imageDisplay: "none" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(imageDisplayNone.light.failureCode, "IMAGE_DISPLAY_NONE");

  const imageHidden = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", imageVisibility: "hidden" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(imageHidden.light.failureCode, "IMAGE_VISIBILITY_HIDDEN");

  const imageTransparent = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", imageOpacity: "0" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(imageTransparent.light.failureCode, "IMAGE_OPACITY_ZERO");

  const zeroImageRendered = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", imageRenderedWidth: 0 }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(zeroImageRendered.light.failureCode, "ZERO_IMAGE_RENDERED_SIZE");

  const incomplete = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed", backgroundDerived: "false" })
  ]));
  assert.strictEqual(tool.isPreviewMatrixComplete(incomplete), false);
  assert.strictEqual(incomplete.journey.failureCode, "BACKGROUND_CONTEXT_NOT_DERIVED");

  const previousDocument = global.document;
  global.document = { createElement: () => ({}) };
  try {
    await assert.rejects(
      tool.capturePreviewPng(fakeFrame("web", {
        contextSource: "web-computed",
        backgroundImage: "linear-gradient(rgb(255, 255, 255), rgb(240, 240, 240))"
      })[1]),
      /CSS_GRADIENT_CAPTURE_UNSUPPORTED/
    );
    await assert.rejects(
      tool.capturePreviewPng(fakeFrame("web", {
        contextSource: "web-computed",
        backgroundImage: "url([redacted])"
      })[1]),
      /CSS_BACKGROUND_IMAGE_CAPTURE_UNSUPPORTED/
    );
  } finally {
    global.document = previousDocument;
  }
}

function assertSingleStickerToolDeclarations() {
  const journeyPath = path.resolve(__dirname, "..", "journey.js");
  const source = fs.readFileSync(journeyPath, "utf8");
  const names = [
    "renderStickerToolPanel",
    "refreshStickerToolStatus",
    "saveStickerToolConfig",
    "clearStickerToolConfig",
    "handleStickerToolFileInput",
    "loadStickerToolOutputPreview",
    "reviewStickerToolRun",
    "acceptStickerToolResult",
    "rejectStickerToolResult",
    "downloadStickerToolBundle",
    "handleStickerToolAction"
  ];
  for (const name of names) {
    const pattern = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(`, "gm");
    const matches = source.match(pattern) || [];
    assert.strictEqual(matches.length, 1, `${name} declaration count`);
  }
  console.log("JOURNEY_STICKER_TOOL_DUPLICATE_FUNCTION_CHECK_PASS");
}

runPreviewTests().then(() => {
  assertSingleStickerToolDeclarations();
  console.log("JOURNEY_STICKER_TOOL_FRONTEND_HELPERS_PASS");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
