import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleSettingsSections } from "../components/mobile/pairing/settings-entry.ts";

const SECTIONS = [
	{ id: "keys", label: "Providers" },
	{ id: "phone", label: "Phone" },
	{ id: "general", label: "General" },
] as const;

test("the Phone settings section is hidden when the mobile shell is off", () => {
	assert.deepEqual(visibleSettingsSections(SECTIONS, false).map((s) => s.id), ["keys", "general"]);
});

test("the Phone settings section shows when the mobile shell is on", () => {
	assert.deepEqual(visibleSettingsSections(SECTIONS, true).map((s) => s.id), ["keys", "phone", "general"]);
});
