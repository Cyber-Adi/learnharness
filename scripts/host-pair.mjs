/**
 * host-pair.mjs - print a pairing QR on the host's terminal (`npm run host:pair`).
 * Talks to the local server with the host admin token; prints no secret except inside the QR.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { renderUnicodeCompact } from "uqr";
import { z } from "zod";
import { adminTokenFile, hostConfig, resolveDataDir, tokenFileProblem } from "./host-config.mjs";

const Response_ = z.object({
	ok: z.literal(true),
	data: z.object({
		shortCode: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
		expiresAt: z.iso.datetime(),
		pairUrl: z.url(),
	}),
});

/** @param {{ port: number }} config @param {string} token */
export function pairRequest(config, token) {
	return {
		url: `http://127.0.0.1:${config.port}/api/remote/pairing-code`,
		// No Origin and no cookies: a loopback tool call, not a browser.
		init: { method: "POST", headers: { "x-lh-host-admin": token } },
	};
}

/** @param {unknown} response the parsed JSON body; throws a fixed message on anything unexpected */
export function formatPairing(response) {
	const parsed = Response_.safeParse(response);
	if (!parsed.success) throw new Error("the server did not return a pairing code");
	const { shortCode, expiresAt, pairUrl } = parsed.data.data;
	const grouped = `${shortCode.slice(0, 3)} ${shortCode.slice(3)}`;
	return [renderUnicodeCompact(pairUrl), "", `Code     ${grouped}`, `Expires  ${expiresAt}`].join("\n");
}

async function main() {
	const result = hostConfig(process.env);
	if (!result.ok) throw new Error("host configuration is invalid");
	const standalone = path.join(path.resolve(import.meta.dirname, ".."), ".next", "standalone");
	let token;
	try {
		const file = adminTokenFile(resolveDataDir(result.config, standalone));
		const problem = tokenFileProblem(fs.lstatSync(file), process.getuid?.() ?? -1);
		if (problem) throw new Error(problem);
		token = fs.readFileSync(file, "utf8").trim();
	} catch (err) {
		if (err instanceof Error && err.message.startsWith("the host admin token")) throw err;
		throw new Error("no host admin token found; start the host first");
	}
	const { url, init } = pairRequest(result.config, token);
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) }).catch(() => {
		throw new Error("could not reach the host on loopback");
	});
	if (!res.ok) throw new Error("the host refused the request");
	console.log(formatPairing(await res.json()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(`[host-pair] ${err instanceof Error && err.message.length < 80 ? err.message : "failed"}`);
		process.exit(1);
	});
}
