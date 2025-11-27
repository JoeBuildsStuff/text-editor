import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"

import { requireAdminSession } from "@/lib/auth/session"
import { isExecutionMode } from "@/lib/execution-modes"
import type { ExecutionMode } from "@/lib/execution-modes"

const EXECUTION_TIMEOUT_MS = 10_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const SANDBOX_ROOT =
  process.env.PYTHON_SANDBOX_DIR ?? path.join(process.cwd(), "server", "python-sandbox")
const PYTHON_DOCKER_IMAGE = process.env.PYTHON_DOCKER_IMAGE ?? "python:3.11-slim"

const SAFE_ENV_KEYS = ["PATH", "PYTHONPATH", "HOME", "LANG"] as const
const SANDBOX_USER_SEGMENT = /[^a-zA-Z0-9_-]/g
const textEncoder = new TextEncoder()

const HARDENED_SANDBOX_ENABLED =
  // process.env.NODE_ENV === "production" &&
  process.env.ENABLE_PYTHON_SANDBOX === "true"

type RateLimiterEntry = {
  windowStart: number
  count: number
}

const rateLimiter = new Map<string, RateLimiterEntry>()
let preparedSandboxRoot: Promise<void> | null = null

function buildSandboxEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PYTHONUNBUFFERED: "1" }
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
    preparedSandboxRoot = mkdir(SANDBOX_ROOT, { recursive: true })
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

function buildSandboxCommand(
  mode: ExecutionMode,
  code: string,
  userSandboxDir: string
): { command: string; args: string[] } {
  if (HARDENED_SANDBOX_ENABLED) {
    const runtimeArgs =
      mode === "python"
        ? ["python3", "-I", "-c", code]
        : ["bash", "-lc", code]

    return {
      command: "docker",
      args: [
        "run",
        "--rm",
        "-i",
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/tmp:size=10M,mode=1777,noexec",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "128m",
        "--memory-swap",
        "128m",
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
        "-v",
        `${userSandboxDir}:/sandbox:rw`,
        "-w",
        "/sandbox",
        PYTHON_DOCKER_IMAGE,
        ...runtimeArgs,
      ],
    }
  }

  return { command: "python3", args: ["-I", "-c", code] }
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

  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Command text is required" }, { status: 400 })
  }

  const userSandboxDir = await ensureUserSandbox(session.user.id)
  const sandboxEnv = buildSandboxEnv()
  const { command, args } = buildSandboxCommand(mode, code, userSandboxDir)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const child = spawn(command, args, {
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
