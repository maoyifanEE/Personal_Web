const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadResolver({ configuredBase = "", hostname, origin }) {
  const source = fs.readFileSync("auth.js", "utf8");
  const sandbox = {
    console,
    fetch: async () => ({ ok: true, text: async () => "{}" }),
    window: {
      location: { hostname, origin },
      PERSONAL_WEB_API_BASE_URL: configuredBase
    }
  };
  vm.runInNewContext(source, sandbox, { filename: "auth.js" });
  return sandbox.window.PersonalWebAuth.resolveApiBaseUrl;
}

function resolve(input) {
  return loadResolver(input)(input);
}

assert.equal(
  resolve({
    configuredBase: "http://local.example.test/api/",
    hostname: "localhost",
    origin: "http://localhost:4173"
  }),
  "http://local.example.test/api",
  "explicit override should win locally"
);

assert.equal(
  resolve({
    configuredBase: "https://api.example.test/api/",
    hostname: "maoyifan0801.com",
    origin: "https://maoyifan0801.com"
  }),
  "https://api.example.test/api",
  "explicit override should win publicly"
);

assert.equal(
  resolve({
    hostname: "localhost",
    origin: "http://localhost:4173"
  }),
  "http://127.0.0.1:8000/api",
  "localhost should use local backend"
);

assert.equal(
  resolve({
    hostname: "127.0.0.1",
    origin: "http://127.0.0.1:4173"
  }),
  "http://127.0.0.1:8000/api",
  "127.0.0.1 should use local backend"
);

assert.equal(
  resolve({
    hostname: "maoyifan0801.com",
    origin: "https://maoyifan0801.com"
  }),
  "https://maoyifan0801.com/api",
  "apex production host should use same-origin API"
);

assert.equal(
  resolve({
    hostname: "www.maoyifan0801.com",
    origin: "https://www.maoyifan0801.com"
  }),
  "https://www.maoyifan0801.com/api",
  "www production host should use same-origin API"
);

assert.equal(
  resolve({
    hostname: "example.com",
    origin: "https://example.com"
  }),
  "https://example.com/api",
  "unknown public host should use same-origin API"
);

assert.equal(
  resolve({
    configuredBase: "https://example.com/api/",
    hostname: "example.com",
    origin: "https://example.com"
  }),
  "https://example.com/api",
  "trailing slash should be removed"
);

const source = fs.readFileSync("auth.js", "utf8");
const resolverSource = source.slice(
  source.indexOf("const resolveApiBaseUrl"),
  source.indexOf("const apiBaseUrl")
);
for (const forbidden of ["searchParams", "document.cookie", "localStorage", "sessionStorage"]) {
  assert.equal(
    resolverSource.includes(forbidden),
    false,
    `resolver must not depend on ${forbidden}`
  );
}

console.log("API_BASE_RESOLVER_TEST_PASS");
