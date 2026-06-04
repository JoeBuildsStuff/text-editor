import path from "node:path"

export const SANDBOX_ROOT =
  process.env.PYTHON_SANDBOX_DIR ?? path.join(process.cwd(), "server", "python-sandbox")

const SANDBOX_USER_SEGMENT = /[^a-zA-Z0-9_-]/g

export function resolveUserSandboxDir(userId: string) {
  const safeSegment = userId.replace(SANDBOX_USER_SEGMENT, "_")
  return path.join(SANDBOX_ROOT, safeSegment)
}
