const assert = require("node:assert/strict");
const { webcrypto, createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(require.resolve("../background.js"), "utf8");

function setup(initial = {}) {
  const data = { ...initial };
  const downloads = [];
  let handler;
  const browser = {
    runtime: { onMessage: { addListener(callback) { handler = callback; } } },
    downloads: { async download(options) { downloads.push(options); return 1; } },
    storage: {
      local: {
        async get() { return { ...data }; },
        async set(values) { Object.assign(data, values); },
        async remove(keys) { for (const key of keys) delete data[key]; }
      }
    }
  };
  vm.runInNewContext(source, { browser, crypto: webcrypto, URL, TextEncoder });
  return { data, downloads, send: (message) => handler(message), browser };
}

function keyFor(url) {
  return `seen:${createHash("sha256").update(url).digest("hex")}`;
}

test("stores a SHA-256 hash, without storing the raw URL", async () => {
  const extension = setup();
  const url = "https://example.com/story?edition=2";
  await extension.send({ type: "markSeen", url: `${url}#heading` });
  assert.deepEqual(extension.data, { [keyFor(url)]: true });
  await extension.send({ type: "markSeen", url: `${url}#another-heading` });
  assert.equal(Object.keys(extension.data).length, 1);
  await extension.send({ type: "markSeen", url: "https://example.com/story?edition=3" });
  assert.equal(Object.keys(extension.data).length, 2);
});

test("concurrent visits do not overwrite one another", async () => {
  const extension = setup();
  await Promise.all(Array.from({ length: 40 }, (_, index) =>
    extension.send({ type: "markSeen", url: `https://example.com/${index}` })
  ));
  assert.equal(Object.keys(extension.data).length, 40);
});

test("batch marking stores every URL hash in one operation", async () => {
  const extension = setup();
  await extension.send({
    type: "markSeenMany",
    urls: ["https://example.com/one", "https://example.com/two", "https://example.com/one#section"]
  });
  assert.deepEqual(extension.data, {
    [keyFor("https://example.com/one")]: true,
    [keyFor("https://example.com/two")]: true
  });
});

test("batch marking rejects invalid URLs without partial writes", async () => {
  const extension = setup();
  await assert.rejects(extension.send({
    type: "markSeenMany",
    urls: ["https://example.com/valid", "javascript:alert(1)"]
  }));
  assert.deepEqual(extension.data, {});
});

test("clear is ordered after pending visits and preserves preferences", async () => {
  const extension = setup({ mode: "hide", paused: true, unrelated: "keep" });
  await Promise.all([
    extension.send({ type: "markSeen", url: "https://example.com/old" }),
    extension.send({ type: "clearSeen" }),
    extension.send({ type: "markSeen", url: "https://example.com/new" })
  ]);
  assert.deepEqual(extension.data, {
    mode: "hide", paused: true, unrelated: "keep", [keyFor("https://example.com/new")]: true
  });
});

test("a rejected URL does not block subsequent writes", async () => {
  const extension = setup();
  await assert.rejects(extension.send({ type: "markSeen", url: "javascript:alert(1)" }));
  await extension.send({ type: "markSeen", url: "https://example.com/valid" });
  assert.equal(extension.data[keyFor("https://example.com/valid")], true);
});

test("a storage failure is reported and the queue recovers", async () => {
  const extension = setup();
  const originalSet = extension.browser.storage.local.set;
  extension.browser.storage.local.set = async () => { throw new Error("Storage full"); };
  await assert.rejects(extension.send({ type: "markSeen", url: "https://example.com/failed" }), /Storage full/);
  extension.browser.storage.local.set = originalSet;
  await extension.send({ type: "markSeen", url: "https://example.com/retry" });
  assert.equal(extension.data[keyFor("https://example.com/retry")], true);
});

test("exports only hashes to seen.json through Firefox Downloads", async () => {
  const extension = setup({ mode: "dim" });
  await extension.send({ type: "markSeen", url: "https://example.com/story" });
  await extension.send({ type: "exportSeen" });
  const download = extension.downloads[0];
  assert.equal(download.filename, "seen.json");
  assert.equal(download.saveAs, true);
  const exported = JSON.parse(decodeURIComponent(download.url.split(",")[1]));
  assert.deepEqual(exported, {
    version: 1, hashes: [keyFor("https://example.com/story").slice("seen:".length)]
  });
});