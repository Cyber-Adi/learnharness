import assert from "node:assert/strict";
import { test } from "node:test";
import { MOBILE_SHELL_ENABLED, requestFormFactor } from "../components/mobile/shell/request-form-factor.ts";

test("with the shell flag off, pages get desktop without reading request data", async () => {
	assert.equal(MOBILE_SHELL_ENABLED, false);
	// Outside a request scope cookies() would throw; desktop proves it was never called.
	assert.equal(await requestFormFactor(), "desktop");
});
