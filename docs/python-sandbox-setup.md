# Python Sandbox Setup

A new hardened execution path lets administrators run Python snippets without exposing the host filesystem, secrets, or network. This guide explains how it works and how to configure it locally and in production.

## Execution Model

| Environment | Behavior |
|-------------|----------|
| Development (default) | `python3 -I -c <code>` runs directly on your Mac for convenience |
| Production + `ENABLE_PYTHON_SANDBOX=true` | Code runs inside a locked-down Docker container spawned on demand |

The sandboxed container disables networking, mounts a read-only filesystem, limits CPU/memory/pids, and runs as the `nobody` user so the attack scripts from `issues-to-address/run-code-risks-text-editor.md` fail by default.

## Environment Variables

Add the following to the relevant `.env` files:

```bash
# Local development (.env.local)
NODE_ENV=development
ENABLE_PYTHON_SANDBOX=false

# Production (.env or compose env section)
NODE_ENV=production
ENABLE_PYTHON_SANDBOX=true
PYTHON_DOCKER_IMAGE=python:3.11-slim

# Optional: Allow network access for pip/npm (default: false)
# WARNING: Enables full network access - see security analysis below
ALLOW_SANDBOX_NETWORK=false
```

- `PYTHON_DOCKER_IMAGE` is optional (defaults to `python:3.11-slim`) but is useful if you maintain an internal hardened image.
- `ALLOW_SANDBOX_NETWORK=true` enables network access, allowing `pip install` and `npm install` at runtime. See `docs/network-access-security-analysis.md` for security implications.

## docker-compose Configuration

The app container needs access to the host Docker daemon plus the Docker CLI binary. Update `docker-compose.yml`:

```yaml
services:
  text-editor:
    volumes:
      - /home/joe/data/text-editor:/app/server
      - /var/run/docker.sock:/var/run/docker.sock  # rw so Docker CLI can talk to the daemon
    environment:
      - ENABLE_PYTHON_SANDBOX=true
      - PYTHON_DOCKER_IMAGE=python:3.11-slim
```

> The socket must be mounted read/write so the bundled Docker CLI can talk to the daemon.

After editing compose, redeploy so the container picks up the mounts and environment variables.

## Docker Image Requirements

The production image now bundles the Docker CLI (downloaded as a static binary in the Dockerfile) and a startup script that automatically detects the socket’s group id and adds the `node` user to it. No host binary mount or manual `chmod` is required—just provide the daemon socket via the bind mount above.

Pre-pull the sandbox image on the VPS to avoid long cold-starts:

```bash
sudo docker pull python:3.11-slim
```

## Security Controls in the Route

When `ENABLE_PYTHON_SANDBOX=true` the API route launches containers with:

- `--network none` – blocks outbound/inbound traffic and metadata endpoints
- `--read-only` + `--tmpfs /tmp:size=10M,mode=1777,noexec` – no filesystem writes except a small tmpfs
- `--cap-drop ALL` & `--security-opt no-new-privileges` – removes Linux capabilities and privilege escalation paths
- `--memory 128m`, `--cpus 0.5`, `--pids-limit 50` – prevents resource exhaustion
- `--user nobody:nogroup` – never runs as root inside the container
- `--device` mappings for `/dev/null`, `/dev/zero`, `/dev/urandom` – enough for Python stdlib without exposing other devices

These settings stop each of the previously successful attack scripts (env dump, filesystem reads, exfiltration, SSRF, pip install) while preserving the existing rate limit and admin-only access.

## Testing Checklist

1. Deploy with the updated compose file and environment variables.
2. Run each snippet from `Python Sandbox Attack Scripts` inside the editor or `/terminal` page.
3. Confirm you see explicit errors (`Network unreachable`, `Read-only file system`, permission errors, etc.).
4. Verify the bundled Docker CLI works inside the container (`docker --version`).
5. Monitor container logs for failures so you can tune `EXECUTION_TIMEOUT_MS` if Docker cold-starts are slow.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `docker: command not found` | CLI missing in image | Rebuild after pulling latest Dockerfile (it now installs a static Docker CLI) |
| `Cannot connect to the Docker daemon` | Missing socket mount or socket not readable | Ensure `/var/run/docker.sock` is mounted read/write (default path) |
| First execution is slow or timeouts | Python image being pulled lazily | Run `docker pull python:3.11-slim` on the VPS before deploying |
| Sandbox ignores restrictions | `ENABLE_PYTHON_SANDBOX` not set or not in production mode | Double-check env vars and `NODE_ENV=production` |

For even stronger isolation consider moving the sandbox logic into a separate microservice that owns Docker access, or switch to a VM-based executor such as Firecracker. The current design is a balanced compromise between security and operational simplicity.
