#!/bin/bash
set -euo pipefail

SOCKET_PATH=${DOCKER_SOCKET_PATH:-/var/run/docker.sock}
TARGET_USER=node

if [ -S "$SOCKET_PATH" ]; then
  SOCKET_GID=$(stat -c '%g' "$SOCKET_PATH")
  TARGET_GROUP=$(getent group "$SOCKET_GID" | cut -d: -f1 || true)

  if [ -z "$TARGET_GROUP" ]; then
    GROUP_NAME=dockersock
    if ! getent group "$GROUP_NAME" >/dev/null 2>&1; then
      groupadd -g "$SOCKET_GID" "$GROUP_NAME" >/dev/null 2>&1 || true
    fi
    TARGET_GROUP=$(getent group "$SOCKET_GID" | cut -d: -f1 || true)
    TARGET_GROUP=${TARGET_GROUP:-$GROUP_NAME}
  fi

  usermod -aG "$TARGET_GROUP" "$TARGET_USER" >/dev/null 2>&1 || true
fi

exec gosu "$TARGET_USER" "$@"
