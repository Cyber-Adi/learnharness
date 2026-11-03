/**
 * Read a request body as UTF-8 text, never buffering more than `maxBytes`.
 * Returns null when the body is over the cap (declared or actual) or unreadable.
 * content-length is only an early exit: the byte count of what arrives decides.
 */
export async function readBoundedText(req: Request, maxBytes: number): Promise<string | null> {
	const declared = req.headers.get("content-length");
	if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > maxBytes)) return null;
	if (req.body === null) return "";
	const reader = req.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			chunks.push(value);
		}
	} catch {
		return null;
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}
