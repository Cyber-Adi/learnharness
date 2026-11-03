import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildPairRequest, codeFromHash, INITIAL_PAIR_STATE, normalizeDeviceName, normalizeShortCode,
	pairState, readAndClearHash, sanitizeShortCodeInput, submitPair, type PairState,
} from "../components/mobile/pairing/pair-model.ts";

const CODE = "abcdefghijklmnopqrstuA"; // 21 chars + one of A Q g w

describe("codeFromHash", () => {
	it("reads a valid code, with or without the leading #", () => {
		assert.equal(codeFromHash(`#${CODE}`), CODE);
		assert.equal(codeFromHash(CODE), CODE);
	});
	it("rejects junk", () => {
		for (const junk of ["", "#", "#short", `#${CODE}x`, `#${CODE.slice(0, 21)}B`, "#abc def ghijklmnopqrstuA", "#<script>"]) {
			assert.equal(codeFromHash(junk), null, junk);
		}
	});
});

describe("readAndClearHash", () => {
	it("the hash is cleared after reading", () => {
		const calls: Array<readonly [unknown, string, string]> = [];
		const got = readAndClearHash(
			{ hash: `#${CODE}`, pathname: "/pair", search: "?x=1" },
			{ replaceState: (d, u, url) => void calls.push([d, u, url]) },
		);
		assert.equal(got, CODE);
		assert.deepEqual(calls, [[null, "", "/pair?x=1"]]);
	});
	it("clears an invalid hash too and returns null", () => {
		const calls: string[] = [];
		const got = readAndClearHash({ hash: "#junk", pathname: "/pair", search: "" }, { replaceState: (_d, _u, url) => void calls.push(url) });
		assert.equal(got, null);
		assert.deepEqual(calls, ["/pair"]);
	});
	it("leaves history alone when there is no hash", () => {
		const calls: string[] = [];
		readAndClearHash({ hash: "", pathname: "/pair", search: "" }, { replaceState: (_d, _u, url) => void calls.push(url) });
		assert.deepEqual(calls, []);
	});
});

describe("short code", () => {
	it("normalizeShortCode uppercases and drops spaces", () => {
		assert.equal(normalizeShortCode("abc 234"), "ABC234");
		assert.equal(normalizeShortCode("  a b c 2 3 4 "), "ABC234");
	});
	it("rejects I, O, 0 and 1 and wrong lengths", () => {
		for (const bad of ["ABCIDE", "ABCODE", "ABC0DE", "ABC1DE", "ABC23", "ABC2345", ""]) {
			assert.equal(normalizeShortCode(bad), null, bad);
		}
	});
	it("input sanitizing uppercases, drops spaces and caps at 6", () => {
		assert.equal(sanitizeShortCodeInput("ab c-2345 678"), "ABC234");
	});
});

describe("device name", () => {
	it("trims and accepts 1-64 characters", () => {
		assert.equal(normalizeDeviceName("  iPhone "), "iPhone");
		assert.equal(normalizeDeviceName("a".repeat(64)), "a".repeat(64));
	});
	it("rejects empty, too long and control characters", () => {
		assert.equal(normalizeDeviceName("   "), null);
		assert.equal(normalizeDeviceName("a".repeat(65)), null);
		assert.equal(normalizeDeviceName("a\u0000b"), null);
	});
});

describe("pair request", () => {
	it("the pair request never puts the code in the URL", () => {
		for (const secret of [{ kind: "code", value: CODE }, { kind: "short", value: "ABC234" }] as const) {
			const req = buildPairRequest(secret, "iPhone");
			assert.equal(req.url, "/api/remote/pair");
			assert.ok(!req.url.includes(secret.value));
			assert.equal(req.init.method, "POST");
			assert.equal(req.init.credentials, "same-origin");
			assert.ok(typeof req.init.body === "string" && req.init.body.includes(secret.value));
		}
	});
	it("sends code or shortCode as the schema expects", () => {
		assert.deepEqual(JSON.parse(String(buildPairRequest({ kind: "code", value: CODE }, "P").init.body)), { code: CODE, deviceName: "P" });
		assert.deepEqual(JSON.parse(String(buildPairRequest({ kind: "short", value: "ABC234" }, "P").init.body)), { shortCode: "ABC234", deviceName: "P" });
	});
	it("submitPair is true only for an ok envelope and false for errors and throws", async () => {
		const reply = (status: number, body: unknown): typeof fetch => async () => Response.json(body, { status });
		const okBody = { ok: true, data: { deviceId: "x", name: "P", scopes: ["learn"] } };
		assert.equal(await submitPair(reply(200, okBody), { kind: "code", value: CODE }, "P"), true);
		assert.equal(await submitPair(reply(401, { ok: false, error: { code: "unauthorized", message: "m" } }), { kind: "code", value: CODE }, "P"), false);
		assert.equal(await submitPair(reply(200, { nope: 1 }), { kind: "code", value: CODE }, "P"), false);
		assert.equal(await submitPair((async () => { throw new Error("net"); }) as typeof fetch, { kind: "code", value: CODE }, "P"), false);
	});
});

describe("pairState", () => {
	const run = (...types: Array<"submit" | "succeeded" | "failed" | "retry">): PairState =>
		types.reduce<PairState>((s, type) => pairState(s, { type }), INITIAL_PAIR_STATE);
	it("walks form, submitting, paired", () => {
		assert.equal(run("submit").phase, "submitting");
		assert.equal(run("submit", "succeeded").phase, "paired");
	});
	it("failure can be retried back to the form", () => {
		assert.equal(run("submit", "failed").phase, "failed");
		assert.equal(run("submit", "failed", "retry").phase, "form");
	});
	it("ignores out-of-order actions and a second submit while submitting", () => {
		assert.equal(run("succeeded").phase, "form");
		assert.equal(run("submit", "submit").phase, "submitting");
		assert.equal(run("submit", "succeeded", "submit").phase, "paired");
	});
});
