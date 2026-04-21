# =============================================================================
# Gateway image — OpenClaw + Chrome + Xvfb + Tailscale + noVNC + Caddy.
#
# One container runs: Xvfb (virtual display), Chrome (used by OpenClaw via CDP),
# noVNC/websockify (browser-based VNC), optional Tailscale (network join),
# optional Caddy (TLS front-end for public-mode noVNC), and the OpenClaw
# gateway itself (PID 1 via tini).
#
# Templates live at /opt/templates inside the image; the entrypoint seeds them
# into the gateway-repo volume on first boot.
#
# Multi-arch: amd64 + arm64. Chrome on arm64 uses the "-linux64" build so we
# rely on Chromium (not google-chrome-stable) when ARCH=arm64.
# =============================================================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    DISPLAY=:1 \
    HOME=/home/openclaw \
    OPENCLAW_VERSION=v2026.4.12 \
    NOVNC_VERSION=1.5.0 \
    TARGETARCH=amd64

ARG TARGETARCH

# ── Base packages ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget gnupg jq git openssh-client unzip tini \
      python3 python3-pip \
      xvfb x11-utils x11-xkb-utils xkb-data dbus-x11 \
      fluxbox \
      net-tools iproute2 iptables iputils-ping \
      fonts-liberation libatk-bridge2.0-0 libatk1.0-0 libcups2 \
      libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
      libxcomposite1 libxdamage1 libxrandr2 xdg-utils \
      libxss1 libasound2t64 \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 24 (for OpenClaw CLI) ────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Chrome / Chromium ────────────────────────────────────────
# On amd64 we use Google Chrome stable (matches today's production). On arm64
# (Apple Silicon, Raspberry Pi) Google doesn't ship a Linux ARM build, so we
# fall back to Chromium which is ABI-compatible for OpenClaw's CDP usage.
RUN if [ "$TARGETARCH" = "amd64" ]; then \
      wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
        | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
      && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list \
      && apt-get update \
      && apt-get install -y --no-install-recommends google-chrome-stable \
      && ln -sf /usr/bin/google-chrome-stable /usr/bin/google-chrome \
      && ln -sf /usr/bin/google-chrome-stable /usr/local/bin/chromium; \
    else \
      apt-get update && apt-get install -y --no-install-recommends chromium-browser \
      && ln -sf /usr/bin/chromium-browser /usr/bin/google-chrome \
      && ln -sf /usr/bin/chromium-browser /usr/bin/google-chrome-stable; \
    fi \
    && rm -rf /var/lib/apt/lists/*

# ── Tailscale (static binary, bundled even if unused) ────────
# Joins the user's tailnet on boot when TAILSCALE_AUTH_KEY is set. The binary
# stays harmless when unused.
RUN set -eux; \
    TS_ARCH=$([ "$TARGETARCH" = "amd64" ] && echo "amd64" || echo "arm64"); \
    TS_VERSION=$(curl -fsSL https://pkgs.tailscale.com/stable/ | grep -oE 'tailscale_[0-9]+\.[0-9]+\.[0-9]+_'"$TS_ARCH"'\.tgz' | head -1); \
    [ -n "$TS_VERSION" ] || { echo "Could not resolve Tailscale version"; exit 1; }; \
    curl -fsSL "https://pkgs.tailscale.com/stable/$TS_VERSION" -o /tmp/tailscale.tgz; \
    tar -xzf /tmp/tailscale.tgz -C /tmp; \
    cp /tmp/tailscale_*/tailscale /usr/local/bin/tailscale; \
    cp /tmp/tailscale_*/tailscaled /usr/local/bin/tailscaled; \
    chmod +x /usr/local/bin/tailscale /usr/local/bin/tailscaled; \
    rm -rf /tmp/tailscale.tgz /tmp/tailscale_*; \
    mkdir -p /var/lib/tailscale /var/run/tailscale

# ── noVNC + websockify ───────────────────────────────────────
# We use TigerVNC as the actual VNC server (already solid, supports :1 on
# Xvfb's display), and websockify wraps it in a WebSocket noVNC can speak.
# tigervnc-tools provides vncpasswd.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tigervnc-standalone-server tigervnc-common tigervnc-tools \
    && rm -rf /var/lib/apt/lists/*

# Xvfb writes its UNIX socket under /tmp/.X11-unix. Pre-create the
# directory with proper ownership so it works when Xvfb runs as our
# non-root user. Docker-managed /tmp is per-container so this can't be
# done lazily at runtime without root.
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

RUN pip3 install --no-cache-dir --break-system-packages websockify==0.12.0

RUN mkdir -p /usr/share/novnc \
    && curl -fsSL "https://github.com/novnc/noVNC/archive/v${NOVNC_VERSION}.tar.gz" \
         | tar -xz --strip-components=1 -C /usr/share/novnc \
    && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# ── Caddy (optional, for NOVNC_BIND=public TLS) ──────────────
RUN set -eux; \
    CADDY_ARCH=$([ "$TARGETARCH" = "amd64" ] && echo "amd64" || echo "arm64"); \
    CADDY_VERSION="2.8.4"; \
    curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_${CADDY_ARCH}.tar.gz" -o /tmp/caddy.tgz; \
    tar -xzf /tmp/caddy.tgz -C /usr/local/bin caddy; \
    chmod +x /usr/local/bin/caddy; \
    rm /tmp/caddy.tgz

# ── OpenClaw CLI ─────────────────────────────────────────────
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# ── Create non-root user ─────────────────────────────────────
# Ubuntu 24.04 ships with a pre-created `ubuntu` user at UID 1000.
# Remove it so we can own UID 1000 with our `openclaw` user.
RUN userdel -r ubuntu 2>/dev/null || true \
    && groupadd -g 1000 openclaw \
    && useradd -m -u 1000 -g 1000 -s /bin/bash openclaw \
    && mkdir -p /home/openclaw/.openclaw /home/openclaw/.ssh \
    && chown -R openclaw:openclaw /home/openclaw

# ── Bundle templates + bootstrap plugin ──────────────────────
COPY --chown=openclaw:openclaw templates /opt/templates
COPY --chown=openclaw:openclaw gateway/scripts/plugins /opt/openclaw-plugins

# ── Entrypoint ───────────────────────────────────────────────
COPY --chown=openclaw:openclaw gateway/files_api.py /usr/local/bin/files_api.py
COPY --chown=openclaw:openclaw gateway/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# noVNC (when enabled) listens on 6901 inside the container. The compose file
# decides whether/how to map it to the host.
EXPOSE 6901

# OpenClaw gateway's loopback-bound port. Not exposed publicly.
EXPOSE 18789

USER openclaw
WORKDIR /home/openclaw

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
