import type { ReactNode, RefObject, UIEventHandler } from "react"
import type { LhViewMessage } from "@/src/core"
import { SessionHeader } from "./session-header.tsx"
import type { SessionKind } from "./session-logic.ts"
import { Transcript } from "./transcript.tsx"

export const READ_ONLY_NOTICE = "Continue this session on your desktop."

export interface SessionViewProps {
	readonly title: string
	readonly kind?: SessionKind
	readonly messages: readonly LhViewMessage[]
	readonly status: string
	readonly error?: string | null
	readonly hasPending: boolean
	readonly turnRunning: boolean
	readonly onOpenAnswer: () => void
	readonly scrollRef?: RefObject<HTMLDivElement | null>
	readonly onScroll?: UIEventHandler<HTMLDivElement>
	readonly atBottom?: boolean
	readonly onJumpLatest?: () => void
	/** The question sheet. */
	readonly children?: ReactNode
}

const BAR = "shrink-0 border-t border-current/10 px-4 pt-2"
const BAR_STYLE = { paddingBottom: "calc(var(--lh-m-safe-bottom, env(safe-area-inset-bottom, 0px)) + 8px)" } as const

// Presentational: all state and effects live in MobileSession. No composer, model menu or steer controls by design.
export function SessionView(props: SessionViewProps) {
	const { hasPending, turnRunning, atBottom = true } = props
	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="mobile-session">
			<SessionHeader title={props.title} kind={props.kind} />
			<div className="relative min-h-0 flex-1">
				<div ref={props.scrollRef} onScroll={props.onScroll} className="h-full overflow-y-auto overscroll-contain">
					<Transcript messages={props.messages} status={props.status} error={props.error} />
				</div>
				{!atBottom && props.onJumpLatest ? (
					<button
						type="button"
						onClick={props.onJumpLatest}
						className="lh-m-glass absolute bottom-3 right-4 rounded-full border px-4 text-[15px] font-medium"
						style={{ minHeight: 44, minWidth: 44 }}
					>
						Jump to latest
					</button>
				) : null}
			</div>
			{hasPending ? (
				<div className={BAR} style={BAR_STYLE}>
					<button type="button" onClick={props.onOpenAnswer} className="w-full rounded-[var(--lh-m-radius-control,12px)] bg-foreground px-4 text-[17px] font-semibold text-background" style={{ minHeight: 48 }}>
						Answer
					</button>
				</div>
			) : !turnRunning ? (
				<p data-testid="read-only-notice" className={`${BAR} text-center text-[15px] opacity-70`} style={BAR_STYLE}>
					{READ_ONLY_NOTICE}
				</p>
			) : null}
			{props.children}
		</div>
	)
}
