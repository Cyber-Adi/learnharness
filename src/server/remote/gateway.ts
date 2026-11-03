import { desktopAPIAuthorized } from "../desktop-access.ts";
import { classifyRequest, localAuthorizedWithoutSecret } from "./classify.ts";
import { readDeviceCookie } from "./devices.ts";
import { ERROR_STATUS, remoteError, type ErrorCode, type RemoteErrorEnvelope } from "./errors.ts";
import { RemoteHosts, type DeviceRecord } from "./schemas.ts";
import { remoteAllowed } from "./scopes.ts";

export interface GatewayEnv {
	/** Upstream's desktop mode: LH_DESKTOP_SERVER=1 or a secret is configured. */
	readonly desktopModeConfigured: boolean;
	/** True only when desktop mode is on AND the supplied capability matches. */
	readonly desktopCapabilityValid: boolean;
	readonly remoteHosts: readonly string[];
}
export interface GatewayInput {
	readonly method: string;
	readonly pathname: string;
	readonly headers: Headers | Readonly<Record<string, string | undefined>>;
	readonly env: GatewayEnv;
	readonly resolveDevice: (cookieValue: string) => DeviceRecord | null;
}
export type LegacyDenyBody = { readonly error: string };
export type GatewayDecision =
	| { readonly kind: "allow"; readonly via: "desktop" | "local" | "remote"; readonly deviceId?: string }
	| { readonly kind: "deny"; readonly status: number; readonly body: RemoteErrorEnvelope | LegacyDenyBody };

/** Upstream's exact 403 body for an unauthorized local request in desktop mode. */
export const LOCAL_DENY_BODY: LegacyDenyBody = Object.freeze({
	error: "Desktop API access requires the trusted LearnHarness window.",
});
const PUBLIC_REMOTE = { method: "POST", pathname: "/api/remote/pair" } as const;
const FORWARDING = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"] as const;

const deny = (code: ErrorCode): GatewayDecision =>
	Object.freeze({ kind: "deny" as const, status: ERROR_STATUS[code], body: remoteError(code) });

function headerGetter(headers: GatewayInput["headers"]): (name: string) => string | null {
	if (headers instanceof Headers) return (name) => headers.get(name);
	const lowered = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	return (name) => lowered.get(name) ?? null;
}

/** Env plumbing for proxy.ts. An invalid LH_REMOTE_HOSTS fails closed (remote off). */
export function gatewayEnv(
	env: Readonly<Record<string, string | undefined>>,
	headers: Headers,
): GatewayEnv {
	const desktopModeConfigured = env.LH_DESKTOP_SERVER === "1" || !!env.LH_DESKTOP_API_SECRET;
	const hosts = RemoteHosts.safeParse(env.LH_REMOTE_HOSTS);
	return {
		desktopModeConfigured,
		desktopCapabilityValid: desktopModeConfigured && desktopAPIAuthorized(headers, env),
		remoteHosts: hosts.success ? hosts.data : [],
	};
}

function decideRemote(input: GatewayInput, get: (n: string) => string | null, host: string): GatewayDecision {
	const method = input.method.toUpperCase();
	const originOk = method === "GET" || get("origin") === `https://${host}`;
	if (method === PUBLIC_REMOTE.method && input.pathname === PUBLIC_REMOTE.pathname) {
		return originOk ? { kind: "allow", via: "remote" } : deny("bad_origin");
	}
	const cookie = readDeviceCookie(get("cookie"));
	const device = cookie === null ? null : input.resolveDevice(cookie);
	if (!device) return deny("unauthorized");
	if (!remoteAllowed(method, input.pathname, device.scopes)) return deny("forbidden_scope");
	if (!originOk) return deny("bad_origin");
	return { kind: "allow", via: "remote", deviceId: device.id };
}

/** Pure decision: desktop capability, then classify, then per-kind rules. */
export function decide(input: GatewayInput): GatewayDecision {
	const get = headerGetter(input.headers);
	const host = get("host");
	const base = {
		hostHeader: host,
		remoteHosts: input.env.remoteHosts,
		desktopCapabilityValid: input.env.desktopCapabilityValid,
		desktopModeConfigured: input.env.desktopModeConfigured,
	};
	const kind = classifyRequest({ ...base, forwarded: FORWARDING.some((h) => get(h) !== null) });
	if (kind === "desktop") return { kind: "allow", via: "desktop" };
	if (kind === "local") {
		return localAuthorizedWithoutSecret(kind, input.env.desktopModeConfigured)
			? { kind: "allow", via: "local" }
			: { kind: "deny", status: 403, body: LOCAL_DENY_BODY };
	}
	if (kind === "remote") return decideRemote(input, get, (host ?? "").toLowerCase());
	// Desktop mode keeps upstream's contract: every request without the capability is its 403.
	if (input.env.desktopModeConfigured) return { kind: "deny", status: 403, body: LOCAL_DENY_BODY };
	// A relayed loopback Host is still bad_host; only a foreign Host with remote off reads as disabled.
	const loopback = classifyRequest({ ...base, forwarded: false }) === "local";
	return deny(input.env.remoteHosts.length === 0 && !loopback ? "remote_disabled" : "bad_host");
}
