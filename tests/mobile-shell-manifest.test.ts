import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import manifest from "../app/manifest.ts";

const ROOT = join(import.meta.dirname, "..");

function pngSize(path: string): { w: number; h: number } {
	const b = readFileSync(path);
	assert.equal(b.subarray(1, 4).toString("latin1"), "PNG");
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("manifest", () => {
	const m = manifest();
	it("the manifest is standalone with a pwa start_url and maskable icons", () => {
		assert.equal(m.name, "Learning Harness");
		assert.equal(m.short_name, "LearnHarness");
		assert.equal(m.display, "standalone");
		assert.equal(m.start_url, "/?source=pwa");
		assert.equal(m.scope, "/");
		assert.equal(m.background_color, "#141414");
		assert.equal(m.theme_color, "#141414");
		const icons = m.icons ?? [];
		assert.ok(icons.some((i) => i.sizes === "192x192" && i.purpose === "any"));
		assert.ok(icons.some((i) => i.sizes === "512x512" && i.purpose === "any"));
		assert.ok(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
	});
	it("the generated icons have the declared pixel sizes", () => {
		for (const icon of m.icons ?? []) {
			const [w, h] = (icon.sizes ?? "").split("x").map(Number);
			const got = pngSize(join(ROOT, "public", icon.src));
			assert.deepEqual(got, { w, h }, icon.src);
		}
	});
});
