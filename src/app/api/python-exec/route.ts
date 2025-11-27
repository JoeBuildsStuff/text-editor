import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"

import { requireAdminSession } from "@/lib/auth/session"

const EXECUTION_TIMEOUT_MS = 10_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const SANDBOX_DIR =
  process.env.PYTHON_SANDBOX_DIR ?? path.join(process.cwd(), "server", "python-sandbox")
const PYTHON_DOCKER_IMAGE = process.env.PYTHON_DOCKER_IMAGE ?? "python:3.11-slim"

const SAFE_ENV_KEYS = ["PATH", "PYTHONPATH", "HOME", "LANG"] as const
const textEncoder = new TextEncoder()

const HARDENED_SANDBOX_ENABLED =
  // process.env.NODE_ENV === "production" &&
  process.env.ENABLE_PYTHON_SANDBOX === "true"

type RateLimiterEntry = {
  windowStart: number
  count: number
}

const rateLimiter = new Map<string, RateLimiterEntry>()
let preparedSandboxDir: Promise<void> | null = null

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

async function ensureSandboxDir() {
  if (!preparedSandboxDir) {
    preparedSandboxDir = mkdir(SANDBOX_DIR, { recursive: true })
  }
  await preparedSandboxDir
}

function buildPythonCommand(code: string): { command: string; args: string[] } {
  if (HARDENED_SANDBOX_ENABLED) {
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
        PYTHON_DOCKER_IMAGE,
        "python3",
        "-I",
        "-c",
        code,
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

  const { code } = await request.json().catch(() => ({ code: null }))
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Python code is required" }, { status: 400 })
  }

  await ensureSandboxDir()
  const sandboxEnv = buildSandboxEnv()
  const { command, args } = buildPythonCommand(code)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const child = spawn(command, args, {
        cwd: SANDBOX_DIR,
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
