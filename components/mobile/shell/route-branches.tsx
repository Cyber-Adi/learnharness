"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { Chat as ChatComponent } from "@/components/chat"
import type { Home as HomeComponent } from "@/components/home"
import type { LearnScreen as LearnScreenComponent } from "../learn/learn-screen.tsx"
import type { MobileSession as MobileSessionComponent } from "../session/mobile-session.tsx"

// A server component that imports both trees ships both to every browser (Next does not code-split a
// client component imported from a server component). These client branches lazy-load only the tree
// that renders, so a phone never downloads the desktop app and a desktop never downloads the phone shell.
// SSR still renders the chosen branch, and its chunk is preloaded with the page.
const Home = dynamic(() => import("@/components/home").then((m) => m.Home))
const LearnScreen = dynamic(() => import("../learn/learn-screen.tsx").then((m) => m.LearnScreen))
const Chat = dynamic(() => import("@/components/chat").then((m) => m.Chat))
const MobileSession = dynamic(() => import("../session/mobile-session.tsx").then((m) => m.MobileSession))

export type HomeBranchProps =
	| { readonly mobile: ComponentProps<typeof LearnScreenComponent> }
	| { readonly desktop: ComponentProps<typeof HomeComponent> }

export function HomeBranch(props: HomeBranchProps) {
	return "mobile" in props ? <LearnScreen {...props.mobile} /> : <Home {...props.desktop} />
}

export type ChatBranchProps =
	| { readonly mobile: ComponentProps<typeof MobileSessionComponent> }
	| { readonly desktop: ComponentProps<typeof ChatComponent> }

export function ChatBranch(props: ChatBranchProps) {
	return "mobile" in props ? <MobileSession {...props.mobile} /> : <Chat {...props.desktop} />
}
