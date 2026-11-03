import { z } from "zod";
import { detectElectron, type FormFactor } from "./form-factor.ts";

export { FORM_FACTOR_COOKIE, formFactorCookie } from "./form-factor.ts";

const CookieValue = z.enum(["mobile", "desktop"]);
const ChMobile = z.enum(["?1", "?0"]);

export interface FormFactorRequest {
	readonly enabled: boolean;
	readonly cookie: string | undefined;
	readonly userAgent: string;
	readonly chMobile: string | null;
}

/** iPad is desktop on purpose; Android tablets omit "Mobile" from the UA. */
const PHONE_UA = /iPhone|iPod|Android.*\sMobile/;

/** Server-side first guess: cookie, then client hint, then user agent. */
export function formFactorFromRequest(req: FormFactorRequest): FormFactor {
	if (!req.enabled || detectElectron(req.userAgent)) return "desktop";
	const cookie = CookieValue.safeParse(req.cookie);
	if (cookie.success) return cookie.data;
	const hint = ChMobile.safeParse(req.chMobile);
	if (hint.success) return hint.data === "?1" ? "mobile" : "desktop";
	return PHONE_UA.test(req.userAgent) ? "mobile" : "desktop";
}
