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
  slug: string
  content?: string
}

const DOCUMENTS_ROOT_ID = "documents-root"

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

  const treeElements = useMemo<TreeViewElement[]>(() => {
    if (!markdownFiles.length) {
      return []
    }

    return [
      {
        id: DOCUMENTS_ROOT_ID,
        name: "documents",
        isSelectable: false,
        children: markdownFiles.map((file) => ({
          id: file.slug,
          name: file.filename,
          isSelectable: true,
        })),
      },
    ]
  }, [markdownFiles])

  const selectedSlug = pathname.startsWith("/documents/")
    ? pathname.split("/")[2]
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
                  elements={treeElements}
                  initialExpandedItems={[DOCUMENTS_ROOT_ID]}
                  initialSelectedId={selectedSlug}
                >
                  <Folder
                    value={DOCUMENTS_ROOT_ID}
                    element="documents"
                    isSelectable={true}
                  >
                    {markdownFiles.map((file) => (
                      <TreeFile
                        key={file.slug}
                        value={file.slug}
                        handleSelect={(id) => router.push(`/documents/${id}`)}
                        isSelect={selectedSlug === file.slug}
                      >
                        <span>{file.filename}</span>
                      </TreeFile>
                    ))}
                  </Folder>
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
