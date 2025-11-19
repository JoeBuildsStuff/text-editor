"use client"

// TODO: The tree flickers because we refetch documents on every route change.
//       Revisit this once we have a shared cache (see README).
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import type { ReactNode } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  useDndContext,
  type CollisionDetection,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ChevronRight,
  Ellipsis,
  File as FileIcon,
  Folder as FolderIcon,
  FolderOpenIcon,
  FilePlus as FilePlusIcon,
  FolderX,
  Trash2,
  Terminal,
  Pencil,
} from "lucide-react"
import { SidebarLogo } from "@/components/sidebar/app-sidebar-logo"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"

import { type TreeViewElement } from "@/components/ui/file-tree"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { toast } from "sonner"
import Spinner from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/auth/user-menu"

const MARKDOWN_EXTENSION = /\.md$/i

type MarkdownDocument = {
  id: string
  title: string
  documentPath: string
  slug: string
  sortOrder?: number
}

type MarkdownFolder = {
  id: string
  folderPath: string
  createdAt: string
  updatedAt: string
  sortOrder?: number
}

const DOCUMENTS_ROOT_ID = "documents-root"

interface SidebarTreeElement extends TreeViewElement {
  children?: SidebarTreeElement[]
  kind: "folder" | "document"
  folderPath?: string
  documentId?: string
  documentPath?: string
  sortOrder?: number
}

function sortTree(elements: SidebarTreeElement[]) {
  elements.sort((a, b) => {
    // If sortOrder is defined for both, use it
    if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number') {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder
      }
    }
    // If one has sortOrder and other doesn't (shouldn't happen with DB default), prioritize one?
    // For now, fallback to name
    return a.name.localeCompare(b.name)
  })
  elements.forEach(element => {
    if (element.children) {
      sortTree(element.children)
    }
  })
  return elements
}

function buildDocumentsTree(
  files: MarkdownDocument[],
  folders: MarkdownFolder[]
): SidebarTreeElement[] {
  const root: SidebarTreeElement = {
    id: DOCUMENTS_ROOT_ID,
    name: "documents",
    // Hidden root used purely for building nested structure
    isSelectable: false,
    children: [],
    kind: "folder",
    folderPath: "",
  }

  const ensureFolderNode = (pathSegments: string[]): SidebarTreeElement => {
    let currentNode = root
    currentNode.children = currentNode.children ?? []

    if (pathSegments.length === 0) {
      return currentNode
    }

    const pathAccumulator: string[] = []

    pathSegments.forEach((segment) => {
      pathAccumulator.push(segment)
      const folderPath = pathAccumulator.join("/")
      const folderId = `${DOCUMENTS_ROOT_ID}/${folderPath}`
      const children =
        (currentNode.children as SidebarTreeElement[] | undefined) ?? []
      currentNode.children = children
      let folderNode = children.find((child) => child.id === folderId)
      if (!folderNode) {
        folderNode = {
          id: folderId,
          name: segment,
          // Must remain true so that we can select the node
          isSelectable: true,
          kind: "folder",
          folderPath,
          sortOrder: 0, // Intermediate folders might not have sortOrder from DB immediately if not in folders array
        } satisfies SidebarTreeElement
        children.push(folderNode)
      } else {
        folderNode.kind = "folder"
        folderNode.folderPath = folderPath
        folderNode.children = folderNode.children ?? []
      }
      currentNode = folderNode
    })

    return currentNode
  }

  folders.forEach((folder) => {
    const segments = folder.folderPath.split("/").filter(Boolean)
    const node = ensureFolderNode(segments)
    // Update the leaf node with actual DB data including sortOrder
    node.sortOrder = folder.sortOrder
  })

  files.forEach((file) => {
    const segments = file.documentPath.split("/").filter(Boolean)
    const filename = segments.pop()
    if (!filename) return

    const parentNode = ensureFolderNode(segments)
    const children =
      (parentNode.children as SidebarTreeElement[] | undefined) ?? []
    parentNode.children = children
    const displayName = file.title?.trim().length ? file.title : filename.replace(MARKDOWN_EXTENSION, "")

    const documentNode: SidebarTreeElement = {
      id: file.slug,
      name: displayName,
      isSelectable: true,
      kind: "document",
      documentId: file.id,
      documentPath: file.documentPath,
      sortOrder: file.sortOrder,
    }

    children.push(documentNode)
  })

  const result = root.children ?? []
  return sortTree(result)
}

const ROOT_DROPPABLE_ID = `${DOCUMENTS_ROOT_ID}-root` as const

type TreeRenderOptions = {
  onSelect: (slug: string) => void
  selectedSlug?: string
  openFolders: Set<string>
  onToggleFolder: (folderId: string) => void
  isActionPending: boolean
  onCreateDocument: (folderPath?: string) => void
  onCreateFolder: (folderPath?: string) => void
  onDeleteFolder: (folderPath: string) => void
  onDeleteDocument: (documentId: string, slug?: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onRenameDocument: (documentId: string, currentName: string) => void
  isNested?: boolean
}

function SidebarTreeNodes({
  elements,
  options,
}: {
  elements: SidebarTreeElement[]
  options: TreeRenderOptions
}) {
  const { active } = useDndContext()
  if (!elements.length) return null

  const items = useMemo(() => elements.map((e) => e.id), [elements])
  const activeIndex = elements.findIndex((e) => e.id === active?.id)

  return (
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      {elements.map((element, index) =>
        element.kind === "folder" ? (
          <FolderTreeNode
            key={element.id}
            element={element}
            options={options}
            index={index}
            activeIndex={activeIndex}
          />
        ) : (
          <DocumentTreeNode
            key={element.id}
            element={element}
            options={options}
            index={index}
            activeIndex={activeIndex}
          />
        )
      )}
    </SortableContext>
  )
}

function FolderTreeNode({
  element,
  options,
  index,
  activeIndex,
}: {
  element: SidebarTreeElement
  options: TreeRenderOptions
  index: number
  activeIndex: number
}) {
  const isOpen = options.openFolders.has(element.id)
  const folderPath =
    element.folderPath && element.folderPath.length > 0 ? element.folderPath : undefined

  const { setNodeRef, isOver } = useDroppable({
    id: `folder:${element.id}`,
    data: {
      type: "folder" as const,
      folderPath,
    },
  })

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: element.id,
    data: {
      type: "folder",
      folderPath,
      sortOrder: element.sortOrder,
      label: element.name,
    },
  })

  const { active, over } = useDndContext()
  const isOverContext = over?.id === element.id
  const isDraggingSelf = active?.id === element.id

  let dropPosition: "top" | "bottom" | "middle" | null = null

  if (isOverContext && !isDraggingSelf && active && over) {
    const activeRect = active.rect.current.translated
    const overRect = over.rect

    if (activeRect && overRect) {
      const activeCenterY = activeRect.top + activeRect.height / 2
      const overTop = overRect.top
      const overHeight = overRect.height
      const relativeY = (activeCenterY - overTop) / overHeight

      if (relativeY < 0.25) {
        dropPosition = "top"
      } else if (relativeY > 0.75) {
        dropPosition = "bottom"
      } else {
        dropPosition = "middle"
      }
    } else {
      // Fallback if rects aren't available (shouldn't happen often during drag)
      if (activeIndex === -1) dropPosition = "middle"
      else if (activeIndex < index) dropPosition = "bottom"
      else dropPosition = "top"
    }
  }

  const style = {
    // Only apply transform if dragging this specific item to keep others fixed
    transform: undefined,
    transition,
  }

  return (
    <ContextMenu>
      <div
        ref={setSortableRef}
        style={style}
        className={cn("rounded-sm relative", dropPosition === "middle" && "bg-muted/40", isDragging && "opacity-25")}
      >
        {dropPosition === "top" && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
        )}
        {dropPosition === "bottom" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10" />
        )}
        <div ref={setNodeRef}>
          <Collapsible
            open={isOpen}
            onOpenChange={() => options.onToggleFolder(element.id)}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <ContextMenuTrigger asChild>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    className={cn(
                      options.isNested && "mr-0!",
                      isOver && "bg-muted/60"
                    )}
                    {...attributes}
                    {...listeners}
                  >
                    {isOpen ? (
                      <FolderOpenIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                    ) : (
                      <FolderIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                    )}
                    <span className="font-normal">{element.name}</span>
                    <ChevronRight
                      className={cn(
                        "ml-auto transition-transform w-3.5 h-3.5 text-muted-foreground",
                        isOpen && "rotate-90"
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
              </ContextMenuTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mr-0! pr-0!">
                  <SidebarMenuSubItem>
                    <SidebarTreeNodes
                      elements={element.children ?? []}
                      options={{ ...options, isNested: true }}
                    />
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </div>
      </div>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={options.isActionPending}
          onSelect={() => options.onCreateDocument(folderPath)}
        >
          <FilePlusIcon className="size-4" />
          Add Document
        </ContextMenuItem>
        <ContextMenuItem
          disabled={options.isActionPending}
          onSelect={() => options.onCreateFolder(folderPath)}
        >
          <FolderIcon className="size-4" />
          Add Folder
        </ContextMenuItem>
        {folderPath && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={options.isActionPending}
              onSelect={() => options.onRenameFolder(folderPath, element.name)}
            >
              <Pencil className="size-4" />
              Rename Folder
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              disabled={options.isActionPending}
              onSelect={() => options.onDeleteFolder(folderPath)}
            >
              <FolderX className="size-4" />
              Delete Folder
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function DocumentTreeNode({
  element,
  options,
  index,
  activeIndex,
}: {
  element: SidebarTreeElement
  options: TreeRenderOptions
  index: number
  activeIndex: number
}) {
  const folderSegments = element.documentPath?.split("/") ?? []
  folderSegments.pop()
  const currentFolderPath = folderSegments.join("/") || undefined

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: element.id,
    data: {
      type: "document",
      documentId: element.documentId,
      slug: element.id,
      currentFolderPath,
      label: element.name,
      sortOrder: element.sortOrder,
    },
  })

  const { active, over } = useDndContext()
  const isOver = over?.id === element.id
  const isDraggingSelf = active?.id === element.id

  let dropPosition: "top" | "bottom" | null = null

  if (isOver && !isDraggingSelf) {
    if (activeIndex === -1) {
      dropPosition = "bottom"
    } else if (activeIndex < index) {
      dropPosition = "bottom"
    } else {
      dropPosition = "top"
    }
  }

  const dragStyle = {
    // Only apply transform if dragging this specific item
    transform: undefined,
    transition,
  }

  const hiddenWhileDragging = cn("transition-opacity", isDragging && "opacity-25")
  const isSelected = options.selectedSlug === element.id

  const fileButton = (
    <SidebarMenuButton
      onClick={() => options.onSelect(element.id)}
      className={cn(
        "w-full justify-start",
        options.isNested && "mr-0!",
        isSelected ? "bg-muted/50 hover:bg-muted font-semibold" : "hover:bg-muted"
      )}
      {...attributes}
      {...listeners}
    >
      <FileIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
      <span className="font-normal">{element.name}</span>
    </SidebarMenuButton>
  )

  const menuContent = (
    <>
      <ContextMenuTrigger asChild>{fileButton}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={options.isActionPending}
          onSelect={() => {
            if (element.documentId) {
              options.onRenameDocument(element.documentId, element.name)
            }
          }}
        >
          <Pencil className="size-4" />
          Rename Document
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={options.isActionPending}
          onSelect={() => {
            if (element.documentId) {
              options.onDeleteDocument(element.documentId, element.id)
            }
          }}
        >
          <Trash2 className="size-4" />
          Delete Document
        </ContextMenuItem>
      </ContextMenuContent>
    </>
  )



  const draggableContent = (
    <div ref={setNodeRef} style={dragStyle} className="relative">
      <div className={hiddenWhileDragging}>
        {menuContent}
      </div>
      {dropPosition === "top" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
      )}
      {dropPosition === "bottom" && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10" />
      )}

    </div>
  )

  if (options.isNested) {
    return <ContextMenu>{draggableContent}</ContextMenu>
  }

  return (
    <SidebarMenuItem>
      <ContextMenu>{draggableContent}</ContextMenu>
    </SidebarMenuItem>
  )
}

function RootDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: ROOT_DROPPABLE_ID,
    data: {
      type: "folder" as const,
      folderPath: undefined,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-md transition-colors", isOver && "bg-muted/30")}
    >
      {children}
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [documents, setDocuments] = useState<MarkdownDocument[]>([])
  const [folders, setFolders] = useState<MarkdownFolder[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(true)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [isActionPending, startActionTransition] = useTransition()
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameType, setRenameType] = useState<"document" | "folder">("document")
  const [renameId, setRenameId] = useState<string>("")
  const [renamePath, setRenamePath] = useState<string>("")
  const [renameCurrentName, setRenameCurrentName] = useState<string>("")
  const [renameNewName, setRenameNewName] = useState<string>("")
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

    const nonRootCollisions = collisions.filter((collision) => collision.id !== ROOT_DROPPABLE_ID)
    return nonRootCollisions.length ? nonRootCollisions : collisions
  }, [])
  const [activeDragItem, setActiveDragItem] = useState<{ label: string } | null>(null)

  const updateSortOrder = useCallback(async (id: string, type: "document" | "folder", sortOrder: number) => {
    try {
      const response = await fetch("/api/markdown", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type, sortOrder }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to save order")
      }
    } catch (error) {
      console.error("Failed to update sort order", error)
      toast.error(error instanceof Error ? error.message : "Failed to save order")
    }
  }, [])
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

  const loadDocuments = useCallback(
    async ({
      signal,
      silent = false,
    }: {
      signal?: AbortSignal
      silent?: boolean
    } = {}) => {
      if (signal?.aborted) {
        return null
      }

      if (!silent) {
        setIsLoadingFiles(true)
      }
      setFilesError(null)

      try {
        const response = await fetch("/api/markdown", signal ? { signal } : undefined)
        if (!response.ok) {
          throw new Error("Unable to load markdown files")
        }
        const data = await response.json()
        const dataset = Array.isArray(data.documents)
          ? data.documents
          : Array.isArray(data.files)
            ? data.files
            : []

        const parsedDocuments = dataset.filter(
          (doc: Partial<MarkdownDocument>): doc is MarkdownDocument => {
            return (
              typeof doc?.id === "string" &&
              typeof doc?.slug === "string" &&
              typeof doc?.documentPath === "string" &&
              typeof doc?.title === "string"
            )
          }
        )

        const rawFolders = Array.isArray(data.folders) ? data.folders : []
        const parsedFolders = rawFolders.filter(
          (folder: Partial<MarkdownFolder>): folder is MarkdownFolder => {
            return (
              typeof folder?.id === "string" &&
              typeof folder?.folderPath === "string" &&
              typeof folder?.createdAt === "string" &&
              typeof folder?.updatedAt === "string"
            )
          }
        )

        if (signal?.aborted) {
          return null
        }

        setDocuments(parsedDocuments)
        setFolders(parsedFolders)

        return { documents: parsedDocuments, folders: parsedFolders }
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError" || signal?.aborted) {
          return null
        }
        console.error(error)
        setFilesError(error instanceof Error ? error.message : "Something went wrong")
        return null
      } finally {
        if (!signal?.aborted && !silent) {
          setIsLoadingFiles(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadDocuments({ signal: controller.signal })
    return () => controller.abort()
    // NOTE: dependency on pathname causes refetch/flicker; replace with cached data later.
  }, [pathname, loadDocuments])

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
      const encodedPath = slug
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
      router.push(`/documents/${encodedPath}`)
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

  useEffect(() => {
    if (!selectedSlug || !treeElements.length) return

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

    const parentFolders = findParentFolders(treeElements, selectedSlug)
    if (parentFolders && parentFolders.length > 0) {
      setOpenFolders((prev) => {
        const next = new Set(prev)
        parentFolders.forEach((folderId) => next.add(folderId))
        return next
      })
    }
  }, [selectedSlug, treeElements])

  const createDocumentInPath = useCallback(
    async (folderPath?: string) => {
      const payload: Record<string, unknown> = { title: "untititled" }
      if (folderPath) {
        payload.folderPath = folderPath
      }

      const response = await fetch("/api/markdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to create document")
      }

      const data = await response.json()
      const document = data.document as {
        id?: string
        slug?: string
        documentPath?: string
        title?: string
      } | null

      if (!document?.id || !document.documentPath) {
        throw new Error("Missing document payload")
      }

      const refreshResult = await loadDocuments({ silent: true })
      const docPath = document.documentPath
      openFolderPath(docPath.split("/").slice(0, -1).join("/"))

      const slug = document.slug ?? document.id
      if (slug) {
        navigateToSlug(slug)
      }

      const label = document.title ?? slug ?? "document"
      toast.success(`Created ${label}`)

      return refreshResult
    },
    [loadDocuments, navigateToSlug, openFolderPath]
  )

  const createFolderInPath = useCallback(
    async (parentPath?: string) => {
      const baseName = "untitled-folder"
      const targetPath =
        parentPath && parentPath.length > 0 ? `${parentPath}/${baseName}` : baseName

      const response = await fetch("/api/markdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "folder",
          folderPath: targetPath,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to create folder")
      }

      const data = await response.json()
      const folder = data.folder as { folderPath?: string } | null
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
      const response = await fetch("/api/markdown", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: documentId }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to delete document")
      }

      const data = await response.json()
      const document = data.document as { slug?: string; title?: string } | null

      await loadDocuments({ silent: true })

      const deletedSlug = document?.slug ?? slug
      if (deletedSlug && deletedSlug === selectedSlug) {
        router.replace("/documents")
      }

      const label = document?.title ?? "Document"
      toast.success(`${label} deleted`)
    },
    [loadDocuments, router, selectedSlug]
  )

  const deleteFolderAtPath = useCallback(
    async (folderPath: string) => {
      const response = await fetch("/api/markdown", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "folder", folderPath }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to delete folder")
      }

      const result = await loadDocuments({ silent: true })
      closeFolderPath(folderPath)

      if (
        selectedSlug &&
        result &&
        !result.documents.some((doc: MarkdownDocument) => doc.slug === selectedSlug)
      ) {
        router.replace("/documents")
      }

      const folderName = folderPath.split("/").pop() ?? folderPath
      toast.success(`Deleted folder "${folderName}"`)
    },
    [loadDocuments, closeFolderPath, selectedSlug, router]
  )

  const moveDocumentToFolder = useCallback(
    async (documentId: string, targetFolderPath?: string, label?: string, sortOrder?: number) => {
      const response = await fetch("/api/markdown", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: documentId,
          targetFolderPath: targetFolderPath ?? null,
          sortOrder,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to move document")
      }

      const data = await response.json()
      const document = data.document as { documentPath?: string; title?: string } | null

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
      setActiveDragItem({ label: data.label ?? "Document" })
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragItem(null)

      const { active, over } = event
      if (!over) return

      const activeData = active.data.current
      const overData = over.data.current

      if (!activeData || !overData) return

      // Helper to find parent and siblings
      const findContext = (elements: SidebarTreeElement[], targetId: string): { parent: SidebarTreeElement | null, siblings: SidebarTreeElement[] } | null => {
        for (const el of elements) {
          if (el.id === targetId) {
            return { parent: null, siblings: elements }
          }
          if (el.children) {
            const found = el.children.find(c => c.id === targetId)
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

      // Calculate drop position relative to over element
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

      // 1. Handle Reordering / Moving
      // Check if both items have sortOrder (implies they are sortable items in the tree)
      if (typeof activeData.sortOrder === "number" && typeof overData.sortOrder === "number") {
        const activeId = active.id as string
        const overId = over.id as string

        if (activeId !== overId) {
          const activeContext = findContext(treeElements, activeId)
          const overContext = findContext(treeElements, overId)

          if (activeContext && overContext) {
            const isOverFolder = overData.type === "folder"

            // Check for "Move Into Folder" (Middle Zone)
            if (isOverFolder && isMiddleZone) {
              // handled below
            } else {
              // Reordering (Same list) OR Moving to specific position (Cross list)

              const siblings = overContext.siblings
              const overIndex = siblings.findIndex((x) => x.id === overId)

              if (overIndex !== -1) {
                if (activeContext.siblings === overContext.siblings) {
                  // Same list reorder: reindex the full list to guarantee stable ordering
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
                  // Cross list move & insert
                  // Determine insertion index
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
                    const nextSortOrder = assignments.get(activeId) ?? (targetItems.length * 1000)

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

      // 2. Handle Move to Folder (Move Into)
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
    setActiveDragItem(null)
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
          const response = await fetch("/api/markdown", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "folder",
              folderPath: renamePath,
              newName: renameNewName.trim(),
            }),
          })

          if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            throw new Error(body.error ?? "Failed to rename folder")
          }

          await loadDocuments({ silent: true })
          const folderName = renameNewName.trim()
          toast.success(`Renamed folder to "${folderName}"`)
        } else {
          const response = await fetch("/api/markdown", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: renameId,
              title: renameNewName.trim(),
            }),
          })

          if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            throw new Error(body.error ?? "Failed to rename document")
          }

          const data = await response.json()
          const document = data.document as { slug?: string; title?: string } | null

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

  return (
    <>
      <Sidebar>
        <SidebarHeader className="">
          <SidebarLogo />
        </SidebarHeader>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="w-full justify-start"
                  onClick={handleCreateDocument}
                  disabled={isActionPending}
                >
                  <FileIcon className="size-4" />
                  <span>New Document</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/terminal">
                  <SidebarMenuButton className="w-full justify-start">
                    <Terminal className="size-4" />
                    <span>Terminal</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


        <SidebarContent className="flex flex-col">
          <SidebarGroup>
            <SidebarGroupLabel>Documents</SidebarGroupLabel>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarGroupAction title="Add Document or Folder">
                  <Ellipsis className="size-4 text-muted-foreground" />
                  <span className="sr-only">Add Document or Folder</span>
                </SidebarGroupAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                  onClick={handleCreateDocument}
                  disabled={isActionPending}
                >
                  <FileIcon className="mr-2 h-4 w-4" />
                  <span>Add Document</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleCreateFolder}
                  disabled={isActionPending}
                >
                  <FolderIcon className="mr-2 h-4 w-4" />
                  <span>Add Folder</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SidebarGroupContent>
              {isLoadingFiles && (
                <SidebarMenu>
                  <SidebarMenuButton>
                    <Spinner className="size-4" />
                    <span className="text-xs text-muted-foreground">Loading files…</span>
                  </SidebarMenuButton>
                </SidebarMenu>
              )}
              {filesError && !isLoadingFiles && (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <p className="text-xs text-destructive">{filesError}</p>
                  </SidebarMenuItem>
                </SidebarMenu>
              )}
              {!isLoadingFiles && !filesError && treeElements.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={collisionDetection}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={handleDragCancel}
                >
                  <RootDropZone>
                    <SidebarMenu>
                      <SidebarTreeNodes
                        elements={treeElements}
                        options={{
                          onSelect: navigateToSlug,
                          selectedSlug,
                          openFolders,
                          onToggleFolder: toggleFolder,
                          isActionPending,
                          onCreateDocument: triggerCreateDocument,
                          onCreateFolder: triggerCreateFolder,
                          onDeleteFolder: triggerDeleteFolder,
                          onDeleteDocument: triggerDeleteDocument,
                          onRenameFolder: handleRenameFolder,
                          onRenameDocument: handleRenameDocument,
                        }}
                      />
                    </SidebarMenu>
                  </RootDropZone>
                  <DragOverlay>
                    {activeDragItem ? (
                      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm ring-1 ring-foreground">
                        <FileIcon className="size-4 text-muted-foreground" />
                        <span>{activeDragItem.label}</span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
            </SidebarGroupContent>
          </SidebarGroup>

        </SidebarContent>
        <SidebarFooter className="">
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rename {renameType === "folder" ? "Folder" : "Document"}
            </DialogTitle>
            <DialogDescription>
              Enter a new name for {renameType === "folder" ? "the folder" : "the document"}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameSubmit()
                } else if (e.key === "Escape") {
                  setRenameDialogOpen(false)
                }
              }}
              placeholder={`Enter ${renameType === "folder" ? "folder" : "document"} name`}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              disabled={isActionPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={isActionPending || !renameNewName.trim() || renameNewName.trim() === renameCurrentName}
            >
              {isActionPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
