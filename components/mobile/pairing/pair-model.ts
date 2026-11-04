import { z } from "zod";

export const PAIR_PATH = "/api/remote/pair";

// Same grammar as the server (src/server/remote/schemas.ts, pairing.ts); duplicated because
// components may not import src/server.
const LONG_CODE = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const SHORT_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const SHORT_LENGTH = 6;
// C0, DEL, C1, zero-width and bidi controls: a device name must not spoof another in the revoke list.
const CONTROL = new RegExp(
	"[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]",
);

export const PAIR_COPY = Object.freeze({
	failed: "That code did not work. It may have expired. Get a new code on your desktop.",
	paired: "Paired",
	noCode: "Open the pairing link from your desktop, or enter the short code below.",
});

export const INSTALL_STEPS: readonly string[] = Object.freeze([
	"In Safari, tap Share.",
	"Tap Add to Home Screen.",
	"Open LearnHarness from your home screen.",
]);

/** The code travels in the URL fragment so it never reaches a server log. */
export function codeFromHash(hash: string): string | null {
	const raw = hash.startsWith("#") ? hash.slice(1) : hash;
	return LONG_CODE.test(raw) ? raw : null;
}

export interface HashLocation {
	readonly hash: string;
	readonly pathname: string;
	readonly search: string;
}
export interface HashHistory {
	replaceState(data: null, unused: string, url: string): void;
}

/** Read the code, then drop the fragment from the address bar and history. */
export function readAndClearHash(loc: HashLocation, hist: HashHistory): string | null {
	if (loc.hash === "" || loc.hash === "#") return null;
	const code = codeFromHash(loc.hash);
	hist.replaceState(null, "", `${loc.pathname}${loc.search}`);
	return code;
}

/** For the live input: uppercase, drop everything that is not a letter or digit, cap the length. */
export function sanitizeShortCodeInput(raw: string): string {
	return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, SHORT_LENGTH);
}

export function normalizeShortCode(raw: string): string | null {
	const code = raw.replace(/\s+/g, "").toUpperCase();
	return SHORT_CODE.test(code) ? code : null;
}

export function normalizeDeviceName(raw: string): string | null {
	const name = raw.trim();
	return name.length >= 1 && name.length <= 64 && !CONTROL.test(name) ? name : null;
}

export type PairSecret = { readonly kind: "code" | "short"; readonly value: string };

export function buildPairRequest(secret: PairSecret, deviceName: string): { readonly url: string; readonly init: RequestInit } {
	const body = secret.kind === "code" ? { code: secret.value, deviceName } : { shortCode: secret.value, deviceName };
	return {
		url: PAIR_PATH,
		init: {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	};
}

const PairOk = z.object({ ok: z.literal(true) });

/** True only for an ok envelope. The reason for a failure is never surfaced. */
export async function submitPair(fetchFn: typeof fetch, secret: PairSecret, deviceName: string): Promise<boolean> {
	try {
		const { url, init } = buildPairRequest(secret, deviceName);
		const res = await fetchFn(url, init);
		if (!res.ok) return false;
		return PairOk.safeParse(await res.json()).success;
	} catch {
		return false;
	}
}

export type PairState = { readonly phase: "form" | "submitting" | "paired" | "failed" };
export type PairAction = { readonly type: "submit" | "succeeded" | "failed" | "retry" };
export const INITIAL_PAIR_STATE: PairState = Object.freeze({ phase: "form" });

export function pairState(state: PairState, action: PairAction): PairState {
	switch (action.type) {
		case "submit":
			return state.phase === "form" ? { phase: "submitting" } : state;
		case "succeeded":
			return state.phase === "submitting" ? { phase: "paired" } : state;
		case "failed":
			return state.phase === "submitting" ? { phase: "failed" } : state;
		case "retry":
			return state.phase === "failed" ? { phase: "form" } : state;
	}
}
/** The short code wins; the long code is used only while it is still unspent. */
export function chooseSecret(shortCode: string, code: string | null): PairSecret | null {
	const short = normalizeShortCode(shortCode);
	if (short) return { kind: "short", value: short };
	return code ? { kind: "code", value: code } : null;
}

/** A long code is single use: once tried (pass or fail) it is dropped, so a retry needs the short code. */
export function codeAfterAttempt(code: string | null, used: PairSecret | null): string | null {
	return used?.kind === "code" ? null : code;
}
