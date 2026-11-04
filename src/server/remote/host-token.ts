import { createHash, timingSafeEqual } from "node:crypto";

/** Sent by the host's own tooling (scripts/host-pair.mjs) over loopback; never by a phone. */
export const HOST_ADMIN_HEADER = "x-lh-host-admin";
// 256 bits as unpadded base64url.
const MIN_LENGTH = 43;

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Constant-time compare (via fixed-size digests). Unset or short expected token never matches. */
export function hostAdminMatches(supplied: string | null, expected: string | undefined): boolean {
	if (!supplied || !expected || expected.length < MIN_LENGTH || supplied.length < MIN_LENGTH) return false;
	return timingSafeEqual(digest(supplied), digest(expected));
}

// Captured once at load and removed from process.env so agent subprocesses never inherit it.
const CAPTURED = process.env.LH_HOST_ADMIN_TOKEN;
delete process.env.LH_HOST_ADMIN_TOKEN;

/** The host's token: the captured one, else the passed env (tests and callers with their own env). */
export function expectedHostToken(env: Readonly<Record<string, string | undefined>>): string | undefined {
	return CAPTURED ?? env.LH_HOST_ADMIN_TOKEN;
}

const DEVICE_ID_ROUTE = /^\/api\/remote\/devices\/[^/]+$/;

/** The only routes the host token unlocks; everything else host-only still needs the desktop capability. */
export function hostTokenRoute(method: string, pathname: string): boolean {
	const m = method.toUpperCase();
	if (m === "POST") return pathname === "/api/remote/pairing-code";
	if (m === "GET") return pathname === "/api/remote/devices";
	return m === "DELETE" && DEVICE_ID_ROUTE.test(pathname);
}
