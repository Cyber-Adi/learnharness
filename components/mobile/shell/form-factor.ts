export const MOBILE_MAX_WIDTH = 767;
export const NARROW_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;
export const COARSE_QUERY = "(pointer: coarse)";
export const STANDALONE_QUERY = "(display-mode: standalone)";

export type FormFactor = "mobile" | "desktop";

export interface FormFactorInput {
	readonly enabled: boolean;
	readonly width: number;
	readonly coarsePointer: boolean;
	readonly standalone: boolean;
	readonly electron: boolean;
}

/** Electron is always desktop; a narrow desktop window never switches there. */
export function resolveFormFactor(input: FormFactorInput): FormFactor {
	if (!input.enabled || input.electron) return "desktop";
	if (input.width < MOBILE_MAX_WIDTH + 1) return "mobile";
	if (input.coarsePointer && input.standalone) return "mobile";
	return "desktop";
}

/** Same rule as components/sidebar.tsx IS_ELECTRON. */
export function detectElectron(userAgent: string): boolean {
	return userAgent.includes("Electron");
}

export const FORM_FACTOR_COOKIE = "lh_ff";
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** Readable by the client (no HttpOnly) so a wrong guess can be corrected. */
export function formFactorCookie(value: FormFactor): string {
	return `${FORM_FACTOR_COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

/** Once mounted the tree never swaps; before mount the resolved value may apply. */
export function nextFactor(mounted: boolean, initial: FormFactor, resolved: FormFactor): FormFactor {
	return mounted ? initial : resolved;
}

/** The cookie to write when the client disagrees with the server's guess. */
export function cookieCorrection(initial: FormFactor, resolved: FormFactor): FormFactor | null {
	return initial === resolved ? null : resolved;
}
