const assert = require("assert");
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

assert.deepStrictEqual(
  tool.completePreviewMatrix(),
  { light: true, dark: true, web: true, journey: true }
);

console.log("JOURNEY_STICKER_TOOL_FRONTEND_HELPERS_PASS");
