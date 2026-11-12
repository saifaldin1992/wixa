// Makes /og.jpg (the share picture) from public/og-src.html, in the brand font.
// Usage (with the local server running): BASE=http://localhost:8787 node tests/make-og.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const BASE = process.env.BASE || "http://localhost:8787";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(`${BASE}/og-src.html`, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
await p.screenshot({ path: new URL("../public/og.jpg", import.meta.url).pathname, type: "jpeg", quality: 88 });
await b.close();
console.log("og.jpg made");
