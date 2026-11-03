"use client";

import { useEffect, type ReactNode } from "react";
import {
	COARSE_QUERY,
	NARROW_QUERY,
	STANDALONE_QUERY,
	cookieCorrection,
	detectElectron,
	formFactorCookie,
	resolveFormFactor,
	type FormFactor,
} from "./form-factor.ts";

function resolveFromMedia(): FormFactor {
	const [narrow, coarse, standalone] = [NARROW_QUERY, COARSE_QUERY, STANDALONE_QUERY].map(
		(q) => window.matchMedia(q).matches,
	);
	return resolveFormFactor({
		enabled: true,
		width: narrow ? 0 : Number.POSITIVE_INFINITY,
		coarsePointer: Boolean(coarse),
		standalone: Boolean(standalone),
		electron: detectElectron(navigator.userAgent),
	});
}

interface Props {
	readonly enabled: boolean;
	readonly initial?: FormFactor;
	readonly desktop: ReactNode;
	readonly mobile: ReactNode;
}

/** The server decides; the tree is sticky for the life of the page. A client
 * that disagrees only corrects the cookie so the next load is right. */
export function FormFactorSwitch({ enabled, initial = "desktop", desktop, mobile }: Props) {
	const factor: FormFactor = enabled ? initial : "desktop";
	useEffect(() => {
		if (!enabled) return;
		const fix = cookieCorrection(initial, resolveFromMedia());
		if (fix) document.cookie = formFactorCookie(fix);
	}, [enabled, initial]);
	return factor === "mobile" ? mobile : desktop;
}
