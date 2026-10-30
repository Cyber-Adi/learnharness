import { z } from "zod";
import { SCOPES } from "./scopes.ts";

/** 128 bits unpadded base64url, canonical: the last char carries 2 data bits. */
export const PairingCode = z.string().regex(/^[A-Za-z0-9_-]{21}[AQgw]$/);
const DeviceId = PairingCode;
/** 256 bits unpadded base64url, canonical: the last char carries 4 data bits. */
const Token256 = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

// C0, DEL, C1, zero-width and bidi controls, and line/paragraph separators:
// a device name must not be able to spoof another in the revoke list.
const CONTROL = new RegExp(
	"[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]",
);
const DeviceName = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.refine((s) => !CONTROL.test(s));

const GrantableScope = z.enum(SCOPES).refine((s) => s !== "admin" && s !== "graph:write");

export const PairRequest = z.strictObject({ code: PairingCode, deviceName: DeviceName });
export type PairRequest = z.infer<typeof PairRequest>;

export const DeviceRecord = z.strictObject({
	id: DeviceId,
	name: DeviceName,
	scopes: z.array(GrantableScope).min(1),
	createdAt: z.iso.datetime(),
	lastSeenAt: z.iso.datetime().nullable(),
	keyVersion: z.number().int().min(1),
});
export type DeviceRecord = z.infer<typeof DeviceRecord>;

export const RefreshPayload = z.strictObject({ deviceId: DeviceId, token: Token256 });
export type RefreshPayload = z.infer<typeof RefreshPayload>;

const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const HOST_RE = new RegExp(`^(${LABEL}(?:\\.${LABEL})*)(?::([1-9][0-9]{0,4}))?$`);

function validHost(entry: string): boolean {
	const m = HOST_RE.exec(entry);
	const name = m?.[1];
	if (!m || !name) return false;
	if (m[2] !== undefined && Number(m[2]) > 65535) return false;
	if (name === "localhost" || name.endsWith(".localhost")) return false;
	// A numeric final label cannot be a real TLD: this catches IPv4 literals.
	const last = name.split(".").at(-1) ?? "";
	return !/^[0-9]+$/.test(last);
}

/** LH_REMOTE_HOSTS: empty or unset means remote access is off. */
export const RemoteHosts = z
	.string()
	.optional()
	.transform((raw, ctx): readonly string[] => {
		const entries = (raw ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s !== "");
		if (!entries.every(validHost)) {
			ctx.addIssue({ code: "custom", message: "invalid remote host list" });
			return z.NEVER;
		}
		return Object.freeze(entries);
	});
export type RemoteHosts = z.infer<typeof RemoteHosts>;
