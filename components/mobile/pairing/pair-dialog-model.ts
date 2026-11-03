import { z } from "zod";

export const DEVICES_PATH = "/api/remote/devices";
export const PAIRING_CODE_PATH = "/api/remote/pairing-code";

export interface PairDevice {
	readonly id: string;
	readonly name: string;
	readonly createdAt: string;
	readonly lastSeenAt: string | null;
}
export interface PairCode {
	readonly shortCode: string;
	readonly expiresAt: string;
	readonly pairUrl: string;
}
export type CodeResult =
	| { readonly kind: "code"; readonly code: PairCode }
	| { readonly kind: "remote_disabled" }
	| { readonly kind: "error" };

/** "ABC234" becomes "ABC 234": easier to read aloud and to type from. */
export function groupShortCode(code: string): string {
	return (code.match(/.{1,3}/g) ?? []).join(" ");
}

export function remainingMs(expiresAt: string, now: number): number {
	const at = Date.parse(expiresAt);
	return Number.isNaN(at) ? 0 : Math.max(0, at - now);
}

export function formatCountdown(ms: number): string {
	const total = Math.ceil(Math.max(0, ms) / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export function relativeTime(iso: string | null, now: number): string {
	if (iso === null) return "never";
	const at = Date.parse(iso);
	if (Number.isNaN(at)) return "never";
	const minutes = Math.floor(Math.max(0, now - at) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return plural(minutes, "minute");
	if (minutes < 60 * 24) return plural(Math.floor(minutes / 60), "hour");
	return plural(Math.floor(minutes / (60 * 24)), "day");
}

// Strips everything else (token hashes never reach the UI) and drops revoked devices.
const DeviceRow = z.object({
	id: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
	name: z.string(),
	createdAt: z.string(),
	lastSeenAt: z.string().nullable(),
	revokedAt: z.string().optional(),
});
const DevicesResponse = z.object({ ok: z.literal(true), data: z.object({ devices: z.array(DeviceRow) }) });

export function parseDevices(json: unknown): readonly PairDevice[] | null {
	const parsed = DevicesResponse.safeParse(json);
	if (!parsed.success) return null;
	return parsed.data.data.devices
		.filter((d) => d.revokedAt === undefined)
		.map(({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt }));
}

const CodeResponse = z.object({
	ok: z.literal(true),
	data: z.object({ shortCode: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/), expiresAt: z.string(), pairUrl: z.url() }),
});
const ErrorResponse = z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) });

export function parseCodeResponse(json: unknown): CodeResult {
	const good = CodeResponse.safeParse(json);
	if (good.success) {
		const { shortCode, expiresAt, pairUrl } = good.data.data;
		return { kind: "code", code: { shortCode, expiresAt, pairUrl } };
	}
	const bad = ErrorResponse.safeParse(json);
	return bad.success && bad.data.error.code === "remote_disabled" ? { kind: "remote_disabled" } : { kind: "error" };
}
