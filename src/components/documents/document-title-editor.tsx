"use client"

import {
  type KeyboardEventHandler,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"
import { Trash, Type } from "lucide-react"
import { Button } from "../ui/button"

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
  const [isDeletePending, startDeleteTransition] = useTransition()

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

  const handleDelete = () => {
    if (isDeletePending) return

    startDeleteTransition(async () => {
      try {
        setError(null)
        const response = await fetch("/api/markdown", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error ?? "Failed to delete document")
        }

        router.replace("/documents")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to delete document")
      }
    })
  }

  const isBusy = isPending || isDeletePending
  const statusMessage = isDeletePending ? "Deleting…" : isPending ? "Saving…" : null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Type className="size-4" />
        <span className="text-sm text-muted-foreground">Title</span>
        <input
          className="bg-card rounded-sm py-1 px-2 justify-start w-full"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
          aria-label="Document title"
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isBusy}
          aria-label="Delete document"
        >
          <Trash className="size-4" />
        </Button>
        {statusMessage && <span className="text-xs text-muted-foreground">{statusMessage}</span>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
