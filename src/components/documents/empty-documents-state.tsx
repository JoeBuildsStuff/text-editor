"use client"

import { useRouter } from "next/navigation"
import { FileIcon, ArrowUpRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { toast } from "sonner"
import { useTransition } from "react"

export function EmptyDocumentsState() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleCreateDocument = async () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/markdown", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: "untitled" }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error ?? "Failed to create document")
        }

        const data = await response.json()
        const document = data.document as {
          id?: string
          slug?: string
          title?: string
        } | null

        if (!document?.id) {
          throw new Error("Missing document payload")
        }

        const slug = document.slug ?? document.id
        if (slug) {
          router.push(`/documents/${slug}`)
          router.refresh()
        }

        const label = document.title ?? "document"
        toast.success(`Created ${label}`)
      } catch (error) {
        console.error(error)
        toast.error(
          error instanceof Error ? error.message : "Unable to create document"
        )
      }
    })
  }

  const handleCreateFolder = async () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/markdown", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "folder",
            folderPath: "untitled-folder",
          }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error ?? "Failed to create folder")
        }

        router.refresh()
        toast.success("Created folder")
      } catch (error) {
        console.error(error)
        toast.error(
          error instanceof Error ? error.message : "Unable to create folder"
        )
      }
    })
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle>No documents yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t created any documents yet. Get started by creating
            your first document or folder.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button onClick={handleCreateDocument} disabled={isPending}>
              Create Document
            </Button>
            <Button
              variant="outline"
              onClick={handleCreateFolder}
              disabled={isPending}
            >
              Create Folder
            </Button>
          </div>
        </EmptyContent>
        <Button variant="link" asChild className="text-muted-foreground" size="sm">
          <a href="/help">
            Learn More <ArrowUpRightIcon className="size-4" />
          </a>
        </Button>
      </Empty>
    </div>
  )
}

