'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Play, X } from 'lucide-react'

import { streamPythonExecution } from '@/lib/python-executor'
import Spinner from '../ui/spinner'
import { buildProcessExitMessage, formatStderrChunk } from '@/lib/python-output'

function buildCopyPayload(code: string, lastOutput?: string, lastError?: string | null) {
  const sections: string[] = []
  const normalizedCode = code || ''
  if (normalizedCode) {
    sections.push(normalizedCode)
  }

  if (lastOutput) {
    sections.push(`Execution output:\n${lastOutput}`)
  }

  if (lastError) {
    sections.push(`Execution error:\n${lastError}`)
  }

  return sections.join('\n\n')
}

export function CodeBlock(props: NodeViewProps) {
  const languages = props.extension.options.lowlight.listLanguages()
  const codeExecution = (props.extension.options as { codeExecution?: { enabled?: boolean } }).codeExecution
  const executionEnabled = Boolean(codeExecution?.enabled)
  const canRun = executionEnabled

  const [output, setOutput] = useState(() => props.node.attrs.lastOutput || '')
  const [error, setError] = useState<string | null>(props.node.attrs.lastError || null)
  const [isRunning, setIsRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const copyPayload = useMemo(
    () =>
      buildCopyPayload(
        props.node.textContent,
        props.node.attrs.lastOutput,
        props.node.attrs.lastError
      ),
    [props.node.attrs.lastError, props.node.attrs.lastOutput, props.node.textContent]
  )
  useEffect(() => {
    if (!isRunning) {
      setOutput(props.node.attrs.lastOutput || '')
      setError(props.node.attrs.lastError || null)
    }
  }, [isRunning, props.node.attrs.lastError, props.node.attrs.lastOutput])
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleLanguageChange = (language: string) => {
    props.updateAttributes({ language })
  }

  const handleClearOutput = () => {
    setOutput('')
    setError(null)
    props.updateAttributes({ lastOutput: '', lastError: null })
  }

  const handleRun = async () => {
    if (!canRun) {
      return
    }

    const code = props.node.textContent
    if (!code || !code.trim()) {
      setError('Nothing to execute in this block')
      props.updateAttributes({ lastOutput: '', lastError: 'Nothing to execute in this block' })
      return
    }

    setIsRunning(true)
    setOutput('')
    setError(null)

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    let accumulatedOutput = ''

    try {
      await streamPythonExecution(
        code,
        {
          onStdout: (chunk) => {
            accumulatedOutput += chunk
            setOutput(accumulatedOutput)
          },
          onStderr: (chunk) => {
            const formatted = formatStderrChunk(chunk)
            accumulatedOutput += formatted
            setOutput(accumulatedOutput)
          },
          onExit: (exitCode) => {
            accumulatedOutput += buildProcessExitMessage(exitCode)
            setOutput(accumulatedOutput)
            props.updateAttributes({ lastOutput: accumulatedOutput, lastError: null })
          },
          onErrorEvent: (message) => {
            setError(message)
            props.updateAttributes({ lastOutput: accumulatedOutput, lastError: message })
          },
        },
        { signal: controller.signal }
      )
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        setError('Execution cancelled')
        props.updateAttributes({ lastOutput: accumulatedOutput, lastError: 'Execution cancelled' })
      } else {
        const message = err instanceof Error ? err.message : 'Unexpected error'
        setError(message)
        props.updateAttributes({ lastOutput: accumulatedOutput, lastError: message })
      }
    } finally {
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }

  const hasOutput = Boolean(output) || Boolean(error)

  return (
    <NodeViewWrapper className="bg-background code-block group relative mb-4 rounded-lg border border-border">
      <div className="flex flex-wrap items-center border-b border-border bg-muted/20 rounded-t-lg px-3 py-2">
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
          {canRun && hasOutput && !isRunning && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearOutput}
              title="Clear output"
            >
              <X className="size-4" />
            </Button>
          )}
          <CopyButton
            textToCopy={copyPayload}
            successMessage="Code copied to clipboard"
            iconSize={16}
            className="size-8"
            variant="ghost"
          />
        </div>
      </div>
      <pre className="">
        <NodeViewContent className="hljs" />
      </pre>
      {executionEnabled && (
        <div className={`border-t border-border  text-xs font-mono ${hasOutput ? '' : 'px-3 py-2'}`}>
          {error ? (
            <span className="text-destructive px-2 py-1">{error}</span>
          ) : output ? (
            <div className="m-0 px-4 py-2 whitespace-pre-wrap wrap-break-word text-xs">{output}</div>
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
