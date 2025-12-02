import { NextResponse } from "next/server"
import { rm, stat } from "node:fs/promises"
import path from "node:path"

import { requireAdminSession } from "@/lib/auth/session"
import { SANDBOX_ROOT, resolveUserSandboxDirExported } from "../route"

/**
 * POST /api/python-exec/reset
 * 
 * Resets the user's Python sandbox environment by deleting the persistent volume.
 * This removes all installed packages, files, and cached data.
 * 
 * Request body (optional):
 * - packagesOnly: boolean - If true, only delete the .python directory (packages),
 *                           preserving user files in /sandbox
 */
export async function POST(request: Request) {
  const session = await requireAdminSession(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = await request.json().catch(() => ({}))
  const packagesOnly = payload?.packagesOnly === true

  const userSandboxDir = resolveUserSandboxDirExported(session.user.id)

  // Security check: ensure the path is within SANDBOX_ROOT
  const resolvedPath = path.resolve(userSandboxDir)
  const resolvedRoot = path.resolve(SANDBOX_ROOT)
  if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
    return NextResponse.json({ error: "Invalid sandbox path" }, { status: 400 })
  }

  try {
    if (packagesOnly) {
      // Only delete the .python directory (installed packages)
      const pythonDir = path.join(userSandboxDir, ".python")
      try {
        await stat(pythonDir)
        await rm(pythonDir, { recursive: true, force: true })
        return NextResponse.json({
          success: true,
          message: "Python packages cleared. Your files have been preserved.",
          cleared: "packages",
        })
      } catch (error) {
        // Directory doesn't exist, nothing to clear
        return NextResponse.json({
          success: true,
          message: "No packages to clear.",
          cleared: "none",
        })
      }
    } else {
      // Delete entire sandbox directory
      try {
        await stat(userSandboxDir)
        await rm(userSandboxDir, { recursive: true, force: true })
        return NextResponse.json({
          success: true,
          message: "Sandbox environment reset. All packages and files have been cleared.",
          cleared: "all",
        })
      } catch (error) {
        // Directory doesn't exist, nothing to clear
        return NextResponse.json({
          success: true,
          message: "No sandbox environment to reset.",
          cleared: "none",
        })
      }
    }
  } catch (error) {
    console.error("Failed to reset sandbox:", error)
    return NextResponse.json(
      { error: "Failed to reset sandbox environment" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/python-exec/reset
 * 
 * Returns information about the user's sandbox environment.
 */
export async function GET(request: Request) {
  const session = await requireAdminSession(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userSandboxDir = resolveUserSandboxDirExported(session.user.id)

  try {
    const stats = await stat(userSandboxDir)
    
    // Get directory size using du command (more accurate for nested dirs)
    const { spawn } = await import("node:child_process")
    const sizeBytes = await new Promise<number>((resolve) => {
      const du = spawn("du", ["-sb", userSandboxDir])
      let output = ""
      du.stdout.on("data", (data) => {
        output += data.toString()
      })
      du.on("close", () => {
        const match = output.match(/^(\d+)/)
        resolve(match ? parseInt(match[1], 10) : 0)
      })
      du.on("error", () => resolve(0))
    })

    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2)

    return NextResponse.json({
      exists: true,
      path: userSandboxDir,
      sizeBytes,
      sizeMB: parseFloat(sizeMB),
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
    })
  } catch (error) {
    return NextResponse.json({
      exists: false,
      path: userSandboxDir,
      sizeBytes: 0,
      sizeMB: 0,
    })
  }
}
