"use client"

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
import { File as FileIcon, Folder as FolderIcon, Terminal } from "lucide-react"
import Link from "next/link"
import Spinner from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/auth/user-menu"
import { SidebarLogo } from "@/components/sidebar/app-sidebar-logo"
import { SidebarTree } from "@/components/sidebar/tree/sidebar-tree"
import { RenameDialog } from "@/components/sidebar/rename-dialog"
import { useMarkdownExplorer } from "@/components/sidebar/hooks/use-markdown-explorer"

export function AppSidebar() {
  const {
    isLoadingFiles,
    filesError,
    isActionPending,
    hasTreeData,
    treeProps,
    createDocument,
    createFolder,
    renameDialogProps,
  } = useMarkdownExplorer()

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarLogo />
        </SidebarHeader>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="w-full justify-start"
                  onClick={createDocument}
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
            <div className="flex items-center gap-1 px-2 pb-2">
              <SidebarGroupLabel className="flex-1 px-0">
                Documents
              </SidebarGroupLabel>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={createDocument}
                  disabled={isActionPending}
                  className="text-muted-foreground h-6 w-6 p-0.5"
                  title="Add Document"
                  aria-label="Add Document"
                >
                  <FileIcon className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={createFolder}
                  disabled={isActionPending}
                  className="text-muted-foreground h-6 w-6 p-0.5"
                  title="Add Folder"
                  aria-label="Add Folder"
                >
                  <FolderIcon className="size-3.5" />
                </Button>
              </div>
            </div>
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
              {!isLoadingFiles && !filesError && hasTreeData && (
                <SidebarTree {...treeProps} />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      <RenameDialog {...renameDialogProps} />
    </>
  )
}
