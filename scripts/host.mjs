/**
 * host.mjs - run the standalone server as a headless host on loopback.
 * Browser mode plus remote devices; never Electron. Put a tunnel in front:
 * tailscale serve --bg https / http://127.0.0.1:<port>
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { hostConfig } from "./host-config.mjs";

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
const env = {
	...process.env,
	NODE_ENV: "production",
	HOSTNAME: config.hostname,
	PORT: String(config.port),
	LH_REMOTE_HOSTS: config.remoteHosts.join(","),
};
console.log(`[host] listening on http://${config.hostname}:${config.port}`);
console.log(`[host] next: tailscale serve --bg https / http://127.0.0.1:${config.port}`);
const child = spawn(process.execPath, [SERVER], { cwd: STANDALONE, env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
