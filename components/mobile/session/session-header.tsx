import Link from "next/link"
import { kindLabel } from "./session-logic.ts"
import type { SessionKind } from "./session-logic.ts"

interface Props {
	readonly title: string
	readonly kind?: SessionKind
}

export function SessionHeader({ title, kind }: Props) {
	const label = kindLabel(kind)
	return (
		<header className="flex shrink-0 items-center gap-2 border-b border-current/10 px-2" style={{ minHeight: "var(--lh-m-topbar, 48px)" }}>
			<Link href="/" className="flex shrink-0 items-center justify-center rounded-[var(--lh-m-radius-control,12px)] px-3 text-[17px]" style={{ minHeight: 44, minWidth: 44 }}>
				Learn
			</Link>
			<h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h1>
			{label ? <span className="shrink-0 rounded-full border px-3 py-1 text-[13px]">{label}</span> : null}
		</header>
	)
}
