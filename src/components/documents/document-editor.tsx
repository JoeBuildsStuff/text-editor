"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Tiptap from "@/components/tiptap/tiptap"
import { toast } from "sonner"

type SaveState = "idle" | "saving" | "saved" | "error"

interface DocumentEditorProps {
  documentId: string
  initialContent: string
}

export function DocumentEditor({ documentId, initialContent }: DocumentEditorProps) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingContentRef = useRef(initialContent)
  const lastSavedContentRef = useRef(initialContent)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    pendingContentRef.current = initialContent
    lastSavedContentRef.current = initialContent
    setSaveState("idle")
    setErrorMessage(null)
  }, [initialContent])

  const saveContent = useCallback(
    async (content: string, { silent = false }: { silent?: boolean } = {}) => {
      if (content === lastSavedContentRef.current) {
        return
      }

      if (!silent) {
        setSaveState("saving")
        setErrorMessage(null)
      }

      try {
        const response = await fetch("/api/markdown", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: documentId,
            content,
          }),
        })

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}))
          throw new Error(
            typeof errorPayload.error === "string"
              ? errorPayload.error
              : "Failed to save document"
          )
        }

        lastSavedContentRef.current = content
        pendingContentRef.current = content
        if (!silent) {
          setSaveState("saved")
        }
      } catch (error) {
        console.error("Failed to save document:", error)
        if (!silent) {
          const message = error instanceof Error ? error.message : "Failed to save document"
          setErrorMessage(message)
          setSaveState("error")
          toast.error(message)
        }
      }
    },
    [documentId]
  )

  const handleContentChange = useCallback(
    (content: string) => {
      pendingContentRef.current = content

      if (content === lastSavedContentRef.current) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        return
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      setErrorMessage(null)
      setSaveState((state) => (state === "error" ? "idle" : state))

      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null
        void saveContent(content)
      }, 1000)
    },
    [saveContent]
  )

  useEffect(() => {
    if (saveState !== "saved") {
      return
    }

    const timeout = setTimeout(() => {
      setSaveState("idle")
    }, 2000)

    return () => clearTimeout(timeout)
  }, [saveState])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }

      if (pendingContentRef.current !== lastSavedContentRef.current) {
        void saveContent(pendingContentRef.current, { silent: true })
      }
    }
  }, [saveContent])

  const statusMessage =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : null

  return (
    <div className="flex flex-col gap-1">
      <Tiptap content={initialContent} onChange={handleContentChange} />
      <div className="flex h-5 items-center justify-end text-xs" aria-live="polite">
        {saveState === "error" ? (
          <span className="text-destructive">{errorMessage ?? "Unable to save document"}</span>
        ) : (
          <span className="text-muted-foreground">{statusMessage}</span>
        )}
      </div>
    </div>
  )
}
