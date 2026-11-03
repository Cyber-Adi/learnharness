import assert from "node:assert/strict";
import { test } from "node:test";
import type { RandomBytes } from "../src/server/remote/devices.ts";
import { PAIRING_TTL_MS, createPairingStore } from "../src/server/remote/pairing.ts";
import { PairingCode } from "../src/server/remote/schemas.ts";

const T0 = 1_000_000;
function store() {
	let n = 0;
	const rb: RandomBytes = (size) => Buffer.alloc(size, ++n);
	return createPairingStore(rb);
}

test("issued codes match the schema and the short alphabet", () => {
	const issued = store().issueCode(T0);
	assert.equal(PairingCode.safeParse(issued.code).success, true);
	assert.match(issued.shortCode, /^[A-HJ-NP-Z2-9]{6}$/);
	assert.equal(issued.expiresAt, T0 + PAIRING_TTL_MS);
});

test("a code redeems once", () => {
	const s = store();
	const { code } = s.issueCode(T0);
	assert.deepEqual(s.redeem(code, T0 + 1), { ok: true });
	assert.deepEqual(s.redeem(code, T0 + 2), { ok: false, reason: "invalid" });
});

test("an expired code fails at 120 s", () => {
	const s = store();
	const a = s.issueCode(T0);
	const b = s.issueCode(T0);
	assert.deepEqual(s.redeem(a.code, T0 + 119_999), { ok: true });
	assert.deepEqual(s.redeem(b.code, T0 + 120_000), { ok: false, reason: "invalid" });
});

test("a fourth code evicts the oldest", () => {
	const s = store();
	const first = s.issueCode(T0);
	s.issueCode(T0 + 1);
	s.issueCode(T0 + 2);
	const fourth = s.issueCode(T0 + 3);
	assert.deepEqual(s.redeem(first.code, T0 + 4), { ok: false, reason: "invalid" });
	assert.deepEqual(s.redeem(fourth.code, T0 + 5), { ok: true });
});

test("the short code redeems the same entry and then both are spent", () => {
	const s = store();
	const { code, shortCode } = s.issueCode(T0);
	assert.deepEqual(s.redeem(shortCode.toLowerCase(), T0 + 1), { ok: true });
	assert.deepEqual(s.redeem(code, T0 + 2), { ok: false, reason: "invalid" });
	const again = s.issueCode(T0 + 3);
	assert.deepEqual(s.redeem(again.code, T0 + 4), { ok: true });
	assert.deepEqual(s.redeem(again.shortCode, T0 + 5), { ok: false, reason: "invalid" });
});

test("the 11th redeem attempt in a minute is rate limited", () => {
	const s = store();
	const { code } = s.issueCode(T0);
	for (let i = 0; i < 10; i++) {
		assert.deepEqual(s.redeem("wrong", T0 + i), { ok: false, reason: "invalid" });
	}
	assert.deepEqual(s.redeem(code, T0 + 11), { ok: false, reason: "rate_limited" });
	assert.deepEqual(s.redeem(code, T0 + 60_010), { ok: true });
});
