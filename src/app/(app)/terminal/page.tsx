"use client"

import { FormEvent, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { streamPythonExecution } from "@/lib/python-executor"

function formatStderrChunk(chunk: string) {
  return chunk.replace(/^/gm, (line) => `[stderr] ${line}`)
}

export default function TerminalPage() {
  const [code, setCode] = useState("print('Hello from Python')")
  const [output, setOutput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsRunning(true)
    setError(null)
    setOutput("")

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      await streamPythonExecution(
        code,
        {
          onStdout: (chunk) => {
            setOutput((prev) => (prev ? prev + chunk : chunk))
          },
          onStderr: (chunk) => {
            setOutput((prev) => {
              const formatted = formatStderrChunk(chunk)
              return prev ? prev + formatted : formatted
            })
          },
          onExit: (exitCode) => {
            setOutput((prev) => {
              const message = `\n[Process exited with code ${exitCode ?? "unknown"}]`
              return prev ? prev + message : message.trim()
            })
          },
          onErrorEvent: (message) => {
            setError(message)
          },
        },
        { signal: controller.signal }
      )
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        setError("Execution cancelled")
      } else {
        setError(err instanceof Error ? err.message : "Unexpected error")
      }
    } finally {
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Python Terminal</h1>
        <p className="text-sm text-muted-foreground">
          Enter Python code below to run it on the server.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="text-sm font-medium" htmlFor="python-code">
          Python code
        </label>
        <Textarea
          id="python-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="print('Hello world')"
          className="min-h-48 font-mono"
          required
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isRunning}>
            {isRunning ? "Running..." : "Run Code"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>

      <div className="rounded-md border bg-muted/30 p-4">
        <div className="mb-2 text-sm font-medium">Output</div>
        <pre className="whitespace-pre-wrap break-words rounded bg-background/70 p-3 font-mono text-sm">
          {output || "Run code to see output."}
        </pre>
      </div>
    </div>
  )
}
