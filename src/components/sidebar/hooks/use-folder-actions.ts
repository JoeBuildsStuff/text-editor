import { useCallback, type TransitionStartFunction } from "react"
import { toast } from "sonner"

import {
  createMarkdownFolder,
  deleteMarkdownFolder,
  moveMarkdownFolder,
  type MarkdownIndexResult,
} from "@/components/sidebar/api/markdown-actions"
import { DEFAULT_FOLDER_BASENAME } from "@/components/sidebar/constants"
import type {
  MarkdownDocument,
  MarkdownFolder,
} from "@/components/sidebar/tree/tree-types"
import { useAbortController } from "@/hooks/use-abort-controller"
import { useLatestValue } from "@/hooks/use-latest-value"
import { getLastPathSegment } from "@/lib/path-utils"

export type FolderActions = {
  create: (parentPath?: string | undefined) => void
  delete: (folderPath: string) => void
  move: (options: {
    folderPath: string
    targetFolderPath?: string | undefined
    sortOrder?: number | undefined
  }) => Promise<void>
}

export type FolderActionDeps = {
  updateIndex: (updater: (current: MarkdownIndexResult) => MarkdownIndexResult) => void
  invalidateData: () => Promise<void>
  openFolderPath: (folderPath?: string | undefined) => void
  closeFolderPath: (folderPath: string) => void
  navigateToSlug: (slug: string) => void
  navigateToDocuments: () => void
  selectedSlug?: string | undefined
  startTransition: TransitionStartFunction
}

export function useFolderActions(deps: FolderActionDeps): FolderActions {
  const abortController = useAbortController()
  const selectedSlugRef = useLatestValue(deps.selectedSlug)

  const createFolder = useCallback(
    async (parentPath?: string) => {
      const baseName = DEFAULT_FOLDER_BASENAME
      const targetPath = parentPath && parentPath.length > 0 ? `${parentPath}/${baseName}` : baseName

      const signal = abortController.getSignal()
      const folder = await createMarkdownFolder(targetPath, signal)
      if (!folder?.folderPath) {
        throw new Error("Missing folder payload")
      }

      if (signal.aborted) {
        return
      }

      await deps.invalidateData()
      if (signal.aborted) {
        return
      }

      deps.openFolderPath(folder.folderPath)
      const folderName = getLastPathSegment(folder.folderPath) ?? "folder"
      toast.success(`Created folder "${folderName}"`)
    },
    [abortController, deps]
  )

  const deleteFolder = useCallback(
    async (folderPath: string) => {
      if (!folderPath) {
        return
      }

      const signal = abortController.getSignal()
      const folderPrefix = folderPath ? `${folderPath}/` : ""
      const removedFolders: { folder: MarkdownFolder; index: number }[] = []
      const removedDocuments: { document: MarkdownDocument; index: number }[] = []

      deps.updateIndex((current) => {
        const nextFolders: MarkdownFolder[] = []
        current.folders.forEach((folder, index) => {
          const isTarget = folder.folderPath === folderPath
          const isNested = folderPrefix ? folder.folderPath.startsWith(folderPrefix) : false
          if (isTarget || isNested) {
            removedFolders.push({ folder, index })
            return
          }
          nextFolders.push(folder)
        })

        const nextDocuments: MarkdownDocument[] = []
        current.documents.forEach((doc, index) => {
          const docPath = doc.documentPath ?? ""
          const shouldRemove =
            docPath === folderPath || (folderPrefix ? docPath.startsWith(folderPrefix) : false)
          if (shouldRemove) {
            removedDocuments.push({ document: doc, index })
            return
          }
          nextDocuments.push(doc)
        })

        const foldersChanged = nextFolders.length !== current.folders.length
        const documentsChanged = nextDocuments.length !== current.documents.length

        if (!foldersChanged && !documentsChanged) {
          return current
        }

        return {
          ...current,
          folders: foldersChanged ? nextFolders : current.folders,
          documents: documentsChanged ? nextDocuments : current.documents,
        }
      })

      const currentSelectedSlug = selectedSlugRef()
      const removedSelectedDoc = Boolean(
        currentSelectedSlug &&
          removedDocuments.some(({ document }) => document.slug === currentSelectedSlug)
      )
      const slugToRestore = removedSelectedDoc ? currentSelectedSlug : undefined

      if (removedSelectedDoc) {
        deps.navigateToDocuments()
      }

      const restoreState = () => {
        if (!removedFolders.length && !removedDocuments.length) {
          return
        }
        deps.updateIndex((current) => {
          let nextFolders = current.folders
          if (removedFolders.length) {
            nextFolders = [...current.folders]
            removedFolders
              .sort((a, b) => a.index - b.index)
              .forEach(({ folder, index }) => {
                if (nextFolders.some((existing) => existing.id === folder.id)) {
                  return
                }
                const insertIndex = index >= 0 && index <= nextFolders.length ? index : nextFolders.length
                nextFolders.splice(insertIndex, 0, folder)
              })
          }

          let nextDocuments = current.documents
          if (removedDocuments.length) {
            nextDocuments = [...current.documents]
            removedDocuments
              .sort((a, b) => a.index - b.index)
              .forEach(({ document, index }) => {
                if (nextDocuments.some((existing) => existing.id === document.id)) {
                  return
                }
                const insertIndex = index >= 0 && index <= nextDocuments.length ? index : nextDocuments.length
                nextDocuments.splice(insertIndex, 0, document)
              })
          }

          if (nextFolders === current.folders && nextDocuments === current.documents) {
            return current
          }

          return {
            ...current,
            folders: nextFolders,
            documents: nextDocuments,
          }
        })
      }

      try {
        await deleteMarkdownFolder(folderPath, signal)
        if (signal.aborted) {
          return
        }
        await deps.invalidateData()
        if (signal.aborted) {
          return
        }
        deps.closeFolderPath(folderPath)
        toast.success("Folder deleted")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        restoreState()
        if (slugToRestore) {
          deps.navigateToSlug(slugToRestore)
        }
        throw error
      }
    },
    [abortController, deps, selectedSlugRef]
  )

  const moveFolder = useCallback<FolderActions["move"]>(
    async ({ folderPath, targetFolderPath, sortOrder }) => {
      if (!folderPath) {
        return
      }
      const signal = abortController.getSignal()
      try {
        await moveMarkdownFolder(folderPath, targetFolderPath ?? null, sortOrder, signal)
        if (signal.aborted) {
          return
        }
        await deps.invalidateData()
        if (signal.aborted) {
          return
        }
        if (targetFolderPath) {
          deps.openFolderPath(targetFolderPath)
        }
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
    (parentPath?: string) => {
      deps.startTransition(() => {
        createFolder(parentPath).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to create folder")
        })
      })
    },
    [createFolder, deps]
  )

  const triggerDelete = useCallback(
    (folderPath: string) => {
      if (!folderPath) {
        return
      }
      deps.startTransition(() => {
        deleteFolder(folderPath).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to delete folder")
        })
      })
    },
    [deleteFolder, deps]
  )

  return {
    create: triggerCreate,
    delete: triggerDelete,
    move: moveFolder,
  }
}
