"use client"

// TODO: The tree flickers because we refetch documents on every route change.
//       Revisit this once we have a shared cache (see README).
import { useEffect, useMemo, useState, useTransition } from "react"

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
import { ChevronRight, Ellipsis, File as FileIcon, FilePlus, Folder as FolderIcon, FolderOpenIcon, FolderPlus } from "lucide-react"
import { SidebarLogo } from "@/components/app-sidebar-logo"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"

import { type TreeViewElement } from "@/components/ui/file-tree"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const MARKDOWN_EXTENSION = /\.md$/i

type MarkdownDocument = {
  id: string
  title: string
  documentPath: string
  slug: string
}

const DOCUMENTS_ROOT_ID = "documents-root"

type SidebarTreeElement = TreeViewElement & {
  children?: SidebarTreeElement[]
}

function buildDocumentsTree(files: MarkdownDocument[]): SidebarTreeElement[] {
  if (!files.length) return []

  const root: SidebarTreeElement = {
    id: DOCUMENTS_ROOT_ID,
    name: "documents",
    // Hidden root used purely for building nested structure
    isSelectable: false,
    children: [],
  }

  files.forEach((file) => {
    const segments = file.documentPath.split("/")
    const filename = segments.pop()
    if (!filename) return

    let currentNode = root
    const pathAccumulator: string[] = []

    segments.forEach((segment) => {
      pathAccumulator.push(segment)
      const folderId = `${DOCUMENTS_ROOT_ID}/${pathAccumulator.join("/")}`
      currentNode.children = currentNode.children ?? []
      let folderNode = currentNode.children.find((child) => child.id === folderId)
      if (!folderNode) {
        folderNode = {
          id: folderId,
          name: segment,
          // Must Remain true so that we can select the node
          isSelectable: true,
          children: [],
        }
        currentNode.children.push(folderNode)
      }
      currentNode = folderNode
    })

    currentNode.children = currentNode.children ?? []
    const displayName = file.title?.trim().length ? file.title : filename.replace(MARKDOWN_EXTENSION, "")

    currentNode.children.push({
      id: file.slug,
      name: displayName,
      isSelectable: true,
    })
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
    isNested?: boolean
  }
) {
  return elements.map((element) => {
    if (element.children?.length) {
      // This is a folder
      const isOpen = options.openFolders.has(element.id)
      return (
        <Collapsible
          key={element.id}
          open={isOpen}
          onOpenChange={() => options.onToggleFolder(element.id)}
          className="group/collapsible"
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton className={cn(options.isNested && "mr-0!")}>
                {isOpen ? (
                  <FolderOpenIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                ) : (
                  <FolderIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                )}
                <span className="font-normal">{element.name}</span>
                <ChevronRight className={cn(
                  "ml-auto transition-transform w-3.5 h-3.5 text-muted-foreground",
                  isOpen && "rotate-90"
                )} />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub className="mr-0! pr-0!">
                <SidebarMenuSubItem>
                  {renderCollapsibleTree(element.children, { ...options, isNested: true })}
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      )
    }

    // This is a file
    const isSelected = options.selectedSlug === element.id
    const fileButton = (
      <SidebarMenuButton
        key={element.id}
        onClick={() => options.onSelect(element.id)}
        className={cn(
          "w-full justify-start",
          options.isNested && "mr-0!",
          isSelected
            ? "bg-muted/50 hover:bg-muted font-semibold"
            : "hover:bg-muted"
        )}
      >
        <FileIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
        <span className="font-normal">{element.name}</span>
      </SidebarMenuButton>
    )

    // If nested inside a folder, return just the button (it's already inside SidebarMenuSubItem)
    // If at root level, wrap in SidebarMenuItem
    if (options.isNested) {
      return fileButton
    }

    return (
      <SidebarMenuItem key={element.id}>
        {fileButton}
      </SidebarMenuItem>
    )
  })
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [documents, setDocuments] = useState<MarkdownDocument[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(true)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, startCreateTransition] = useTransition()
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    const controller = new AbortController()
    const fetchFiles = async () => {
      try {
        setIsLoadingFiles(true)
        setFilesError(null)
        const response = await fetch("/api/markdown", { signal: controller.signal })
        if (!response.ok) {
          throw new Error("Unable to load markdown files")
        }
        const data = await response.json()
        const dataset = Array.isArray(data.documents)
          ? data.documents
          : Array.isArray(data.files)
            ? data.files
            : []

        const parsedDocuments = dataset.filter((doc: Partial<MarkdownDocument>): doc is MarkdownDocument => {
          return (
            typeof doc?.id === "string" &&
            typeof doc?.slug === "string" &&
            typeof doc?.documentPath === "string" &&
            typeof doc?.title === "string"
          )
        })

        setDocuments(parsedDocuments)
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return
        }
        console.error(error)
        setFilesError(error instanceof Error ? error.message : "Something went wrong")
      } finally {
        setIsLoadingFiles(false)
      }
    }

    fetchFiles()
    return () => controller.abort()
    // NOTE: dependency on pathname causes refetch/flicker; replace with cached data later.
  }, [pathname])

  const treeElements = useMemo(() => buildDocumentsTree(documents), [documents])

  const selectedSlug = useMemo(() => {
    if (!pathname.startsWith("/documents")) return undefined
    const segments = pathname.split("/").slice(2).filter(Boolean)
    if (!segments.length) return undefined
    return segments.map((segment) => decodeURIComponent(segment)).join("/")
  }, [pathname])

  const navigateToSlug = (slug: string) => {
    const encodedPath = slug
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
    router.push(`/documents/${encodedPath}`)
  }

  const toggleFolder = (folderId: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  // Auto-expand folders that contain the selected document
  useEffect(() => {
    if (!selectedSlug || !treeElements.length) return

    const findParentFolders = (
      elements: SidebarTreeElement[],
      targetSlug: string,
      parentPath: string[] = []
    ): string[] | null => {
      for (const element of elements) {
        if (element.id === targetSlug) {
          // Found the target, return all parent folder IDs
          return parentPath
        }
        if (element.children?.length) {
          // This is a folder, add it to the path and search children
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

  const navigationItems = [
    {
      label: "New document",
      href: "/documents",
      icon: FileIcon,
    },
  ]

  const handleCreateDocument = () => {
    if (isCreating) return

    startCreateTransition(async () => {
      try {
        setCreateError(null)
        const response = await fetch("/api/markdown", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: "untititled" }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error ?? "Failed to create document")
        }

        const data = await response.json()
        const document = data.document
        if (!document) {
          throw new Error("Missing document payload")
        }

        const slug = document.slug ?? document.id
        if (!slug) {
          throw new Error("Missing document identifier")
        }

        navigateToSlug(slug)
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : "Unable to create document")
      }
    })
  }

  const handleCreateFolder = () => {
    if (isCreatingFolder || isCreating) return

    setIsCreatingFolder(true)
    startCreateTransition(async () => {
      try {
        setCreateError(null)
        // Create a folder by creating a document inside a new folder
        // The folder name will be sanitized and made unique if needed
        const folderName = "untitled-folder"
        const response = await fetch("/api/markdown", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            title: "untititled",
            folderPath: folderName
          }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error ?? "Failed to create folder")
        }

        const data = await response.json()
        const document = data.document
        if (!document) {
          throw new Error("Missing document payload")
        }

        // Extract folder path from document path
        const folderPath = document.documentPath.split("/").slice(0, -1).join("/")
        if (folderPath) {
          // Open the folder in the sidebar
          const folderId = `${DOCUMENTS_ROOT_ID}/${folderPath}`
          setOpenFolders((prev) => new Set(prev).add(folderId))
        }

        // Navigate to the new document
        const slug = document.slug ?? document.id
        if (slug) {
          navigateToSlug(slug)
        }
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : "Unable to create folder")
      } finally {
        setIsCreatingFolder(false)
      }
    })
  }

  return (
    <>
      <Sidebar>
        <SidebarHeader className="">
          <SidebarLogo />
        </SidebarHeader>


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
                  disabled={isCreating || isCreatingFolder}
                >
                  <FilePlus className="mr-2 h-4 w-4" />
                  <span>Add Document</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleCreateFolder}
                  disabled={isCreating || isCreatingFolder}
                >
                  <FolderPlus className="mr-2 h-4 w-4" />
                  <span>Add Folder</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SidebarGroupContent>
              {isLoadingFiles && <p className="text-xs text-muted-foreground">Loading files…</p>}
              {filesError && !isLoadingFiles && (
                <p className="text-xs text-destructive">{filesError}</p>
              )}
              {!isLoadingFiles && !filesError && treeElements.length > 0 && (
                <SidebarMenu>
                  {renderCollapsibleTree(treeElements, {
                    onSelect: navigateToSlug,
                    selectedSlug,
                    openFolders,
                    onToggleFolder: toggleFolder,
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
