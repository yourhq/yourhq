# Troubleshooting

Real problems we hit while building yourhq, with copy-paste fixes. Organized by symptom — search for the exact text you're seeing.

If your issue isn't here, jump to [Where to get help](#where-to-get-help) at the bottom.

---

## UI & access

### UI keeps showing onboarding or says no active project

**What you see**

Open `http://localhost:3000`, and the UI sends you back to onboarding even though you already connected Supabase.

**Why it happens**

The UI reads Supabase config from the project registry on the `ui-config` volume. The registry is empty, unreadable, or was lost when volumes were recreated.

**How to fix**

Check the UI logs first:

```bash
cd ~/.yourhq
docker compose logs ui
```

Then either complete onboarding again or inspect the `ui-config` volume. If you intentionally reset volumes, this is expected. Supabase browser config is runtime-injected, so rebuilding the UI image is not required.

### Login page loads but sign-in fails silently or says "Invalid API key"

**What you see**

You type your email/password, click Sign in — nothing happens, or you get `Invalid API key` / `Invalid login credentials`.

**Why it happens**

Either the anon key in the UI doesn't match the Supabase project you're pointing at, or you never created an auth user in Supabase. A fresh Supabase project has zero users.

**How to fix**

1. In Supabase dashboard → **Project Settings → API**, confirm `Project URL` and `anon public` match the active project in Settings → Projects.
2. In Supabase dashboard → **Authentication → Users → Add user → Create new user**, set an email + password.
3. Log in with those credentials.

If you fix the keys, update the project from Settings → Projects or rerun onboarding. No image rebuild is required.

### Setup wizard 500s on "Complete setup"

**What you see**

You fill out the six-step setup wizard, hit `Complete`, and the UI returns a 500. `docker compose logs ui` shows an `Origin mismatch` or `CSRF` error, or just a generic Next.js server error from the setup server action.

**Why it happens**

Next.js server actions enforce that the request `Origin` header matches the host the server thinks it's on. When you access the UI through a proxy (Codespaces forwarded URL, a Tailscale IP, a reverse proxy), the origin doesn't match `localhost` and the action is rejected.

**How to fix**

Set `ALLOWED_ORIGINS` in `.env` to the exact origin you're loading the UI from, then restart the UI container. Comma-separate multiple values:

```bash
# in ~/.yourhq/.env
ALLOWED_ORIGINS=https://<codespace-name>-3000.app.github.dev,http://100.x.y.z:3000
```

```bash
docker compose up -d ui
```

Codespaces users: the installer sets `CODESPACE_NAME` / `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` automatically if they're in the environment. If you're running Codespaces locally (VS Code tunnel), set `ALLOWED_ORIGINS` manually. See [docs/CONFIGURATION.md](CONFIGURATION.md) for the full list of origin-related vars.

### "Site can't be reached" from a phone/laptop via the Tailscale IP

**What you see**

UI works fine on the host at `http://localhost:3000`. From another device on the tailnet — phone, laptop, iPad — `http://100.x.y.z:3000` just times out or says "connection refused".

**Why it happens**

If you installed in local-only mode, the installer sets `UI_HOST_PORT=127.0.0.1:3000`. Docker publishes the port on loopback only, so the tailnet can't reach it.

**How to fix**

Edit `~/.yourhq/.env`, change the port bindings to `0.0.0.0`:

```
UI_HOST_PORT=0.0.0.0:3000
NOVNC_HOST_PORT=0.0.0.0:6901
FILES_API_HOST_PORT=0.0.0.0:18790
HOST_REACHABLE_URL=http://100.x.y.z    # your host's Tailscale IP
NETWORKING_MODE=tailscale
```

Recreate the containers so the new port mappings take effect:

```bash
docker compose up -d --force-recreate
```

Re-running the installer and picking option 2 (Tailscale) does the same thing. See [docs/NETWORKING.md](NETWORKING.md) for the full networking model.

### `docker compose up` fails with "pull access denied" on ghcr.io/yourhq/*

**What you see**

```
Error response from daemon: pull access denied for ghcr.io/yourhq/yourhq-ui,
repository does not exist or may require 'docker login'
```

**Why it happens**

During early access, the GHCR repo is private. Unauthenticated pulls are denied.

**How to fix**

Create a GitHub personal access token with the `read:packages` scope, then log in:

```bash
echo "<your-PAT>" | docker login ghcr.io -u <your-github-username> --password-stdin
docker compose pull
docker compose up -d
```

If you don't want to deal with GHCR auth, build locally instead:

```bash
docker compose build
docker compose up -d
```

Heads-up: local builds need more RAM — see the t3.medium symptom below.

---

## Gateway & agents

### Gateway container keeps restarting

**What you see**

```
$ docker compose ps
NAME               STATUS
yourhq-gateway     Restarting (1) 8 seconds ago
```

**Why it happens**

The entrypoint chains several fragile steps: `openclaw onboard`, Xtigervnc, D-Bus, XFCE, websockify. Any one failing will exit non-zero and Docker will loop.

**How to fix**

Tail the logs and look at the last step that ran:

```bash
docker compose logs --tail=200 gateway
```

The most common culprits, in order:

- **`openclaw onboard exited non-zero`** — usually Node version mismatch or a bad `SUPABASE_SERVICE_ROLE_KEY`. Check `docker compose exec gateway node --version` — must be `v24.x`. Re-confirm the service role key in Supabase → Settings → API.
- **Xtigervnc won't start** — stale lock files from a crash. Nuke the volume: `docker compose down && docker volume rm yourhq-gateway-state && docker compose up -d gateway`.
- **D-Bus session never appeared** — the entrypoint prints `session D-Bus socket never appeared at ...`. A full recreate usually clears it: `docker compose up -d --force-recreate gateway`.

### noVNC `websockify.log` shows "Cannot assign requested address"

**What you see**

Inside the gateway, `~/.vnc/websockify.log` ends with:

```
[Errno 99] Cannot assign requested address
```

**Why it happens**

Historical bug: websockify used to try to bind to the gateway's Tailscale IP from inside the container. With the current architecture, **Tailscale lives on the host, not in the container** — the gateway container only knows about `0.0.0.0` and `127.0.0.1`. Host-level port mapping decides who can reach 6901.

**How to fix**

Make sure `.env` has:

```
NOVNC_BIND=local
```

`NOVNC_BIND` only controls whether websockify runs at all — it should always be `local` (which translates to `0.0.0.0:6901` inside the container). Then set `NOVNC_HOST_PORT` to control who can reach it from outside:

- `NOVNC_HOST_PORT=127.0.0.1:6901` — localhost only
- `NOVNC_HOST_PORT=0.0.0.0:6901` — tailnet/public-accessible

Recreate: `docker compose up -d --force-recreate gateway`.

### noVNC loads but shows only a black screen

**What you see**

`http://<host>:6901/vnc.html` loads, you click **Connect**, the viewport turns black. No cursor, no desktop, no Chrome.

**Why it happens**

Xtigervnc is up (otherwise you'd see a connection error), but the XFCE session died. Almost always a D-Bus socket issue — XFCE needs a session bus before it'll start xfwm, xfce4-panel, or xfdesktop.

**How to fix**

Look at `~/xfce.log` inside the gateway:

```bash
docker compose exec gateway tail -50 /home/openclaw/xfce.log
docker compose exec gateway tail -20 /home/openclaw/dbus.log
```

Full recreate usually fixes it — the entrypoint re-runs the D-Bus bootstrap on every start:

```bash
docker compose up -d --force-recreate gateway
```

If it still won't come up, clear the state volume (destroys the agent workspace repo and openclaw auth — you'll have to re-OAuth):

```bash
docker compose down
docker volume rm yourhq-gateway-state
docker compose up -d
```

### Tailscale shows the gateway container as dead / never joined

**What you see**

You check `tailscale status` and don't see the gateway. Or you see an old `yourhq-gateway` node stuck as "inactive".

**Why it happens**

You're reading old docs. As of the current release, **Tailscale runs on the host, not in the gateway container** — that's why the gateway container no longer needs `NET_ADMIN` or a `/dev/net/tun` device. Earlier versions did it inside the container and it was flaky in Codespaces and on many cloud hosts.

**How to fix**

Check Tailscale on the **host**:

```bash
sudo tailscale status
sudo tailscale ip -4
```

The single node named `yourhq-<hostname>` (or whatever you set) is what the UI and noVNC are reached through. If it's missing, re-run the host install:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-... --hostname="yourhq-$(hostname)"
```

Then update `.env` with the new IP (`HOST_REACHABLE_URL=http://<ip>`) and `docker compose up -d --force-recreate`. See [docs/NETWORKING.md](NETWORKING.md).

### `openclaw models auth login` for Codex hangs forever

**What you see**

You run:

```bash
docker compose exec gateway openclaw models auth login \
  --provider openai-codex --set-default
```

It prints a URL, you complete the OAuth in your browser — then the CLI just sits there. No "Auth profile saved", no prompt for paste, nothing.

**Why it happens**

openclaw's OAuth flow races two completion paths: a loopback HTTP callback on `localhost:1455`, and a paste-the-code fallback. The loopback is only reachable from the same machine as the browser, so if you're running `exec` on a remote host (EC2, Hetzner, Mac mini) and completing OAuth on your laptop's browser, the callback can never fire — but the CLI is waiting for it.

**How to fix**

Pre-occupy port 1455 inside the gateway to force the CLI to use the paste fallback:

```bash
# terminal 1 — hold the port
docker compose exec gateway python3 -m http.server 1455
```

```bash
# terminal 2 — run the login, it'll now prompt "Paste the code from the redirect URL:"
docker compose exec gateway openclaw models auth login \
  --provider openai-codex --set-default
```

Complete OAuth in your browser, copy the redirect URL (it'll be `http://localhost:1455/?code=...`), paste it back into terminal 2. You should see `Auth profile saved`. Kill the http.server in terminal 1.

### Gateway logs show "registering gateway ... failed"

**What you see**

```
Registering gateway default in Supabase ...
  registration failed (Supabase unreachable or gateways table missing — will retry from daemon)
```

**Why it happens**

Either `SUPABASE_SERVICE_ROLE_KEY` is wrong, or the `gateways` table doesn't exist in your project because migrations were never run.

**How to fix**

1. Copy the service role key again from Supabase → Settings → API → `service_role` (not the anon key), and update the active project in the UI or the env override in `.env`.
2. Run every migration in `db/migrations/` in filename order from Supabase Dashboard → **SQL Editor → New query**.
3. Restart the gateway: `docker compose restart gateway`.

Log should flip to `registered (reachable at http://...)`.

### Agent stuck in "provisioning" for > 2 minutes

**What you see**

You create an agent in the UI. It shows up with status `provisioning` and stays there forever.

**Why it happens**

The provision command is leased by the `runner` container, which runs `add-agent.sh`. Something in that script failed — template branch missing, git repo corruption, or write to Supabase blocked by RLS.

**How to fix**

Tail the runner:

```bash
docker compose logs -f runner
```

Look for the `provision` command and whatever stderr follows. Common causes:

- **`fatal: A branch named 'template/cofounder' not found`** — your `TEMPLATES_SOURCE` pointed at a repo that doesn't have that template. Either fix the source repo or re-create using the bundled templates (`TEMPLATES_SOURCE=` empty in `.env`, restart gateway).
- **`permission denied`** writing to `/home/openclaw/.openclaw/...` — gateway-state volume is owned by the wrong UID. `docker compose down && docker volume rm yourhq-gateway-state && docker compose up -d`.
- **HTTP 401/403** writing to Supabase — service role key wrong. See previous symptom.

If the command is simply stuck (no log activity), mark it failed so the UI unblocks:

```sql
-- in Supabase SQL Editor
update agent_commands set status='failed', error='manual cancel'
where status='in_progress' and leased_at < now() - interval '5 minutes';
```

### Telegram bot never responds

**What you see**

You send a DM to your agent's Telegram bot. No reply. Ever.

**Why it happens**

99% of the time: you skipped the pairing step. openclaw's Telegram plugin default policy is `pairing` — the bot won't engage with a DM until you've paired your Telegram account to the agent.

**How to fix**

1. Send any message to the bot. It should reply with a pairing code (6-digit).
2. Open the UI → the agent's detail page → **Pair Telegram** field → paste the code → submit.
3. Send another message. Agent engages.

If the bot doesn't reply with a pairing code on the first message either, it means the bot token is invalid or the runner never ran `add-agent.sh` successfully — see the "provisioning" symptom above. See [docs/AGENTS.md](AGENTS.md).

---

## Installer

### "Docker is not installed" on Mac or Windows

**What you see**

The installer prints a multi-step message pointing you at Docker Desktop and exits.

**Why it happens**

The auto-install path (`curl | sh get.docker.com`) is Linux-only. Docker on Mac/Windows runs inside Docker Desktop, which is a GUI app and can't be installed from a shell script.

**How to fix**

- **macOS** — download Docker Desktop from https://docs.docker.com/desktop/install/mac-install/, drag to Applications, launch it, wait for the whale icon, re-run the installer.
- **Windows** — install WSL2 (https://learn.microsoft.com/windows/wsl/install), then Docker Desktop, then launch it, then re-run the installer from a WSL shell.

### `curl | bash` install doesn't show prompts

**What you see**

You pipe the installer into bash and it looks like it hangs — or it just exits without asking for Supabase creds.

**Why it happens**

Bash pipes can buffer stderr or swallow `/dev/tty` reads in some terminals. The prompts are there, but they're not visible, or `read` can't reach your terminal.

**How to fix**

Clone the repo and run the script directly:

```bash
git clone https://github.com/yourhq/yourhq.git
cd yourhq
./installer/install.sh
```

Same prompts, guaranteed interactive.

### t3.medium EC2 instance becomes unreachable during `docker compose build`

**What you see**

You started `docker compose build`, SSH session locks up, after a few minutes the instance is unreachable. Reboot is required.

**Why it happens**

Out of memory. Building all four images (ui, gateway, dispatcher, runner) in parallel peaks well past 4 GB of RAM. A t3.medium with 4 GB RAM and no swap has no room to work with — the OOM killer reaps sshd, dockerd, or both.

**How to fix**

Preferred: **don't build, pull the prebuilt images**:

```bash
cd ~/.yourhq
docker compose pull
docker compose up -d
```

If you must build (e.g. you're on a fork), add swap first:

```bash
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Then build one service at a time:

```bash
docker compose build ui
docker compose build gateway
docker compose build dispatcher
docker compose build runner
```

Or upgrade to a t3.large / equivalent.

---

## Data / Supabase

### Supabase migration fails partway through

**What you see**

In the SQL editor, the migration stops with `ERROR: relation "contacts" already exists` or similar on some line.

**Why it happens**

You ran the migration twice, or against a project where some tables already existed. `001_schema.sql` is not idempotent — it expects a clean `public` schema.

**How to fix**

If this is a **fresh throwaway project** where losing all data is fine:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
```

Then run every file in `db/migrations/` in filename order again. **Warning**: this destroys all data in the `public` schema. If you have anything else in there, back it up first.

If it's a real project, skip the failing statement and run subsequent ones manually — but this is fragile. Starting with a fresh Supabase project is usually faster.

### UI loads but all tables are empty

**What you see**

You're logged in, dashboard renders, but contacts / tasks / agents lists are all empty even though you inserted rows via SQL.

**Why it happens**

Row-level security is blocking reads. Every table has a single policy granting `authenticated` full access — if your `authenticated` role is missing `USAGE` on the schema or `SELECT` on the tables, the policy never gets a chance.

**How to fix**

In the Supabase SQL Editor:

```sql
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
```

Refresh the UI. If data still doesn't show, check the browser console — you may be seeing JWT issues instead (anon key mismatch, session expired — log out and back in).

---

## Performance

### First run feels very slow to boot

**What you see**

`docker compose up -d` sits for 5+ minutes on the first run. Subsequent runs are fast.

**Why it happens**

Pulling the prebuilt images from GHCR the first time takes a while — the gateway image alone is ~1.5 GB (includes Xtigervnc, XFCE, Chrome, openclaw, Node 24). Docker caches them after the first pull.

**How to fix**

Just wait. If you want progress visibility, pull explicitly with `docker compose pull` before `up` — you'll see per-layer progress bars.

### Gateway feels laggy in noVNC

**What you see**

Mouse moves lag a beat behind. Typing feels sluggish. Chrome is slow to scroll.

**Why it happens**

The gateway container runs Chrome + XFCE + openclaw simultaneously — ~1.5 GB of RAM just sitting there, plus whatever Chrome does. On a t3.small (2 GB RAM) you're swapping constantly. Also, websockify streams uncompressed framebuffer diffs — bandwidth-hungry over public internet.

**How to fix**

- Use a t3.medium (4 GB RAM) or larger for comfortable agent work.
- Access noVNC over Tailscale rather than the public internet — direct peer-to-peer, no reverse proxy, much better throughput.
- In the noVNC UI (top-left gear), drop quality to `6` and compression to `9` — cuts bandwidth ~3x at the cost of some visual fidelity.

---

## Where to get help

If nothing above matches, open an issue at **https://github.com/yourhq/yourhq/issues** with:

- The exact error message (copy/paste, not a screenshot, so it's searchable).
- Output of `docker compose logs` for the failing container(s) — last 200 lines is usually enough.
- Which host you're running on: `uname -a`, cloud provider + instance type, or "local Mac/Linux".
- Which install method you used: `curl | bash`, direct clone, manual.

### Diagnostic bundle

To make bug reports easier, a one-liner (coming in a follow-up PR) will gather everything at once:

```bash
bash scripts/diagnostic-bundle.sh > diag.txt
```

It collects: `docker compose ps`, recent logs for each service, compose config with secrets redacted, `.env` keys (values redacted), `docker --version`, `tailscale status`, host OS info, and openclaw version. Attach `diag.txt` to your issue.

See also: [docs/NETWORKING.md](NETWORKING.md), [docs/CONFIGURATION.md](CONFIGURATION.md), [docs/AGENTS.md](AGENTS.md), [docs/SCHEMA.md](SCHEMA.md).
