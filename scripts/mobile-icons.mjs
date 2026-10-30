// Renders build/icon-flat.svg to the PWA icon set in public/icons/.
// Usage: node scripts/mobile-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "icons");
const svg = readFileSync(join(root, "build", "icon-flat.svg"), "utf8");
const BG = "#141414";

function render(background, fit) {
	const r = new Resvg(svg, {
		fitTo: { mode: "width", value: fit },
		background,
	});
	return r.render();
}

function png(size) {
	return render(undefined, size).asPng();
}

// Maskable: artwork in the inner 80% (10% safe-zone each side) on a flat field.
function maskable(size) {
	const inner = Math.round(size * 0.8);
	const art = render(undefined, inner).asPng().toString("base64");
	const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${BG}"/><image x="${(size - inner) / 2}" y="${(size - inner) / 2}" width="${inner}" height="${inner}" href="data:image/png;base64,${art}"/></svg>`;
	return new Resvg(wrapped, { fitTo: { mode: "width", value: size } }).render().asPng();
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "icon-192.png"), png(192));
writeFileSync(join(out, "icon-512.png"), png(512));
writeFileSync(join(out, "icon-maskable-512.png"), maskable(512));
