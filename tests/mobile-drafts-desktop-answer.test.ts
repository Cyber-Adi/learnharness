import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { QuestionAnswerData } from "../src/core/index.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const question = {
	id: "a1", role: "assistant",
	content: [{ type: "toolCall", id: "c1", name: "quiz", arguments: { question: "Q?" } }],
	stopReason: "toolUse", timestamp: 1,
} as unknown as LhMessage;
const answer = { kind: "quiz", values: ["Venus"] } as unknown as QuestionAnswerData;

function modelWith(status: number): SessionModel {
	return new SessionModel({
		chatId: "c", initialMessages: [question], pollMs: 1, waitMaxMs: 20,
		fetch: async (url) => {
			const u = String(url);
			if (u === "/api/chat") return status === 200 ? json(200, { ok: true }) : json(status, { ok: false, error: { code: "invalid", message: "No." } });
			if (u.endsWith("/stream")) return new Response("data: [DONE]\n\n", { status: 200 });
			return json(200, { messages: [question], turnInFlight: false });
		},
	});
}

describe("submitAnswer result (SYNC-4)", () => {
	it("submitAnswer resolves true when the answer is accepted and false when refused", async () => {
		assert.equal(await modelWith(200).submitAnswer("quiz", "c1", answer, "c1"), true);
		assert.equal(await modelWith(400).submitAnswer("quiz", "c1", answer, "c1"), false);
	});
});
