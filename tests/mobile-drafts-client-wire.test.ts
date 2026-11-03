import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONFIDENCE_STOPS, emptyDockSelection, type QuestionDraft } from "../src/core/question-core.ts";
import { fromDesktopDraft, fromWire, toDesktopDraft, toWire, type ServerDraft } from "../components/mobile/drafts/draft-wire.ts";
import type { SheetDraft } from "../components/mobile/session/sheet-draft.ts";

const AT = "2026-03-01T12:00:00.000Z";

describe("draft wire mapping (SYNC-4)", () => {
	it("toWire and fromWire round trip", () => {
		const sheet: SheetDraft = { selection: { picked: [1] }, confidenceIndex: 4, thinking: "because" };
		const wire = toWire(sheet, "call-1", "phone", AT);
		assert.deepEqual(wire, { toolCallId: "call-1", text: "because", confidence: 90, selection: { picked: [1] }, clientUpdatedAt: AT, deviceLabel: "phone" });
		const back = fromWire({ ...wire, savedAt: AT } as ServerDraft);
		assert.deepEqual(back, sheet);
		assert.equal(toWire({ ...sheet, confidenceIndex: null }, "c", "phone", AT).confidence, null);
		assert.equal(fromWire({ ...wire, confidence: null, savedAt: AT } as ServerDraft).confidenceIndex, null);
	});

	it("confidence maps to the nearest stop", () => {
		const idx = (confidence: number): number | null =>
			fromWire({ ...toWire({ selection: null, confidenceIndex: 0, thinking: "" }, "c", "phone", AT), confidence, savedAt: AT } as ServerDraft).confidenceIndex;
		assert.equal(idx(0), 0);
		assert.equal(idx(41), 2);
		assert.equal(idx(61), 3);
		assert.equal(idx(96), 5);
		assert.equal(idx(100), CONFIDENCE_STOPS.length - 1);
	});

	it("a desktop QuestionDraft maps to a SheetDraft and back", () => {
		const draft: QuestionDraft = {
			form: { selection: { selected: new Set([0, 2]), otherSelected: true, dontKnow: false }, thinking: "why", other: "mine", text: "t", confidenceIndex: 3 },
			readingThinking: "reading",
		};
		const sheet = fromDesktopDraft(draft);
		assert.ok(sheet);
		assert.equal(sheet.thinking, "why");
		assert.equal(sheet.confidenceIndex, 3);
		JSON.stringify(sheet.selection);
		assert.deepEqual(toDesktopDraft(sheet), draft);
		assert.equal(fromDesktopDraft({}), null);
	});

	it("a foreign selection shape degrades to an empty dock selection", () => {
		const out = toDesktopDraft({ selection: { weird: true }, confidenceIndex: null, thinking: "keep" });
		assert.equal(out.form?.thinking, "keep");
		assert.deepEqual(out.form?.selection, emptyDockSelection());
		assert.equal(out.form?.confidenceIndex, 2);
	});
});
