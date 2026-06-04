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
import { useCreateFolderDialog } from "@/components/sidebar/hooks/use-create-folder-dialog"
import type { CreateFolderDialogProps } from "@/components/sidebar/create-folder-dialog"
import { useCreateDocumentDialog } from "@/components/sidebar/hooks/use-create-document-dialog"
import type { CreateDocumentDialogProps } from "@/components/sidebar/create-document-dialog"
import { useAbortableAction } from "@/hooks/use-abortable-action"
import { useCallbackStability } from "@/hooks/use-callback-stability"
import { renameMarkdownDocument, renameMarkdownFolder } from "@/components/sidebar/api/markdown-actions"
import {
  documentRenameHasChanges,
  folderRenameHasChanges,
} from "@/components/sidebar/hooks/rename-dialog-reducer"
import type { MarkdownDocument, MarkdownFolder } from "@/components/sidebar/tree/tree-types"

export type MarkdownExplorerResult = {
  isLoadingFiles: boolean
  filesError: string | null
  isActionPending: boolean
  hasTreeData: boolean
  treeProps: SidebarTreeProps
  createDocument: () => void
  createFolder: () => void
  renameDialogProps: RenameDialogProps
  createDocumentDialogProps: CreateDocumentDialogProps
  createFolderDialogProps: CreateFolderDialogProps
}

export function useMarkdownExplorer(): MarkdownExplorerResult {
  const [isActionPending, startActionTransition] = useTransition()
  const data = useMarkdownData()
  const navigation = useDocumentNavigation()
  const renameDialog = useRenameDialog()
  const createDocumentDialog = useCreateDocumentDialog()
  const createFolderDialog = useCreateFolderDialog()

  const foldersWithRenamePreview = useMemo(() => {
    const state = renameDialog.state
    if (state.status !== "open" || state.entityType !== "folder") {
      return data.folders
    }

    return data.folders.map((folder) =>
      folder.folderPath === state.folderPath
        ? {
            ...folder,
            iconColor: state.iconColor ?? undefined,
          }
        : folder
    )
  }, [data.folders, renameDialog.state])

  const documentsWithRenamePreview = useMemo(() => {
    const state = renameDialog.state
    if (state.status !== "open" || state.entityType !== "document") {
      return data.documents
    }

    return data.documents.map((document) =>
      document.id === state.documentId
        ? {
            ...document,
            iconColor: state.iconColor ?? undefined,
          }
        : document
    )
  }, [data.documents, renameDialog.state])

  const treeElements = useMemo(
    () => buildDocumentsTree(documentsWithRenamePreview, foldersWithRenamePreview),
    [documentsWithRenamePreview, foldersWithRenamePreview]
  )

  const foldersByPath = useMemo(() => {
    const map = new Map<string, MarkdownFolder>()
    foldersWithRenamePreview.forEach((folder) => {
      map.set(folder.folderPath, folder)
    })
    return map
  }, [foldersWithRenamePreview])

  const documentsById = useMemo(() => {
    const map = new Map<string, MarkdownDocument>()
    documentsWithRenamePreview.forEach((document) => {
      map.set(document.id, document)
    })
    return map
  }, [documentsWithRenamePreview])

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
    openCreateFolderDialog: createFolderDialog.open,
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

  const [submitRenameAction] = useAbortableAction(async (signal: AbortSignal) => {
    const state = renameDialog.state
    if (state.status !== "open") {
      return
    }

    const trimmed = state.newName.trim()
    if (!trimmed) {
      return
    }

    if (state.entityType === "folder") {
      if (!folderRenameHasChanges(state)) {
        renameDialog.close()
        return
      }

      await renameMarkdownFolder(
        state.folderPath,
        {
          newName: trimmed,
          iconColor: state.iconColor,
          description: state.description.trim() || null,
        },
        signal
      )
      if (signal.aborted) {
        return
      }
      await data.invalidate()
      if (signal.aborted) {
        return
      }
      const nameChanged = trimmed !== state.currentName
      toast.success(nameChanged ? `Renamed folder to "${trimmed}"` : "Folder updated")
    } else {
      if (!documentRenameHasChanges(state)) {
        renameDialog.close()
        return
      }
      const document = await renameMarkdownDocument(
        state.documentId,
        { title: trimmed, iconColor: state.iconColor },
        signal
      )
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
      const nameChanged = trimmed !== state.currentName
      toast.success(nameChanged ? `Renamed document to "${label}"` : "Document updated")
    }

    if (!signal.aborted) {
      renameDialog.close()
    }
  })

  const handleCreateFolderSubmit = useCallback(() => {
    const state = createFolderDialog.state
    if (state.status !== "open" || isActionPending) {
      return
    }

    startActionTransition(() => {
      folderActions
        .submitCreate({
          parentPath: state.parentPath,
          name: state.name,
          iconColor: state.iconColor,
          description: state.description.trim() || null,
        })
        .then(() => {
          createFolderDialog.close()
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to create folder")
        })
    })
  }, [createFolderDialog, folderActions, isActionPending, startActionTransition])

  const handleCreateDocumentSubmit = useCallback(() => {
    const state = createDocumentDialog.state
    if (state.status !== "open" || isActionPending) {
      return
    }

    startActionTransition(() => {
      documentActions
        .submitCreate({
          folderPath: state.folderPath,
          title: state.name,
          iconColor: state.iconColor,
        })
        .then(() => {
          createDocumentDialog.close()
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to create document")
        })
    })
  }, [createDocumentDialog, documentActions, isActionPending, startActionTransition])

  const handleRenameSubmit = useCallback(() => {
    if (isActionPending) {
      return
    }

    startActionTransition(() => {
      submitRenameAction().catch((error: unknown) => {
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
    canSubmit: renameDialog.canSubmit,
    onNewNameChange: (value) => renameDialog.updateNewName(value),
    onIconColorChange: (value) => renameDialog.updateIconColor(value),
    onDescriptionChange: (value) => renameDialog.updateDescription(value),
    onSubmit: handleRenameSubmit,
    onClose: () => renameDialog.close(),
  }

  const createFolderDialogProps: CreateFolderDialogProps = {
    state: createFolderDialog.state,
    isPending: isActionPending,
    canSubmit: createFolderDialog.canSubmit,
    onNameChange: createFolderDialog.setName,
    onIconColorChange: createFolderDialog.setIconColor,
    onDescriptionChange: createFolderDialog.setDescription,
    onSubmit: handleCreateFolderSubmit,
    onClose: () => createFolderDialog.close(),
  }

  const createDocumentDialogProps: CreateDocumentDialogProps = {
    state: createDocumentDialog.state,
    isPending: isActionPending,
    canSubmit: createDocumentDialog.canSubmit,
    onNameChange: createDocumentDialog.setName,
    onIconColorChange: createDocumentDialog.setIconColor,
    onSubmit: handleCreateDocumentSubmit,
    onClose: () => createDocumentDialog.close(),
  }

  const treeProps: SidebarTreeProps = {
    elements: treeElements,
    selectedSlug: navigation.selectedSlug,
    openFolders: folderState.openFolders,
    onToggleFolder: folderState.toggleFolder,
    isActionPending,
    onCreateDocument: createDocumentDialog.open,
    onCreateFolder: folderActions.requestCreate,
    onDeleteFolder: folderActions.delete,
    onDeleteDocument: documentActions.delete,
    onRenameFolder: (folderPath, currentName) => {
      const folder = foldersByPath.get(folderPath)
      renameDialog.openForFolder(folderPath, currentName, {
        iconColor: folder?.iconColor ?? null,
        description: folder?.description ?? "",
      })
    },
    onRenameDocument: (documentId, currentName) => {
      const document = documentsById.get(documentId)
      renameDialog.openForDocument(documentId, currentName, {
        iconColor: document?.iconColor ?? null,
      })
    },
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
    createDocument: () => createDocumentDialog.open(),
    createFolder: () => folderActions.requestCreate(),
    renameDialogProps,
    createDocumentDialogProps,
    createFolderDialogProps,
  }
}
