# Testing

Staged test plan for validating the Docker stack. Each stage is independently testable; stop at the first failure, debug, retry that stage.

## Environment

Recommended: **GitHub Codespaces** on this repo's default branch.

- Open the repo on GitHub → **Code → Codespaces → Create codespace**.
- Wait ~3 min for the devcontainer to boot.
- The `postCreateCommand` installs UI deps, copies `.env.example` → `.env`, and prints a quick-start banner.

Ports forwarded automatically: `3000` (UI), `6901` (noVNC).

You'll also need a **throwaway Supabase project** — do not point this at production while testing. Go to [supabase.com](https://supabase.com), create a free project, and run every SQL file in [`db/migrations/`](db/migrations/) in filename order. Then copy the URL, anon key, and service role key for browser onboarding.

## Stage 1 — UI build and run

Prove the UI Dockerfile is correct and the standalone build works in a container.

```bash
docker compose build ui
docker compose up -d ui
docker compose logs -f ui
```

Expected:
- Build completes without errors (first build: 3–5 min — Next.js compile + optimize).
- `ui` container shows "Ready on http://0.0.0.0:3000" in logs.
- Codespaces shows a notification for port 3000; click to open the URL.
- Browser loads the onboarding or login page. If the project registry is empty, onboarding is expected.

Common failures:
- `ENOENT ./public/...` → a COPY path in the Dockerfile is wrong.
- `Cannot find module ...` → a build-time dep didn't make it into the standalone bundle; check `next.config.ts` has `output: "standalone"`.

**Tear down:** `docker compose down ui`

## Stage 2 — UI backed by your throwaway Supabase

Prove the UI connects to Supabase and renders real data.

1. Start the UI and complete browser onboarding with the throwaway Supabase URL, anon key, and service role key.
2. Create or sign in with a Supabase auth user when prompted. You can also create one manually in Supabase → Authentication → Users → Add user.

```bash
docker compose up -d ui
```

Expected:
- Open the UI, log in with the user you just created.
- Setup wizard appears (fresh workspace, `initialized=false`).
- Complete the wizard. Workspace marked initialized.
- Dashboard loads. Sidebar footer says "HQ". Browser tab says "HQ".

## Stage 3 — Gateway stack against the same Supabase

Bring up gateway + dispatcher + runner. UI stays off for this stage.

```bash
docker compose up -d gateway dispatcher runner
docker compose logs -f gateway dispatcher runner
```

Expected sequence in `gateway` logs:
1. `First boot — initializing bare repo at /home/openclaw/.openclaw/repo.git`
2. `Seeding templates from /opt/templates ... ✓ seeded branch default`, then ~14 more templates.
3. `Starting Xvfb :1 ...`
4. `Running openclaw onboard ...` (may take 30–60s).
5. `Patching openclaw.json ...`
6. `Starting VNC server on :1 ...`
7. `Starting websockify on 127.0.0.1:6901 -> localhost:5901 ...`
8. `Registering gateway default in Supabase ... ✓ registered`
9. `Starting openclaw gateway ...`

Verify from the UI (bring UI up alongside):
```bash
docker compose up -d ui
```
- Navigate to Settings → System. You should see one gateway `default` with status `online` and `last_seen_at` recent.

The `runner` container logs should show `Starting command runner for gateway=default (Primary gateway)`.

Common failures:
- Git clone failure on `GIT_REMOTE_URL` — expected if unset (templates seed locally instead).
- `openclaw onboard` exits non-zero — check Node version inside container (`docker compose exec gateway node --version` → must be 24).
- `Registering gateway ...` fails with 403 → `SUPABASE_SERVICE_ROLE_KEY` is wrong or the gateways table doesn't exist (re-run the migration).

## Stage 4 — Codex OAuth

One-time, writes the token into the `openclaw-state` volume shared by all agents on this gateway.

```bash
docker compose exec gateway openclaw models auth login \
  --provider openai-codex --set-default
```

Follow the prompts: paste URL in a browser, paste the redirect back.

Expected: `Auth profile saved`.

## Stage 5 — Create an agent end-to-end

Through the UI: navigate to Agents → New Agent → pick the Cofounder template → give it a name/slug/Telegram token → click Create.

Watch `docker compose logs -f runner`:
- Command `provision` leased.
- `add-agent.sh cofounder-xyz --token ...` runs.
- Git worktree created at `/home/openclaw/.openclaw/workspace-.../`.
- `openclaw.json` patched with the agent entry.
- Gateway restarted.

Agent should appear in the UI as `online` within a minute.

Send a Telegram message to the bot. Expect a pairing code to reply. Paste the code back into the UI's "Pair Telegram" field. Command runner runs `openclaw pairing approve`. Next Telegram message triggers the agent.

## Stage 6 — noVNC desktop view

Codespaces forwards port 6901. Click the forwarded URL from the Ports tab.

Expected: the noVNC web client loads. Click Connect. Desktop shows Xvfb + (probably) the agent's Chrome window if an agent is running.

Note: because Tailscale is disabled in Codespaces, `NOVNC_BIND` falls back to `local` (127.0.0.1 inside the container). The port-forwarded URL works because Codespaces proxies through.

## Tear down

```bash
docker compose down           # stops containers, keeps volumes
docker compose down -v        # stops + removes volumes (clean slate)
```

## What this does NOT test

- Tailscale join — disabled in Codespaces (NET_ADMIN + tun device behavior differs in the devcontainer env).
- Public HTTPS mode — needs a real domain + DNS record.
- Multi-arch builds — CI/GHCR catches that separately.
- The `curl | bash` installer flow — best tested on a fresh VPS (see below).

## After Codespaces: real-host validation

Once everything above passes, spin up a small VPS ($5/mo on Hetzner) or EC2 t3.small. SSH in and run:

```bash
curl -fsSL https://raw.githubusercontent.com/yourhq/yourhq/initial/installer/install.sh | bash
```

This exercises the real OSS install UX. Validates: Docker install prereq check, interactive prompts, `.env` generation, image pull from GHCR, first-boot on a host you didn't pre-configure. Tear down the VPS after.
