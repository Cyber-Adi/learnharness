/**
 * host.mjs - run the standalone server as a headless host on loopback.
 * Browser mode plus remote devices; never Electron. Put a tunnel in front:
 * tailscale serve --bg https / http://127.0.0.1:<port>
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { adminTokenFile, childEnv, exitCodeFor, hostConfig, makeAdminToken, removeAdminToken, resolveDataDir, writeAdminToken } from "./host-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const SERVER = path.join(STANDALONE, "server.js");

const result = hostConfig(process.env);
if (!result.ok) {
	for (const e of result.errors) console.error(`[host] ${e}`);
	process.exit(1);
}
if (!fs.existsSync(SERVER)) {
	console.error("[host] .next/standalone/server.js missing - run `npm run build && node scripts/build-server.mjs` first.");
	process.exit(1);
}
const { config } = result;
// Fresh per start; the file lets `npm run host:pair` act as the host. Never logged.
const adminToken = makeAdminToken(randomBytes);
const tokenFile = adminTokenFile(resolveDataDir(config, STANDALONE));
try {
	writeAdminToken(tokenFile, adminToken);
} catch {
	console.error("[host] could not write the host admin token file");
	process.exit(1);
}
const env = childEnv(config, process.env, adminToken);
console.log(`[host] listening on http://${config.hostname}:${config.port}`);
console.log(`[host] next: tailscale serve --bg https / http://127.0.0.1:${config.port}`);
const child = spawn(process.execPath, [SERVER], { cwd: STANDALONE, env, stdio: "inherit" });
// The token file must not outlive the host.
process.on("exit", () => removeAdminToken(tokenFile));
for (const sig of ["SIGINT", "SIGTERM"]) {
	process.on(sig, () => {
		removeAdminToken(tokenFile);
		child.kill(sig);
	});
}
child.on("error", (err) => {
	console.error(`[host] could not start the server: ${err.code ?? "unknown error"}`);
	process.exit(1);
});
child.on("exit", (code, signal) => process.exit(exitCodeFor(code, signal)));
