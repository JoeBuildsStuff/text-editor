import type { ExecutionMode } from './execution-modes'

export type PythonExecutionCallbacks = {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  onExit?: (exitCode: number | null) => void
  onErrorEvent?: (message: string) => void
}

interface StreamOptions {
  signal?: AbortSignal
  mode?: ExecutionMode
}

function parseSseEvents(buffer: string, handleEvent: (event: string, data: unknown) => void) {
  const events = buffer.split("\n\n")

  for (const rawEvent of events) {
    if (!rawEvent.trim()) continue
    const lines = rawEvent.split("\n")
    let eventType: string | null = null
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (!eventType || dataLines.length === 0) continue

    try {
      const parsed = JSON.parse(dataLines.join("\n"))
      handleEvent(eventType, parsed)
    } catch {
      // Ignore malformed events
    }
  }
}

export async function streamPythonExecution(
  code: string,
  callbacks: PythonExecutionCallbacks = {},
  options: StreamOptions = {}
) {
  const fetchOptions: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, mode: options.mode ?? "python" }),
  }
  if (options.signal) {
    fetchOptions.signal = options.signal
  }
  const response = await fetch("/api/python-exec", fetchOptions)

  if (!response.ok) {
    let message = "Failed to execute code"
    try {
      const payload = await response.json()
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      const text = await response.text().catch(() => "")
      if (text.trim()) message = text.trim()
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error("Streaming is not supported in this environment")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const dispatchEvent = (eventType: string, data: unknown) => {
    if (!data || typeof data !== "object") return
    if (eventType === "stdout") {
      const chunk = (data as { chunk?: string }).chunk
      if (typeof chunk === "string") {
        callbacks.onStdout?.(chunk)
      }
      return
    }

    if (eventType === "stderr") {
      const chunk = (data as { chunk?: string }).chunk
      if (typeof chunk === "string") {
        callbacks.onStderr?.(chunk)
      }
      return
    }

    if (eventType === "exit") {
      const exitCode = (data as { exitCode?: number }).exitCode
      callbacks.onExit?.(typeof exitCode === "number" ? exitCode : null)
      return
    }

    if (eventType === "error") {
      const message = (data as { message?: string }).message
      if (typeof message === "string") {
        callbacks.onErrorEvent?.(message)
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lastSeparator = buffer.lastIndexOf("\n\n")
    if (lastSeparator !== -1) {
      const chunk = buffer.slice(0, lastSeparator)
      buffer = buffer.slice(lastSeparator + 2)
      parseSseEvents(chunk, dispatchEvent)
    }
  }

  if (buffer.trim()) {
    parseSseEvents(buffer, dispatchEvent)
  }
}
