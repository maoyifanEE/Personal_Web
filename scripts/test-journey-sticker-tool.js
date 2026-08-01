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
    naturalHeight: 60
  } : overrides.image;
  const frame = {
    dataset: {
      contextSource: overrides.contextSource,
      backgroundDerived: overrides.backgroundDerived ?? "true"
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
    querySelector: (selector) => selector === "img" ? image : null
  };
  return [context, frame];
}

function fakeContainer(entries) {
  const frames = Object.fromEntries(entries);
  return {
    querySelector(selector) {
      const match = selector.match(/data-sticker-preview-context="([^"]+)"/);
      const context = match?.[1];
      if (!context || !frames[context]) {
        return null;
      }
      if (selector.endsWith(" img")) {
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

  const zeroRendered = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", renderedWidth: 0 }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(zeroRendered.light.failureCode, "ZERO_RENDERED_SIZE");

  const displayNone = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", display: "none" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(displayNone.light.failureCode, "DISPLAY_NONE");

  const hidden = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", visibility: "hidden" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(hidden.light.failureCode, "VISIBILITY_HIDDEN");

  const transparent = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light", opacity: "0" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed" })
  ]));
  assert.strictEqual(transparent.light.failureCode, "OPACITY_ZERO");

  const incomplete = await tool.inspectRenderedPreviewMatrix(fakeContainer([
    fakeFrame("light", { contextSource: "fixed-light" }),
    fakeFrame("dark", { contextSource: "fixed-dark" }),
    fakeFrame("web", { contextSource: "web-computed" }),
    fakeFrame("journey", { contextSource: "journey-computed", backgroundDerived: "false" })
  ]));
  assert.strictEqual(tool.isPreviewMatrixComplete(incomplete), false);
  assert.strictEqual(incomplete.journey.failureCode, "BACKGROUND_CONTEXT_NOT_DERIVED");
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
