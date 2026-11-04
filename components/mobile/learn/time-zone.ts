// Learn renders in one zone on server and client so hydration cannot differ (CR2).
export const TZ_COOKIE = "lh_tz"
const FALLBACK_ZONE = "UTC"
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60

function validZone(zone: string | undefined): zone is string {
	if (!zone) return false
	try {
		new Intl.DateTimeFormat("en", { timeZone: zone })
		return true
	} catch {
		return false
	}
}

/** The cookie's zone when it is a real IANA name, else UTC. */
export function resolveTimeZone(raw: string | undefined): string {
	return validZone(raw) ? raw : FALLBACK_ZONE
}

/** The zone to switch to after mount, or null when the device agrees or reports nonsense. */
export function deviceZoneChange(current: string, device: string | undefined): string | null {
	return validZone(device) && device !== current ? device : null
}

/** Cookie string to assign to document.cookie, or null for an invalid zone. */
export function tzCookie(zone: string): string | null {
	if (!validZone(zone)) return null
	return `${TZ_COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`
}
