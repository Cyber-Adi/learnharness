import { z } from "zod";
import { DEFAULT_MOBILE_SCOPES } from "./scopes.ts";
import {
	createDevice,
	defaultDevicesFile,
	deviceCookie,
	listDevices,
	revokeDevice,
} from "./devices.ts";
import { ERROR_STATUS, fromZodError, ok, remoteError, type ErrorCode } from "./errors.ts";
import { createPairingStore, type PairingStore } from "./pairing.ts";
import { PairingCode, PairRequest, RemoteHosts } from "./schemas.ts";

const MAX_BODY = 2048;
const NO_STORE = { "Cache-Control": "no-store" } as const;
const ShortCode = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/);
const PairBody = z.union([
	PairRequest,
	z.strictObject({ shortCode: ShortCode, deviceName: PairRequest.shape.deviceName }),
]);

let pairing: PairingStore = createPairingStore();
/** Test seam: swap the in-memory pairing store. */
export function setPairingStore(store: PairingStore): void {
	pairing = store;
}

function failure(code: ErrorCode): Response {
	return Response.json(remoteError(code), { status: ERROR_STATUS[code], headers: NO_STORE });
}
function success<T>(data: T, headers?: Record<string, string>): Response {
	return Response.json(ok(data), { headers: { ...NO_STORE, ...headers } });
}
function remoteHosts(): readonly string[] {
	const parsed = RemoteHosts.safeParse(process.env.LH_REMOTE_HOSTS);
	return parsed.success ? parsed.data : [];
}

export async function handlePairingCode(_req: Request): Promise<Response> {
	const host = remoteHosts()[0];
	if (!host) return failure("remote_disabled");
	const issued = pairing.issueCode(Date.now());
	return success({
		code: issued.code,
		shortCode: issued.shortCode,
		expiresAt: new Date(issued.expiresAt).toISOString(),
		pairUrl: `https://${host}/pair#${issued.code}`,
	});
}

async function readBody(req: Request): Promise<unknown> {
	try {
		const text = await req.text();
		return text.length > MAX_BODY ? undefined : JSON.parse(text);
	} catch {
		return undefined;
	}
}

export async function handlePair(req: Request): Promise<Response> {
	const parsed = PairBody.safeParse(await readBody(req));
	if (!parsed.success) return Response.json(fromZodError(parsed.error), { status: 400, headers: NO_STORE });
	const secret = "code" in parsed.data ? parsed.data.code : parsed.data.shortCode;
	const result = pairing.redeem(secret, Date.now());
	if (!result.ok) return failure(result.reason === "rate_limited" ? "rate_limited" : "unauthorized");
	try {
		const { record, token } = createDevice(
			defaultDevicesFile(),
			{ name: parsed.data.deviceName, scopes: DEFAULT_MOBILE_SCOPES },
			Date.now(),
		);
		return success(
			{ deviceId: record.id, name: record.name, scopes: record.scopes },
			{ "Set-Cookie": deviceCookie(`${record.id}.${token}`) },
		);
	} catch {
		return failure("internal");
	}
}

export async function handleListDevices(_req: Request): Promise<Response> {
	return success({ devices: listDevices(defaultDevicesFile()) });
}

export async function handleRevokeDevice(_req: Request, id: string): Promise<Response> {
	if (!PairingCode.safeParse(id).success) return failure("invalid_input");
	try {
		return success({ revoked: revokeDevice(defaultDevicesFile(), id, Date.now()) });
	} catch {
		return failure("internal");
	}
}
