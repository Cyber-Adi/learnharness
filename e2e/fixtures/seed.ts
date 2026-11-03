// Seeds the e2e data dir with real records before `next dev` starts (LH_E2E_MOBILE=1 only).
// Runs the real chat handler against a faux engine, so the records have the exact shape
// production writes: one session with a pending quiz, one finished session.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";

assert.equal(process.env.NODE_ENV, "test", "seed runs with NODE_ENV=test (faux engine only)");
const dataDir = process.env.LH_DATA_DIR;
const seedFile = process.env.LH_E2E_SEED_FILE;
assert.ok(dataDir && seedFile, "LH_DATA_DIR and LH_E2E_SEED_FILE are required");
// Never the developer's real key store: the faux engine needs only a key's presence.
assert.ok(process.env.LH_AUTH_FILE, "LH_AUTH_FILE must point at a scratch file");
if (!fs.existsSync(process.env.LH_AUTH_FILE)) fs.writeFileSync(process.env.LH_AUTH_FILE, "{}");
process.env.OPENROUTER_API_KEY ??= "seed-key-presence-gate";

const { createTeacherAgent } = await import("../../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../../src/server/chat-handler.ts");
const { runningTurn } = await import("../../src/server/turn-runs.ts");
const { chatStore } = await import("../../src/store/chats.ts");

const QUIZ = {
	question: "Which planet is closest to the sun?",
	options: [{ label: "Venus" }, { label: "Mercury" }, { label: "Mars" }],
	correctAnswer: "Mercury",
	explanation: "Mercury is the innermost planet.",
	type: "check",
	nodeId: "planet-order",
};

function engine(first: () => ReturnType<typeof fauxAssistantMessage>) {
	const faux = createFauxCore({});
	faux.setResponses([first]);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

async function seedChat(title: string, first: () => ReturnType<typeof fauxAssistantMessage>): Promise<string> {
	const chat = chatStore.createChat(title);
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	chatStore.saveTree(chat.id, { nodes: [{ id: "planet-order", title: "Planet order" }], edges: [], version: 1 });
	const req = new Request("http://seed/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "Teach me the planets" } }),
	});
	const e = engine(first);
	const ack = await handleChatRequest(req, (opts) => createTeacherAgent(undefined, { ...opts, engine: e }));
	assert.equal(ack.status, 200, `seed turn for ${title}`);
	const handle = runningTurn(chat.id);
	if (handle) await new Response(handle.subscribe()).text();
	return chat.id;
}

const pending = await seedChat("Planets quiz", () =>
	fauxAssistantMessage([fauxText("Let us start with a quick check."), fauxToolCall("quiz", QUIZ, { id: "seed-q1" })], {
		stopReason: "toolUse",
	}),
);
const finished = await seedChat("Inner planets overview", () =>
	fauxAssistantMessage([fauxText("Mercury, Venus, Earth and Mars are the rocky inner planets.")]),
);
fs.mkdirSync(path.dirname(seedFile), { recursive: true });
fs.writeFileSync(seedFile, JSON.stringify({ pending, finished, pendingCallId: "seed-q1" }));
console.log("[seed] wrote", path.basename(seedFile));
