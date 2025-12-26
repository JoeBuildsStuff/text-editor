# GitHub Actions Deploy Performance Analysis

**Date**: December 26, 2024  
**Current Deploy Time**: ~4 minutes 35 seconds  
**Target Deploy Time**: ~1 minute 30-45 seconds

## Commands Used to Inspect Timings

```bash
# View recent workflow runs
gh run list --workflow=deploy.yml --limit=5

# View detailed logs of the most recent run
gh run view 20526423015 --log

# Check workflow status
gh run view 20526423015
```

## Time Breakdown Analysis

### Current Performance

| Stage | Operation | Time | Notes |
|-------|-----------|------|-------|
| **Builder Stage** | Total | ~60s | |
| | pnpm install | 15s | Dependencies installation |
| | pnpm build (Next.js) | 45s | Production build compilation |
| **Runner Stage** | Total | ~70s | |
| | pnpm install --prod | 13s | Production dependencies only |
| | **chown -R node:node** | **58s** | **🔴 MAJOR BOTTLENECK** |
| **Docker Ops** | | ~10s | pull, up, cleanup |
| **Pruning** | | ~15s | Aggressive cleanup operations |
| **Total** | | **~275s** | **4m 35s** |

## Critical Issues Identified

### 1. 🔴 Catastrophic `chown` Performance (58 seconds!)

**Problem**: The `RUN chown -R node:node /app` command is recursively changing ownership of thousands of files in node_modules.

**Root Cause**: Running chown after copying all files instead of copying with correct ownership.

**Impact**: Loses 58 seconds (21% of total deploy time)

### 2. ⚠️ No Docker Layer Caching

**Problem**: Every build starts from scratch, rebuilding unchanged layers.

**Impact**: Wastes 30-45 seconds on subsequent deploys where dependencies haven't changed.

### 3. ⚠️ Over-Aggressive Cleanup

**Problem**: 
- Pruning ALL build cache with `-af` flag
- Attempting to prune volumes with unsupported `until` filter (causing errors)
- Unnecessarily aggressive container pruning

**Impact**: 
- Removes useful cache that could speed up next build
- Spends time on operations that don't provide value

### 4. ⚠️ Suboptimal pnpm Configuration

**Problem**: Not leveraging pnpm's caching capabilities or offline mode.

**Impact**: Downloads packages that could be cached.

## Recommended Optimizations

### 1. Fix `chown` Bottleneck (Saves ~50s) ⭐⭐⭐

**Before:**
```dockerfile
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/.next ./.next
# ... more COPY commands ...
RUN chown -R node:node /app  # ❌ 58 seconds!
```

**After:**
```dockerfile
COPY --chown=node:node --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/next.config.ts ./
COPY --chown=node:node --from=builder /app/tsconfig.json ./
COPY --chown=node:node --from=builder /app/postcss.config.mjs ./
COPY --chown=node:node --from=builder /app/src ./src
COPY --chown=node:node --from=builder /app/node_modules/typescript ./node_modules/typescript
COPY --chown=node:node --from=builder /app/node_modules/.bin/tsc ./node_modules/.bin/tsc
# ❌ REMOVE: RUN chown -R node:node /app
```

### 2. Add Docker BuildKit Caching (Saves ~30-45s) ⭐⭐⭐

**In `.github/workflows/deploy.yml`:**
```yaml
script: |
  # Enable BuildKit
  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1
  
  # Build with cache
  docker compose build \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    text-editor
```

**In `Dockerfile`:**
```dockerfile
# Add cache mounts for pnpm
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
```

### 3. Optimize Docker Cleanup (Saves ~5-10s) ⭐

**Replace aggressive pruning:**
```bash
# ❌ REMOVE: docker builder prune -af
# ❌ REMOVE: docker image prune -af

# ✅ REPLACE WITH:
docker builder prune -f --keep-storage=2GB || true
docker image prune -f || true  # Only dangling images
```

**Remove broken volume prune:**
```bash
# ❌ REMOVE: docker volume prune -f --filter "until=168h" || true
# This filter is not supported and causes errors
```

### 4. Optimize pnpm Configuration (Saves ~5s) ⭐

**In `Dockerfile`:**
```dockerfile
# Before pnpm install
RUN pnpm config set store-dir /root/.local/share/pnpm/store

# Use offline mode when possible
RUN pnpm install --frozen-lockfile --prefer-offline
```

### 5. Skip Unnecessary Operations

**Remove redundant chmod:**
```dockerfile
# ❌ REMOVE: RUN chmod +x ./node_modules/.bin/tsc 2>/dev/null || true
# Not needed if using COPY --chown
```

## Implementation Priority

1. **🔥 Critical** - Fix `chown` bottleneck (Priority 1)
   - Quick win: 50 seconds saved
   - Low risk: Just changing COPY commands
   
2. **⚡ High** - Add BuildKit caching (Priority 2)
   - Medium effort
   - 30-45 seconds saved on subsequent builds
   
3. **✨ Medium** - Optimize cleanup (Priority 3)
   - Low effort
   - 5-10 seconds saved
   - Reduces wear on disk

4. **📦 Low** - pnpm optimizations (Priority 4)
   - Low effort
   - 5 seconds saved

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| First build | 4m 35s | 2m 30s | -45% |
| Subsequent builds | 4m 35s | 1m 30s | -67% |
| chown operation | 58s | 0s | -100% |
| Cache reuse | 0% | 60-70% | - |

## Next Steps

1. Create updated `Dockerfile` with `--chown` flags
2. Update `.github/workflows/deploy.yml` with BuildKit
3. Simplify cleanup operations
4. Test on development branch first
5. Monitor first few deploys for any issues

## Additional Notes

- Docker BuildKit cache is content-based, so it only rebuilds what changed
- The `chown` fix alone will save nearly 1 minute per deploy
- Consider setting up GitHub Actions cache for even better performance
- Current error with volume prune can be safely ignored/removed
