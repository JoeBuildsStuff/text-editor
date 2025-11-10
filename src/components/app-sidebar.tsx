"use client"

// TODO: The tree flickers because we refetch documents on every route change.
//       Revisit this once we have a shared cache (see README).
import { useEffect, useMemo, useState } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { File as FileIcon } from "lucide-react"
import { SidebarLogo } from "@/components/app-sidebar-logo"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"

import { File as TreeFile, Folder, Tree, type TreeViewElement } from "@/components/ui/file-tree"

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
    // Must Remain true so that we can expand and colapse the node
    isSelectable: true,
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

  return [root]
}

function renderTree(
  elements: SidebarTreeElement[],
  options: { onSelect: (slug: string) => void; selectedSlug?: string }
) {
  return elements.map((element) => {
    if (element.children?.length) {
      return (
        <Folder
          key={element.id}
          value={element.id}
          element={element.name}
          isSelectable={element.isSelectable}
        >
          {renderTree(element.children, options)}
        </Folder>
      )
    }

    return (
      <TreeFile
        key={element.id}
        value={element.id}
        handleSelect={options.onSelect}
        isSelect={options.selectedSlug === element.id}
      >
        <span>{element.name}</span>
      </TreeFile>
    )
  })
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [documents, setDocuments] = useState<MarkdownDocument[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(true)
  const [filesError, setFilesError] = useState<string | null>(null)

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

  const navigationItems = [
    {
      label: "New document",
      href: "/documents",
      icon: FileIcon,
    },
  ]

  return (
    <>
      <Sidebar>
        <SidebarHeader className="">
          <SidebarLogo />
        </SidebarHeader>


        <SidebarContent className="flex flex-col">
          {/* Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                      asChild
                      className={cn(
                        "w-full justify-start",
                        pathname.startsWith(item.href)
                          ? "bg-muted/50 hover:bg-muted font-semibold"
                          : "hover:bg-muted"
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                        <span className="font-normal">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Documents</SidebarGroupLabel>
            <SidebarGroupContent>
              {isLoadingFiles && <p className="text-xs text-muted-foreground">Loading files…</p>}
              {filesError && !isLoadingFiles && (
                <p className="text-xs text-destructive">{filesError}</p>
              )}
              {!isLoadingFiles && !filesError && treeElements.length === 0 && (
                <p className="text-xs text-muted-foreground">No markdown files yet</p>
              )}
              {treeElements.length > 0 && (
                <Tree
                  className=""
                  elements={treeElements as TreeViewElement[]}
                  initialExpandedItems={[DOCUMENTS_ROOT_ID]}
                  initialSelectedId={selectedSlug}
                >
                  {renderTree(treeElements, {
                    onSelect: navigateToSlug,
                    selectedSlug,
                  })}
                </Tree>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
          
        </SidebarContent>
        <SidebarFooter className="">
          {/* Footer */}
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
