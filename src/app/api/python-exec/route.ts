import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import path from "node:path"

import { requireAdminSession } from "@/lib/auth/session"
import { isExecutionMode } from "@/lib/execution-modes"
import type { ExecutionMode } from "@/lib/execution-modes"

const EXECUTION_TIMEOUT_MS =
  process.env.PYTHON_EXEC_TIMEOUT_MS ? parseInt(process.env.PYTHON_EXEC_TIMEOUT_MS, 10) : 120_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 60
const SANDBOX_ROOT =
  process.env.PYTHON_SANDBOX_DIR ?? path.join(process.cwd(), "server", "python-sandbox")
const PYTHON_DOCKER_IMAGE = process.env.PYTHON_DOCKER_IMAGE ?? "python:3.11-slim"
const NODE_DOCKER_IMAGE = process.env.NODE_DOCKER_IMAGE ?? "node:22-slim"

const SAFE_ENV_KEYS = ["PATH", "PYTHONPATH", "HOME", "LANG", "PYTHONUSERBASE"] as const
const SANDBOX_USER_SEGMENT = /[^a-zA-Z0-9_-]/g
const textEncoder = new TextEncoder()

const HARDENED_SANDBOX_ENABLED =
  // process.env.NODE_ENV === "production" &&
  process.env.ENABLE_PYTHON_SANDBOX === "true"
const ALLOW_SANDBOX_NETWORK = process.env.ALLOW_SANDBOX_NETWORK === "true"

type RateLimiterEntry = {
  windowStart: number
  count: number
}

const rateLimiter = new Map<string, RateLimiterEntry>()
let preparedSandboxRoot: Promise<void> | null = null

function buildSandboxEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PYTHONUNBUFFERED: "1",
    // Defaults mirror the hardened sandbox so local/non-docker runs behave the same.
    HOME: process.env.HOME ?? "/tmp",
    PYTHONUSERBASE: process.env.PYTHONUSERBASE ?? "/tmp",
    PATH: process.env.PATH ?? "/tmp/bin:/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin",
    PYTHONPATH:
      process.env.PYTHONPATH ??
      "/tmp/lib/python3.11/site-packages:/tmp/lib/python3/site-packages:/tmp/.local/lib/python3.11/site-packages:/tmp/.local/lib/python3/site-packages",
  }
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key]
    if (typeof value === "string") {
      env[key] = value
    }
  }
  return env
}

function encodeSse(event: string, data: unknown) {
  const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  return textEncoder.encode(text)
}

function isRateLimited(userId: string) {
  const now = Date.now()
  const entry = rateLimiter.get(userId)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimiter.set(userId, { windowStart: now, count: 1 })
    return false
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true
  }

  entry.count += 1
  return false
}

async function ensureSandboxRoot() {
  if (!preparedSandboxRoot) {
    preparedSandboxRoot = mkdir(SANDBOX_ROOT, { recursive: true }).then(() => undefined)
  }
  await preparedSandboxRoot
}

function resolveUserSandboxDir(userId: string) {
  const safeSegment = userId.replace(SANDBOX_USER_SEGMENT, "_")
  return path.join(SANDBOX_ROOT, safeSegment)
}

async function ensureUserSandbox(userId: string) {
  await ensureSandboxRoot()
  const userDir = resolveUserSandboxDir(userId)
  await mkdir(userDir, { recursive: true })
  return userDir
}

function resolveTsxBinary() {
  const binName = process.platform === "win32" ? "tsx.cmd" : "tsx"
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", binName)
  if (!existsSync(tsxPath)) {
    throw new Error(
      "TypeScript execution requires the 'tsx' binary. Run `pnpm install` to install dependencies."
    )
  }
  return tsxPath
}

function buildDockerCommand(mode: ExecutionMode, code: string, userSandboxDir: string) {
  const runtimeArgs = (() => {
    switch (mode) {
      case "python":
        return ["python3", "-c", code]
      case "bash":
        return ["bash", "-lc", code]
      case "node":
        return ["node", "-e", code]
      case "typescript":
        return ["node", "-e", code]
    }
  })()

  const image = mode === "node" || mode === "typescript" ? NODE_DOCKER_IMAGE : PYTHON_DOCKER_IMAGE

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "-i",
      "--network",
      ALLOW_SANDBOX_NETWORK ? "bridge" : "none",
      "--read-only",
      "--tmpfs",
      "/tmp:size=100M,mode=1777",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      "256m",
      "--memory-swap",
      "256m",
      "--cpus",
      "0.5",
      "--pids-limit",
      "50",
      "--user",
      "nobody:nogroup",
      "--device",
      "/dev/null:/dev/null",
      "--device",
      "/dev/zero:/dev/zero",
      "--device",
      "/dev/urandom:/dev/urandom",
      "-e",
      "PYTHONUNBUFFERED=1",
      "-e",
      "HOME=/tmp",
      "-e",
      "PYTHONUSERBASE=/tmp",
      "-e",
      "PATH=/tmp/bin:/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin",
      "-e",
      "PYTHONPATH=/tmp/lib/python3.11/site-packages:/tmp/lib/python3/site-packages:/tmp/.local/lib/python3.11/site-packages:/tmp/.local/lib/python3/site-packages",
      "-v",
      `${userSandboxDir}:/sandbox:rw`,
      "-w",
      "/sandbox",
      image,
      ...runtimeArgs,
    ],
  }
}

function buildLocalCommand(mode: ExecutionMode, code: string) {
  switch (mode) {
    case "python":
      // No -I so user installs in /tmp are discoverable via PYTHONPATH.
      return { command: "python3", args: ["-c", code] }
    case "bash":
      return { command: "bash", args: ["-lc", code] }
    case "node":
      return { command: "node", args: ["-e", code] }
    case "typescript": {
      const tsxBinary = resolveTsxBinary()
      return { command: tsxBinary, args: ["--eval", code] }
    }
  }
}

function buildSandboxCommand(
  mode: ExecutionMode,
  code: string,
  userSandboxDir: string
): { command: string; args: string[] } {
  if (HARDENED_SANDBOX_ENABLED) {
    return buildDockerCommand(mode, code, userSandboxDir)
  }

  const command = buildLocalCommand(mode, code)
  if (!command) {
    throw new Error("Unsupported execution mode")
  }
  return command
}

export async function POST(request: Request) {
  const session = await requireAdminSession(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (isRateLimited(session.user.id)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429 }
    )
  }

  const payload = await request.json().catch(() => ({}))
  const code: unknown = payload?.code
  const rawMode: unknown = payload?.mode

  let mode: ExecutionMode = "python"
  if (rawMode !== undefined) {
    if (!isExecutionMode(rawMode)) {
      return NextResponse.json({ error: "Invalid execution mode" }, { status: 400 })
    }
    mode = rawMode
  }

  if (mode === "bash" && !HARDENED_SANDBOX_ENABLED) {
    return NextResponse.json(
      { error: "Shell execution requires ENABLE_PYTHON_SANDBOX=true" },
      { status: 400 }
    )
  }

  if (mode === "typescript" && HARDENED_SANDBOX_ENABLED) {
    return NextResponse.json(
      { error: "TypeScript execution is not available while ENABLE_PYTHON_SANDBOX=true" },
      { status: 400 }
    )
  }

  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Command text is required" }, { status: 400 })
  }

  const userSandboxDir = await ensureUserSandbox(session.user.id)
  const sandboxEnv = buildSandboxEnv()
  let sandboxCommand: { command: string; args: string[] }
  try {
    sandboxCommand = buildSandboxCommand(mode, code, userSandboxDir)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare runtime"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const child = spawn(sandboxCommand.command, sandboxCommand.args, {
        cwd: userSandboxDir,
        env: sandboxEnv,
        stdio: ["ignore", "pipe", "pipe"],
      })

      const timeout = setTimeout(() => {
        child.kill("SIGKILL")
        controller.enqueue(
          encodeSse("stderr", { chunk: "Process terminated after timeout." })
        )
      }, EXECUTION_TIMEOUT_MS)

      let closed = false
      const closeStream = (event: string, data: unknown) => {
        if (closed) return
        closed = true
        clearTimeout(timeout)
        controller.enqueue(encodeSse(event, data))
        controller.close()
      }

      child.stdout.on("data", (chunk) => {
        controller.enqueue(encodeSse("stdout", { chunk: chunk.toString() }))
      })

      child.stderr.on("data", (chunk) => {
        controller.enqueue(encodeSse("stderr", { chunk: chunk.toString() }))
      })

      child.on("error", (error) => {
        closeStream("error", { message: error.message })
      })

      child.on("close", (exitCode) => {
        closeStream("exit", { exitCode: exitCode ?? -1 })
      })

      request.signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGKILL")
          closeStream("error", { message: "Request aborted by client." })
        },
        { once: true }
      )
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
