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

import { buildDocumentsPath, buildDocumentsTree } from "@/components/sidebar/tree/tree-utils"
import {
  DOCUMENTS_ROOT_ID,
  SIDEBAR_TREE_ROOT_DROPPABLE_ID,
  type MarkdownDocument,
  type MarkdownFolder,
  type SidebarTreeElement,
} from "@/components/sidebar/tree/tree-types"
import type { SidebarTreeProps } from "@/components/sidebar/tree/sidebar-tree"
import type { RenameDialogProps } from "@/components/sidebar/rename-dialog"
import {
  createMarkdownDocument,
  createMarkdownFolder,
  deleteMarkdownDocument,
  deleteMarkdownFolder,
  fetchMarkdownIndex,
  moveMarkdownDocument,
  renameMarkdownDocument,
  renameMarkdownFolder,
  updateMarkdownSortOrder,
} from "@/components/sidebar/api/markdown-actions"

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
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameType, setRenameType] = useState<"document" | "folder">("document")
  const [renameId, setRenameId] = useState("")
  const [renamePath, setRenamePath] = useState("")
  const [renameCurrentName, setRenameCurrentName] = useState("")
  const [renameNewName, setRenameNewName] = useState("")
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
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
    staleTime: 30_000,
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

  const selectedSlug = useMemo(() => {
    if (!pathname.startsWith("/documents")) return undefined
    const segments = pathname.split("/").slice(2).filter(Boolean)
    if (!segments.length) return undefined
    return segments.map((segment) => decodeURIComponent(segment)).join("/")
  }, [pathname])

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
      const payload: Record<string, unknown> = { title: "untititled" }
      if (folderPath) {
        payload.folderPath = folderPath
      }

      const document = await createMarkdownDocument(payload)
      if (!document?.id || !document.documentPath) {
        throw new Error("Missing document payload")
      }

      await loadDocuments({ silent: true })
      const docPath = document.documentPath
      openFolderPath(docPath.split("/").slice(0, -1).join("/"))

      const slug = document.slug ?? document.id
      if (slug) {
        navigateToSlug(slug)
      }

      const label = document.title ?? slug ?? "document"
      toast.success(`Created ${label}`)
    },
    [loadDocuments, navigateToSlug, openFolderPath]
  )

  const createFolderInPath = useCallback(
    async (parentPath?: string) => {
      const baseName = "untitled-folder"
      const targetPath =
        parentPath && parentPath.length > 0 ? `${parentPath}/${baseName}` : baseName

      const folder = await createMarkdownFolder(targetPath)
      if (!folder?.folderPath) {
        throw new Error("Missing folder payload")
      }

      await loadDocuments({ silent: true })
      openFolderPath(folder.folderPath)

      const folderName = folder.folderPath.split("/").pop() ?? "folder"
      toast.success(`Created folder "${folderName}"`)
    },
    [loadDocuments, openFolderPath]
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

      const resolvedSlug = slug ?? removedDocument?.slug
      const shouldResetSelection = Boolean(didRemove && resolvedSlug && resolvedSlug === selectedSlug)
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

      try {
        await deleteMarkdownDocument(documentId)
        await loadDocuments({ silent: true })
      } catch (error) {
        restoreDocument()
        if (slugToRestore) {
          router.replace(buildDocumentsPath(slugToRestore))
        }
        throw error
      }
    },
    [loadDocuments, router, selectedSlug, setMarkdownIndex]
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

      const removedSelectedDoc = Boolean(
        selectedSlug &&
          removedDocuments.some(({ document }) => document.slug === selectedSlug)
      )
      const slugToRestore = removedSelectedDoc ? selectedSlug : undefined

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

      try {
        await deleteMarkdownFolder(folderPath)
        await loadDocuments({ silent: true })
        closeFolderPath(folderPath)
      } catch (error) {
        restoreState()
        if (slugToRestore) {
          router.replace(buildDocumentsPath(slugToRestore))
        }
        throw error
      }
    },
    [loadDocuments, closeFolderPath, selectedSlug, router, setMarkdownIndex]
  )

  const moveDocumentToFolder = useCallback(
    async (documentId: string, targetFolderPath?: string, label?: string, sortOrder?: number) => {
      const document = await moveMarkdownDocument({ id: documentId, targetFolderPath, sortOrder })

      await loadDocuments({ silent: true })

      if (document?.documentPath) {
        const parentPath = document.documentPath.split("/").slice(0, -1).join("/")
        if (parentPath) {
          openFolderPath(parentPath)
        }
      } else if (targetFolderPath) {
        openFolderPath(targetFolderPath)
      }

      const docLabel = document?.title ?? label ?? "Document"
      toast.success(`Moved "${docLabel}"`)
    },
    [loadDocuments, openFolderPath]
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
      return folders.find((folder) => folder.folderPath === folderPath)?.id
    },
    [folders]
  )

  const assignSortOrders = useCallback(
    (items: SidebarTreeElement[], skipIds?: Set<string>) => {
      const assignments = new Map<string, number>()
      const updates: Promise<void>[] = []

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
          console.error(error)
          toast.error(error instanceof Error ? error.message : "Unable to move document")
        })
      })
    },
    [isActionPending, startActionTransition, moveDocumentToFolder]
  )

  const handleCreateDocument = useCallback(() => {
    triggerCreateDocument()
  }, [triggerCreateDocument])

  const handleCreateFolder = useCallback(() => {
    triggerCreateFolder()
  }, [triggerCreateFolder])

  const handleRenameFolder = useCallback((folderPath: string, currentName: string) => {
    setRenameType("folder")
    setRenamePath(folderPath)
    setRenameCurrentName(currentName)
    setRenameNewName(currentName)
    setRenameDialogOpen(true)
  }, [])

  const handleRenameDocument = useCallback((documentId: string, currentName: string) => {
    setRenameType("document")
    setRenameId(documentId)
    setRenameCurrentName(currentName)
    setRenameNewName(currentName)
    setRenameDialogOpen(true)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === "document") {
      setActiveDragLabel(data.label ?? "Document")
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragLabel(null)

      const { active, over } = event
      if (!over) return

      const activeData = active.data.current
      const overData = over.data.current

      if (!activeData || !overData) return

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
      if (active.rect.current.translated && over.rect) {
        const activeRect = active.rect.current.translated
        const overRect = over.rect
        const activeCenterY = activeRect.top + activeRect.height / 2
        const overTop = overRect.top
        const overHeight = overRect.height
        const relativeY = (activeCenterY - overTop) / overHeight

        if (relativeY >= 0.25 && relativeY <= 0.75) {
          isMiddleZone = true
        }
      }

      if (typeof activeData.sortOrder === "number" && typeof overData.sortOrder === "number") {
        const activeId = active.id as string
        const overId = over.id as string

        if (activeId !== overId) {
          const activeContext = findContext(treeElements, activeId)
          const overContext = findContext(treeElements, overId)

          if (activeContext && overContext) {
            const isOverFolder = overData.type === "folder"

            if (isOverFolder && isMiddleZone) {
              // handled below
            } else {
              const siblings = overContext.siblings
              const overIndex = siblings.findIndex((x) => x.id === overId)

              if (overIndex !== -1) {
                if (activeContext.siblings === overContext.siblings) {
                  const oldIndex = activeContext.siblings.findIndex((x) => x.id === activeId)
                  if (oldIndex === -1) {
                    return
                  }
                  const newOrderArray = arrayMove([...activeContext.siblings], oldIndex, overIndex)
                  const { promise } = assignSortOrders(newOrderArray)
                  promise.then(() => {
                    void loadDocuments({ silent: true })
                  })
                  return
                } else {
                  let insertAfter = true
                  if (active.rect.current.translated && over.rect) {
                    const activeRect = active.rect.current.translated
                    const overRect = over.rect
                    const activeCenterY = activeRect.top + activeRect.height / 2
                    const overTop = overRect.top
                    const overHeight = overRect.height
                    const relativeY = (activeCenterY - overTop) / overHeight
                    if (relativeY < 0.5) insertAfter = false
                  }

                  const insertionIndex = insertAfter ? overIndex + 1 : overIndex

                  if (activeData.type === "document" && activeData.documentId) {
                    const sourceItems = activeContext.siblings.filter((item) => item.id !== activeId)
                    const { promise: sourcePromise } = assignSortOrders(sourceItems)

                    const targetItems = [...siblings]
                    const placeholder: SidebarTreeElement = {
                      id: activeId,
                      name: activeData.label ?? "Document",
                      isSelectable: true,
                      kind: "document",
                      documentId: activeData.documentId,
                    }
                    targetItems.splice(insertionIndex, 0, placeholder)

                    const skipIds = new Set<string>([activeId])
                    const { assignments, promise: targetPromise } = assignSortOrders(targetItems, skipIds)
                    const nextSortOrder = assignments.get(activeId) ?? targetItems.length * 1000

                    Promise.all([sourcePromise, targetPromise]).then(() => {
                      triggerMoveDocument(
                        activeData.documentId,
                        overContext.parent?.folderPath,
                        activeData.label,
                        nextSortOrder
                      )
                    })
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

        const targetFolder = findFolderByPath(treeElements, targetFolderPath)
        const siblings = targetFolder?.children ?? []
        const maxSortOrder = siblings.reduce((max, item) => {
          if (typeof item.sortOrder === "number") {
            return Math.max(max, item.sortOrder)
          }
          return max
        }, Number.NEGATIVE_INFINITY)
        const nextSortOrder = Number.isFinite(maxSortOrder) ? maxSortOrder + 1000 : 0

        triggerMoveDocument(
          activeData.documentId,
          targetFolderPath,
          activeData.label,
          nextSortOrder
        )
      }
    },
    [triggerMoveDocument, treeElements, assignSortOrders, loadDocuments]
  )

  const handleDragCancel = useCallback(() => {
    setActiveDragLabel(null)
  }, [])

  const handleRenameSubmit = useCallback(async () => {
    if (!renameNewName.trim() || renameNewName.trim() === renameCurrentName) {
      setRenameDialogOpen(false)
      return
    }

    if (isActionPending) return

    startActionTransition(async () => {
      try {
        if (renameType === "folder") {
          await renameMarkdownFolder(renamePath, renameNewName.trim())
          await loadDocuments({ silent: true })
          const folderName = renameNewName.trim()
          toast.success(`Renamed folder to "${folderName}"`)
        } else {
          const document = await renameMarkdownDocument(renameId, renameNewName.trim())

          await loadDocuments({ silent: true })

          if (document?.slug && selectedSlug) {
            const encodedPath = document.slug
              .split("/")
              .map((segment) => encodeURIComponent(segment))
              .join("/")
            router.replace(`/documents/${encodedPath}`)
          }

          const label = document?.title ?? renameNewName.trim()
          toast.success(`Renamed document to "${label}"`)
        }

        setRenameDialogOpen(false)
      } catch (error) {
        console.error(error)
        toast.error(
          error instanceof Error ? error.message : "Unable to rename"
        )
      }
    })
  }, [
    renameType,
    renameId,
    renamePath,
    renameNewName,
    renameCurrentName,
    isActionPending,
    startActionTransition,
    loadDocuments,
    selectedSlug,
    router,
  ])

  const renameDialogProps: RenameDialogProps = {
    open: renameDialogOpen,
    isPending: isActionPending,
    type: renameType,
    currentName: renameCurrentName,
    newName: renameNewName,
    onNewNameChange: (value: string) => setRenameNewName(value),
    onSubmit: handleRenameSubmit,
    onOpenChange: setRenameDialogOpen,
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
