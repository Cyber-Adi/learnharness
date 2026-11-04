import { desktopAPIAuthorized } from "../desktop-access.ts";
import { classifyRequest, localAuthorizedWithoutSecret } from "./classify.ts";
import { readDeviceCookie } from "./devices.ts";
import { ERROR_STATUS, remoteError, type ErrorCode, type RemoteErrorEnvelope } from "./errors.ts";
import { HOST_ADMIN_HEADER, expectedHostToken, hostAdminMatches, hostTokenRoute } from "./host-token.ts";
import { RemoteHosts, type DeviceRecord } from "./schemas.ts";
import { HOST_ONLY_SCOPES, remoteAllowed, scopeFor } from "./scopes.ts";

export interface GatewayEnv {
	/** Upstream's desktop mode: LH_DESKTOP_SERVER=1 or a secret is configured. */
	readonly desktopModeConfigured: boolean;
	/** True only when desktop mode is on AND the supplied capability matches. */
	readonly desktopCapabilityValid: boolean;
	readonly remoteHosts: readonly string[];
	/** Local-only host credential (headless host); precomputed so `decide` stays pure. */
	readonly hostAdminValid?: boolean;
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
const FORWARDING_EXACT: ReadonlySet<string> = new Set(["forwarded", "via", "x-real-ip"]);
const FORWARDING_PREFIXES = ["x-forwarded-", "tailscale-"] as const;
// Next's base-server fills these four with `??=` on every request, so their presence alone
// proves nothing; only values that differ from what Next itself would write mark a relay.
const NEXT_FILLED: ReadonlySet<string> = new Set(["x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto"]);
const LOOPBACK_PEER = /^(?:127(?:\.[0-9]{1,3}){3}|::1|::ffff:127(?:\.[0-9]{1,3}){3})$/;
const PORT = /^[1-9][0-9]{0,4}$/;
const LOOPBACK_ORIGIN = /^https?:\/\/(?:127\.0\.0\.1|\[::1\]|localhost)(?::[1-9][0-9]{0,4})?$/;
// Public pages a device-less phone must reach to pair.
const PUBLIC_PAGE = /^\/pair(?:\/.*)?$/;

const isApi = (pathname: string): boolean => pathname === "/api" || pathname.startsWith("/api/");

/** Any relay marker means a loopback Host proves nothing about the peer. */
function relayed(headers: GatewayInput["headers"], get: (n: string) => string | null): boolean {
	const names = headers instanceof Headers ? [...headers.keys()] : Object.keys(headers);
	const marker = names.some((raw) => {
		const n = raw.toLowerCase();
		if (NEXT_FILLED.has(n)) return false;
		return FORWARDING_EXACT.has(n) || FORWARDING_PREFIXES.some((p) => n.startsWith(p));
	});
	if (marker) return true;
	const peer = get("x-forwarded-for");
	const proto = get("x-forwarded-proto");
	const fwdHost = get("x-forwarded-host");
	const port = get("x-forwarded-port");
	if (peer !== null && !LOOPBACK_PEER.test(peer.trim())) return true;
	if (proto !== null && proto !== "http") return true;
	if (fwdHost !== null && fwdHost.toLowerCase() !== (get("host") ?? "").toLowerCase()) return true;
	return port !== null && !PORT.test(port);
}

/** With remote on, loopback alone cannot prove the peer is local (a tunnel that adds no
 * headers looks identical), so host-only scopes need the desktop capability. */
function hostOnlyRoute(method: string, pathname: string): boolean {
	const scope = scopeFor(method, pathname);
	return scope !== null && HOST_ONLY_SCOPES.includes(scope);
}

/** Local CSRF: a cross-site page can aim a POST at localhost; browsers label it. */
function localOriginOk(method: string, get: (n: string) => string | null): boolean {
	if (method === "GET") return true;
	const origin = get("origin");
	if (origin !== null && !LOOPBACK_ORIGIN.test(origin)) return false;
	const site = get("sec-fetch-site");
	return site === null || site === "same-origin" || site === "none";
}

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
		// Present only when true, so the env shape is unchanged for every other deployment.
		...(hostAdminMatches(headers.get(HOST_ADMIN_HEADER), expectedHostToken(env)) ? { hostAdminValid: true } : {}),
	};
}

function decideRemote(input: GatewayInput, get: (n: string) => string | null, host: string): GatewayDecision {
	const method = input.method.toUpperCase();
	const originOk = method === "GET" || get("origin") === `https://${host}`;
	const page = !isApi(input.pathname);
	const publicRoute =
		page ? PUBLIC_PAGE.test(input.pathname) : method === PUBLIC_REMOTE.method && input.pathname === PUBLIC_REMOTE.pathname;
	if (publicRoute) return originOk ? { kind: "allow", via: "remote" } : deny("bad_origin");
	const cookie = readDeviceCookie(get("cookie"));
	const device = cookie === null ? null : input.resolveDevice(cookie);
	if (!device) return deny("unauthorized");
	const permitted = page ? device.scopes.includes("learn") : remoteAllowed(method, input.pathname, device.scopes);
	if (!permitted) return deny("forbidden_scope");
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
	const kind = classifyRequest({ ...base, forwarded: relayed(input.headers, get) });
	if (kind === "desktop") return { kind: "allow", via: "desktop" };
	if (kind === "local") {
		// Pages are served to loopback browsers and the Electron window without the capability.
		const authorized = !isApi(input.pathname) || localAuthorizedWithoutSecret(kind, input.env.desktopModeConfigured);
		if (!authorized) return { kind: "deny", status: 403, body: LOCAL_DENY_BODY };
		// The host admin token stands in for the desktop capability on a headless host (local kind only).
		const hostAdmin = input.env.hostAdminValid === true && hostTokenRoute(input.method, input.pathname);
		if (input.env.remoteHosts.length > 0 && !hostAdmin && hostOnlyRoute(input.method, input.pathname)) return deny("forbidden_scope");
		return localOriginOk(input.method.toUpperCase(), get) ? { kind: "allow", via: "local" } : deny("bad_origin");
	}
	if (kind === "remote") return decideRemote(input, get, (host ?? "").toLowerCase());
	// Desktop mode keeps upstream's contract: every request without the capability is its 403.
	if (input.env.desktopModeConfigured) return { kind: "deny", status: 403, body: LOCAL_DENY_BODY };
	// A relayed loopback Host is still bad_host; only a foreign Host with remote off reads as disabled.
	const loopback = classifyRequest({ ...base, forwarded: false }) === "local";
	return deny(input.env.remoteHosts.length === 0 && !loopback ? "remote_disabled" : "bad_host");
}
