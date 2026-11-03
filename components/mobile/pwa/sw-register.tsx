"use client";

import { useEffect } from "react";
import { detectElectron } from "../shell/form-factor.ts";

export interface SwEnv {
	readonly production: boolean;
	readonly secure: boolean;
	readonly electron: boolean;
	readonly mobileShell: boolean;
	readonly supported: boolean;
}

export function shouldRegisterSw(env: SwEnv): boolean {
	return env.production && env.secure && !env.electron && env.mobileShell && env.supported;
}

interface Props {
	readonly active: boolean;
}

/** Render inside the mobile tree only; `active` is the mobile shell flag. */
export function SwRegister({ active }: Props) {
	useEffect(() => {
		const ok = shouldRegisterSw({
			production: process.env.NODE_ENV === "production",
			secure: window.isSecureContext,
			electron: detectElectron(navigator.userAgent),
			mobileShell: active,
			supported: "serviceWorker" in navigator,
		});
		if (!ok) return;
		navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
	}, [active]);
	return null;
}
