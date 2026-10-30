import type { z } from "zod";

export const ERROR_CODES: readonly [
	"unauthorized",
	"forbidden_scope",
	"bad_host",
	"bad_origin",
	"invalid_input",
	"rate_limited",
	"remote_disabled",
	"internal",
] = Object.freeze([
	"unauthorized",
	"forbidden_scope",
	"bad_host",
	"bad_origin",
	"invalid_input",
	"rate_limited",
	"remote_disabled",
	"internal",
] as const);
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
	unauthorized: 401,
	forbidden_scope: 403,
	bad_host: 421,
	bad_origin: 403,
	invalid_input: 400,
	rate_limited: 429,
	remote_disabled: 404,
	internal: 500,
});

const MESSAGES: Readonly<Record<ErrorCode, string>> = Object.freeze({
	unauthorized: "Authentication required.",
	forbidden_scope: "This device is not allowed to do that.",
	bad_host: "Unrecognized host.",
	bad_origin: "Request origin not allowed.",
	invalid_input: "The request was not valid.",
	rate_limited: "Too many requests. Try again later.",
	remote_disabled: "Not found.",
	internal: "Something went wrong.",
});

export interface RemoteErrorEnvelope {
	readonly ok: false;
	readonly error: { readonly code: ErrorCode; readonly message: string };
}
export interface OkEnvelope<T> {
	readonly ok: true;
	readonly data: T;
}

export function remoteError(code: ErrorCode): RemoteErrorEnvelope {
	return Object.freeze({
		ok: false as const,
		error: Object.freeze({ code, message: MESSAGES[code] }),
	});
}

/** Deliberately ignores the error: zod issues can echo input values. */
export function fromZodError(_err: z.ZodError): RemoteErrorEnvelope {
	return remoteError("invalid_input");
}

export function ok<T>(data: T): OkEnvelope<T> {
	return Object.freeze({ ok: true as const, data });
}
