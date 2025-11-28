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
import { type ExecutionMode } from '@/lib/execution-modes'
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

const LANGUAGE_EXECUTION_MODE: Record<string, ExecutionMode> = {
  python: 'python',
  py: 'python',
  'python-repl': 'python',
  bash: 'bash',
  shell: 'bash',
  sh: 'bash',
  zsh: 'bash',
  javascript: 'node',
  js: 'node',
  jsx: 'node',
  mjs: 'node',
  cjs: 'node',
  node: 'node',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
}

function resolveExecutionMode(language?: string | null): ExecutionMode | null {
  if (!language) return null
  const normalized = language.toLowerCase()
  return LANGUAGE_EXECUTION_MODE[normalized] ?? null
}

const PREVIEW_LANGUAGES = new Set(['html', 'htm', 'xml', 'svg', 'css'])
const DEFAULT_PREVIEW_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8" /><style>html,body{margin:0;padding:0;background:#f8fafc;color:#475569;font-family:system-ui,sans-serif;}body{display:flex;align-items:center;justify-content:center;min-height:200px;}p{opacity:0.6;font-size:14px;}</style></head><body><p>Run this block to see the preview.</p></body></html>`

function buildPreviewDocument(language: string, code: string) {
  const normalized = language.toLowerCase()
  if (normalized === 'css') {
    return `<!doctype html><html><head><meta charset="utf-8" /><style>html,body{margin:0;padding:0;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif;min-height:100vh;}main{display:flex;flex-direction:column;gap:12px;padding:24px;} .preview-target{padding:24px;border-radius:12px;background:#f8fafc;color:#0f172a;text-align:center;font-weight:600;}</style><style>${code}</style></head><body><main><div class="preview-target">CSS Preview Target</div><div class="preview-target" style="background:#0ea5e9;color:white;">Another element</div></main></body></html>`
  }

  const trimmed = code.trim()
  const hasHtmlShell = /<!doctype/i.test(trimmed) || /<html[\s>]/i.test(trimmed)
  if (hasHtmlShell) {
    return trimmed || DEFAULT_PREVIEW_DOCUMENT
  }

  const bodyContent = trimmed || '<p>Empty HTML snippet</p>'
  return `<!doctype html><html><head><meta charset="utf-8" /><style>html,body{margin:0;padding:0;background:#ffffff;color:#0f172a;font-family:system-ui,sans-serif;}body{min-height:100vh;padding:24px;}code{background:#e2e8f0;padding:2px 6px;border-radius:6px;}</style></head><body>${bodyContent}</body></html>`
}

function isPreviewLanguage(language?: string | null) {
  if (!language) return false
  return PREVIEW_LANGUAGES.has(language.toLowerCase())
}

const EXTRA_LANGUAGES = ['html', 'css', 'javascript', 'typescript']

export function CodeBlock(props: NodeViewProps) {
  const languages = useMemo(() => {
    const base = props.extension.options.lowlight.listLanguages() as string[]
    const deduped = new Set([...EXTRA_LANGUAGES, ...base])
    return Array.from(deduped)
  }, [props.extension.options.lowlight])
  const codeExecution = (props.extension.options as { codeExecution?: { enabled?: boolean } }).codeExecution
  const executionEnabled = Boolean(codeExecution?.enabled)
  const canRun = executionEnabled
  const selectedLanguage = props.node.attrs.language || 'plaintext'
  const executionMode = resolveExecutionMode(selectedLanguage) ?? 'python'
  const previewEnabled = isPreviewLanguage(selectedLanguage)

  const [output, setOutput] = useState(() => props.node.attrs.lastOutput || '')
  const [error, setError] = useState<string | null>(props.node.attrs.lastError || null)
  const [isRunning, setIsRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [previewRendered, setPreviewRendered] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(DEFAULT_PREVIEW_DOCUMENT)
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
    setPreviewRendered(false)
    setPreviewDoc(DEFAULT_PREVIEW_DOCUMENT)
  }, [selectedLanguage])
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
    setPreviewRendered(false)
    setPreviewDoc(DEFAULT_PREVIEW_DOCUMENT)
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
    abortControllerRef.current = null

    if (previewEnabled) {
      try {
        const documentHtml = buildPreviewDocument(selectedLanguage, code)
        setPreviewDoc(documentHtml)
        setPreviewRendered(true)
        props.updateAttributes({ lastOutput: '', lastError: null })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to render preview'
        setError(message)
        setPreviewRendered(false)
        props.updateAttributes({ lastOutput: '', lastError: message })
      } finally {
        setIsRunning(false)
      }
      return
    }

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
        { signal: controller.signal, mode: executionMode }
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

  const hasOutput = Boolean(error) || (!previewEnabled && Boolean(output)) || (previewEnabled && previewRendered)
  const lineNumbers = useMemo(() => {
    const text = props.node.textContent ?? ''
    const count = text ? text.split(/\r?\n/).length : 1
    const lines: number[] = []
    for (let i = 1; i <= count; i++) lines.push(i)
    return lines.join('\n')
  }, [props.node.textContent])

  return (
    <NodeViewWrapper className="bg-background code-block group relative mb-4 rounded-lg border border-border">
      <div className="flex flex-wrap items-center border-b border-border bg-muted/20 rounded-t-lg px-3 py-2">
        <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
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
      <div className="flex text-sm leading-6">
        <div className="select-none border-r border-border bg-muted/40 px-3 py-2 text-right text-muted-foreground tabular-nums text-sm whitespace-pre leading-6">
          {lineNumbers}
        </div>
        <pre className="flex-1 overflow-auto leading-6">
          <NodeViewContent className="hljs px-3 py-2" />
        </pre>
      </div>
      {executionEnabled && (
        <div className={`border-t border-border text-xs font-mono ${hasOutput ? '' : 'px-3 py-2'}`}>
          {error ? (
            <span className="text-destructive px-2 py-1">{error}</span>
          ) : previewEnabled ? (
            <div className="w-full">
              <iframe
                title="Code block preview"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                className={`w-full border-0 rounded-b-lg min-h-[12rem] ${previewRendered ? 'block' : 'hidden'}`}
                srcDoc={previewDoc}
              />
              {!previewRendered && (
                <div className="px-4 py-2 text-muted-foreground">
                  {isRunning ? 'Rendering preview…' : 'Run this block to see the preview.'}
                </div>
              )}
            </div>
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
