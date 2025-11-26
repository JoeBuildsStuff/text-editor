import type { TreeViewElement } from "@/components/ui/file-tree"

// Root identifiers for the documents tree

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

export type FolderTreeElement = SidebarTreeElement & {
  kind: "folder"
  folderPath: string
  children: SidebarTreeElement[]
}

export type DocumentTreeElement = SidebarTreeElement & {
  kind: "document"
  documentId: string
  documentPath: string
}

// Typed drag data for dnd-kit
export type DocumentDragData = {
  type: "document"
  documentId: string
  slug: string
  currentFolderPath: string | undefined
  label: string
  sortOrder: number
}

export type FolderDragData = {
  type: "folder"
  folderPath: string | undefined
  label: string
  sortOrder: number
}

export type RootDroppableData = {
  type: "root"
}

export type DragData = DocumentDragData | FolderDragData
export type DroppableData = DragData | RootDroppableData

// Type guards
export function isDocumentDragData(data: unknown): data is DocumentDragData {
  if (typeof data !== "object" || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    obj.type === "document" &&
    typeof obj.documentId === "string" &&
    typeof obj.slug === "string" &&
    typeof obj.label === "string" &&
    typeof obj.sortOrder === "number"
  )
}

export function isFolderDragData(data: unknown): data is FolderDragData {
  if (typeof data !== "object" || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    obj.type === "folder" &&
    typeof obj.label === "string" &&
    typeof obj.sortOrder === "number" &&
    (obj.folderPath === undefined || typeof obj.folderPath === "string")
  )
}

export function isDragData(data: unknown): data is DragData {
  return isDocumentDragData(data) || isFolderDragData(data)
}

export function isRootDroppableData(data: unknown): data is RootDroppableData {
  if (typeof data !== "object" || data === null) return false
  return (data as Record<string, unknown>).type === "root"
}

export function isFolderElement(element: SidebarTreeElement): element is FolderTreeElement {
  return (
    element.kind === "folder" &&
    typeof element.folderPath === "string" &&
    Array.isArray(element.children)
  )
}

export function isDocumentElement(element: SidebarTreeElement): element is DocumentTreeElement {
  return (
    element.kind === "document" &&
    typeof element.documentId === "string" &&
    typeof element.documentPath === "string"
  )
}
