# Python Execution Persistence Options

> **STATUS: IMPLEMENTED** - Option 2 (Ephemeral Containers + Per-User Volume) was implemented on 2024-12-XX.

Goal: allow multiple code blocks in a document/session to share the same Python environment so installs/imports/files persist across blocks—more like Jupyter—while keeping safety and operability reasonable.

## Options Overview

### 1) Long-lived container per document/session
- **How**: On first block, start a container; reuse for subsequent blocks keyed by document/session; tear down on idle timeout or explicit reset.
- **Pros**: True in-memory persistence (variables, modules, interpreter state); installs once, reuse; minimal cold starts after first run.
- **Cons**: Must manage lifecycle (idle timers, caps on concurrent containers); risk of resource leaks (runaway processes, background jobs); security surface increases (persistent state for potential exfiltration/SSRF until teardown); requires API changes to route to the right container; harder horizontal scaling.
- **Mitigations**: Idle timeout (e.g., 10–15 min); per-container CPU/mem/pids limits; max blocks per session; “Reset environment” button; enforce no background network once block ends (difficult without additional sandboxing).

### 2) Ephemeral container + per-document volume
- **How**: Keep one container per block (as today) but mount a per-document named volume to `/tmp` (and/or another mount). Pip installs/scripts persist on disk between blocks; interpreter state does not.
- **Pros**: Avoids long-lived processes; simpler lifecycle (garbage-collect volumes by age); retains installed packages and saved files; keeps current security properties of fresh process per block.
- **Cons**: No in-memory state (variables lost); volumes can bloat and need cleanup; still allows persistence of downloaded data across runs; slightly longer startup (mount volume).
- **Mitigations**: Volume size caps/quotas; TTL-based cleanup (e.g., 24h); optional “Reset environment” to delete volume; path scoping to `/tmp` only.

### 3) Prebaked images per doc/template
- **How**: Build custom images with preinstalled packages per doc/project; continue using ephemeral containers.
- **Pros**: Fast startup for common stacks; no runtime persistence needed; safer (read-only image).
- **Cons**: Not flexible for ad-hoc installs; build/registry pipeline overhead; combinatorial image explosion if highly customized.
- **Mitigations**: Limit to curated stacks; pair with Option 2 for ad-hoc extras.

## Recommendation
- Default to **Option 2 (ephemeral containers + per-doc volume)**: balances safety and usability; gives “install once, reuse across blocks” for packages/files; avoids long-lived processes.
- Add optional **“Reset environment”** action to drop the volume.
- Keep time-based GC for volumes (e.g., delete if idle > 24h) and size caps (e.g., 500MB per volume).
- If true in-memory state is required, consider a controlled pilot of **Option 1** with strict idle timeout (≤15 min), strong limits, and explicit reset.

## Implementation Sketch (Option 2)
- Key a volume name by document or document+user (e.g., `py-sbx-${docId}-${userId}` sanitized).
- Mount volume to `/tmp` in docker run; keep read-only root FS.
- Ensure `PYTHONUSERBASE=/tmp`, `PATH` includes `/tmp/bin`, `PYTHONPATH` includes `/tmp/...` (already done).
- Add API to “reset environment” → drop the named volume.
- Add GC job to prune stale volumes by mtime/label and enforce size limits (docker system prune or explicit volume removal).

## Open Questions
- What is the right TTL and size cap for persisted state?
- Should volumes be per-document, per-user, or per (document, user)?
- Do we need a UI affordance to show when a volume is reused vs reset?
- Are there compliance concerns with persistent artifacts (logs/data) in the volume? Labeling/encryption needed?

## Rollout Plan
1. ✅ Implement Option 2 behind a feature flag (default off).
2. ✅ Add reset endpoint/action; add TTL cleanup job.
3. Dogfood internally; watch resource usage and security posture.
4. If stable, enable by default for admins; consider in-memory persistence (Option 1) as a follow-up experiment.

---

## Implementation Details (Option 2)

### What Changed

1. **Persistent package storage**: Packages installed via `pip install --user` now persist in `/sandbox/.python/` instead of `/tmp/`. This directory is mounted from the host filesystem at `server/python-sandbox/{userId}/.python/`.

2. **Environment variable changes in Docker**:
   - `HOME=/sandbox` (was `/tmp`)
   - `PYTHONUSERBASE=/sandbox/.python` (was `/tmp`)
   - `PATH` now includes `/sandbox/.python/bin`
   - `PYTHONPATH` now includes `/sandbox/.python/lib/python3.11/site-packages`

3. **Reset Environment API**: New endpoint at `POST /api/python-exec/reset`
   - Without body: Deletes entire sandbox (packages + files)
   - With `{ "packagesOnly": true }`: Only deletes `.python` directory, preserving user files
   - `GET /api/python-exec/reset`: Returns sandbox info (size, timestamps)

4. **Cleanup Script**: `scripts/cleanup-sandboxes.mjs`
   - Run manually: `pnpm sandbox:cleanup`
   - Dry run: `pnpm sandbox:cleanup:dry`
   - Deletes sandboxes idle > 24h (configurable via `SANDBOX_TTL_HOURS`)
   - Deletes sandboxes > 500MB (configurable via `SANDBOX_MAX_SIZE_MB`)
   - Can be scheduled via cron for automated cleanup

### File Structure

```
server/python-sandbox/
└── {userId}/                    # Per-user sandbox directory
    ├── .python/                 # Persistent Python packages
    │   ├── bin/                 # Installed scripts (e.g., openai CLI)
    │   └── lib/python3.11/
    │       └── site-packages/   # Installed packages
    ├── myfile.py                # User's working files
    └── data/                    # User's data directories
```

### Usage Example

```python
# First code block: install package (persists!)
import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "requests", "--user"])
print("Installed!")
```

```python
# Second code block (later): package is available!
import requests
print(requests.__version__)
```

### Security Considerations

- ✅ Ephemeral containers: Each execution is isolated, container destroyed after
- ✅ Read-only filesystem: Only `/sandbox` and `/tmp` are writable
- ✅ Resource limits: 256MB RAM, 0.5 CPU, 50 processes, 2 min timeout
- ✅ No capabilities: All Linux capabilities dropped
- ✅ Non-root user: Runs as `nobody:nogroup`
- ✅ Rate limiting: 60 requests/minute per user
- ✅ Admin-only: Only authenticated admin users can execute
- ⚠️ Persistent storage: Downloaded data persists until cleanup/reset
- ⚠️ Network access: When enabled, full internet access (not just pip registries) 
