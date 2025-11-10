"use client"

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

type MarkdownFile = {
  filename: string
  relativePath: string
  documentPath: string
  slug: string
  content?: string
}

const DOCUMENTS_ROOT_ID = "documents-root"

type SidebarTreeElement = TreeViewElement & {
  children?: SidebarTreeElement[]
}

function buildDocumentsTree(files: MarkdownFile[]): SidebarTreeElement[] {
  if (!files.length) return []

  const root: SidebarTreeElement = {
    id: DOCUMENTS_ROOT_ID,
    name: "documents",
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
          isSelectable: true,
          children: [],
        }
        currentNode.children.push(folderNode)
      }
      currentNode = folderNode
    })

    currentNode.children = currentNode.children ?? []
    currentNode.children.push({
      id: file.slug,
      name: filename,
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
  const [markdownFiles, setMarkdownFiles] = useState<MarkdownFile[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(true)
  const [filesError, setFilesError] = useState<string | null>(null)

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setIsLoadingFiles(true)
        setFilesError(null)
        const response = await fetch("/api/markdown")
        if (!response.ok) {
          throw new Error("Unable to load markdown files")
        }
        const data = await response.json()
        setMarkdownFiles(
          Array.isArray(data.files)
            ? data.files.filter((file: MarkdownFile) => Boolean(file?.slug))
            : []
        )
      } catch (error) {
        console.error(error)
        setFilesError(error instanceof Error ? error.message : "Something went wrong")
      } finally {
        setIsLoadingFiles(false)
      }
    }

    fetchFiles()
  }, [])

  const treeElements = useMemo(() => buildDocumentsTree(markdownFiles), [markdownFiles])

  const selectedSlug = pathname.startsWith("/documents/")
    ? decodeURIComponent(pathname.replace(/^\/documents\/?/, "")) || undefined
    : undefined

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
                    onSelect: (slug) => router.push(`/documents/${slug}`),
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
