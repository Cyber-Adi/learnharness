import { danglingQuestionOf, type LhMessage } from "../../core/native-messages.ts";

export type ToolResultRecord = Extract<LhMessage, { role: "toolResult" }>;
export type AnswerOutcome =
	| { readonly kind: "pending" }
	| { readonly kind: "duplicate"; readonly result: ToolResultRecord }
	| { readonly kind: "unknown" };

/** SYNC-3: classify an answer to `toolCallId` against the saved record.
 *  Pending wins (a reused call id can be re-posed); else a stored result makes
 *  it a duplicate whose canonical record is the latest result for that id. */
export function answerOutcome(messages: readonly LhMessage[], toolCallId: string): AnswerOutcome {
	if (danglingQuestionOf(messages)?.toolCallId === toolCallId) return { kind: "pending" };
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "toolResult" && m.toolCallId === toolCallId) return { kind: "duplicate", result: m };
	}
	return { kind: "unknown" };
}
