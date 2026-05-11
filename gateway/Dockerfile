# =============================================================================
# Gateway image — OpenClaw + Chrome + Xtigervnc + noVNC.
#
# One container runs: Xtigervnc (X + VNC in one process), XFCE (full desktop),
# Chrome (via CDP), noVNC/websockify (browser-based VNC), and the OpenClaw
# gateway itself (PID 1 via tini).
#
# Tailscale + TLS reverse-proxy live on the HOST, not in this container.
# Docker publishes ports to 127.0.0.1 or 0.0.0.0 per NOVNC_HOST_PORT /
# FILES_API_HOST_PORT in docker-compose.yml — the host's network mode
# (Tailscale installed vs not) decides who can reach them.
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

# ── Base packages + XFCE desktop ─────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget gnupg jq git openssh-client unzip tini \
      python3 python3-pip \
      x11-utils x11-xkb-utils xkb-data dbus-x11 \
      net-tools iproute2 iptables iputils-ping \
      fonts-liberation libatk-bridge2.0-0 libatk1.0-0 libcups2 \
      libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
      libxcomposite1 libxdamage1 libxrandr2 xdg-utils \
      libxss1 libasound2t64 \
      xdotool scrot \
      xfce4 xfce4-goodies xfce4-terminal \
      xfce4-whiskermenu-plugin \
      thunar xdg-user-dirs \
      yaru-theme-gtk yaru-theme-icon \
      papirus-icon-theme \
      fonts-ubuntu fonts-noto-color-emoji \
      at-spi2-core \
      autocutsel \
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

# ── noVNC + websockify ───────────────────────────────────────
# We use TigerVNC's Xtigervnc — a combined X server + VNC server in one
# process. It's what tigervncserver / vncserver wrap under the hood, and
# it handles both the display and the RFB protocol cleanly on Debian/
# Ubuntu (unlike tigervnc-scraping-server's perl-wrapped x0vncserver,
# which ships broken on 24.04).
#
# tigervnc-standalone-server  provides Xtigervnc
# tigervnc-tools              provides vncpasswd
# tigervnc-common             runtime shared libs
RUN apt-get update && apt-get install -y --no-install-recommends \
      tigervnc-standalone-server tigervnc-common tigervnc-tools \
    && rm -rf /var/lib/apt/lists/*

# X and ICE socket dirs. Xtigervnc writes its X socket under
# /tmp/.X11-unix; XFCE/ICE uses /tmp/.ICE-unix. Pre-create both with
# sticky perms so our non-root user can use them (they're on
# Docker's per-container /tmp so this has to happen at build time).
RUN mkdir -p /tmp/.X11-unix /tmp/.ICE-unix \
    && chmod 1777 /tmp/.X11-unix /tmp/.ICE-unix

COPY gateway/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

RUN mkdir -p /usr/share/novnc \
    && curl -fsSL "https://github.com/novnc/noVNC/archive/v${NOVNC_VERSION}.tar.gz" \
         | tar -xz --strip-components=1 -C /usr/share/novnc \
    && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# ── OpenClaw CLI ─────────────────────────────────────────────
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# ── Create non-root user ─────────────────────────────────────
# Ubuntu 24.04 ships with a pre-created `ubuntu` user at UID 1000.
# Remove it so we can own UID 1000 with our `openclaw` user.
RUN userdel -r ubuntu 2>/dev/null || true \
    && groupadd -g 1000 openclaw \
    && useradd -m -u 1000 -g 1000 -s /bin/bash openclaw \
    && mkdir -p \
         /home/openclaw/.openclaw \
         /home/openclaw/.ssh \
         /home/openclaw/.config/google-chrome \
         /home/openclaw/.local/share \
         /home/openclaw/.cache \
    && chown -R openclaw:openclaw /home/openclaw

# ── XFCE system-wide defaults ────────────────────────────────
# xfconfd reads /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/*.xml as
# system defaults when the user's ~/.config/xfce4 version is missing
# (which it is on first boot, since we don't ship dotfiles). These
# files set the theme (Yaru-dark), icon theme (Papirus-Dark), panel
# layout with whisker menu + clock, wallpaper (solid dark color),
# and disable the power-manager popup (no battery in a container).
COPY gateway/xfce-defaults/xsettings.xml                /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml
COPY gateway/xfce-defaults/xfwm4.xml                    /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml
COPY gateway/xfce-defaults/xfce4-panel.xml              /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml
COPY gateway/xfce-defaults/xfce4-desktop.xml            /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml
COPY gateway/xfce-defaults/xfce4-power-manager.xml      /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-power-manager.xml

# ── Default browser registration ─────────────────────────────
# Without these, XFCE's "Web Browser" launcher (exo-open --launch
# WebBrowser) and xdg-open both fail with "Failed to execute default
# Web Browser. Input/output error." because no handler is registered
# for http/https schemes. Register Chrome as the default at both the
# exo/XFCE layer (helpers.rc) and the xdg-mime layer (mimeapps.list)
# so every path finds it.
RUN mkdir -p /etc/xdg/xfce4 /etc/xdg \
    && printf '%s\n' \
         'WebBrowser=custom-WebBrowser' \
         > /etc/xdg/xfce4/helpers.rc \
    && mkdir -p /usr/share/xfce4/helpers \
    && printf '%s\n' \
         '[Desktop Entry]' \
         'Version=1.0' \
         'Type=X-XFCE-Helper' \
         'Name=Google Chrome' \
         'Icon=google-chrome' \
         'X-XFCE-Category=WebBrowser' \
         'X-XFCE-Commands=/usr/bin/google-chrome-stable --no-sandbox --disable-dev-shm-usage' \
         'X-XFCE-CommandsWithParameter=/usr/bin/google-chrome-stable --no-sandbox --disable-dev-shm-usage "%s"' \
         > /usr/share/xfce4/helpers/custom-WebBrowser.desktop \
    && printf '%s\n' \
         '[Default Applications]' \
         'text/html=google-chrome.desktop' \
         'x-scheme-handler/http=google-chrome.desktop' \
         'x-scheme-handler/https=google-chrome.desktop' \
         'x-scheme-handler/about=google-chrome.desktop' \
         'x-scheme-handler/unknown=google-chrome.desktop' \
         > /etc/xdg/mimeapps.list \
    && install -o openclaw -g openclaw -m 644 \
         /etc/xdg/mimeapps.list /home/openclaw/.config/mimeapps.list

# ── Bundle templates + bootstrap plugin ──────────────────────
COPY --chown=openclaw:openclaw templates /opt/templates
COPY --chown=openclaw:openclaw gateway/scripts/plugins /opt/openclaw-plugins

# ── Entrypoint ───────────────────────────────────────────────
COPY --chown=openclaw:openclaw gateway/files_api.py /usr/local/bin/files_api.py
COPY --chown=openclaw:openclaw gateway/entrypoint.sh /usr/local/bin/entrypoint.sh
# Registry-fallback helper used by entrypoint.sh when SUPABASE_URL /
# SUPABASE_SERVICE_ROLE_KEY aren't set. Reads the UI's projects.json +
# secrets.json via the shared ui-config volume (mounted at /config).
RUN mkdir -p /opt/yourhq/daemons && chown -R openclaw:openclaw /opt/yourhq
COPY --chown=openclaw:openclaw gateway/daemons/registry_config.py /opt/yourhq/registry_config.py
COPY --chown=openclaw:openclaw gateway/connectors /opt/yourhq/connectors
COPY --chown=openclaw:openclaw gateway/daemons/inbox_dispatcher.py /opt/yourhq/daemons/inbox_dispatcher.py
COPY --chown=openclaw:openclaw gateway/daemons/command_runner.py /opt/yourhq/daemons/command_runner.py
COPY --chown=openclaw:openclaw gateway/daemons/git_backup_sweep.py /opt/yourhq/daemons/git_backup_sweep.py
COPY --chown=openclaw:openclaw gateway/daemons/secrets_sync.py /opt/yourhq/daemons/secrets_sync.py
COPY --chown=openclaw:openclaw gateway/daemons/file_processor.py /opt/yourhq/daemons/file_processor.py
COPY --chown=openclaw:openclaw gateway/daemons/source_sync.py /opt/yourhq/daemons/source_sync.py
RUN chmod +x /usr/local/bin/entrypoint.sh

# noVNC (when enabled) listens on 6901 inside the container. The compose file
# decides whether/how to map it to the host.
EXPOSE 6901

# OpenClaw gateway's loopback-bound port. Not exposed publicly.
EXPOSE 18789

USER openclaw
WORKDIR /home/openclaw

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=60s \
  CMD wget -qO- http://localhost:18790/healthz || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
