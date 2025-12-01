# Network Access Security Analysis

## Current Security Model

The sandbox currently uses `--network none` which blocks all network access. This prevents:

1. **Data exfiltration** - Code cannot send data to external servers
2. **SSRF attacks** - Cannot probe internal networks or cloud metadata endpoints
3. **Supply chain attacks** - Cannot install malicious packages at runtime
4. **Command & Control** - Malicious code cannot phone home

## What Remains Protected (Even With Network Access)

Even if we enable network access, these protections remain:

✅ **Ephemeral containers** - Each execution runs in a fresh container that's destroyed after completion (`--rm`)
✅ **Read-only filesystem** - Packages can only write to `/tmp` (10MB, `noexec` flag)
✅ **No capabilities** - `--cap-drop ALL` prevents privilege escalation
✅ **Non-root user** - Runs as `nobody:nogroup`
✅ **Resource limits** - Memory (128MB), CPU (0.5 cores), PIDs (50 max)
✅ **No host access** - Container cannot access host filesystem or Docker socket
✅ **Rate limiting** - 5 requests per minute per user
✅ **Admin-only** - Only authenticated admin users can execute code

## Risks of Enabling Network Access

### 1. **Data Exfiltration** ⚠️ **HIGH RISK**
- **Risk**: Code could send sensitive data (API keys, user data, etc.) to external servers
- **Mitigation**: 
  - Code execution is admin-only (trusted users)
  - Containers are ephemeral (data doesn't persist)
  - But if code has access to environment variables or mounted data, it could exfiltrate

### 2. **SSRF Attacks** ⚠️ **MEDIUM RISK**
- **Risk**: Code could probe internal networks (e.g., `169.254.169.254` for cloud metadata)
- **Mitigation**: 
  - Container runs in isolated network namespace
  - Cannot access host network or Docker network
  - But could still reach public internet and internal services if on same network

### 3. **Supply Chain Attacks** ⚠️ **MEDIUM RISK**
- **Risk**: Malicious packages could be installed and executed
- **Mitigation**:
  - Packages only install to `/tmp` (ephemeral)
  - Cannot persist to host filesystem
  - But malicious package code runs with same privileges as user code

### 4. **Resource Exhaustion** ⚠️ **LOW RISK**
- **Risk**: Large package downloads could consume bandwidth/time
- **Mitigation**: 
  - Timeout limits (10 seconds)
  - Rate limiting (5 requests/minute)
  - Resource limits already in place

## Selective Network Access (pip/npm only)

Docker's `--network none` is all-or-nothing. To allow only pip/npm registries, you'd need:

### Option A: Network Bridge + iptables Rules
```bash
--network bridge
# Then use iptables to whitelist only pypi.org, npmjs.org, etc.
```
**Complexity**: High - requires iptables setup and maintenance

### Option B: HTTP Proxy
```bash
--network bridge
-e HTTP_PROXY=http://proxy:8080
-e HTTPS_PROXY=http://proxy:8080
# Proxy only allows pip/npm registries
```
**Complexity**: Medium - requires proxy service

### Option C: DNS Filtering
```bash
--network bridge
--dns 127.0.0.1
# Custom DNS server that only resolves pip/npm domains
```
**Complexity**: High - requires DNS server setup

## Recommendation: Risk Assessment

### For Admin-Only Code Execution (Current Setup)

**Risk Level: LOW to MEDIUM** if network access is enabled

**Why it's relatively safe:**
- Only trusted admin users can execute code
- Containers are ephemeral and isolated
- Filesystem is read-only
- Resource limits prevent abuse
- Rate limiting prevents spam

**Remaining concerns:**
- Admins could accidentally exfiltrate data
- Malicious packages could run (but can't persist)
- SSRF attacks possible (but limited by network isolation)

### For Public/Untrusted Users

**Risk Level: HIGH** - Network access should remain disabled

**Why it's dangerous:**
- Untrusted users could install malicious packages
- Data exfiltration becomes a real threat
- SSRF attacks more likely
- Supply chain attacks easier to exploit

## Practical Implementation Options

### Option 1: Full Network Access (Simplest)
```typescript
// Change line 123-124 in route.ts
"--network", "bridge",  // Instead of "none"
```
**Pros**: Simple, allows pip/npm
**Cons**: Enables all network access (exfiltration, SSRF)

### Option 2: Environment Variable Toggle
```typescript
const ALLOW_NETWORK = process.env.ALLOW_SANDBOX_NETWORK === "true"
// ...
"--network", ALLOW_NETWORK ? "bridge" : "none",
```
**Pros**: Configurable per environment
**Cons**: Still all-or-nothing

### Option 3: Whitelist Approach (Most Secure)
Use a proxy or iptables to only allow:
- `pypi.org` / `files.pythonhosted.org`
- `registry.npmjs.org`
- Block everything else

**Pros**: Maximum security
**Cons**: Complex setup, maintenance overhead

## Conclusion

For **admin-only** execution (your current setup), enabling network access is **relatively low risk** because:
1. Users are trusted (admins)
2. Containers are ephemeral
3. Filesystem is read-only
4. Resource limits prevent abuse

The main risks are:
- Accidental data exfiltration
- Supply chain attacks (mitigated by ephemeral containers)
- SSRF (mitigated by network namespace isolation)

**Recommendation**: If you need pip/npm access, Option 2 (environment variable toggle) is a good balance. Enable it for trusted environments, keep it disabled for production if you're concerned about data exfiltration.

