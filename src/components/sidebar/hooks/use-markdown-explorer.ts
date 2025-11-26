"use client"

import { useCallback, useMemo, useTransition } from "react"
import type { DragEndEvent } from "@dnd-kit/core"
import { toast } from "sonner"

import { buildDocumentsTree } from "@/components/sidebar/tree/tree-utils"
import type { SidebarTreeProps } from "@/components/sidebar/tree/sidebar-tree"
import type { RenameDialogProps } from "@/components/sidebar/rename-dialog"
import { useMarkdownData } from "@/components/sidebar/hooks/use-markdown-data"
import { useDocumentNavigation } from "@/components/sidebar/hooks/use-document-navigation"
import { useFolderState } from "@/components/sidebar/hooks/use-folder-state"
import { useTreeDnd } from "@/components/sidebar/hooks/use-tree-dnd"
import { useDocumentActions } from "@/components/sidebar/hooks/use-document-actions"
import { useFolderActions } from "@/components/sidebar/hooks/use-folder-actions"
import { useTreeReorder } from "@/components/sidebar/hooks/use-tree-reorder"
import { executeDropScenario } from "@/components/sidebar/hooks/execute-drop-scenario"
import { useRenameDialog } from "@/components/sidebar/hooks/use-rename-dialog"
import { useAbortableAction } from "@/hooks/use-abortable-action"
import { useCallbackStability } from "@/hooks/use-callback-stability"
import { renameMarkdownDocument, renameMarkdownFolder } from "@/components/sidebar/api/markdown-actions"

export type MarkdownExplorerResult = {
  isLoadingFiles: boolean
  filesError: string | null
  isActionPending: boolean
  hasTreeData: boolean
  treeProps: SidebarTreeProps
  createDocument: () => void
  createFolder: () => void
  renameDialogProps: RenameDialogProps
}

export function useMarkdownExplorer(): MarkdownExplorerResult {
  const [isActionPending, startActionTransition] = useTransition()
  const data = useMarkdownData()
  const navigation = useDocumentNavigation()

  const treeElements = useMemo(
    () => buildDocumentsTree(data.documents, data.folders),
    [data.documents, data.folders]
  )

  const folderState = useFolderState(treeElements, navigation.selectedSlug)
  const reorderActions = useTreeReorder(data.folders)
  const dnd = useTreeDnd(treeElements)

  const documentActions = useDocumentActions({
    setDocuments: data.setDocuments,
    invalidateData: data.invalidate,
    openFolderPath: folderState.openFolderPath,
    navigateToSlug: navigation.navigateToSlug,
    navigateToDocuments: navigation.navigateToDocuments,
    selectedSlug: navigation.selectedSlug,
    startTransition: startActionTransition,
  })

  const folderActions = useFolderActions({
    updateIndex: data.updateIndex,
    invalidateData: data.invalidate,
    openFolderPath: folderState.openFolderPath,
    closeFolderPath: folderState.closeFolderPath,
    navigateToSlug: navigation.navigateToSlug,
    navigateToDocuments: navigation.navigateToDocuments,
    selectedSlug: navigation.selectedSlug,
    startTransition: startActionTransition,
  })

  const handleDragEndWithActions = useCallback(
    (event: DragEndEvent) => {
      const scenario = dnd.handleDragEnd(event)
      if (scenario.type === "no-op") {
        return
      }

      startActionTransition(() => {
        executeDropScenario(scenario, {
          assignSortOrders: reorderActions.assignSortOrders,
          moveDocument: documentActions.move,
          moveFolder: folderActions.move,
        }).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error(error)
        })
      })
    },
    [dnd, reorderActions.assignSortOrders, documentActions.move, folderActions.move, startActionTransition]
  )

  useCallbackStability("handleDragEnd", handleDragEndWithActions, [
    dnd,
    reorderActions.assignSortOrders,
    documentActions.move,
    folderActions.move,
    startActionTransition,
  ])

  const renameDialog = useRenameDialog()

  const [submitRenameAction] = useAbortableAction(async (signal: AbortSignal) => {
    const state = renameDialog.state
    if (state.status !== "open") {
      return
    }

    const trimmed = state.newName.trim()
    if (!trimmed || trimmed === state.currentName) {
      renameDialog.close()
      return
    }

    if (state.entityType === "folder") {
      await renameMarkdownFolder(state.folderPath, trimmed, signal)
      if (signal.aborted) {
        return
      }
      await data.invalidate()
      if (signal.aborted) {
        return
      }
      toast.success(`Renamed folder to "${trimmed}"`)
    } else {
      const document = await renameMarkdownDocument(state.documentId, trimmed, signal)
      if (signal.aborted) {
        return
      }
      await data.invalidate()
      if (signal.aborted) {
        return
      }
      if (document?.slug) {
        navigation.updateSlugInPlace(document.slug)
      }
      const label = document?.title ?? trimmed
      toast.success(`Renamed document to "${label}"`)
    }

    if (!signal.aborted) {
      renameDialog.close()
    }
  })

  const handleRenameSubmit = useCallback(() => {
    if (isActionPending) {
      return
    }

    startActionTransition(() => {
      submitRenameAction().catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Unable to rename")
      })
    })
  }, [isActionPending, startActionTransition, submitRenameAction])

  const renameDialogProps: RenameDialogProps = {
    state: renameDialog.state,
    isPending: isActionPending,
    onNewNameChange: (value) => renameDialog.updateNewName(value),
    onSubmit: handleRenameSubmit,
    onClose: () => renameDialog.close(),
  }

  const treeProps: SidebarTreeProps = {
    elements: treeElements,
    selectedSlug: navigation.selectedSlug,
    openFolders: folderState.openFolders,
    onToggleFolder: folderState.toggleFolder,
    isActionPending,
    onCreateDocument: documentActions.create,
    onCreateFolder: folderActions.create,
    onDeleteFolder: folderActions.delete,
    onDeleteDocument: documentActions.delete,
    onRenameFolder: (folderPath, currentName) => renameDialog.openForFolder(folderPath, currentName),
    onRenameDocument: (documentId, currentName) => renameDialog.openForDocument(documentId, currentName),
    onSelect: navigation.navigateToSlug,
    sensors: dnd.sensors,
    collisionDetection: dnd.collisionDetection,
    onDragStart: dnd.handleDragStart,
    onDragEnd: handleDragEndWithActions,
    onDragCancel: dnd.handleDragCancel,
    activeDragLabel: dnd.activeDragLabel,
  }

  return {
    isLoadingFiles: data.isLoading,
    filesError: data.error,
    isActionPending,
    hasTreeData: treeElements.length > 0,
    treeProps,
    createDocument: () => documentActions.create(),
    createFolder: () => folderActions.create(),
    renameDialogProps,
  }
}
