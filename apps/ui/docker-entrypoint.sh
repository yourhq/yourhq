#!/bin/sh
# Ensure the nextjs user can access the Docker socket (GID varies by host).
if [ -S /var/run/docker.sock ]; then
  SOCK_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null)
  if [ -n "$SOCK_GID" ] && [ "$SOCK_GID" != "0" ]; then
    if ! getent group "$SOCK_GID" >/dev/null 2>&1; then
      groupadd -g "$SOCK_GID" dockersock
    fi
    usermod -aG "$SOCK_GID" nextjs 2>/dev/null
  fi
fi

# Make mounted compose .env readable by nextjs (installer creates it 600/root).
if [ -f /compose/.env ] && ! su -s /bin/sh nextjs -c "test -r /compose/.env" 2>/dev/null; then
  chmod 644 /compose/.env
fi

# Copy host Docker config so nextjs can authenticate to registries.
if [ -f /host-docker-config/config.json ]; then
  mkdir -p /home/nextjs/.docker
  cp /host-docker-config/config.json /home/nextjs/.docker/config.json
  chown -R nextjs:nodejs /home/nextjs/.docker
fi

exec gosu nextjs "$@"
