"use client"

import { Fragment } from "react"
import { AnsweredCard } from "@/components/answered-card"
import { artifactRenderers } from "@/components/artifacts"
import { LiveToolCard } from "@/components/artifacts/live-tool-card"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { BrailleSpinner } from "@/components/braille-spinner"
import { Shimmer } from "@/components/ai-elements/shimmer"
import type { ArtifactPartProps, LhViewMessage, QuestionAnswerData } from "@/src/core"

type Part = LhViewMessage["parts"][number]

const QUESTION_PARTS = new Set(["tool-quiz", "tool-probe", "tool-ask_user_question", "tool-explain", "tool-recall"])

interface PartProps {
	readonly part: Part
	readonly streaming: boolean
}

// Wraps the desktop renderers; pending questions live in the sheet, never in the transcript.
function PartView({ part, streaming }: PartProps) {
	if (part.type === "text") return <MessageResponse>{part.text}</MessageResponse>
	if (part.type === "reasoning") {
		return (
			<Reasoning isStreaming={streaming} className="mb-2">
				<ReasoningTrigger />
				<ReasoningContent>{part.text ?? ""}</ReasoningContent>
			</Reasoning>
		)
	}
	if (!part.type.startsWith("tool-")) return null
	const tool = part as ArtifactPartProps["part"]
	if (QUESTION_PARTS.has(part.type)) {
		const answered = part as { state?: string; output?: unknown; input?: unknown }
		return answered.state === "output-available" ? <AnsweredCard answer={answered.output as QuestionAnswerData} input={answered.input} /> : null
	}
	if ((part as { state?: string }).state === "input-streaming") return <LiveToolCard part={tool} />
	const Renderer = artifactRenderers[part.type.slice("tool-".length)]
	return Renderer ? <Renderer part={tool} /> : null
}

function UserMessage({ message }: { readonly message: LhViewMessage }) {
	const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n")
	return (
		<div data-testid="user-message" className="my-2 w-full border-l-2 border-current/30 bg-card py-1 pl-3 pr-4">
			<div className="text-[13px] font-medium uppercase tracking-wide opacity-70">You</div>
			<div className="whitespace-pre-wrap">{text}</div>
		</div>
	)
}

interface Props {
	readonly messages: readonly LhViewMessage[]
	readonly status: string
	readonly error?: string | null
}

export function Transcript({ messages, status, error }: Props) {
	const last = messages.length - 1
	return (
		<div className="lh-m-prose mx-auto w-full px-4 py-4" data-testid="transcript">
			{messages.map((m, mi) =>
				m.role === "user" ? (
					<UserMessage key={m.id || `m-${mi}`} message={m} />
				) : (
					<Message key={m.id || `m-${mi}`} from="assistant" className="max-w-full">
						<MessageContent className="w-full">
							{m.parts.map((part, pi) => (
								<Fragment key={pi}>
									<PartView part={part} streaming={status === "streaming" && mi === last && pi === m.parts.length - 1} />
								</Fragment>
							))}
						</MessageContent>
					</Message>
				),
			)}
			{status === "submitted" ? (
				<span data-testid="thinking" className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide opacity-70">
					<BrailleSpinner label="Thinking" />
					<Shimmer duration={1}>THINKING...</Shimmer>
				</span>
			) : null}
			{error ? (
				<p role="alert" className="mt-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-[15px]">
					Something went wrong. Pull the session again in a moment.
				</p>
			) : null}
		</div>
	)
}
