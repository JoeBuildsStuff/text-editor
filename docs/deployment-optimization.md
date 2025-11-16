# Deployment Optimization Guide

This document explains the optimized deployment strategy that builds Docker images in GitHub Actions CI instead of on the VPS.

## Overview

**Before:** VPS builds everything (5+ minutes on 2 CPU / 2 GB RAM VPS)
- Install dependencies
- Build better-sqlite3 native bindings
- Build Next.js application
- Build Docker image
- Restart services

**After:** CI builds, VPS just pulls and runs (~30 seconds on VPS)
- ✅ GitHub Actions builds Docker image (uses faster CI resources)
- ✅ Image pushed to GitHub Container Registry (ghcr.io)
- ✅ VPS pulls pre-built image
- ✅ VPS restarts services

## Setup Instructions

### 1. GitHub Container Registry Setup

The workflow automatically uses `ghcr.io` (GitHub Container Registry), which is **free for public repos** and **free for private repos** too (with generous limits).

#### For Private Repositories:

1. Create a GitHub Personal Access Token (PAT):
   - Go to: GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Create token with `read:packages` permission
   - Copy the token

2. Add as GitHub Secret:
   - Go to: Repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `GHCR_TOKEN`
   - Value: Paste your PAT

**Note:** If you don't set `GHCR_TOKEN`, the workflow will try using `GITHUB_TOKEN` (automatically available) or anonymous pull (for public packages).

#### For Public Repositories:

No setup needed! The package will be public by default.

### 2. How It Works

1. **Build Job** (runs in GitHub Actions):
   - Checks out code
   - Builds Docker image using your Dockerfile
   - Pushes to `ghcr.io/YOUR_USERNAME/text-editor:latest`
   - Uses Docker layer caching (via GitHub Actions cache) for faster subsequent builds

2. **Deploy Job** (runs after build completes):
   - SSH to your VPS
   - Logs in to ghcr.io
   - Pulls the latest image
   - Restarts Docker Compose service
   - Restarts systemd service (if configured)

### 3. Image Tags

Images are tagged with:
- `latest` - Always points to the latest main branch build
- `main-<sha>` - Specific commit SHA (e.g., `main-abc123def`)
- `main` - Branch name

The workflow uses the `latest` tag for deployments.

## Benefits

✅ **Faster deployments**: Build happens in parallel on fast CI runners  
✅ **Lower VPS load**: VPS just pulls and restarts (uses minimal resources)  
✅ **Better caching**: Docker layer caching in CI speeds up rebuilds  
✅ **Consistent builds**: Same build environment every time  
✅ **Scalable**: Easy to deploy to multiple VPS instances  

## Performance Comparison

| Metric | Before (VPS Build) | After (CI Build) |
|--------|-------------------|------------------|
| VPS CPU usage | High (100% during build) | Minimal (just pull) |
| VPS RAM usage | High (1.5GB+ during build) | Low (<100MB) |
| Deployment time | ~5 minutes | ~30 seconds on VPS |
| Build time | On VPS | On CI (~2-3 min) |
| **Total time** | **~5 min** | **~2-3 min** |

## Alternative Options

If you prefer not to use ghcr.io, here are other options:

### Option 2: Build Next.js in CI, Transfer Artifacts

Build the `.next` folder in CI, transfer via SSH, then build Docker on VPS (but skip Next.js build step).

**Pros:**
- Faster than full VPS build
- No container registry needed

**Cons:**
- Still builds Docker on VPS (though faster)
- Need to handle better-sqlite3 native bindings on VPS

### Option 3: Use Docker Hub or Other Registry

Change the `IMAGE_NAME` env var in `.github/workflows/deploy.yml`:

```yaml
IMAGE_NAME: docker.io/yourusername/text-editor  # Docker Hub
# or
IMAGE_NAME: registry.example.com/text-editor    # Private registry
```

Then update login step accordingly.

### Option 4: Build Locally and Push

For local development, you can still build and push manually:

```bash
docker build -t ghcr.io/YOUR_USERNAME/text-editor:latest .
docker push ghcr.io/YOUR_USERNAME/text-editor:latest
```

Then pull on VPS:

```bash
docker pull ghcr.io/YOUR_USERNAME/text-editor:latest
docker-compose up -d --force-recreate
```

## Troubleshooting

### Image pull fails with "unauthorized"

**Solution:** Set up `GHCR_TOKEN` secret (see Setup Instructions above)

### Image pull fails with "not found"

**Possible causes:**
1. Package visibility is private but no auth token
2. Image name doesn't match repository name
3. Build job failed

**Solution:** Check build job logs, verify image name matches your repo.

### VPS still building locally

**Check:** The workflow uses `docker-compose.override.yml` to override the image. Ensure the override file is being used:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml config
```

Should show `image: ghcr.io/...` instead of `build: ...`

## Rollback

If you need to rollback to the old workflow, the previous version built everything on the VPS. You can revert the `.github/workflows/deploy.yml` file to the previous commit.

## Manual Deployment

You can also manually trigger deployment by:

1. Building locally and pushing:
   ```bash
   docker build -t ghcr.io/YOUR_USERNAME/text-editor:latest .
   docker push ghcr.io/YOUR_USERNAME/text-editor:latest
   ```

2. On VPS, pull and restart:
   ```bash
   docker pull ghcr.io/YOUR_USERNAME/text-editor:latest
   docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d --force-recreate
   ```

## Questions?

- **GitHub Container Registry docs**: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- **Docker layer caching**: Enabled automatically via `cache-from: type=gha` and `cache-to: type=gha`

