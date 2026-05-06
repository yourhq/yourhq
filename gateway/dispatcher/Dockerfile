# =============================================================================
# Dispatcher image — watches agent_inbox_items in Supabase Realtime and wakes
# agents via the OpenClaw CLI.
#
# Needs `openclaw` CLI because wake_agent() shells out to it. Shares the
# gateway-state volume read-only so it can resolve agent IDs from openclaw.json.
# =============================================================================
FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HOME=/home/openclaw \
    OPENCLAW_VERSION=v2026.4.12

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --break-system-packages websocket-client==1.8.0

RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Ubuntu 24.04 ships with a pre-created `ubuntu` user at UID 1000.
RUN userdel -r ubuntu 2>/dev/null || true \
    && groupadd -g 1000 openclaw \
    && useradd -m -u 1000 -g 1000 -s /bin/bash openclaw

COPY --chown=openclaw:openclaw gateway/daemons/inbox_dispatcher.py /app/inbox_dispatcher.py
COPY --chown=openclaw:openclaw gateway/daemons/registry_config.py /app/registry_config.py
COPY --chown=openclaw:openclaw gateway/dispatcher/entrypoint.sh /app/entrypoint.sh

USER openclaw
WORKDIR /home/openclaw

ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
