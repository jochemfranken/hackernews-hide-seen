let pending = Promise.resolve();

browser.runtime.onMessage.addListener((message) => {
  if (!message || !["markSeen", "markSeenMany", "clearSeen", "exportSeen"].includes(message.type)) {
    return undefined;
  }

  const operation = pending.then(async () => {
    if (message.type === "markSeen" || message.type === "markSeenMany") {
      const urls = message.type === "markSeen" ? [message.url] : message.urls;
      if (!Array.isArray(urls)) throw new Error("Expected a list of story URLs");
      const entries = await Promise.all(urls.map(async (value) => {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error("Unsupported story URL");
        }
        url.hash = "";
        const digest = await crypto.subtle.digest(
          "SHA-256", new TextEncoder().encode(url.href)
        );
        const hash = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");
        return [`seen:${hash}`, true];
      }));
      await browser.storage.local.set(Object.fromEntries(entries));
    } else if (message.type === "clearSeen") {
      const stored = await browser.storage.local.get(null);
      await browser.storage.local.remove(
        Object.keys(stored).filter((key) => key.startsWith("seen:"))
      );
    } else {
      const stored = await browser.storage.local.get(null);
      const hashes = Object.keys(stored)
        .filter((key) => key.startsWith("seen:"))
        .map((key) => key.slice("seen:".length)).sort();
      const json = JSON.stringify({ version: 1, hashes }, null, 2);
      await browser.downloads.download({
        url: `data:application/json;charset=utf-8,${encodeURIComponent(json)}`,
        filename: "seen.json",
        saveAs: true
      });
    }
  });

  pending = operation.catch(() => {});
  return operation.then(() => ({ ok: true }));
});