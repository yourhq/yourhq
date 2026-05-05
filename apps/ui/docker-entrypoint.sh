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

exec gosu nextjs "$@"
