import { createHash, randomBytes as nodeRandomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SETTINGS_FILE } from "../../../config.ts";
import { DeviceRecord, PairingCode } from "./schemas.ts";
import { HOST_ONLY_SCOPES, type Scope } from "./scopes.ts";

export type RandomBytes = (size: number) => Buffer;
export const DEVICE_COOKIE_NAME = "__Host-lh_device";
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
const SEEN_INTERVAL_MS = 60_000;

const StoredDevice = DeviceRecord.extend({
	tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
	revokedAt: z.iso.datetime().optional(),
});
type StoredDevice = z.infer<typeof StoredDevice>;
const DevicesFile = z.strictObject({ version: z.literal(1), devices: z.array(StoredDevice) });

export interface NewDevice {
	readonly name: string;
	readonly scopes: readonly Scope[];
}
export interface ListedDevice extends DeviceRecord {
	readonly revokedAt?: string;
}

/** Lives beside settings.json so LH_DATA_DIR relocates it too. */
export function defaultDevicesFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
	return env.LH_REMOTE_DEVICES_FILE || path.join(path.dirname(SETTINGS_FILE), "devices.json");
}

type Loaded =
	| { readonly state: "ok"; readonly devices: readonly StoredDevice[] }
	| { readonly state: "corrupt" };

function load(file: string): Loaded {
	let raw: string;
	try {
		raw = readFileSync(file, "utf8");
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return { state: "ok", devices: [] };
		return corrupt();
	}
	try {
		const parsed = DevicesFile.safeParse(JSON.parse(raw));
		return parsed.success ? { state: "ok", devices: parsed.data.devices } : corrupt();
	} catch {
		return corrupt();
	}
}

function corrupt(): Loaded {
	console.error("remote devices store is unreadable; refusing to modify it");
	return { state: "corrupt" };
}

function save(file: string, devices: readonly StoredDevice[]): void {
	mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${randomUUID()}.tmp`;
	writeFileSync(tmp, JSON.stringify({ version: 1, devices }, null, "\t"), { mode: 0o600 });
	renameSync(tmp, file);
}

function writable(file: string): readonly StoredDevice[] {
	const loaded = load(file);
	if (loaded.state === "corrupt") throw new Error("devices store unavailable");
	return loaded.devices;
}

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

function toRecord(s: StoredDevice): DeviceRecord {
	return {
		id: s.id,
		name: s.name,
		scopes: s.scopes,
		createdAt: s.createdAt,
		lastSeenAt: s.lastSeenAt,
		keyVersion: s.keyVersion,
	};
}

export function createDevice(
	file: string,
	input: NewDevice,
	now: number,
	randomBytes: RandomBytes = nodeRandomBytes,
): { readonly record: DeviceRecord; readonly token: string } {
	const scopes = [...new Set(input.scopes.filter((s) => !HOST_ONLY_SCOPES.includes(s)))];
	const token = randomBytes(32).toString("base64url");
	const stored = StoredDevice.parse({
		id: randomBytes(16).toString("base64url"),
		name: input.name,
		scopes,
		createdAt: new Date(now).toISOString(),
		lastSeenAt: null,
		keyVersion: 1,
		tokenHash: hashToken(token),
	});
	save(file, [...writable(file), stored]);
	return { record: toRecord(stored), token };
}

function parseCookie(value: string): { id: string; token: string } | null {
	const dot = value.indexOf(".");
	if (dot < 0) return null;
	const id = value.slice(0, dot);
	const token = value.slice(dot + 1);
	if (!PairingCode.safeParse(id).success || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
	return { id, token };
}

export function resolveDevice(file: string, cookieValue: string, now: number): DeviceRecord | null {
	const parsed = parseCookie(cookieValue);
	if (!parsed) return null;
	const loaded = load(file);
	if (loaded.state !== "ok") return null;
	const found = loaded.devices.find((d) => d.id === parsed.id);
	if (!found) return null;
	const a = Buffer.from(hashToken(parsed.token));
	const b = Buffer.from(found.tokenHash);
	if (a.length !== b.length || !timingSafeEqual(a, b) || found.revokedAt) return null;
	const lastSeen = found.lastSeenAt === null ? null : Date.parse(found.lastSeenAt);
	if (lastSeen !== null && now - lastSeen < SEEN_INTERVAL_MS) return toRecord(found);
	const updated: StoredDevice = { ...found, lastSeenAt: new Date(now).toISOString() };
	try {
		save(file, loaded.devices.map((d) => (d.id === found.id ? updated : d)));
	} catch {
		console.error("could not record device activity");
	}
	return toRecord(updated);
}

export function listDevices(file: string): readonly ListedDevice[] {
	const loaded = load(file);
	if (loaded.state !== "ok") return [];
	return loaded.devices.map((d) => ({
		...toRecord(d),
		...(d.revokedAt ? { revokedAt: d.revokedAt } : {}),
	}));
}

/** Revocation never deletes the record. Returns false for an unknown id. */
export function revokeDevice(file: string, id: string, now: number): boolean {
	const devices = writable(file);
	if (!devices.some((d) => d.id === id)) return false;
	const stamp = new Date(now).toISOString();
	save(file, devices.map((d) => (d.id === id ? { ...d, revokedAt: d.revokedAt ?? stamp } : d)));
	return true;
}

export function deviceCookie(value: string): string {
	return `${DEVICE_COOKIE_NAME}=${value}; Max-Age=${COOKIE_MAX_AGE_S}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function readDeviceCookie(header: string | null | undefined): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq < 0) continue;
		if (part.slice(0, eq).trim() === DEVICE_COOKIE_NAME) return part.slice(eq + 1).trim() || null;
	}
	return null;
}
