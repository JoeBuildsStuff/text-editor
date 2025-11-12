"use client"

// TODO: The tree flickers because we refetch documents on every route change.
//       Revisit this once we have a shared cache (see README).
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"

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

  FolderPlus as FolderPlusIcon,
  FilePlus as FilePlusIcon,
  FolderX,
  Trash2,
  Terminal,
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

const MARKDOWN_EXTENSION = /\.md$/i

type MarkdownDocument = {
  id: string
  title: string
  documentPath: string
  slug: string
}

type MarkdownFolder = {
  id: string
  folderPath: string
  createdAt: string
  updatedAt: string
}

const DOCUMENTS_ROOT_ID = "documents-root"

interface SidebarTreeElement extends TreeViewElement {
  children?: SidebarTreeElement[]
  kind: "folder" | "document"
  folderPath?: string
  documentId?: string
  documentPath?: string
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
          children: [],
          kind: "folder",
          folderPath,
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
    ensureFolderNode(segments)
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
    }

    children.push(documentNode)
  })

  return root.children ?? []
}

function renderCollapsibleTree(
  elements: SidebarTreeElement[],
  options: {
    onSelect: (slug: string) => void
    selectedSlug?: string
    openFolders: Set<string>
    onToggleFolder: (folderId: string) => void
    isActionPending: boolean
    onCreateDocument: (folderPath?: string) => void
    onCreateFolder: (folderPath?: string) => void
    onDeleteFolder: (folderPath: string) => void
    onDeleteDocument: (documentId: string, slug?: string) => void
    isNested?: boolean
  }
) {
  return elements.map((element) => {
    if (element.kind === "folder") {
      const isOpen = options.openFolders.has(element.id)
      const folderPath =
        element.folderPath && element.folderPath.length > 0 ? element.folderPath : undefined

      return (
        <ContextMenu key={element.id}>
          <Collapsible
            open={isOpen}
            onOpenChange={() => options.onToggleFolder(element.id)}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <ContextMenuTrigger asChild>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className={cn(options.isNested && "mr-0!")}>
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
                    {renderCollapsibleTree(element.children ?? [], { ...options, isNested: true })}
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
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

    const isSelected = options.selectedSlug === element.id
    const fileButton = (
      <SidebarMenuButton
        onClick={() => options.onSelect(element.id)}
        className={cn(
          "w-full justify-start",
          options.isNested && "mr-0!",
          isSelected ? "bg-muted/50 hover:bg-muted font-semibold" : "hover:bg-muted"
        )}
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

    if (options.isNested) {
      return (
        <ContextMenu key={element.id}>
          {menuContent}
        </ContextMenu>
      )
    }

    return (
      <SidebarMenuItem key={element.id}>
        <ContextMenu>{menuContent}</ContextMenu>
      </SidebarMenuItem>
    )
  })
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

  const handleCreateDocument = useCallback(() => {
    triggerCreateDocument()
  }, [triggerCreateDocument])

  const handleCreateFolder = useCallback(() => {
    triggerCreateFolder()
  }, [triggerCreateFolder])

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
                    <Spinner className="size-4"  />
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
                <SidebarMenu>
                  {renderCollapsibleTree(treeElements, {
                    onSelect: navigateToSlug,
                    selectedSlug,
                    openFolders,
                    onToggleFolder: toggleFolder,
                    isActionPending,
                    onCreateDocument: triggerCreateDocument,
                    onCreateFolder: triggerCreateFolder,
                    onDeleteFolder: triggerDeleteFolder,
                    onDeleteDocument: triggerDeleteDocument,
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
          
        </SidebarContent>
        <SidebarFooter className="">
          {/* footer content here */}
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
