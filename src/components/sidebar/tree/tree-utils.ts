import {
  DOCUMENTS_ROOT_ID,
  type MarkdownDocument,
  type MarkdownFolder,
  type SidebarTreeElement,
} from "./tree-types"
import {
  SORT_ORDER_DEFAULT,
  SORT_ORDER_FALLBACK_DELTA,
  SORT_ORDER_SPACING,
} from "@/components/sidebar/constants"

const MARKDOWN_EXTENSION = /\.md$/i

export function buildDocumentsPath(slug: string) {
  return `/documents/${slug
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`
}

export function sortTree(elements: SidebarTreeElement[]) {
  elements.sort((a, b) => {
    if (typeof a.sortOrder === "number" && typeof b.sortOrder === "number") {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder
      }
    }
    return a.name.localeCompare(b.name)
  })

  elements.forEach((element) => {
    if (element.children) {
      sortTree(element.children)
    }
  })

  return elements
}

export function buildDocumentsTree(
  files: MarkdownDocument[],
  folders: MarkdownFolder[]
): SidebarTreeElement[] {
  const root: SidebarTreeElement = {
    id: DOCUMENTS_ROOT_ID,
    name: "documents",
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
      const children = (currentNode.children as SidebarTreeElement[] | undefined) ?? []
      currentNode.children = children
      let folderNode = children.find((child) => child.id === folderId)
      if (!folderNode) {
        folderNode = {
          id: folderId,
          name: segment,
          isSelectable: true,
          kind: "folder",
          folderPath,
          sortOrder: 0,
        }
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
    node.sortOrder = folder.sortOrder
  })

  files.forEach((file) => {
    const segments = file.documentPath.split("/").filter(Boolean)
    const filename = segments.pop()
    if (!filename) return

    const parentNode = ensureFolderNode(segments)
    const children = (parentNode.children as SidebarTreeElement[] | undefined) ?? []
    parentNode.children = children
    const displayName = file.title?.trim().length
      ? file.title
      : filename.replace(MARKDOWN_EXTENSION, "")

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

// Compute a sort order key between two neighbors.
// - If both neighbors exist, return the midpoint.
// - If only prev exists, space forward by 1000.
// - If only next exists, space backward by halving.
// - If neither exists, default to 0.
export function computeSortOrderBetween(prev?: number, next?: number): number {
  if (typeof prev === "number" && typeof next === "number") {
    // If the gap is too small, fall back to midpoint (still), and rely on occasional resequencing upstream.
    const gap = next - prev
    if (!Number.isFinite(gap) || gap <= 0) {
      return prev + SORT_ORDER_FALLBACK_DELTA // degenerate case; caller should re-space when detected
    }
    return prev + gap / 2
  }
  if (typeof prev === "number") {
    return prev + SORT_ORDER_SPACING
  }
  if (typeof next === "number") {
    return next / 2
  }
  return SORT_ORDER_DEFAULT
}
