"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { MobileErrorBoundary } from "./error-boundary.tsx";
import { MOBILE_TABS, isTabActive, type MobileTab } from "./tabs.ts";

/** `--lh-m-vvh` value for a visualViewport height, or null when unusable. */
export function viewportVar(height: number): string | null {
	return Number.isFinite(height) && height > 0 ? `${height}px` : null;
}

const reload = () => window.location.reload();

interface Props {
	readonly children: ReactNode;
	readonly pathname?: string;
	readonly tabs?: readonly MobileTab[];
}

export function MobileShell({ children, pathname, tabs = MOBILE_TABS }: Props) {
	const routePath = usePathname();
	const current = pathname ?? routePath;
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const vv = window.visualViewport;
		const root = rootRef.current;
		if (!vv || !root) return;
		const sync = () => {
			const v = viewportVar(vv.height);
			if (v) root.style.setProperty("--lh-m-vvh", v);
		};
		sync();
		vv.addEventListener("resize", sync);
		vv.addEventListener("scroll", sync);
		return () => {
			vv.removeEventListener("resize", sync);
			vv.removeEventListener("scroll", sync);
			root.style.removeProperty("--lh-m-vvh");
		};
	}, []);

	return (
		<div
			ref={rootRef}
			data-lh-mobile=""
			className="fixed inset-0 flex flex-col bg-background text-foreground"
			style={{
				height: "100dvh",
				paddingTop: "var(--lh-m-safe-top, env(safe-area-inset-top, 0px))",
				paddingLeft: "var(--lh-m-safe-left, env(safe-area-inset-left, 0px))",
				paddingRight: "var(--lh-m-safe-right, env(safe-area-inset-right, 0px))",
			}}
		>
			{/* contain: layout makes main the containing block for position: fixed
			    children, so page chrome can never escape under the tab bar. */}
			<main className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ contain: "layout paint" }}>
				<MobileErrorBoundary onReload={reload}>{children}</MobileErrorBoundary>
			</main>
			<nav
				aria-label="Primary"
				className="flex shrink-0 border-t border-current/10"
				style={{
					minHeight: "var(--lh-m-tabbar, 56px)",
					paddingBottom: "var(--lh-m-safe-bottom, env(safe-area-inset-bottom, 0px))",
				}}
			>
				{tabs.map((tab) => (
					<Link
						key={tab.id}
						href={tab.href}
						aria-current={isTabActive(tab.href, current) ? "page" : undefined}
						className="flex min-h-11 min-w-11 flex-1 items-center justify-center text-sm aria-[current=page]:font-semibold"
					>
						{tab.label}
					</Link>
				))}
			</nav>
		</div>
	);
}
