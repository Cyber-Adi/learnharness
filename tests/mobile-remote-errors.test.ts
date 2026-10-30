import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
	ERROR_CODES,
	ERROR_STATUS,
	fromZodError,
	ok,
	remoteError,
} from "../src/server/remote/errors.ts";

test("the invalid-input error does not echo input values", () => {
	const schema = z.strictObject({ secret: z.string().min(40), n: z.number() });
	const result = schema.safeParse({ secret: "hunter2-super-secret", n: "nope", extra: "leak-me" });
	assert.equal(result.success, false);
	if (result.success) return;
	const env = fromZodError(result.error);
	const text = JSON.stringify(env);
	assert.equal(env.ok, false);
	assert.equal(env.error.code, "invalid_input");
	for (const leak of ["hunter2", "leak-me", "nope", "secret", "Too small", "expected"]) {
		assert.equal(text.includes(leak), false, leak);
	}
	assert.ok(Object.isFrozen(env));
});

test("every error code has a status and a generic message", () => {
	assert.deepEqual(
		{ ...ERROR_STATUS },
		{
			unauthorized: 401,
			forbidden_scope: 403,
			bad_host: 421,
			bad_origin: 403,
			invalid_input: 400,
			rate_limited: 429,
			remote_disabled: 404,
			internal: 500,
		},
	);
	const messages = new Set<string>();
	for (const code of ERROR_CODES) {
		const env = remoteError(code);
		assert.equal(env.ok, false);
		assert.equal(env.error.code, code);
		assert.ok(env.error.message.length > 0);
		assert.ok(Object.isFrozen(env) && Object.isFrozen(env.error));
		messages.add(env.error.message);
	}
	assert.equal(messages.size, ERROR_CODES.length);
});

test("ok wraps data in a success envelope", () => {
	assert.deepEqual(ok({ a: 1 }), { ok: true, data: { a: 1 } });
});

test("error tables are frozen", () => {
	assert.ok(Object.isFrozen(ERROR_STATUS));
	assert.ok(Object.isFrozen(ERROR_CODES));
});
