import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { PiEngine } from "../src/agent/models.ts";
import type { QuestionData } from "../src/core/question-core.ts";

// Storage seams BEFORE any app import; shared by the SYNC-3 handler tests.
assert.equal(process.env.NODE_ENV, "test", "Run with NODE_ENV=test; tests must not use real providers.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-mobile-answers-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LH_AUTH_FILE = path.join(scratch, "auth.json");
process.env.OPENROUTER_API_KEY = "test-key-presence-gate";
fs.writeFileSync(process.env.LH_AUTH_FILE, "{}");

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { buildAnswer, normalizeOptions, resolveCorrect } = await import("../src/core/question-core.ts");

after(() => {
	fs.rmSync(scratch, { recursive: true, force: true });
});

export { chatStore, handleChatRequest, runningTurn };

const QUIZ_INPUT = {
	question: "Which planet is closest to the sun?",
	options: [{ label: "Venus" }, { label: "Mercury" }],
	correctAnswer: "Mercury",
	explanation: "Mercury is the innermost planet.",
	type: "check",
	nodeId: "planet-order",
};

/** Faux engine: the first response asks the given quiz calls, later ones are plain text. */
export function engineAsking(callIds: readonly string[], texts = 8): PiEngine {
	const faux = createFauxCore({});
	faux.setResponses([
		() => fauxAssistantMessage(callIds.map((id) => fauxToolCall("quiz", QUIZ_INPUT, { id })), { stopReason: "toolUse" }),
		...Array.from({ length: texts }, (_, i) => () => fauxAssistantMessage([fauxText(`reaction ${i}`)])),
	]);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

export function post(chatId: string, input: unknown): Request {
	return new Request("http://test/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId, input }),
	});
}

export const factory = (engine: PiEngine): Parameters<typeof handleChatRequest>[1] =>
	(opts) => createTeacherAgent(undefined, { ...opts, engine });

/** POST one event; when accepted, optionally drain the server-owned turn. */
export async function send(engine: PiEngine, chatId: string, input: unknown, drain = true): Promise<Response> {
	const ack = await handleChatRequest(post(chatId, input), factory(engine));
	if (drain && ack.status === 200) await drainTurn(chatId);
	return ack;
}

export async function drainTurn(chatId: string): Promise<void> {
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

/** A chat whose first turn asked `callIds` (all dangling). */
export async function chatAsking(engine: PiEngine, title: string) {
	const chat = chatStore.createChat(title);
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	chatStore.saveTree(chat.id, { nodes: [{ id: "planet-order", title: "Planet order" }], edges: [], version: 1 });
	const res = await send(engine, chat.id, { type: "text", text: "quiz me" });
	assert.equal(res.status, 200);
	return chat;
}

export function gradedAnswer(callId: string, values: readonly string[] = ["Mercury"]) {
	const options = normalizeOptions(QUIZ_INPUT.options);
	const qd: QuestionData = {
		id: callId,
		kind: "quiz",
		question: QUIZ_INPUT.question,
		mode: "single-select",
		options,
		correctIndices: resolveCorrect(QUIZ_INPUT.correctAnswer, options).indices,
		explanation: QUIZ_INPUT.explanation,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
	return buildAnswer(qd, { values: [...values], thinking: "t", readingThinking: "r", confidence: 80 });
}

export function resultsFor(chatId: string, callId: string) {
	return chatStore.getChat(chatId)!.messages.filter((m) => m.role === "toolResult" && m.toolCallId === callId);
}
