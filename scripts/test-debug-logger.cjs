const assert = require("node:assert/strict");
const core = require("../debug-logger-core.js");

const now = Date.parse("2026-07-11T00:00:00.000Z");
const days = (count) => count * 24 * 60 * 60 * 1000;

function entry(id, ageMs) {
  return {
    id,
    timestamp: new Date(now - ageMs).toISOString(),
    event: `event.${id}`,
    details: { id }
  };
}

function testRetention() {
  const entries = [
    entry("old", days(8)),
    entry("edge", core.RETENTION_MS),
    entry("fresh", days(1))
  ];
  const retained = core.pruneEntriesByAge(entries, now);
  assert.deepEqual(retained.map((item) => item.id), ["edge", "fresh"]);

  const trimmed = core.emergencyTrimEntries(
    [entry("a", days(3)), entry("b", days(2)), entry("c", days(1))],
    { maxEntries: 2, maxBytes: 100000 }
  );
  assert.equal(trimmed.trimmed, true);
  assert.deepEqual(trimmed.entries.map((item) => item.id), ["b", "c"]);
  console.log("DEBUG_LOGGER_RETENTION_TEST_PASS");
}

function testSanitization() {
  const output = core.sanitize({
    password: "demo1234",
    token: "abc",
    csrf: "csrf-value",
    nested: {
      newPassword: "private",
      stickerId: "sticker-1",
      body: "{\"secret\":\"value\"}"
    },
    image: "data:image/png;base64,abc"
  });
  assert.equal(output.password, core.REDACTED);
  assert.equal(output.token, core.REDACTED);
  assert.equal(output.csrf, core.REDACTED);
  assert.equal(output.nested.newPassword, core.REDACTED);
  assert.equal(output.nested.body, core.BODY_REDACTED);
  assert.equal(output.nested.stickerId, "sticker-1");
  assert.match(output.image, /^\[DATA_URL_REDACTED\]/);

  const safeUrl = core.safeUrlParts(
    "https://example.com/api/messages?token=abc&page=2",
    "https://example.com/"
  );
  assert.equal(safeUrl.path, "/api/messages");
  assert.equal(safeUrl.sameOrigin, true);
  assert.equal(safeUrl.safeSearch, "?token=[REDACTED]&page=[VALUE]");
  console.log("DEBUG_LOGGER_SANITIZATION_TEST_PASS");
}

function testEventSummary() {
  const target = {
    tagName: "BUTTON",
    id: "delete",
    className: "danger",
    dataset: {
      stickerAction: "delete",
      privateValue: "ignored"
    },
    innerText: "Delete\nSticker",
    getAttribute(name) {
      return name === "aria-label" ? "Delete sticker" : "";
    }
  };
  const summary = core.summarizeTarget(target);
  assert.equal(summary.tag, "button");
  assert.equal(summary.id, "delete");
  assert.equal(summary.label, "Delete Sticker");
  assert.equal(summary.dataset.stickerAction, "delete");
  assert.equal(summary.dataset.privateValue, undefined);
  console.log("DEBUG_LOGGER_EVENT_SUMMARY_TEST_PASS");
}

testRetention();
testSanitization();
testEventSummary();
console.log("DEBUG_LOGGER_TEST_PASS");
