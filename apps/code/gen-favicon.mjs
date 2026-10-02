// Generates the DevPass favicon set: white passport mark on a Vichar-blue
// rounded tile. Run: pnpm exec node gen-favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const OUT = "public/favicon";

const html = (size) => `<!doctype html><html><body style="margin:0">
<div id="tile" style="width:${size}px;height:${size}px;border-radius:${Math.round(
	size * 0.22,
)}px;background:#305dde;display:flex;align-items:center;justify-content:center;">
<svg width="${Math.round(size * 0.62)}" height="${Math.round(
	size * 0.62,
)}" viewBox="0 0 32 32" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="5" y="3" width="23" height="27" rx="4"/>
<path d="M9 3v27M16 10l-3 3 3 3m6-6 3 3-3 3M17 21h6M17 25h3"/>
</svg></div></body></html>`;

const browser = await chromium.launch();
const sizes = [16, 32, 48, 180, 192, 512];
for (const size of sizes) {
	const page = await browser.newPage({
		viewport: { width: size, height: size },
		deviceScaleFactor: 1,
	});
	await page.setContent(html(size));
	const buf = await page
		.locator("#tile")
		.screenshot({ omitBackground: size !== 180 });
	const name =
		size === 16 || size === 32 || size === 48
			? `favicon-${size}x${size}.png`
			: size === 180
				? "apple-touch-icon.png"
				: `android-chrome-${size}x${size}.png`;
	writeFileSync(`${OUT}/${name}`, buf);
	await page.close();
	console.log(name);
}
await browser.close();

// Pack 16/32/48 into favicon.ico (PNG-in-ICO).
const pngs = [16, 32, 48].map((s) =>
	readFileSync(`${OUT}/favicon-${s}x${s}.png`),
);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
const dir = Buffer.alloc(16 * pngs.length);
let offset = 6 + dir.length;
pngs.forEach((png, i) => {
	const size = [16, 32, 48][i];
	dir.writeUInt8(size === 256 ? 0 : size, i * 16);
	dir.writeUInt8(size === 256 ? 0 : size, i * 16 + 1);
	dir.writeUInt8(0, i * 16 + 2);
	dir.writeUInt8(0, i * 16 + 3);
	dir.writeUInt16LE(1, i * 16 + 4);
	dir.writeUInt16LE(32, i * 16 + 6);
	dir.writeUInt32LE(png.length, i * 16 + 8);
	dir.writeUInt32LE(offset, i * 16 + 12);
	offset += png.length;
});
writeFileSync(`${OUT}/favicon.ico`, Buffer.concat([header, dir, ...pngs]));
console.log("favicon.ico");
