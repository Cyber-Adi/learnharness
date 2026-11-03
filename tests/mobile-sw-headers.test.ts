import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";
import nextConfig from "../next.config.ts";

const require = createRequire(import.meta.url);
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
	pathToRegexp: (source: string) => RegExp;
};

const FLAG = "NEXT_PUBLIC_LH_MOBILE_SHELL";
const saved = process.env[FLAG];
afterEach(() => {
	if (saved === undefined) delete process.env[FLAG];
	else process.env[FLAG] = saved;
});

async function rules() {
	assert.ok(nextConfig.headers);
	return nextConfig.headers();
}

describe("next.config headers", () => {
	it("ships only the sw.js rule when the mobile shell flag is off", async () => {
		delete process.env[FLAG];
		const r = await rules();
		assert.deepEqual(r.map((x) => x.source), ["/sw.js"]);
	});

	it("static assets, icons, sw.js and the manifest never get Accept-CH or Vary", async () => {
		process.env[FLAG] = "1";
		const r = await rules();
		const hint = r.find((x) => x.headers.some((h) => h.key === "Accept-CH"));
		assert.ok(hint);
		const re = pathToRegexp(hint.source);
		for (const p of ["/_next/static/chunks/a.js", "/_next/image", "/icons/icon-192.png", "/sw.js", "/manifest.webmanifest"])
			assert.equal(re.test(p), false, p);
		for (const p of ["/", "/learn", "/chat/abc"]) assert.equal(re.test(p), true, p);
	});

	it("the sw.js rule still disables caching with the flag on", async () => {
		process.env[FLAG] = "1";
		const sw = (await rules()).find((x) => x.source === "/sw.js");
		assert.ok(sw?.headers.some((h) => h.key === "Cache-Control" && h.value.includes("no-store")));
	});
});
