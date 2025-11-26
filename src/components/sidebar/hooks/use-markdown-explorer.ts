"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  PointerSensor,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"

import { buildDocumentsPath, buildDocumentsTree, computeSortOrderBetween } from "@/components/sidebar/tree/tree-utils"
import {
  DOCUMENTS_ROOT_ID,
  SIDEBAR_TREE_ROOT_DROPPABLE_ID,
  type MarkdownDocument,
  type MarkdownFolder,
  type SidebarTreeElement,
} from "@/components/sidebar/tree/tree-types"
import { getDropPosition, resolveSortableId, parseDragEvent } from "@/components/sidebar/tree/dnd-utils"
import type { SidebarTreeProps } from "@/components/sidebar/tree/sidebar-tree"
import type { RenameDialogProps } from "@/components/sidebar/rename-dialog"
import {
  createMarkdownDocument,
  createMarkdownFolder,
  deleteMarkdownDocument,
  deleteMarkdownFolder,
  fetchMarkdownIndex,
  moveMarkdownDocument,
  moveMarkdownFolder,
  renameMarkdownDocument,
  renameMarkdownFolder,
  updateMarkdownSortOrder,
} from "@/components/sidebar/api/markdown-actions"
import {
  DND_ACTIVATION_DISTANCE,
  MARKDOWN_INDEX_STALE_TIME_MS,
  DEFAULT_DOCUMENT_TITLE,
  DEFAULT_FOLDER_BASENAME,
  DOCUMENT_DROP_SPLIT,
} from "@/components/sidebar/constants"
import { useRenameDialog } from "@/components/sidebar/hooks/use-rename-dialog"
import type { RenameDialogState } from "@/components/sidebar/hooks/rename-dialog-reducer"
import { useLatestValue } from "@/hooks/use-latest-value"
import { useCallbackStability } from "@/hooks/use-callback-stability"
import { useAbortController } from "@/hooks/use-abort-controller"
import { useAbortableAction } from "@/hooks/use-abortable-action"
import { getLastPathSegment, getParentPath } from "@/lib/path-utils"

const MARKDOWN_INDEX_QUERY_KEY = ["markdown-index"] as const
type MarkdownIndexResult = Awaited<ReturnType<typeof fetchMarkdownIndex>>

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
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [isActionPending, startActionTransition] = useTransition()
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
  const renameDialog = useRenameDialog()
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null)
  const abortController = useAbortController()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DND_ACTIVATION_DISTANCE },
    })
  )

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const collisions = closestCenter(args)
    if (collisions.length <= 1) {
      return collisions
    }

    const nonRootCollisions = collisions.filter(
      (collision) => collision.id !== SIDEBAR_TREE_ROOT_DROPPABLE_ID
    )
    return nonRootCollisions.length ? nonRootCollisions : collisions
  }, [])

  const {
    data: markdownIndex,
    error: markdownError,
    isPending: isQueryPending,
    refetch: refetchMarkdownIndex,
  } = useQuery({
    queryKey: MARKDOWN_INDEX_QUERY_KEY,
    queryFn: ({ signal }) => fetchMarkdownIndex(signal),
    refetchOnWindowFocus: false,
    staleTime: MARKDOWN_INDEX_STALE_TIME_MS,
  })

  const documents = useMemo(
    () => markdownIndex?.documents ?? [],
    [markdownIndex]
  )
  const folders = useMemo(
    () => markdownIndex?.folders ?? [],
    [markdownIndex]
  )

  const setMarkdownIndex = useCallback(
    (updater: (current: MarkdownIndexResult) => MarkdownIndexResult) => {
      queryClient.setQueryData<MarkdownIndexResult>(MARKDOWN_INDEX_QUERY_KEY, (current) => {
        const safeCurrent = current ?? { documents: [], folders: [] }
        return updater(safeCurrent)
      })
    },
    [queryClient]
  )

  const loadDocuments = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        await queryClient.invalidateQueries({ queryKey: MARKDOWN_INDEX_QUERY_KEY })
        return null
      }

      const result = await refetchMarkdownIndex()
      return result.data ?? null
    },
    [queryClient, refetchMarkdownIndex]
  )

  const isLoadingFiles = isQueryPending && !markdownIndex
  const filesError = markdownError instanceof Error ? markdownError.message : null

  const treeElements = useMemo(
    () => buildDocumentsTree(documents, folders),
    [documents, folders]
  )

  const getTreeElements = useLatestValue(treeElements)
  const getFolders = useLatestValue(folders)

  const selectedSlug = useMemo(() => {
    if (!pathname.startsWith("/documents")) return undefined
    const segments = pathname.split("/").slice(2).filter(Boolean)
    if (!segments.length) return undefined
    return segments.map((segment) => decodeURIComponent(segment)).join("/")
  }, [pathname])

  const getSelectedSlug = useLatestValue(selectedSlug)

  const navigateToSlug = useCallback(
    (slug: string) => {
      router.push(buildDocumentsPath(slug))
    },
    [router]
  )

  const toggleFolder = useCallback((folderId: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const openFolderPath = useCallback((folderPath?: string) => {
    if (!folderPath) return
    const segments = folderPath.split("/").filter(Boolean)
    if (!segments.length) return
    setOpenFolders((prev) => {
      const next = new Set(prev)
      segments.forEach((_, index) => {
        const partial = segments.slice(0, index + 1).join("/")
        next.add(`${DOCUMENTS_ROOT_ID}/${partial}`)
      })
      return next
    })
  }, [])

  const closeFolderPath = useCallback((folderPath: string) => {
    setOpenFolders((prev) => {
      const targetPrefix = `${DOCUMENTS_ROOT_ID}/${folderPath}`
      const next = new Set(
        [...prev].filter(
          (id) => id !== targetPrefix && !id.startsWith(`${targetPrefix}/`)
        )
      )
      return next
    })
  }, [])

  const autoOpenFolders = useMemo(() => {
    if (!selectedSlug || !treeElements.length) {
      return [] as string[]
    }

    const findParentFolders = (
      elements: SidebarTreeElement[],
      targetSlug: string,
      parentPath: string[] = []
    ): string[] | null => {
      for (const element of elements) {
        if (element.kind === "document" && element.id === targetSlug) {
          return parentPath
        }
        if (element.kind === "folder" && element.children?.length) {
          const newPath = [...parentPath, element.id]
          const found = findParentFolders(element.children, targetSlug, newPath)
          if (found !== null) {
            return found
          }
        }
      }
      return null
    }

    return findParentFolders(treeElements, selectedSlug) ?? []
  }, [selectedSlug, treeElements])

  const derivedOpenFolders = useMemo(() => {
    if (!autoOpenFolders.length) {
      return openFolders
    }
    const next = new Set(openFolders)
    autoOpenFolders.forEach((folderId) => next.add(folderId))
    return next
  }, [openFolders, autoOpenFolders])

  const createDocumentInPath = useCallback(
    async (folderPath?: string) => {
      const payload: Record<string, unknown> = { title: DEFAULT_DOCUMENT_TITLE }
      if (folderPath) {
        payload.folderPath = folderPath
      }

      const signal = abortController.getSignal()
      const document = await createMarkdownDocument(payload, signal)
      if (!document?.id || !document.documentPath) {
        throw new Error("Missing document payload")
      }

      if (signal.aborted) return

      await loadDocuments({ silent: true })
      if (signal.aborted) return

      const parentPath = getParentPath(document.documentPath)
      if (parentPath) {
        openFolderPath(parentPath)
      }

      const slug = document.slug ?? document.id
      if (slug) {
        navigateToSlug(slug)
      }

      const label = document.title ?? slug ?? "document"
      toast.success(`Created ${label}`)
    },
    [abortController, loadDocuments, navigateToSlug, openFolderPath]
  )

  const createFolderInPath = useCallback(
    async (parentPath?: string) => {
      const baseName = DEFAULT_FOLDER_BASENAME
      const targetPath =
        parentPath && parentPath.length > 0 ? `${parentPath}/${baseName}` : baseName

      const signal = abortController.getSignal()
      const folder = await createMarkdownFolder(targetPath, signal)
      if (!folder?.folderPath) {
        throw new Error("Missing folder payload")
      }

      if (signal.aborted) return

      await loadDocuments({ silent: true })
      if (signal.aborted) return

      openFolderPath(folder.folderPath)

      const folderName = getLastPathSegment(folder.folderPath) ?? "folder"
      toast.success(`Created folder "${folderName}"`)
    },
    [abortController, loadDocuments, openFolderPath]
  )

  const deleteDocumentById = useCallback(
    async (documentId: string, slug?: string) => {
      let removedDocument: MarkdownDocument | undefined
      let removedIndex = -1
      let didRemove = false

      setMarkdownIndex((current) => {
        const index = current.documents.findIndex((doc) => doc.id === documentId)
        if (index === -1) {
          return current
        }
        removedIndex = index
        removedDocument = current.documents[index]
        didRemove = true
        const nextDocuments = [...current.documents]
        nextDocuments.splice(index, 1)
        return { ...current, documents: nextDocuments }
      })

      const currentSelectedSlug = getSelectedSlug()
      const resolvedSlug = slug ?? removedDocument?.slug
      const shouldResetSelection = Boolean(
        didRemove &&
          resolvedSlug &&
          currentSelectedSlug &&
          resolvedSlug === currentSelectedSlug
      )
      const slugToRestore = shouldResetSelection ? resolvedSlug : undefined

      if (shouldResetSelection) {
        router.replace("/documents")
      }

      const restoreDocument = () => {
        if (!didRemove || !removedDocument) return
        setMarkdownIndex((current) => {
          if (current.documents.some((doc) => doc.id === documentId)) {
            return current
          }
          const nextDocuments = [...current.documents]
          const insertIndex =
            removedIndex >= 0 && removedIndex <= nextDocuments.length
              ? removedIndex
              : nextDocuments.length
          nextDocuments.splice(insertIndex, 0, removedDocument as MarkdownDocument)
          return { ...current, documents: nextDocuments }
        })
      }

      const signal = abortController.getSignal()

      try {
        await deleteMarkdownDocument(documentId, signal)
        if (signal.aborted) return
        await loadDocuments({ silent: true })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        restoreDocument()
        if (slugToRestore) {
          router.replace(buildDocumentsPath(slugToRestore))
        }
        throw error
      }
    },
    [abortController, getSelectedSlug, loadDocuments, router, setMarkdownIndex]
  )

  const deleteFolderAtPath = useCallback(
    async (folderPath: string) => {
      const folderPrefix = folderPath ? `${folderPath}/` : ""
      const removedFolders: { folder: MarkdownFolder; index: number }[] = []
      const removedDocuments: { document: MarkdownDocument; index: number }[] = []

      setMarkdownIndex((current) => {
        let foldersChanged = false
        const nextFolders: MarkdownFolder[] = []
        current.folders.forEach((folder, index) => {
          const isTarget = folder.folderPath === folderPath
          const isNested = folderPrefix ? folder.folderPath.startsWith(folderPrefix) : false
          if (isTarget || isNested) {
            removedFolders.push({ folder, index })
            foldersChanged = true
            return
          }
          nextFolders.push(folder)
        })

        let documentsChanged = false
        const nextDocuments: MarkdownDocument[] = []
        current.documents.forEach((doc, index) => {
          const docPath = doc.documentPath ?? ""
          const shouldRemove =
            docPath === folderPath || (folderPrefix ? docPath.startsWith(folderPrefix) : false)
          if (shouldRemove) {
            removedDocuments.push({ document: doc, index })
            documentsChanged = true
            return
          }
          nextDocuments.push(doc)
        })

        if (!foldersChanged && !documentsChanged) {
          return current
        }

        return {
          ...current,
          folders: foldersChanged ? nextFolders : current.folders,
          documents: documentsChanged ? nextDocuments : current.documents,
        }
      })

      const currentSelectedSlug = getSelectedSlug()
      const removedSelectedDoc = Boolean(
        currentSelectedSlug &&
          removedDocuments.some(({ document }) => document.slug === currentSelectedSlug)
      )
      const slugToRestore = removedSelectedDoc ? currentSelectedSlug : undefined

      if (removedSelectedDoc) {
        router.replace("/documents")
      }

      const restoreState = () => {
        if (removedFolders.length || removedDocuments.length) {
          const foldersToRestore = [...removedFolders].sort((a, b) => a.index - b.index)
          const documentsToRestore = [...removedDocuments].sort((a, b) => a.index - b.index)

          setMarkdownIndex((current) => {
            let nextFolders = current.folders
            if (foldersToRestore.length) {
              nextFolders = [...current.folders]
              foldersToRestore.forEach(({ folder, index }) => {
                if (nextFolders.some((item) => item.id === folder.id)) {
                  return
                }
                const insertIndex = index >= 0 && index <= nextFolders.length ? index : nextFolders.length
                nextFolders.splice(insertIndex, 0, folder)
              })
            }

            let nextDocuments = current.documents
            if (documentsToRestore.length) {
              nextDocuments = [...current.documents]
              documentsToRestore.forEach(({ document, index }) => {
                if (nextDocuments.some((item) => item.id === document.id)) {
                  return
                }
                const insertIndex = index >= 0 && index <= nextDocuments.length ? index : nextDocuments.length
                nextDocuments.splice(insertIndex, 0, document)
              })
            }

            if (nextFolders === current.folders && nextDocuments === current.documents) {
              return current
            }

            return { ...current, folders: nextFolders, documents: nextDocuments }
          })
        }
      }

      const signal = abortController.getSignal()

      try {
        await deleteMarkdownFolder(folderPath, signal)
        if (signal.aborted) return
        await loadDocuments({ silent: true })
        if (signal.aborted) return
        closeFolderPath(folderPath)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        restoreState()
        if (slugToRestore) {
          router.replace(buildDocumentsPath(slugToRestore))
        }
        throw error
      }
    },
    [abortController, closeFolderPath, getSelectedSlug, loadDocuments, router, setMarkdownIndex]
  )

  const moveDocumentToFolder = useCallback(
    async (documentId: string, targetFolderPath?: string, label?: string, sortOrder?: number) => {
      const signal = abortController.getSignal()
      const document = await moveMarkdownDocument(
        { id: documentId, targetFolderPath, sortOrder },
        signal
      )

      if (signal.aborted) return

      await loadDocuments({ silent: true })
      if (signal.aborted) return

      const parentPath = getParentPath(document?.documentPath)
      if (parentPath) {
        openFolderPath(parentPath)
      } else if (targetFolderPath) {
        openFolderPath(targetFolderPath)
      }

      const docLabel = document?.title ?? label ?? "Document"
      toast.success(`Moved "${docLabel}"`)
    },
    [abortController, loadDocuments, openFolderPath]
  )

  const updateSortOrder = useCallback(
    async (id: string, type: "document" | "folder", sortOrder: number) => {
      try {
        await updateMarkdownSortOrder({ id, type, sortOrder })
      } catch (error) {
        console.error("Failed to update sort order", error)
        toast.error(error instanceof Error ? error.message : "Failed to save order")
      }
    },
    []
  )

  const getFolderIdByPath = useCallback(
    (folderPath?: string) => {
      if (!folderPath) return undefined
      return getFolders().find((folder) => folder.folderPath === folderPath)?.id
    },
    [getFolders]
  )

  const assignSortOrders = useCallback(
    (
      items: SidebarTreeElement[],
      options?: { onlyMoveId?: string; prevOrder?: SidebarTreeElement[]; skipIds?: Set<string> }
    ) => {
      const assignments = new Map<string, number>()
      const updates: Promise<void>[] = []

      const onlyMoveId = options?.onlyMoveId
      const skipIds = options?.skipIds

      if (onlyMoveId) {
        const index = items.findIndex((x) => x.id === onlyMoveId)
        if (index === -1) {
          return { assignments, promise: Promise.resolve() }
        }
        const prevItem = index > 0 ? items[index - 1] : undefined
        const nextItem = index < items.length - 1 ? items[index + 1] : undefined
        const nextSortOrder = computeSortOrderBetween(prevItem?.sortOrder, nextItem?.sortOrder)
        assignments.set(onlyMoveId, nextSortOrder)

        const moved = items[index]
        const dbId =
          moved.kind === "document" ? moved.documentId : getFolderIdByPath(moved.folderPath)

        if (dbId && moved.sortOrder !== nextSortOrder && !skipIds?.has(onlyMoveId)) {
          updates.push(updateSortOrder(dbId, moved.kind, nextSortOrder))
        }

        const promise =
          updates.length > 0
            ? Promise.allSettled(updates).then(() => undefined)
            : Promise.resolve()

        return { assignments, promise }
      }

      // Fallback: resequence everything (rarely)
      items.forEach((item, index) => {
        const nextSortOrder = (index + 1) * 1000
        assignments.set(item.id, nextSortOrder)

        if (skipIds?.has(item.id)) {
          return
        }

        const dbId =
          item.kind === "document" ? item.documentId : getFolderIdByPath(item.folderPath)

        if (!dbId) {
          return
        }

        if (item.sortOrder === nextSortOrder) {
          return
        }

        updates.push(updateSortOrder(dbId, item.kind, nextSortOrder))
      })

      const promise =
        updates.length > 0
          ? Promise.allSettled(updates).then(() => undefined)
          : Promise.resolve()

      return { assignments, promise }
    },
    [getFolderIdByPath, updateSortOrder]
  )

  const triggerCreateDocument = useCallback(
    (folderPath?: string) => {
      if (isActionPending) return
      startActionTransition(() => {
        createDocumentInPath(folderPath).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          console.error(error)
          toast.error(
            error instanceof Error ? error.message : "Unable to create document"
          )
        })
      })
    },
    [isActionPending, startActionTransition, createDocumentInPath]
  )

  const triggerCreateFolder = useCallback(
    (parentPath?: string) => {
      if (isActionPending) return
      startActionTransition(() => {
        createFolderInPath(parentPath).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          console.error(error)
          toast.error(
            error instanceof Error ? error.message : "Unable to create folder"
          )
        })
      })
    },
    [isActionPending, startActionTransition, createFolderInPath]
  )

  const triggerDeleteDocument = useCallback(
    (documentId: string, slug?: string) => {
      if (!documentId || isActionPending) return
      startActionTransition(() => {
        deleteDocumentById(documentId, slug).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          console.error(error)
          toast.error(
            error instanceof Error ? error.message : "Unable to delete document"
          )
        })
      })
    },
    [isActionPending, startActionTransition, deleteDocumentById]
  )

  const triggerDeleteFolder = useCallback(
    (folderPath: string) => {
      if (!folderPath || isActionPending) return
      startActionTransition(() => {
        deleteFolderAtPath(folderPath).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to delete folder")
        })
      })
    },
    [isActionPending, startActionTransition, deleteFolderAtPath]
  )

  const triggerMoveDocument = useCallback(
    (documentId: string, targetFolderPath?: string, label?: string, sortOrder?: number) => {
      if (!documentId || isActionPending) return
      startActionTransition(() => {
        moveDocumentToFolder(documentId, targetFolderPath, label, sortOrder).catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to move document")
        })
      })
    },
    [isActionPending, startActionTransition, moveDocumentToFolder]
  )

  const triggerMoveFolder = useCallback(
    (folderPath: string, targetFolderPath?: string, sortOrder?: number) => {
      if (!folderPath) return
      startActionTransition(() => {
        const signal = abortController.getSignal()
        moveMarkdownFolder(folderPath, targetFolderPath ?? null, sortOrder, signal)
          .then(async () => {
            if (signal.aborted) return
            await loadDocuments({ silent: true })
          })
          .catch((error) => {
            if (error instanceof DOMException && error.name === "AbortError") return
            console.error(error)
            toast.error(error instanceof Error ? error.message : "Unable to move folder")
          })
      })
    },
    [abortController, loadDocuments, startActionTransition]
  )

  const handleCreateDocument = useCallback(() => {
    triggerCreateDocument()
  }, [triggerCreateDocument])

  const handleCreateFolder = useCallback(() => {
    triggerCreateFolder()
  }, [triggerCreateFolder])

  const handleRenameFolder = useCallback((folderPath: string, currentName: string) => {
    renameDialog.openForFolder(folderPath, currentName)
  }, [renameDialog])

  const handleRenameDocument = useCallback((documentId: string, currentName: string) => {
    renameDialog.openForDocument(documentId, currentName)
  }, [renameDialog])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === "document" || data?.type === "folder") {
      setActiveDragLabel(data.label ?? (data?.type === "folder" ? "Folder" : "Document"))
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragLabel(null)

      const parsed = parseDragEvent(event)
      if (!parsed) return
      const { activeData, overData } = parsed
      const { active, over } = event
      const currentTreeElements = getTreeElements()

      const findContext = (
        elements: SidebarTreeElement[],
        targetId: string
      ): { parent: SidebarTreeElement | null; siblings: SidebarTreeElement[] } | null => {
        for (const el of elements) {
          if (el.id === targetId) {
            return { parent: null, siblings: elements }
          }
          if (el.children) {
            const found = el.children.find((child) => child.id === targetId)
            if (found) return { parent: el, siblings: el.children }
            const deep = findContext(el.children, targetId)
            if (deep) return deep
          }
        }
        return null
      }

      const findFolderByPath = (
        elements: SidebarTreeElement[],
        targetPath?: string
      ): SidebarTreeElement | null => {
        if (!targetPath) {
          return {
            id: DOCUMENTS_ROOT_ID,
            name: "root",
            isSelectable: false,
            kind: "folder",
            folderPath: undefined,
            children: elements,
          }
        }

        for (const el of elements) {
          if (el.kind === "folder") {
            if (el.folderPath === targetPath) {
              return el
            }
            if (el.children?.length) {
              const found = findFolderByPath(el.children, targetPath)
              if (found) {
                return found
              }
            }
          }
        }
        return null
      }

      let isMiddleZone = false
      if (active.rect.current.translated && over?.rect) {
        const activeRect = active.rect.current.translated ?? null
        const overRect = over.rect ?? null
        const zone = getDropPosition(activeRect, overRect)
        isMiddleZone = zone === "middle"
      }

      const isSortableActive = activeData.type === "document" || activeData.type === "folder"
      const isSortableOver = overData.type === "document" || overData.type === "folder"

      if (isSortableActive && isSortableOver) {
        const activeId = active.id as string
        const overId = resolveSortableId((event.over!.id as string), overData, currentTreeElements)
        if (!overId) return

        if (activeId !== overId) {
          const activeContext = findContext(currentTreeElements, activeId)
          const overContext = findContext(currentTreeElements, overId)

          if (activeContext && overContext) {
            const isOverFolder = overData.type === "folder"

            if (isOverFolder && isMiddleZone) {
              // handled below
            } else {
              const resolvedOverContext = overContext ?? findContext(currentTreeElements, overId)
              if (!resolvedOverContext) return
              const siblings = resolvedOverContext.siblings
              const overIndex = siblings.findIndex((x) => x.id === overId)

              if (overIndex !== -1) {
                if (activeContext.siblings === resolvedOverContext.siblings) {
                  const oldIndex = activeContext.siblings.findIndex((x) => x.id === activeId)
                  if (oldIndex === -1) {
                    return
                  }
                  const newOrderArray = arrayMove([...activeContext.siblings], oldIndex, overIndex)
                  const { promise } = assignSortOrders(newOrderArray, {
                    onlyMoveId: activeId,
                    prevOrder: activeContext.siblings,
                  })
                  promise.then(() => {
                    void loadDocuments({ silent: true })
                  })
                  return
                } else {
                  let insertAfter = true
                  if (active.rect.current.translated && event.over?.rect) {
                    const activeRect = active.rect.current.translated ?? null
                    const overRect = event.over.rect ?? null
                    const zone = getDropPosition(activeRect, overRect, { top: DOCUMENT_DROP_SPLIT, bottom: DOCUMENT_DROP_SPLIT })
                    if (zone === "top") insertAfter = false
                  }

                  const insertionIndex = insertAfter ? overIndex + 1 : overIndex

                  if (activeData.type === "document" && activeData.documentId) {
                    const targetItems = [...siblings]
                    const placeholder: SidebarTreeElement = {
                      id: activeId,
                      name: activeData.label ?? "Document",
                      isSelectable: true,
                      kind: "document",
                      documentId: activeData.documentId,
                      sortOrder: undefined,
                    }
                    targetItems.splice(insertionIndex, 0, placeholder)

                    const idx = targetItems.findIndex((i) => i.id === activeId)
                    const prevItem = idx > 0 ? targetItems[idx - 1] : undefined
                    const nextItem = idx < targetItems.length - 1 ? targetItems[idx + 1] : undefined
                    const nextSortOrder = computeSortOrderBetween(prevItem?.sortOrder, nextItem?.sortOrder)

                    triggerMoveDocument(
                      activeData.documentId,
                      resolvedOverContext.parent?.folderPath,
                      activeData.label,
                      nextSortOrder
                    )
                    return
                  } else if (activeData.type === "folder" && activeData.folderPath) {
                    const targetItems = [...siblings]
                    const placeholder: SidebarTreeElement = {
                      id: activeId,
                      name: activeData.label ?? "Folder",
                      isSelectable: true,
                      kind: "folder",
                      folderPath: activeData.folderPath,
                      sortOrder: undefined,
                    }
                    targetItems.splice(insertionIndex, 0, placeholder)

                    const idx = targetItems.findIndex((i) => i.id === activeId)
                    const prevItem = idx > 0 ? targetItems[idx - 1] : undefined
                    const nextItem = idx < targetItems.length - 1 ? targetItems[idx + 1] : undefined
                    const nextSortOrder = computeSortOrderBetween(prevItem?.sortOrder, nextItem?.sortOrder)

                    triggerMoveFolder(
                      activeData.folderPath as string,
                      resolvedOverContext.parent?.folderPath,
                      nextSortOrder
                    )
                    return
                  }
                }
              }
            }
          }
        }
      }

      if (
        activeData.type === "document" &&
        overData.type === "folder" &&
        activeData.documentId
      ) {
        const targetFolderPath = overData.folderPath ?? undefined
        const currentFolderPath = activeData.currentFolderPath ?? undefined

        if (targetFolderPath === currentFolderPath) {
          return
        }

                    const targetFolder = findFolderByPath(currentTreeElements, targetFolderPath)
        const siblings = targetFolder?.children ?? []
        const lastItem = siblings[siblings.length - 1]
        const nextSortOrder = computeSortOrderBetween(lastItem?.sortOrder, undefined)

        triggerMoveDocument(
          activeData.documentId,
          targetFolderPath,
          activeData.label,
          nextSortOrder
        )
      }

      // Drop a folder into a folder (middle zone) or into root
      if (activeData.type === "folder" && activeData.folderPath && overData.type === "folder") {
        const targetFolderPath = (event.over!.id === SIDEBAR_TREE_ROOT_DROPPABLE_ID) ? undefined : (overData.folderPath ?? undefined)

        // If middle zone over a folder row, move into that folder
        if (isMiddleZone && targetFolderPath !== undefined) {
          const targetFolder = findFolderByPath(currentTreeElements, targetFolderPath)
          const siblings = targetFolder?.children ?? []
          const lastItem = siblings[siblings.length - 1]
          const last = lastItem?.sortOrder
          const nextSortOrder = computeSortOrderBetween(last, undefined)

          triggerMoveFolder(activeData.folderPath as string, targetFolderPath, nextSortOrder)
          return
        }

        // If over root drop zone, place at end of root
        if (event.over!.id === SIDEBAR_TREE_ROOT_DROPPABLE_ID) {
          const siblings = currentTreeElements
          const lastItem = siblings[siblings.length - 1]
          const nextSortOrder = computeSortOrderBetween(lastItem?.sortOrder, undefined)

          triggerMoveFolder(activeData.folderPath as string, undefined, nextSortOrder)
          return
        }
      }
    },
    [assignSortOrders, getTreeElements, loadDocuments, triggerMoveDocument, triggerMoveFolder]
  )

  useCallbackStability("handleDragEnd", handleDragEnd, [
    assignSortOrders,
    getTreeElements,
    loadDocuments,
    triggerMoveDocument,
    triggerMoveFolder,
  ])

  const handleDragCancel = useCallback(() => {
    setActiveDragLabel(null)
  }, [])

  const [submitRenameAction] = useAbortableAction(
    async (signal: AbortSignal, state: RenameDialogState) => {
      if (state.status !== "open") return
      const trimmed = state.newName.trim()
      if (!trimmed || trimmed === state.currentName) {
        renameDialog.close()
        return
      }

      if (state.entityType === "folder") {
        await renameMarkdownFolder(state.folderPath, trimmed, signal)
        if (signal.aborted) return
        await loadDocuments({ silent: true })
        if (signal.aborted) return
        toast.success(`Renamed folder to "${trimmed}"`)
      } else {
        const document = await renameMarkdownDocument(state.documentId, trimmed, signal)
        if (signal.aborted) return
        await loadDocuments({ silent: true })
        if (signal.aborted) return

        const slugToNavigate = document?.slug
        if (slugToNavigate && getSelectedSlug()) {
          router.replace(buildDocumentsPath(slugToNavigate))
        }

        const label = document?.title ?? trimmed
        toast.success(`Renamed document to "${label}"`)
      }

      if (signal.aborted) return
      renameDialog.close()
    }
  )

  const handleRenameSubmit = useCallback(() => {
    if (isActionPending) return
    const state = renameDialog.state

    startActionTransition(() => {
      submitRenameAction(state).catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Unable to rename")
      })
    })
  }, [isActionPending, renameDialog.state, startActionTransition, submitRenameAction])

  const renameDialogProps: RenameDialogProps = {
    state: renameDialog.state,
    isPending: isActionPending,
    onNewNameChange: (value: string) => renameDialog.updateNewName(value),
    onSubmit: handleRenameSubmit,
    onClose: () => renameDialog.close(),
  }

  const treeProps: SidebarTreeProps = {
    elements: treeElements,
    selectedSlug,
    openFolders: derivedOpenFolders,
    onToggleFolder: toggleFolder,
    isActionPending,
    onCreateDocument: triggerCreateDocument,
    onCreateFolder: triggerCreateFolder,
    onDeleteFolder: triggerDeleteFolder,
    onDeleteDocument: triggerDeleteDocument,
    onRenameFolder: handleRenameFolder,
    onRenameDocument: handleRenameDocument,
    onSelect: navigateToSlug,
    sensors,
    collisionDetection,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
    activeDragLabel,
  }

  return {
    isLoadingFiles,
    filesError,
    isActionPending,
    hasTreeData: treeElements.length > 0,
    treeProps,
    createDocument: handleCreateDocument,
    createFolder: handleCreateFolder,
    renameDialogProps,
  }
}
