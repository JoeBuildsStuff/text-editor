import { useCallback, type TransitionStartFunction } from "react"
import { toast } from "sonner"

import {
  createMarkdownDocument,
  deleteMarkdownDocument,
  moveMarkdownDocument,
} from "@/components/sidebar/api/markdown-actions"
import {
  DEFAULT_DOCUMENT_TITLE,
} from "@/components/sidebar/constants"
import type { MarkdownDocument } from "@/components/sidebar/tree/tree-types"
import { useAbortController } from "@/hooks/use-abort-controller"
import { useLatestValue } from "@/hooks/use-latest-value"
import { getParentPath } from "@/lib/path-utils"

export type DocumentActions = {
  submitCreate: (payload?: {
    folderPath?: string | undefined
    title?: string | undefined
    iconColor?: string | null | undefined
  }) => Promise<void>
  create: (payload?: {
    folderPath?: string | undefined
    title?: string | undefined
    iconColor?: string | null | undefined
  }) => void
  delete: (documentId: string, slug?: string | undefined) => void
  move: (options: {
    documentId: string
    targetFolderPath?: string | undefined
    sortOrder?: number | undefined
    label?: string | undefined
  }) => Promise<void>
}

export type DocumentActionDeps = {
  setDocuments: (
    updater: (docs: MarkdownDocument[]) => MarkdownDocument[]
  ) => void
  invalidateData: () => Promise<void>
  openFolderPath: (folderPath?: string | undefined) => void
  navigateToSlug: (slug: string) => void
  navigateToDocuments: () => void
  selectedSlug?: string | undefined
  startTransition: TransitionStartFunction
}

export function useDocumentActions(deps: DocumentActionDeps): DocumentActions {
  const abortController = useAbortController()
  const selectedSlugRef = useLatestValue(deps.selectedSlug)

  const createDocument = useCallback(
    async (createOptions?: {
      folderPath?: string | undefined
      title?: string | undefined
      iconColor?: string | null | undefined
    }) => {
      const signal = abortController.getSignal()
      const document = await createMarkdownDocument(
        {
          title: createOptions?.title ?? DEFAULT_DOCUMENT_TITLE,
          folderPath: createOptions?.folderPath,
          iconColor: createOptions?.iconColor ?? null,
        },
        signal
      )

      if (!document?.id || !document.documentPath) {
        throw new Error("Missing document payload")
      }

      if (signal.aborted) {
        return
      }

      await deps.invalidateData()
      if (signal.aborted) {
        return
      }

      const parentPath = getParentPath(document.documentPath)
      if (parentPath) {
        deps.openFolderPath(parentPath)
      } else if (createOptions?.folderPath) {
        deps.openFolderPath(createOptions.folderPath)
      }

      const slug = document.slug ?? document.id
      if (slug) {
        deps.navigateToSlug(slug)
      }

      const label = document.title ?? slug ?? "document"
      toast.success(`Created ${label}`)
    },
    [abortController, deps]
  )

  const deleteDocument = useCallback(
    async (documentId: string, slug?: string) => {
      const signal = abortController.getSignal()

      let removedDocument: MarkdownDocument | undefined
      let removedIndex = -1

      deps.setDocuments((current) => {
        const index = current.findIndex((doc) => doc.id === documentId)
        if (index === -1) {
          return current
        }
        removedIndex = index
        removedDocument = current[index]
        return [...current.slice(0, index), ...current.slice(index + 1)]
      })

      const currentSelectedSlug = selectedSlugRef()
      const resolvedSlug = slug ?? removedDocument?.slug
      const shouldResetSelection = Boolean(
        currentSelectedSlug &&
          resolvedSlug &&
          resolvedSlug === currentSelectedSlug
      )

      if (shouldResetSelection) {
        deps.navigateToDocuments()
      }

      try {
        await deleteMarkdownDocument(documentId, signal)
        if (signal.aborted) {
          return
        }
        await deps.invalidateData()
        toast.success("Document deleted")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }

        if (removedDocument) {
          deps.setDocuments((current) => {
            if (current.some((doc) => doc.id === documentId)) {
              return current
            }
            const next = [...current]
            const insertIndex = removedIndex >= 0 ? Math.min(removedIndex, next.length) : next.length
            next.splice(insertIndex, 0, removedDocument as MarkdownDocument)
            return next
          })
        }

        if (shouldResetSelection && resolvedSlug) {
          deps.navigateToSlug(resolvedSlug)
        }

        throw error
      }
    },
    [abortController, deps, selectedSlugRef]
  )

  const moveDocument = useCallback<DocumentActions["move"]>(
    async ({ documentId, targetFolderPath, sortOrder, label }) => {
      if (!documentId) {
        return
      }

      const signal = abortController.getSignal()

      try {
        const document = await moveMarkdownDocument(
          { id: documentId, targetFolderPath, sortOrder },
          signal
        )

        if (signal.aborted) {
          return
        }

        await deps.invalidateData()
        if (signal.aborted) {
          return
        }

        const parentPath = getParentPath(document?.documentPath)
        if (parentPath) {
          deps.openFolderPath(parentPath)
        } else if (targetFolderPath) {
          deps.openFolderPath(targetFolderPath)
        }

        const docLabel = document?.title ?? label ?? "Document"
        toast.success(`Moved "${docLabel}"`)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        throw error
      }
    },
    [abortController, deps]
  )

  const triggerCreate = useCallback(
    (createOptions?: {
      folderPath?: string | undefined
      title?: string | undefined
      iconColor?: string | null | undefined
    }) => {
      deps.startTransition(() => {
        createDocument(createOptions).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to create document")
        })
      })
    },
    [createDocument, deps]
  )

  const triggerDelete = useCallback(
    (documentId: string, slug?: string) => {
      if (!documentId) {
        return
      }
      deps.startTransition(() => {
        deleteDocument(documentId, slug).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to delete document")
        })
      })
    },
    [deleteDocument, deps]
  )

  return {
    submitCreate: createDocument,
    create: triggerCreate,
    delete: triggerDelete,
    move: moveDocument,
  }
}
