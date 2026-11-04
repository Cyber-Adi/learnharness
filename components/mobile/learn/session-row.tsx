import Link from "next/link"
import { motion } from "motion/react"
import type { ChatListItem } from "@/src/core"
import { DURATION, EASE, staggerDelay, toSeconds } from "../motion.ts"
import { relativeTime } from "./learn-model.ts"

interface Props {
	readonly chat: ChatListItem
	readonly now: number
	readonly timeZone?: string
	// Only rows that just arrived fade in; the first paint is static.
	readonly fresh?: boolean
	readonly index?: number
	readonly reduced: boolean
}

export function isLearnersTurn(chat: ChatListItem): boolean {
	return chat.pendingQuestion || chat.pendingProblem
}

function RowBody({ chat, now, timeZone }: Pick<Props, "chat" | "now" | "timeZone">) {
	const meta = [chat.kind === "practice" ? "Practice" : "", relativeTime(chat.updatedAt, now, timeZone)]
		.filter((part) => part !== "")
		.join(" · ")
	return (
		<Link
			href={`/chat/${encodeURIComponent(chat.id)}`}
			className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-current/5"
		>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-base font-medium">{chat.title}</span>
				<span className="truncate text-xs opacity-70">{meta}</span>
			</span>
			{chat.busy ? <span className="shrink-0 text-xs opacity-70">Working</span> : null}
			{isLearnersTurn(chat) ? (
				<span className="shrink-0 rounded-full bg-current/10 px-2.5 py-1 text-xs font-semibold">Your turn</span>
			) : null}
		</Link>
	)
}

export function SessionRow({ chat, now, timeZone, fresh = false, index = 0, reduced }: Props) {
	const body = <RowBody chat={chat} now={now} timeZone={timeZone} />
	if (reduced) return <li>{body}</li>
	return (
		<motion.li
			initial={fresh ? { opacity: 0 } : false}
			animate={{ opacity: 1 }}
			transition={{
				duration: toSeconds(DURATION.base),
				delay: toSeconds(staggerDelay(index)),
				ease: EASE.enter,
			}}
		>
			{body}
		</motion.li>
	)
}
