'use client'

import { useEffect, useRef, useState } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CopyButton } from '@/components/ui/copy-button'
import { Button } from '@/components/ui/button'
import { Play } from 'lucide-react'

import { streamPythonExecution } from '@/lib/python-executor'
import Spinner from '../ui/spinner'

function formatStderrChunk(chunk: string) {
  return chunk.replace(/^/gm, (line) => `[stderr] ${line}`)
}

export function CodeBlock(props: NodeViewProps) {
  const languages = props.extension.options.lowlight.listLanguages()
  const codeExecution = (props.extension.options as { codeExecution?: { enabled?: boolean } }).codeExecution
  const executionEnabled = Boolean(codeExecution?.enabled)
  const canRun = executionEnabled

  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleLanguageChange = (language: string) => {
    props.updateAttributes({ language })
  }

  const handleRun = async () => {
    if (!canRun) {
      return
    }

    const code = props.node.textContent
    if (!code || !code.trim()) {
      setError('Nothing to execute in this block')
      return
    }

    setIsRunning(true)
    setOutput('')
    setError(null)

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
              const message = `\n[Process exited with code ${exitCode ?? 'unknown'}]`
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
      if ((err as DOMException)?.name === 'AbortError') {
        setError('Execution cancelled')
      } else {
        setError(err instanceof Error ? err.message : 'Unexpected error')
      }
    } finally {
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }

  return (
    <NodeViewWrapper className="bg-background code-block group relative mb-4 rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-3 py-2">
        <Select
          defaultValue={props.node.attrs.language || 'plaintext'}
          onValueChange={handleLanguageChange}
        >
          <SelectTrigger className="h-8 w-40 border-input bg-background text-xs">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang: string) => (
              <SelectItem key={lang} value={lang}>
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          {canRun && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRun}
              disabled={isRunning}
            >
              {isRunning ? (
                <>
                  <Spinner />
                </>
              ) : (
                <>
                  <Play className="size-4" />
                </>
              )}
            </Button>
          )}
          <CopyButton
            textToCopy={props.node.textContent}
            successMessage="Code copied to clipboard"
            iconSize={16}
            className="size-8"
            variant="ghost"
          />
        </div>
      </div>
      <pre className="mb-0 bg-background px-3 py-3">
        <NodeViewContent className="hljs" />
      </pre>
      {executionEnabled && (
        <div className="border-t border-border bg-muted/40 px-3 py-2 text-xs font-mono">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : output ? (
            <pre className="whitespace-pre-wrap break-words text-xs">{output}</pre>
          ) : isRunning ? (
            <span className="text-muted-foreground">Running…</span>
          ) : (
            <span className="text-muted-foreground">Run this block to see output.</span>
          )}
        </div>
      )}
    </NodeViewWrapper>
  )
}
