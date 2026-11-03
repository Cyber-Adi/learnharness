import type { ChatListItem } from "@/src/core"
import { groupSessions } from "./learn-model.ts"
import { SessionRow } from "./session-row.tsx"

export interface LearnViewProps {
	readonly chats: readonly ChatListItem[]
	readonly online: boolean
	readonly hasList: boolean
	readonly now: number
	readonly timeZone?: string
	readonly freshIds?: ReadonlySet<string>
	readonly reduced: boolean
	readonly onRetry?: () => void
}

function Message({ heading, body, action }: { heading: string; body: string; action?: React.ReactNode }) {
	return (
		<div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
			<h2 className="text-lg font-semibold">{heading}</h2>
			<p className="max-w-[34ch] text-base opacity-70">{body}</p>
			{action}
		</div>
	)
}

function Body({ chats, online, hasList, now, timeZone, freshIds, reduced, onRetry }: LearnViewProps) {
	if (!hasList && !online && chats.length === 0) {
		return (
			<Message
				heading="Host offline"
				body="Your host is not reachable. Make sure it is running and connected to Tailscale."
				action={
					onRetry ? (
						<button
							type="button"
							onClick={onRetry}
							className="mt-3 min-h-11 min-w-11 rounded-full bg-current/10 px-5 text-base font-semibold"
						>
							Try again
						</button>
					) : null
				}
			/>
		)
	}
	if (chats.length === 0) {
		return <Message heading="No sessions yet" body="Start a session on your desktop. It will show up here." />
	}
	let index = 0
	return (
		<>
			{groupSessions(chats, now, timeZone).map((section) => (
				<section key={section.id} aria-label={section.label}>
					<h2 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide opacity-60">
						{section.label}
					</h2>
					<ul>
						{section.chats.map((chat) => {
							const fresh = freshIds?.has(chat.id) ?? false
							return (
								<SessionRow
									key={chat.id}
									chat={chat}
									now={now}
									timeZone={timeZone}
									fresh={fresh}
									index={fresh ? index++ : 0}
									reduced={reduced}
								/>
							)
						})}
					</ul>
				</section>
			))}
		</>
	)
}

export function LearnView(props: LearnViewProps) {
	return (
		<div>
			<header className="sticky top-0 z-10 bg-background px-4 pb-2 pt-3">
				<h1 className="text-3xl font-bold tracking-tight">Learn</h1>
			</header>
			<Body {...props} />
		</div>
	)
}
