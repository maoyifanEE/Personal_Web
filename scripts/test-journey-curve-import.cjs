const assert = require("node:assert/strict");
const core = require("../journey-curve-import-core.js");

function point(x, y) {
  return { x, y };
}

function makeTransparentImage(width, height, draw) {
  const data = new Uint8ClampedArray(width * height * 4);
  draw({
    set(x, y, rgba = [80, 64, 220, 255]) {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        return;
      }
      const offset = (y * width + x) * 4;
      data[offset] = rgba[0];
      data[offset + 1] = rgba[1];
      data[offset + 2] = rgba[2];
      data[offset + 3] = rgba[3];
    }
  });
  return { data, width, height };
}

function drawDisk(drawer, cx, cy, radius) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (Math.hypot(x - cx, y - cy) <= radius) {
        drawer.set(x, y);
      }
    }
  }
}

function drawDash(drawer, cx, cy, radius = 2) {
  drawDisk(drawer, cx, cy, radius);
}

function syntheticDashedImage() {
  const width = 520;
  const height = 900;
  const route = [];
  for (let i = 0; i < 120; i += 1) {
    const t = i / 119;
    route.push({
      x: 72 + Math.sin(t * Math.PI * 2.2) * 92 + t * 300,
      y: 48 + t * 790
    });
  }
  const image = makeTransparentImage(width, height, (drawer) => {
    drawDisk(drawer, route[0].x - 14, route[0].y - 8, 9);
    route.forEach((p) => drawDash(drawer, Math.round(p.x), Math.round(p.y), 1));
    drawer.set(6, 6);
    drawer.set(width - 8, 10);
    drawer.set(20, height - 12);
  });
  return { image, route };
}

function testJson() {
  const canonical = core.parseCurveJsonText(JSON.stringify({
    version: "journey-curve-import-v1",
    source: { width: 1024, height: 1536 },
    coordinateSpace: "source-pixels",
    points: [point(10, 20), point(30, 40)]
  }));
  assert.equal(canonical.source.width, 1024);
  assert.equal(canonical.points.length, 2);

  const minimal = core.parseCurveJsonText(JSON.stringify({
    sourceWidth: 100,
    sourceHeight: 200,
    points: [point(0, 0), point(100, 200)]
  }));
  assert.equal(minimal.source.height, 200);

  const normalized = core.parseCurveJsonText(JSON.stringify({
    coordinateSpace: "normalized",
    points: [point(0.1, 0.2), point(0.8, 0.9)]
  }));
  assert.equal(normalized.coordinateSpace, "normalized");

  assert.throws(() => core.parseCurveJsonText("{"), /JSON/);
  assert.throws(() => core.parseCurveJsonText(JSON.stringify({
    sourceWidth: 10,
    sourceHeight: 10,
    points: [point(0, 0), { x: "NaN", y: 1 }]
  })), /有效坐标/);
  assert.throws(() => core.parseCurveJsonText(JSON.stringify({
    sourceWidth: 10,
    sourceHeight: 10,
    points: [point(0, 0)]
  })), /至少需要 2/);
  assert.throws(() => core.parseCurveJsonText(JSON.stringify({
    sourceWidth: 10,
    sourceHeight: 10,
    points: Array.from({ length: 10001 }, (_, index) => point(index, index))
  })), /10000/);
  const unrelated = core.parseCurveJsonText(JSON.stringify({
    sourceWidth: 10,
    sourceHeight: 10,
    stickers: [{ imageSrc: "data:image/png;base64,bad" }],
    nodes: [{ id: "N001" }],
    points: [point(0, 0), point(10, 10)]
  }));
  assert.equal(unrelated.points.length, 2);
}

function testMapping() {
  const mapped = core.mapCurvePoints([point(0, 0), point(100, 200)], {
    width: 100,
    height: 200
  }, {
    width: 1000,
    height: 2400
  }, "stretch");
  assert.deepEqual(mapped[0], point(0, 0));
  assert.deepEqual(mapped[1], point(1000, 2400));

  const contained = core.mapCurvePoints([point(0, 0), point(100, 100)], {
    width: 100,
    height: 100
  }, {
    width: 1000,
    height: 2000
  }, "contain");
  assert.equal(contained[0].x, 0);
  assert.equal(contained[0].y, 500);
  assert.equal(contained[1].x, 1000);
  assert.equal(contained[1].y, 1500);

  const clamped = core.mapCurvePoints([point(-10, 120), point(200, -20)], {
    width: 100,
    height: 100
  }, {
    width: 1000,
    height: 1000
  }, "stretch");
  clamped.forEach((p) => {
    assert.ok(Number.isFinite(p.x));
    assert.ok(Number.isFinite(p.y));
    assert.ok(p.x >= 0 && p.x <= 1000);
    assert.ok(p.y >= 0 && p.y <= 1000);
  });
  assert.deepEqual(core.reverseCurvePoints([point(1, 2), point(3, 4)]), [point(3, 4), point(1, 2)]);
}

function testRasterTracing() {
  const { image, route } = syntheticDashedImage();
  const mask = core.buildForegroundMask(image);
  assert.equal(mask.mode, "alpha");
  const components = core.findConnectedComponents(mask, mask.width, mask.height, {
    minArea: 2,
    maxComponents: 2000
  });
  assert.ok(components.length >= 100, `expected many dash components, got ${components.length}`);
  assert.ok(!components.some((component) => component.area <= 3), "tiny noise should be removed");

  const marker = core.detectStartMarker(components, {
    width: mask.width,
    height: mask.height
  });
  assert.ok(marker, "marker should be detected");
  assert.ok(Math.hypot(marker.centroid.x - (route[0].x - 14), marker.centroid.y - (route[0].y - 8)) < 4);

  const traced = core.traceMaskToRoute(mask, { minArea: 2 });
  assert.ok(traced.points.length >= 100);
  assert.ok(Math.hypot(traced.points[0].x - marker.centroid.x, traced.points[0].y - marker.centroid.y) < 1);
  assert.ok(traced.usedCount >= 100);
  const gaps = traced.points.slice(1).map((p, index) => Math.hypot(p.x - traced.points[index].x, p.y - traced.points[index].y));
  const maxGap = Math.max(...gaps);
  const medianGap = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  assert.ok(maxGap < medianGap * 7);
  traced.points.forEach((p) => {
    assert.ok(Number.isFinite(p.x));
    assert.ok(Number.isFinite(p.y));
  });
  assert.ok(traced.points[traced.points.length - 1].y > traced.points[0].y);
}

function testErrorBehavior() {
  assert.throws(() => core.findConnectedComponents(new Uint8Array(100), 10, 10), /没有识别/);

  const noisy = new Uint8Array(80 * 80);
  for (let i = 0; i < 2100; i += 1) {
    const x = (i * 17) % 80;
    const y = (i * 31) % 80;
    noisy[y * 80 + x] = 1;
  }
  assert.throws(() => core.findConnectedComponents(noisy, 80, 80, {
    minArea: 1,
    maxComponents: 20
  }), /片段过多/);

  const solid = new Uint8Array(100 * 100);
  for (let y = 20; y < 80; y += 1) {
    for (let x = 20; x < 80; x += 1) {
      solid[y * 100 + x] = 1;
    }
  }
  assert.throws(() => core.traceMaskToRoute({
    mask: solid,
    width: 100,
    height: 100
  }), /连续实线/);

  const disconnected = [point(0, 0), point(3, 4), point(500, 500), point(503, 504)];
  const validation = core.validateOrderedRoute(disconnected, { maxGapFactor: 3 });
  assert.equal(validation.ok, false);
}

testJson();
testMapping();
testRasterTracing();
testErrorBehavior();

console.log("JSON_TEST_PASS");
console.log("MAPPING_TEST_PASS");
console.log("RASTER_COMPONENT_TEST_PASS");
console.log("MARKER_TEST_PASS");
console.log("NOISE_FILTERING_TEST_PASS");
console.log("ORDERING_TEST_PASS");
console.log("ERROR_TEST_PASS");
console.log("JOURNEY_CURVE_IMPORT_TEST_PASS");
