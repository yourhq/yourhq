#!/usr/bin/env bash
# =============================================================================
# Codespaces post-create hook.
#
# Runs once after the container is created. Installs the UI's npm deps so
# live-reload dev (`docker compose -f ... -f docker-compose.dev.yml up`) works
# immediately, and prints a quick-start message in the terminal.
# =============================================================================
set -euo pipefail

echo "→ Installing UI dependencies ..."
cd apps/ui
npm ci --legacy-peer-deps --no-audit --no-fund

cd ../..

# Copy .env.example to .env if no .env exists yet.
if [ ! -f .env ]; then
  cp .env.example .env
  echo "→ Created .env from .env.example — edit it with your Supabase creds."
fi

cat << 'EOF'

═══════════════════════════════════════════════════════════════════════════════
  HQ dev environment ready.

  Next steps:
    1. Edit .env and set SUPABASE_URL / *_KEY values from a throwaway project.
       (Run all .sql files in db/migrations/ in filename order in the
        SQL editor of that project first, then paste keys here.)

    2. Build + start just the UI first, as a canary:
          docker compose build ui
          docker compose up -d ui

       Codespaces will forward port 3000; click the browser icon in the
       "Ports" tab to open the UI.

    3. Once the UI works, bring up the full stack:
          docker compose up -d

       Logs: docker compose logs -f
       Gateway desktop (noVNC): forwarded port 6901 → /vnc.html

    4. Run the Codex OAuth once (one-time, per gateway):
          docker compose exec gateway openclaw models auth login \
            --provider openai-codex --set-default

  See TESTING.md for the full staged test plan.
═══════════════════════════════════════════════════════════════════════════════
EOF
