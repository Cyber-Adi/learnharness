"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/controls";
import { DeviceList } from "./pair-devices.tsx";
import {
	DEVICES_PATH,
	PAIRING_CODE_PATH,
	formatCountdown,
	groupShortCode,
	parseCodeResponse,
	parseDevices,
	remainingMs,
	type PairCode,
	type PairDevice,
} from "./pair-dialog-model.ts";
import { PairQr } from "./pair-qr.tsx";

export const REMOTE_OFF_COPY = "Remote access is off. Set LH_REMOTE_HOSTS on the host to pair a phone.";

/** QR, grouped short code and a live countdown; an expired code offers a new one instead. */
export function PairCodePanel({ code, now, onNewCode }: { code: PairCode; now: number; onNewCode: () => void }) {
	const left = remainingMs(code.expiresAt, now);
	if (left === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-4" data-testid="pair-expired">
				<p className="text-sm text-muted-foreground">This code has expired.</p>
				<Button type="button" onClick={onNewCode}>New code</Button>
			</div>
		);
	}
	return (
		<div className="flex flex-col items-center gap-4" data-testid="pair-code">
			<PairQr value={code.pairUrl} />
			<p className="font-mono text-3xl tracking-widest" aria-label="Short code">{groupShortCode(code.shortCode)}</p>
			<p className="text-xs text-muted-foreground">Expires in {formatCountdown(left)}</p>
		</div>
	);
}

interface ViewProps {
	readonly remote: "unknown" | "off";
	readonly devices: readonly PairDevice[];
	readonly now: number;
	readonly confirmingId: string | null;
	readonly busy: boolean;
	readonly onPair: () => void;
	readonly onAskRevoke: (id: string) => void;
	readonly onConfirmRevoke: (id: string) => void;
	readonly onCancelRevoke: () => void;
}

export function PairPhoneView(p: ViewProps) {
	return (
		<SettingsSection title="Phone" hint="Continue your sessions from an iPhone." testid="pair-phone">
			<DeviceList
				devices={p.devices}
				now={p.now}
				confirmingId={p.confirmingId}
				onAskRevoke={p.onAskRevoke}
				onConfirmRevoke={p.onConfirmRevoke}
				onCancel={p.onCancelRevoke}
			/>
			{p.remote === "off" ? (
				<p className="text-xs text-muted-foreground" role="status">{REMOTE_OFF_COPY}</p>
			) : (
				<div>
					<Button type="button" variant="outline" size="sm" disabled={p.busy} onClick={p.onPair}>Pair a phone</Button>
				</div>
			)}
		</SettingsSection>
	);
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
	try {
		const res = await fetch(url, { ...init, credentials: "same-origin" });
		return await res.json();
	} catch {
		return null;
	}
}

/** Desktop Settings section: paired devices, revoke, and the pairing dialog. */
export function PairPhoneSection() {
	const [devices, setDevices] = useState<readonly PairDevice[]>([]);
	const [remote, setRemote] = useState<"unknown" | "off">("unknown");
	const [code, setCode] = useState<PairCode | null>(null);
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	const [confirmingId, setConfirmingId] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());

	const refresh = useCallback(async () => {
		const list = parseDevices(await getJson(DEVICES_PATH));
		if (list) setDevices(list);
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useEffect(() => {
		if (!open) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [open]);

	const pair = useCallback(async () => {
		setBusy(true);
		setError(false);
		const result = parseCodeResponse(await getJson(PAIRING_CODE_PATH, { method: "POST" }));
		setBusy(false);
		setNow(Date.now());
		if (result.kind === "remote_disabled") return setRemote("off");
		if (result.kind === "error") return setError(true);
		setCode(result.code);
		setOpen(true);
	}, []);

	const revoke = useCallback(
		async (id: string) => {
			setConfirmingId(null);
			await getJson(`${DEVICES_PATH}/${id}`, { method: "DELETE" });
			await refresh();
		},
		[refresh],
	);

	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) {
			setCode(null);
			void refresh();
		}
	};

	return (
		<>
			<PairPhoneView
				remote={remote}
				devices={devices}
				now={now}
				confirmingId={confirmingId}
				busy={busy}
				onPair={() => void pair()}
				onAskRevoke={setConfirmingId}
				onConfirmRevoke={(id) => void revoke(id)}
				onCancelRevoke={() => setConfirmingId(null)}
			/>
			{error && <p className="px-6 text-xs text-destructive" role="alert">Could not get a pairing code. Try again.</p>}
			<Dialog.Root open={open} onOpenChange={onOpenChange}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
					<Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-lg">
						<Dialog.Title className="text-sm uppercase tracking-widest">Pair a phone</Dialog.Title>
						<Dialog.Description className="mb-4 mt-1 text-xs text-muted-foreground">
							Scan with the iPhone camera, or open LearnHarness on the phone and enter the code.
						</Dialog.Description>
						{code && <PairCodePanel code={code} now={now} onNewCode={() => void pair()} />}
						<div className="mt-4 flex justify-end">
							<Dialog.Close asChild>
								<Button type="button" variant="ghost" size="sm">Close</Button>
							</Dialog.Close>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</>
	);
}
