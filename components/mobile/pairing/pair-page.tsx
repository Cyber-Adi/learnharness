"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import {
	INITIAL_PAIR_STATE,
	INSTALL_STEPS,
	PAIR_COPY,
	normalizeDeviceName,
	normalizeShortCode,
	pairState,
	readAndClearHash,
	sanitizeShortCodeInput,
	submitPair,
	type PairSecret,
	type PairState,
} from "./pair-model.ts";

export interface PairViewProps {
	readonly phase: PairState["phase"];
	readonly hasCode: boolean;
	readonly deviceName: string;
	readonly shortCode: string;
	readonly onDeviceName: (value: string) => void;
	readonly onShortCode: (value: string) => void;
	readonly onSubmit: () => void;
	readonly onRetry: () => void;
}

const FIELD = "min-h-11 w-full rounded-md border border-border bg-transparent px-3 text-base";
const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-50";

function Paired() {
	return (
		<section className="flex flex-col gap-4" aria-live="polite">
			<h1 className="text-2xl font-semibold">{PAIR_COPY.paired}</h1>
			<p className="font-prose text-[17px] leading-[1.55]">Add LearnHarness to your home screen to use it like an app.</p>
			<ol className="flex list-decimal flex-col gap-2 pl-6 font-prose text-[17px] leading-[1.55]">
				{INSTALL_STEPS.map((step) => (
					<li key={step}>{step}</li>
				))}
			</ol>
			<Link href="/" className={`${BUTTON} no-underline`}>Continue in Safari</Link>
		</section>
	);
}

/** Presentational; PairPage owns the state so the view renders to static markup. */
export function PairView(p: PairViewProps) {
	if (p.phase === "paired") return <Paired />;
	const busy = p.phase === "submitting";
	const ready = p.hasCode || p.shortCode.length === 6;
	return (
		<form
			className="mx-auto flex w-full max-w-[68ch] flex-col gap-4 p-4"
			onSubmit={(e) => {
				e.preventDefault();
				p.onSubmit();
			}}
		>
			<h1 className="text-2xl font-semibold">Pair this phone</h1>
			{p.phase === "failed" && (
				<div role="alert" className="flex flex-col gap-3">
					<p className="font-prose text-[17px] leading-[1.55]">{PAIR_COPY.failed}</p>
					<button type="button" className={BUTTON} onClick={p.onRetry}>Try again</button>
				</div>
			)}
			{p.phase !== "failed" && (
				<>
					<label className="flex flex-col gap-1 text-base">
						Device name
						<input className={FIELD} value={p.deviceName} maxLength={64} autoComplete="off" onChange={(e) => p.onDeviceName(e.target.value)} />
					</label>
					<label className="flex flex-col gap-1 text-base">
						Have a code?
						<input
							className={`${FIELD} font-mono uppercase tracking-widest`}
							value={p.shortCode}
							inputMode="text"
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
							autoComplete="off"
							placeholder="6 characters"
							onChange={(e) => p.onShortCode(e.target.value)}
						/>
					</label>
					{!p.hasCode && p.shortCode === "" && <p className="text-sm text-muted-foreground">{PAIR_COPY.noCode}</p>}
					<button type="submit" className={BUTTON} disabled={busy || !ready}>Pair this phone</button>
				</>
			)}
		</form>
	);
}

/** Reads the code from the fragment once, clears it, and pairs same-origin. */
export function PairPage() {
	const [state, dispatch] = useReducer(pairState, INITIAL_PAIR_STATE);
	const [deviceName, setDeviceName] = useState("iPhone");
	const [shortCode, setShortCode] = useState("");
	const [code, setCode] = useState<string | null>(null);
	const read = useRef(false);

	useEffect(() => {
		if (read.current) return;
		read.current = true;
		setCode(readAndClearHash(window.location, window.history));
	}, []);

	const submit = async () => {
		const name = normalizeDeviceName(deviceName);
		const short = normalizeShortCode(shortCode);
		const secret: PairSecret | null = short ? { kind: "short", value: short } : code ? { kind: "code", value: code } : null;
		dispatch({ type: "submit" });
		const ok = name !== null && secret !== null && (await submitPair(fetch, secret, name));
		dispatch({ type: ok ? "succeeded" : "failed" });
	};

	return (
		<PairView
			phase={state.phase}
			hasCode={code !== null}
			deviceName={deviceName}
			shortCode={shortCode}
			onDeviceName={setDeviceName}
			onShortCode={(v) => setShortCode(sanitizeShortCodeInput(v))}
			onSubmit={() => void submit()}
			onRetry={() => dispatch({ type: "retry" })}
		/>
	);
}
