"use client"

import {
  type KeyboardEventHandler,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"

function slugToPath(slug: string) {
  return slug
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

type DocumentTitleEditorProps = {
  id: string
  title: string
  slug: string
}

export function DocumentTitleEditor({ id, title: initialTitle, slug }: DocumentTitleEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [currentSlug, setCurrentSlug] = useState(slug)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setTitle(initialTitle)
    setCurrentSlug(slug)
  }, [initialTitle, slug])

  const isDirty = useMemo(() => {
    return title.trim() !== initialTitle.trim()
  }, [title, initialTitle])

  const handleSave = () => {
    const nextTitle = title.trim()
    if (!nextTitle || !isDirty) {
      return
    }

    startTransition(async () => {
      try {
        setError(null)
        const response = await fetch("/api/markdown", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id, title: nextTitle }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error ?? "Failed to rename document")
        }

        const data = await response.json()
        const document = data.document
        if (!document) {
          throw new Error("Missing document payload")
        }

        setError(null)
        setTitle(document.title)
        const nextSlug = document.slug ?? currentSlug
        setCurrentSlug(nextSlug)
        if (document.slug && document.slug !== currentSlug) {
          router.replace(`/documents/${slugToPath(document.slug)}`)
        }
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to save title")
      }
    })
  }

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          className="text-2xl font-semibold bg-transparent border-b border-transparent focus:border-border focus:outline-none"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          aria-label="Document title"
        />
        {isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
