export type RequestKind = "desktop" | "remote" | "local" | "reject";

export interface ClassifyInput {
	readonly hostHeader: string | null | undefined;
	readonly remoteHosts: readonly string[];
	readonly desktopCapabilityValid: boolean;
	readonly desktopModeConfigured: boolean;
	/** Any of Forwarded / X-Forwarded-For / X-Forwarded-Host present: a proxy
	 * or tunnel relayed this request, so a loopback Host proves nothing. */
	readonly forwarded: boolean;
}

// Same port grammar as LH_REMOTE_HOSTS (schemas.ts): 1..65535, no leading zero.
const LOOPBACK = /^(?:127\.0\.0\.1|\[::1\]|localhost)(?::([1-9][0-9]{0,4}))?$/;

function isLoopback(host: string): boolean {
	const m = LOOPBACK.exec(host);
	if (!m) return false;
	return m[1] === undefined || Number(m[1]) <= 65535;
}

/** Order matters: capability, then tunnel host, then direct loopback; all else is rejected. */
export function classifyRequest(input: ClassifyInput): RequestKind {
	if (input.desktopCapabilityValid) return "desktop";
	const host = input.hostHeader?.toLowerCase();
	if (!host) return "reject";
	if (input.remoteHosts.includes(host)) return "remote";
	if (!input.forwarded && isLoopback(host)) return "local";
	return "reject";
}

/** Upstream's browser-only branch (no secret configured), limited to loopback. */
export function localAuthorizedWithoutSecret(
	kind: RequestKind,
	desktopModeConfigured: boolean,
): boolean {
	return kind === "local" && !desktopModeConfigured;
}
