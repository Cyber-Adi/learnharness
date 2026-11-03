import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

// Same rules as RemoteHosts in src/server/remote/schemas.ts (tests share the cases).
const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const HOST_RE = new RegExp(`^(${LABEL}(?:\\.${LABEL})*)(?::([1-9][0-9]{0,4}))?$`);

function validHost(entry) {
	const m = HOST_RE.exec(entry);
	const name = m?.[1];
	if (!m || !name) return false;
	if (m[2] !== undefined && Number(m[2]) > 65535) return false;
	if (name === "localhost" || name.endsWith(".localhost")) return false;
	const last = name.split(".").at(-1) ?? "";
	return !/^[0-9]+$/.test(last);
}

const Port = z.string().regex(/^[0-9]{1,5}$/).transform(Number).refine((n) => n >= 1 && n <= 65535);

const Hosts = z
	.string()
	.transform((raw) => raw.split(",").map((s) => s.trim()).filter((s) => s !== ""))
	.refine((l) => l.length > 0 && l.every(validHost));

/**
 * @typedef {{ hostname: "127.0.0.1", port: number, remoteHosts: readonly string[], dataDir: string | undefined }} HostConfig
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, config: HostConfig } | { ok: false, errors: string[] }}
 * Messages name the variable only, never its value.
 */
export function hostConfig(env) {
	const errors = [];
	if (env.LH_DESKTOP_API_SECRET !== undefined) errors.push("LH_DESKTOP_API_SECRET must not be set on a headless host");
	if (env.LH_DESKTOP_SERVER === "1") errors.push("LH_DESKTOP_SERVER must not be 1 on a headless host");

	const hosts = Hosts.safeParse(env.LH_REMOTE_HOSTS ?? "");
	if (!hosts.success) errors.push("LH_REMOTE_HOSTS is required and must be a list of valid hostnames");

	const port = Port.safeParse(env.PORT ?? "3210");
	if (!port.success) errors.push("PORT must be an integer from 1 to 65535");

	const dir = z.string().min(1).optional().safeParse(env.LH_DATA_DIR);
	if (!dir.success) errors.push("LH_DATA_DIR must be a non-empty path when set");

	if (errors.length > 0 || !hosts.success || !port.success || !dir.success) return { ok: false, errors };
	return {
		ok: true,
		config: Object.freeze({
			hostname: "127.0.0.1",
			port: port.data,
			remoteHosts: Object.freeze(hosts.data),
			dataDir: dir.data,
		}),
	};
}

const SIGNAL_NUMBERS = Object.freeze({ SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGABRT: 6, SIGKILL: 9, SIGUSR1: 10, SIGSEGV: 11, SIGUSR2: 12, SIGPIPE: 13, SIGALRM: 14, SIGTERM: 15 });

/**
 * Shell convention: a signal death is 128 + signal number, so a supervisor sees a failure.
 * @param {number | null} code
 * @param {string | null} signal
 */
export function exitCodeFor(code, signal) {
	if (typeof code === "number") return code;
	if (signal) return 128 + (SIGNAL_NUMBERS[signal] ?? 1);
	return 1;
}

/**
 * Environment for the server child. An explicit LH_DATA_DIR wins over whatever was inherited.
 * @param {HostConfig} config
 * @param {Record<string, string | undefined>} base
 * @param {string} [adminToken] per-start host admin token; reaches the child only through this env var
 * @returns {Record<string, string | undefined>}
 */
export function childEnv(config, base, adminToken) {
	/** @type {Record<string, string | undefined>} */
	const env = {
		...base,
		NODE_ENV: "production",
		HOSTNAME: config.hostname,
		PORT: String(config.port),
		LH_REMOTE_HOSTS: config.remoteHosts.join(","),
		LH_HOST_ADMIN_TOKEN: adminToken,
	};
	// Never inherit a stale token from the parent environment.
	if (adminToken === undefined) delete env.LH_HOST_ADMIN_TOKEN;
	if (config.dataDir !== undefined) env.LH_DATA_DIR = config.dataDir;
	return env;
}

/** Same default the server uses: config.ts resolves data/ beside itself, i.e. inside the standalone dir. */
export function resolveDataDir(config, standaloneRoot) {
	return config.dataDir !== undefined ? path.resolve(config.dataDir) : path.join(standaloneRoot, "data");
}

/** @param {string} dataDir */
export function adminTokenFile(dataDir) {
	return path.join(dataDir, "host-admin.token");
}

/** 256 bits, unpadded base64url (43 chars).
 * @param {(n: number) => Buffer} randomBytes */
export function makeAdminToken(randomBytes) {
	return randomBytes(32).toString("base64url");
}

/** Atomic rewrite, owner-only. Nothing else is written beside it. */
export function writeAdminToken(file, token) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmp, token, { mode: 0o600 });
		fs.chmodSync(tmp, 0o600);
		fs.renameSync(tmp, file);
	} catch (err) {
		fs.rmSync(tmp, { force: true });
		throw err;
	}
}
