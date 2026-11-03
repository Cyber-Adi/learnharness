import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";
import type { RandomBytes } from "./devices.ts";

export interface IssuedCode {
	readonly code: string;
	readonly shortCode: string;
	readonly expiresAt: number;
}
export type RedeemResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: "invalid" | "rate_limited" };
export interface PairingStore {
	issueCode(now: number): IssuedCode;
	redeem(candidate: string, now: number): RedeemResult;
}

export const PAIRING_TTL_MS = 120_000;
const MAX_LIVE = 3;
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000;
// 32 symbols (A-Z without I and O, digits 2-9) so one random byte maps without bias.
const SHORT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHORT_LENGTH = 6;

interface Entry {
	readonly codeHash: Buffer;
	readonly shortHash: Buffer;
	readonly expiresAt: number;
}

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

/** State is closed over, so the core is testable with a fake clock and entropy. */
export function createPairingStore(randomBytes: RandomBytes = nodeRandomBytes): PairingStore {
	let entries: readonly Entry[] = [];
	let attempts: readonly number[] = [];

	function issueCode(now: number): IssuedCode {
		const code = randomBytes(16).toString("base64url");
		const shortCode = Array.from(randomBytes(SHORT_LENGTH), (b) => SHORT_ALPHABET[b & 31]).join("");
		const expiresAt = now + PAIRING_TTL_MS;
		const live = entries.filter((e) => e.expiresAt > now);
		entries = [...live.slice(-(MAX_LIVE - 1)), { codeHash: digest(code), shortHash: digest(shortCode), expiresAt }];
		return { code, shortCode, expiresAt };
	}

	function redeem(candidate: string, now: number): RedeemResult {
		attempts = attempts.filter((t) => now - t < WINDOW_MS);
		if (attempts.length >= MAX_ATTEMPTS) return { ok: false, reason: "rate_limited" };
		attempts = [...attempts, now];
		const asCode = digest(candidate);
		const asShort = digest(candidate.trim().toUpperCase());
		let hit = -1;
		// No early exit: timing does not reveal which entry matched.
		entries.forEach((e, i) => {
			const match = timingSafeEqual(asCode, e.codeHash) || timingSafeEqual(asShort, e.shortHash);
			if (match && e.expiresAt > now) hit = i;
		});
		entries = entries.filter((e, i) => i !== hit && e.expiresAt > now);
		return hit >= 0 ? { ok: true } : { ok: false, reason: "invalid" };
	}

	return { issueCode, redeem };
}
