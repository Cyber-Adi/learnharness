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
