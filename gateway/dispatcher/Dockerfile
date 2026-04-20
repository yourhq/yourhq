# =============================================================================
# Dispatcher image — watches agent_inbox_items in Supabase Realtime and wakes
# agents via the OpenClaw CLI.
#
# Needs `openclaw` CLI because wake_agent() shells out to it. Shares the
# gateway-state volume read-only so it can resolve agent IDs from openclaw.json.
# =============================================================================
FROM ubuntu:24.04

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

RUN useradd -m -u 1000 -s /bin/bash openclaw

COPY --chown=openclaw:openclaw gateway/daemons/inbox_dispatcher.py /app/inbox_dispatcher.py

USER openclaw
WORKDIR /home/openclaw

ENTRYPOINT ["/usr/bin/tini", "--", "python3", "/app/inbox_dispatcher.py"]
