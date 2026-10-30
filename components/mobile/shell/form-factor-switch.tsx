"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
	COARSE_QUERY,
	NARROW_QUERY,
	STANDALONE_QUERY,
	detectElectron,
	resolveFormFactor,
	type FormFactor,
} from "./form-factor.ts";

const QUERIES = [NARROW_QUERY, COARSE_QUERY, STANDALONE_QUERY] as const;

const subscribeNone = () => () => {};
const desktopSnapshot = (): FormFactor => "desktop";
const serverSnapshot = (): FormFactor => "desktop";

function subscribeMedia(onChange: () => void): () => void {
	const lists = QUERIES.map((q) => window.matchMedia(q));
	for (const l of lists) l.addEventListener("change", onChange);
	return () => {
		for (const l of lists) l.removeEventListener("change", onChange);
	};
}

function mediaSnapshot(): FormFactor {
	const [narrow, coarse, standalone] = QUERIES.map((q) => window.matchMedia(q).matches);
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
	readonly desktop: ReactNode;
	readonly mobile: ReactNode;
}

/** Desktop on the server and first client render; media queries decide after. */
export function FormFactorSwitch({ enabled, desktop, mobile }: Props) {
	const factor = useSyncExternalStore(
		enabled ? subscribeMedia : subscribeNone,
		enabled ? mediaSnapshot : desktopSnapshot,
		serverSnapshot,
	);
	return factor === "mobile" ? mobile : desktop;
}
