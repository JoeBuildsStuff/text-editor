# Python pip Install in Sandbox: Implementation Journey

This document tracks our efforts to enable `pip install` functionality in the Python code execution sandbox environment.

## Goal

Enable users to install Python packages at runtime using `pip install` within code blocks, while maintaining the security isolation provided by the Docker-based sandbox.

## Initial State

The sandbox was configured with:
- **Network isolation**: `--network none` - completely blocked network access
- **Read-only filesystem**: `--read-only` with only `/tmp` writable (10MB tmpfs)
- **Memory limit**: 128MB
- **Execution timeout**: 10 seconds
- **Python isolation**: `-I` flag (isolated mode, ignores PYTHONPATH)

This configuration successfully prevented:
- Network access (no pip install, no API calls, no data exfiltration)
- Filesystem attacks
- Resource exhaustion

But it also prevented legitimate use cases like installing packages.

## Issue #1: Network Access Disabled

**Problem**: `pip install openai` failed with:
```
Failed to establish a new connection: [Errno -3] Temporary failure in name resolution
```

**Root Cause**: Docker container was launched with `--network none`, completely blocking all network access.

**Solution**: Added environment variable `ALLOW_SANDBOX_NETWORK` to conditionally enable network access:
- When `ALLOW_SANDBOX_NETWORK=true`: Use `--network bridge` (full internet access)
- When `ALLOW_SANDBOX_NETWORK=false` (default): Use `--network none` (no network)

**Implementation**:
```typescript
const ALLOW_SANDBOX_NETWORK = process.env.ALLOW_SANDBOX_NETWORK === "true"
// ...
"--network", ALLOW_SANDBOX_NETWORK ? "bridge" : "none",
```

**Trade-offs**:
- ✅ Enables pip install and npm install
- ⚠️ Enables full network access (data exfiltration, SSRF possible)
- ✅ Still protected by: ephemeral containers, read-only filesystem, resource limits, admin-only access

## Issue #2: Execution Timeout Too Short

**Problem**: Package installation was timing out after 10 seconds:
```
Process terminated after timeout.
```

**Root Cause**: 10 seconds wasn't enough time for:
- Pulling Docker image (if not cached): 10-30 seconds
- Downloading packages: 30-60+ seconds
- Installing packages: 10-20 seconds

**Solution**: Increased timeout from 10 seconds to 120 seconds (2 minutes):
```typescript
const EXECUTION_TIMEOUT_MS =
  process.env.PYTHON_EXEC_TIMEOUT_MS ? parseInt(process.env.PYTHON_EXEC_TIMEOUT_MS, 10) : 120_000
```

**Trade-offs**:
- ✅ Allows time for package installation
- ⚠️ Longer wait for failed executions
- ✅ Still has timeout protection

## Issue #3: Read-Only Filesystem

**Problem**: `pip install` failed with:
```
ERROR: Could not install packages due to an OSError: [Errno 30] Read-only file system: '/nonexistent'
```

**Root Cause**: 
- Filesystem is read-only except for `/tmp`
- Pip tried to install to `/nonexistent/.local` (nobody user's home directory)
- `/nonexistent` doesn't exist and can't be created

**Solution**: Set `HOME=/tmp` so pip installs to `/tmp/.local`:
```typescript
"-e", "HOME=/tmp",
```

Also increased tmpfs size from 10MB to 100MB to accommodate packages:
```typescript
"--tmpfs", "/tmp:size=100M,mode=1777",
```

**Trade-offs**:
- ✅ Packages can be installed to writable location
- ✅ 100MB is enough for most packages
- ⚠️ Packages are ephemeral (lost when container is destroyed)

## Issue #4: Process Killed (SIGKILL)

**Problem**: Installation completed but process was killed with exit code -9 (SIGKILL):
```
Installing collected packages: ...
[Process exited with code -9]
```

**Root Cause**: Memory limit of 128MB was too low for package installation. Pip and package compilation can use significant memory.

**Solution**: Increased memory limit from 128MB to 256MB:
```typescript
"--memory", "256m",
"--memory-swap", "256m",
```

**Trade-offs**:
- ✅ Enough memory for most package installations
- ⚠️ Still limited (prevents resource exhaustion)
- ✅ Reasonable for single-user admin setup

## Issue #5: Python Can't Find Installed Packages

**Problem**: Packages installed successfully but Python couldn't import them:
```
Successfully installed openai-2.8.1
...
❌ Failed to import openai: No module named 'openai'
```

**Root Causes**:
1. **Python's `-I` flag**: Isolated mode ignores `PYTHONPATH` environment variable
2. **PYTHONUSERBASE**: When set to `/tmp`, pip installs to `/tmp/lib/python3.11/site-packages` instead of `/tmp/.local/lib/python3.11/site-packages`

**Solution**: 
1. Removed `-I` flag to allow Python to respect PYTHONPATH:
```typescript
// Before: ["python3", "-I", "-c", code]
// After:  ["python3", "-c", code]
```

2. Set `PYTHONUSERBASE=/tmp` and updated PYTHONPATH to include both locations:
```typescript
"-e", "PYTHONUSERBASE=/tmp",
"-e", "PATH=/tmp/bin:/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin",
"-e", "PYTHONPATH=/tmp/lib/python3.11/site-packages:/tmp/lib/python3/site-packages:/tmp/.local/lib/python3.11/site-packages:/tmp/.local/lib/python3/site-packages",
```

**Why both paths?**
- `/tmp/lib/...` - where `PYTHONUSERBASE=/tmp` installs packages
- `/tmp/.local/lib/...` - fallback for compatibility
- `/tmp/bin` - where scripts are installed with `PYTHONUSERBASE=/tmp`

**Trade-offs**:
- ✅ Python can find installed packages
- ⚠️ Removed `-I` flag (less isolation, but sandbox still provides isolation)
- ✅ Multiple paths ensure compatibility

## Issue #6: PATH Warning for Scripts

**Problem**: Pip warned that scripts were installed to `/tmp/bin` which wasn't on PATH:
```
WARNING: The script openai is installed in '/tmp/bin' which is not on PATH.
```

**Solution**: Added `/tmp/bin` to PATH (already included in Issue #5 fix):
```typescript
"-e", "PATH=/tmp/bin:/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin",
```

## Current Configuration

### Environment Variables
- `ALLOW_SANDBOX_NETWORK=true` - Enables network access for pip/npm
- `PYTHON_EXEC_TIMEOUT_MS=120000` - 2 minute timeout (configurable)
- `ENABLE_PYTHON_SANDBOX=true` - Enables Docker sandbox mode

### Docker Container Settings
- **Network**: `bridge` (when `ALLOW_SANDBOX_NETWORK=true`)
- **Filesystem**: Read-only with `/tmp` writable (100MB tmpfs)
- **Memory**: 256MB limit
- **CPU**: 0.5 cores
- **User**: `nobody:nogroup` (non-root)
- **Capabilities**: All dropped
- **Timeout**: 120 seconds

### Python Environment
- **HOME**: `/tmp`
- **PYTHONUSERBASE**: `/tmp`
- **PYTHONPATH**: Includes `/tmp/lib/python3.11/site-packages` and `/tmp/.local/lib/python3.11/site-packages`
- **PATH**: Includes `/tmp/bin` and `/tmp/.local/bin`

## Remaining Limitations

1. **Ephemeral Containers**: Packages don't persist between code block executions. Each execution runs in a fresh container.
   - **Workaround**: Install packages in the same code block that uses them, or use a custom Docker image with pre-installed packages.

2. **Memory Limit**: 256MB may not be enough for very large packages or packages that compile from source.
   - **Workaround**: Increase `--memory` limit or use pre-built wheels.

3. **Network Access**: Full internet access is enabled (not just pip/npm registries).
   - **Future improvement**: Could use a proxy or iptables rules to whitelist only pip/npm registries.

4. **Timeout**: 120 seconds may not be enough for very large package installations.
   - **Workaround**: Increase `PYTHON_EXEC_TIMEOUT_MS` environment variable.

## Security Considerations

Even with network access enabled, the sandbox still provides protection:

✅ **Ephemeral containers** - Each execution is isolated and destroyed after completion
✅ **Read-only filesystem** - Can't modify host filesystem
✅ **Resource limits** - Memory, CPU, and process limits prevent resource exhaustion
✅ **Non-root user** - Runs as `nobody:nogroup`
✅ **No capabilities** - All Linux capabilities dropped
✅ **Rate limiting** - 60 requests per minute per user
✅ **Admin-only** - Only authenticated admin users can execute code

**Risks introduced by network access**:
- ⚠️ Data exfiltration possible (but admin-only, so trusted users)
- ⚠️ SSRF attacks possible (but network namespace isolation helps)
- ⚠️ Supply chain attacks (malicious packages, but ephemeral containers)

## Testing

A comprehensive test document was created to verify functionality:
- Basic Python execution
- Network connectivity
- Package installation
- Package import
- Filesystem access
- Resource limits
- Network services

See test results for verification of each component.

### Running the test doc in this CLI

If you run the code blocks from this doc in the current CLI playground, note a few quirks:
- Each code block runs in a fresh container. Install and use a package in the **same** block (or combine the install/import into one script) or it will not be found later.
- `ping` is not installed in the base image; use a small Python socket/DNS check instead (see Test 9).
- Packages install under `/tmp` (`PYTHONUSERBASE=/tmp`). Ensure `PYTHONPATH` includes `/tmp/lib/python3.11/site-packages:/tmp/.local/lib/python3.11/site-packages` if you customize it.
- Tools like `psutil` are not preinstalled—`pip install psutil --user` inside the same block before importing.
- PATH warnings about `/tmp/bin` are expected; the environment already prepends `/tmp/bin:/tmp/.local/bin`.

A minimal “install + use” one-shot block:
```python
import sys, subprocess

subprocess.run([sys.executable, "-m", "pip", "install", "openai", "--user"], check=True)

import openai
print("Imported openai", openai.__version__)
```

## Future Improvements

1. **Selective Network Access**: Whitelist only pip/npm registries instead of full internet access
2. **Package Caching**: Cache installed packages in a volume to speed up subsequent installations
3. **Custom Base Images**: Pre-install common packages in a custom Docker image
4. **Package Persistence**: Use a shared volume for packages (with security considerations)
5. **Better Error Messages**: More descriptive errors when packages fail to install or import

## Summary

We successfully enabled `pip install` functionality by:
1. ✅ Enabling network access via `ALLOW_SANDBOX_NETWORK=true`
2. ✅ Increasing execution timeout to 120 seconds
3. ✅ Setting `HOME=/tmp` and increasing tmpfs to 100MB
4. ✅ Increasing memory limit to 256MB
5. ✅ Removing Python's `-I` flag and configuring PYTHONPATH correctly
6. ✅ Setting `PYTHONUSERBASE=/tmp` and updating PATH/PYTHONPATH

The solution maintains security through ephemeral containers, resource limits, and admin-only access, while enabling legitimate package installation use cases.
