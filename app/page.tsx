import { Home } from "@/components/home";
import { LearnScreen } from "@/components/mobile/learn/learn-screen";
import { requestFormFactor } from "@/components/mobile/shell/request-form-factor";
import { compactionInFlight, isTurnRunning, listChats, readSettingsRecord } from "@/src/server";
import { resolveSettings, slotsConfigured } from "@/src/core";

// Dynamic: the configured state is server-rendered into the page (the
// setup CTA's truth on the first frame), and every navigation re-reads
// the record (dynamic routes aren't cached client-side).
export const dynamic = "force-dynamic";

export default async function HomePage() {
	// Mobile fork: the phone's home is the Learn tab (continue existing sessions only).
	if ((await requestFormFactor()) === "mobile") {
		const initialChats = listChats().map((c) => ({ ...c, busy: isTurnRunning(c.id), compacting: compactionInFlight(c.id) }));
		return <LearnScreen initialChats={initialChats} now={Date.now()} />;
	}
	// First-run gate (model-slots wave): chats cannot start until the user
	// has picked all three slots — the dock shows the CTA while the raw
	// record's models section lacks any slot pin.
	const record = readSettingsRecord();
	// GRAPH RENDERING (owner, 2026-10-06): off = the home's main view is
	// the chains view. Resolved through the one core resolver (missing
	// section / absent key → factory default on); re-read per navigation.
	const rendering = resolveSettings(record ?? null).graph.rendering;
	return (
		<Home initialConfigured={slotsConfigured(record?.models)} rendering={rendering} />
	);
}
