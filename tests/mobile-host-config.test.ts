import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hostConfig } from "../scripts/host-config.mjs";

const good = { LH_REMOTE_HOSTS: "my-mac.tailnet-1234.ts.net" };

describe("hostConfig", () => {
	it("refuses a missing LH_REMOTE_HOSTS", () => {
		const r = hostConfig({});
		assert.equal(r.ok, false);
		assert.ok(!r.ok && r.errors.some((e) => e.includes("LH_REMOTE_HOSTS")));
		assert.equal(hostConfig({ LH_REMOTE_HOSTS: "  " }).ok, false);
	});
	it("refuses LH_DESKTOP_API_SECRET or LH_DESKTOP_SERVER=1", () => {
		const a = hostConfig({ ...good, LH_DESKTOP_API_SECRET: "x" });
		assert.ok(!a.ok && a.errors.some((e) => e.includes("LH_DESKTOP_API_SECRET")));
		const b = hostConfig({ ...good, LH_DESKTOP_SERVER: "1" });
		assert.ok(!b.ok && b.errors.some((e) => e.includes("LH_DESKTOP_SERVER")));
		assert.equal(hostConfig({ ...good, LH_DESKTOP_SERVER: "0" }).ok, true);
	});
	it("always binds 127.0.0.1", () => {
		const r = hostConfig({ ...good, HOSTNAME: "0.0.0.0", PORT: "4000", LH_DATA_DIR: "/tmp/d" });
		assert.ok(r.ok);
		if (r.ok) {
			assert.equal(r.config.hostname, "127.0.0.1");
			assert.equal(r.config.port, 4000);
			assert.deepEqual(r.config.remoteHosts, ["my-mac.tailnet-1234.ts.net"]);
			assert.equal(r.config.dataDir, "/tmp/d");
		}
		const d = hostConfig(good);
		assert.ok(d.ok && d.config.port === 3210 && d.config.hostname === "127.0.0.1");
	});
	it("rejects an invalid port and an IPv4 literal in LH_REMOTE_HOSTS", () => {
		for (const port of ["0", "70000", "abc", "12.5", "-1"]) assert.equal(hostConfig({ ...good, PORT: port }).ok, false, port);
		for (const h of ["192.168.1.5", "localhost", "a.localhost", "https://a.b", "A.B", "a.b:99999", "*.a.b"])
			assert.equal(hostConfig({ LH_REMOTE_HOSTS: h }).ok, false, h);
		assert.equal(hostConfig({ LH_REMOTE_HOSTS: "a.ts.net:8443, b.ts.net" }).ok, true);
	});
	it("error messages never include values", () => {
		const secret = "s3cr3t-value-zzz";
		const r = hostConfig({ LH_REMOTE_HOSTS: `10.0.0.1,${secret}`, PORT: secret, LH_DESKTOP_API_SECRET: secret, LH_DESKTOP_SERVER: "1" });
		assert.ok(!r.ok);
		if (!r.ok) {
			assert.ok(r.errors.length >= 3);
			assert.ok(!JSON.stringify(r.errors).includes(secret));
			assert.ok(!JSON.stringify(r.errors).includes("10.0.0.1"));
		}
	});
});
