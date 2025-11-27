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
```

`PYTHON_DOCKER_IMAGE` is optional (defaults to `python:3.11-slim`) but is useful if you maintain an internal hardened image.

## docker-compose Configuration

The app container needs access to the host Docker daemon plus the Docker CLI binary. Update `docker-compose.yml`:

```yaml
services:
  text-editor:
    volumes:
      - /home/joe/data/text-editor:/app/server
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /usr/bin/docker:/usr/bin/docker:ro  # reuse host CLI binary
    environment:
      - ENABLE_PYTHON_SANDBOX=true
      - PYTHON_DOCKER_IMAGE=python:3.11-slim
```

> **Alternative:** If you prefer not to mount `/usr/bin/docker`, install the Docker CLI inside your image (e.g. `apt-get install docker-ce-cli`) and keep only the socket mount. Mounting the host binary keeps the image smaller but assumes `/usr/bin/docker` exists on the VPS.

After editing compose, redeploy so the container picks up the mounts and environment variables.

## Docker Image Requirements

Because the sandbox containers are siblings (spawned by the host Docker daemon), the application image only needs the Docker CLI client. There are two supported options:

1. **Mount host CLI (recommended for simplicity)** – as shown above.
2. **Install docker-ce-cli in the Dockerfile** – follow the instructions from Docker’s apt repository if you need a self-contained image.

Regardless of the approach, pre-pull the sandbox image on the VPS to avoid long cold-starts:

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
4. Verify `/usr/bin/docker` is reachable in the container (`docker --version`).
5. Monitor container logs for failures so you can tune `EXECUTION_TIMEOUT_MS` if Docker cold-starts are slow.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `docker: command not found` | CLI not mounted or installed | Add the `/usr/bin/docker` bind mount or install docker-ce-cli in the image |
| `Cannot connect to the Docker daemon` | Missing socket mount / permissions | Ensure `/var/run/docker.sock` is mounted read-only and accessible (may require `chmod 660` on the host) |
| First execution is slow or timeouts | Python image being pulled lazily | Run `docker pull python:3.11-slim` on the VPS before deploying |
| Sandbox ignores restrictions | `ENABLE_PYTHON_SANDBOX` not set or not in production mode | Double-check env vars and `NODE_ENV=production` |

For even stronger isolation consider moving the sandbox logic into a separate microservice that owns Docker access, or switch to a VM-based executor such as Firecracker. The current design is a balanced compromise between security and operational simplicity.
