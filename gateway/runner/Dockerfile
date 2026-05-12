# =============================================================================
# Runner image — watches agent_commands in Supabase Realtime and executes
# lifecycle commands (add-agent, remove, update, restart, OAuth steps, etc.)
# against the gateway's state volume.
#
# Carries Docker CLI so it can `docker compose restart` sibling containers
# (restart_gateway / restart_dispatcher / update_self actions).
# =============================================================================
FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HOME=/home/openclaw \
    OPENCLAW_VERSION=v2026.4.12 \
    RUNTIME_MODE=docker

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg tini python3 python3-pip \
      git jq openssh-client \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI (mount host docker socket for sibling-container restarts)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
       | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
       docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --break-system-packages websocket-client==1.8.0 cryptography==44.0.0

RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Ubuntu 24.04 ships with a pre-created `ubuntu` user at UID 1000.
RUN userdel -r ubuntu 2>/dev/null || true \
    && groupadd -g 1000 openclaw \
    && useradd -m -u 1000 -g 1000 -s /bin/bash openclaw

COPY --chown=openclaw:openclaw gateway/daemons/command_runner.py /app/command_runner.py
COPY --chown=openclaw:openclaw gateway/daemons/git_backup_sweep.py /app/git_backup_sweep.py
COPY --chown=openclaw:openclaw gateway/daemons/secrets_sync.py /app/secrets_sync.py
COPY --chown=openclaw:openclaw gateway/daemons/registry_config.py /app/registry_config.py
COPY --chown=openclaw:openclaw gateway/runner/entrypoint.sh /app/entrypoint.sh
COPY --chown=openclaw:openclaw gateway/scripts /home/openclaw/.yourhq-infra

RUN set -eux; \
    chmod +x /home/openclaw/.yourhq-infra/*.sh 2>/dev/null || true; \
    for s in add-agent.sh remove-agent.sh update-agent.sh update-all-agents.sh list-agents.sh; do \
      if [ -f "/home/openclaw/.yourhq-infra/$s" ]; then \
        ln -sf "/home/openclaw/.yourhq-infra/$s" "/home/openclaw/$s"; \
      fi; \
    done; \
    chown -R openclaw:openclaw /home/openclaw

USER openclaw
WORKDIR /home/openclaw

ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
