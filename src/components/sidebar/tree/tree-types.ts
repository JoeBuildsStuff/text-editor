import type { TreeViewElement } from "@/components/ui/file-tree"

export const DOCUMENTS_ROOT_ID = "documents-root"
export const SIDEBAR_TREE_ROOT_DROPPABLE_ID = `${DOCUMENTS_ROOT_ID}-root` as const

export type MarkdownDocument = {
  id: string
  title: string
  documentPath: string
  slug: string
  sortOrder?: number
}

export type MarkdownFolder = {
  id: string
  folderPath: string
  createdAt: string
  updatedAt: string
  sortOrder?: number
}

export interface SidebarTreeElement extends TreeViewElement {
  children?: SidebarTreeElement[]
  kind: "folder" | "document"
  folderPath?: string
  documentId?: string
  documentPath?: string
  sortOrder?: number
}
