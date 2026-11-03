import { NextResponse, type NextRequest } from "next/server";
import { decide, gatewayEnv } from "./src/server/remote/gateway.ts";
import { defaultDevicesFile, resolveDevice } from "./src/server/remote/devices.ts";

/** Applies to every API method, including SSE and spending/settings routes.
 * No public callback or worker bypass: internal jobs call server functions,
 * and any legitimate self-HTTP request must carry the private capability.
 * The decision itself is the pure gateway (src/server/remote/gateway.ts). */
export function proxy(request: NextRequest) {
	const decision = decide({
		method: request.method,
		pathname: request.nextUrl.pathname,
		headers: request.headers,
		env: gatewayEnv(process.env, request.headers),
		resolveDevice: (cookie) => resolveDevice(defaultDevicesFile(), cookie, Date.now()),
	});
	if (decision.kind === "deny") {
		return NextResponse.json(decision.body, {
			status: decision.status,
			headers: { "Cache-Control": "no-store" },
		});
	}
	return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
