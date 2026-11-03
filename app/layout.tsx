import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { FormFactorSwitch } from "@/components/mobile/shell/form-factor-switch";
import { MOBILE_SHELL_ENABLED, requestFormFactor } from "@/components/mobile/shell/request-form-factor";
import { MobileShell } from "@/components/mobile/shell/mobile-shell";
import { SwRegister } from "@/components/mobile/pwa/sw-register";
import { ReducedMotionRoot } from "@/components/mobile/reduced-motion";
import "@/components/mobile/mobile.css";

// LMobile: the phone shell stays dark until Phase 1 fills it (docs/PRD-mobile-access.md).
const MOBILE_SHELL = MOBILE_SHELL_ENABLED;

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
};

// Phone chrome: content under the notch is padded by MobileShell; the
// keyboard resizes the layout viewport so the composer stays visible.
export const viewport: Viewport = {
	viewportFit: "cover",
	interactiveWidget: "resizes-content",
	themeColor: "#141414",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const initial = await requestFormFactor();
	return (
		<html lang="en" className={`dark ${ui.variable} ${prose.variable}`}>
			<body className="min-h-dvh antialiased">
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			<ServerEventsProvider>
				<AppearanceProvider>
					<SidebarProvider>
						<ActivityProvider>
							<FormFactorSwitch
								enabled={MOBILE_SHELL}
								initial={initial}
								desktop={<AppShell>{children}</AppShell>}
								mobile={
									<ReducedMotionRoot>
										<MobileShell>{children}</MobileShell>
										<SwRegister active={MOBILE_SHELL} />
									</ReducedMotionRoot>
								}
							/>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</ServerEventsProvider>
			{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
			<UpdateBanner />
		</body>
		</html>
	);
}
