import { z } from "zod"
import type { LhMessage } from "@/src/core"

const messageSchema = z.custom<LhMessage>((v) => typeof v === "object" && v !== null && typeof (v as { role?: unknown }).role === "string")

const recordSchema = z.object({
	messages: z.array(messageSchema),
	turnError: z.string().optional(),
	turnInFlight: z.boolean().optional(),
})

export interface ServerRecord {
	readonly messages: LhMessage[]
	readonly turnError?: string
	readonly turnInFlight: boolean
}

// GET /api/chats/<id> is external input: parse, and treat a bad shape like a failed fetch.
export function parseServerRecord(json: unknown): ServerRecord | null {
	const parsed = recordSchema.safeParse(json)
	if (!parsed.success) return null
	const { messages, turnError, turnInFlight } = parsed.data
	return { messages, ...(turnError === undefined ? {} : { turnError }), turnInFlight: turnInFlight === true }
}
