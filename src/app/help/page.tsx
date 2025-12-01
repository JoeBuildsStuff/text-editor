"use client"

import { useEffect, useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import Tiptap from "@/components/tiptap/tiptap"
import { BookOpen } from "lucide-react"

export default function HelpPage() {
  const searchParams = useSearchParams()
  const docFile = searchParams.get("doc")
  const [content, setContent] = useState<string>("")
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!docFile) {
      startTransition(() => {
        setContent("")
      })
      return
    }
    let cancelled = false

    fetch(`/api/docs?file=${encodeURIComponent(docFile)}`)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Document not found")
          }
          throw new Error("Failed to load document")
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        startTransition(() => {
          setContent(data.content || "")
        })
      })
      .catch(() => {
        if (cancelled) return
        startTransition(() => {
          setContent("")
        })
      })

    return () => {
      cancelled = true
    }
  }, [docFile])

  if (!docFile) {
    return (
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 py-8">
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <BookOpen className="size-12 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-semibold">Welcome to Documentation</h2>
            <p className="text-muted-foreground mt-2">
              Select a document from the sidebar to view its contents
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-2">
      <Tiptap
        className="border-none bg-transparent"
        content={content}
        readonly={true}
        showFixedMenu={false}
        showBubbleMenu={false}
        showDragHandle={false}
        enableFileNodes={false}
        enableCodeExecution={false}
      />
    </div>
  )
}

