import { cookies, headers } from "next/headers";
import { FORM_FACTOR_COOKIE, formFactorFromRequest } from "./form-factor-server.ts";
import type { FormFactor } from "./form-factor.ts";

/** The shell flag; read once so layout and pages agree. */
export const MOBILE_SHELL_ENABLED = process.env.NEXT_PUBLIC_LH_MOBILE_SHELL === "1";

/**
 * The per-request form factor for server components (root layout and pages), decided
 * before hydration (docs/LESSONS.md). Request data is read only when the shell is on:
 * reading it makes a route dynamic, and the desktop build must not change.
 */
export async function requestFormFactor(): Promise<FormFactor> {
	if (!MOBILE_SHELL_ENABLED) return "desktop";
	const [jar, h] = await Promise.all([cookies(), headers()]);
	return formFactorFromRequest({
		enabled: true,
		cookie: jar.get(FORM_FACTOR_COOKIE)?.value,
		userAgent: h.get("user-agent") ?? "",
		chMobile: h.get("sec-ch-ua-mobile"),
	});
}
