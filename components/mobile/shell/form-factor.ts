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
