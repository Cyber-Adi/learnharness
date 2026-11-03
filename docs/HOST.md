# Headless host

Run LMobile on an always-on Mac or VPS with no Electron. The phone reaches it over a private tunnel.

1. Build once: `npm ci && npm run build && node scripts/build-server.mjs`
2. Run (loopback only, port 3210 by default):
   ```
   LH_REMOTE_HOSTS=my-host.tailnet-1234.ts.net \
   LH_DATA_DIR=/var/lib/lmobile PORT=3210 npm run host
   ```
   `LH_REMOTE_HOSTS` is required: lowercase hostnames, optional `:port`, no IPs, schemes or `localhost`.
   The host refuses to start if `LH_DESKTOP_SERVER=1` or `LH_DESKTOP_API_SECRET` is set.
3. Expose it privately: `tailscale serve --bg https / http://127.0.0.1:3210`
   Never use `tailscale funnel`; the host must stay off the public internet.
4. Pair a phone: with the host running, in another terminal on the host (same environment) run `npm run host:pair`.
   It prints a QR, a 6-character code and the expiry (codes last 2 minutes). Scan the QR with the iPhone camera,
   tap Pair this phone, then in Safari: Share, Add to Home Screen. If the app is installed first, open it, go to
   `/pair` and enter the 6-character code under "Have a code?" (the installed app has its own cookie store).
   On the desktop app the same flow is the Pair a phone section in Settings.
5. Revoke a device: Settings on the desktop app lists paired phones with a Revoke button each (confirms first).
   Revoking invalidates the credential at once.

Process notes
- `LH_DATA_DIR`, when set, is passed to the server explicitly.
- Each start writes a fresh 256-bit host admin token to `<data dir>/host-admin.token` (mode 0600; data dir is `LH_DATA_DIR`, else `.next/standalone/data`) and gives it to the server only as `LH_HOST_ADMIN_TOKEN`. `npm run host:pair` reads the file. Restarting invalidates the old token.
- If the server dies from a signal the host exits non-zero (128 plus the signal number), so a supervisor restarts it.

Security notes
- The server binds 127.0.0.1 always; only the tunnel can reach it.
- The host admin token only works on loopback requests with no proxy headers; it never authorizes a tunneled request. Do not copy it off the host.
- A phone never gets the `admin` or `graph:write` scopes.
- Secrets come from the environment only. Config errors name the variable, never the value.
- Build with `NEXT_PUBLIC_LH_MOBILE_SHELL=1` to serve the phone shell.
