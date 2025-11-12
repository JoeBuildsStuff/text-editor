"use client"

import { useCallback, useRef } from "react"
import Tiptap from "@/components/tiptap/tiptap"
import { toast } from "sonner"

interface DocumentEditorProps {
  documentId: string
  initialContent: string
}

export function DocumentEditor({ documentId, initialContent }: DocumentEditorProps) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedContentRef = useRef<string>(initialContent)

  const handleContentChange = useCallback(
    async (content: string) => {
      // Skip if content hasn't changed
      if (content === lastSavedContentRef.current) {
        return
      }

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Debounce saves - wait 1 second after user stops typing
      saveTimeoutRef.current = setTimeout(async () => {
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
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error ?? "Failed to save document")
          }

          lastSavedContentRef.current = content
          // Optionally show a subtle save indicator
          // toast.success("Saved", { duration: 1000 })
        } catch (error) {
          console.error("Failed to save document:", error)
          toast.error(
            error instanceof Error ? error.message : "Failed to save document"
          )
        }
      }, 1000)
    },
    [documentId]
  )

  return <Tiptap content={initialContent} onChange={handleContentChange} />
}

