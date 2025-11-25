import { SIDEBAR_TREE_ROOT_DROPPABLE_ID, type SidebarTreeElement } from "./tree-types"

const FOLDER_DROPPABLE_PREFIX = "folder:" as const

export const TOP_BOUND = 0.25
export const BOTTOM_BOUND = 0.75

export function makeFolderDroppableId(folderId: string): string {
  return `${FOLDER_DROPPABLE_PREFIX}${folderId}`
}

export function isFolderDroppableId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(FOLDER_DROPPABLE_PREFIX)
}

export function parseFolderDroppableId(
  id: string | null | undefined
): { folderId: string } | null {
  if (!isFolderDroppableId(id)) return null
  return { folderId: (id as string).slice(FOLDER_DROPPABLE_PREFIX.length) }
}

export function resolveSortableId(
  overId: string | null | undefined,
  overData: unknown,
  _tree: SidebarTreeElement[]
): string | null {
  if (!overId) return null
  if (overId === SIDEBAR_TREE_ROOT_DROPPABLE_ID) return overId

  if (isFolderDroppableId(overId)) {
    const parsed = parseFolderDroppableId(overId)
    if (parsed) return parsed.folderId
  }

  return overId
}

type RectLike = DOMRect | ClientRect

export function getDropPosition(
  activeRect: RectLike | null,
  overRect: RectLike | null,
  opts?: { top: number; bottom: number }
): "top" | "middle" | "bottom" | null {
  if (!activeRect || !overRect) return null

  const top = opts?.top ?? TOP_BOUND
  const bottom = opts?.bottom ?? BOTTOM_BOUND

  const activeCenterY = activeRect.top + activeRect.height / 2
  const overTop = overRect.top
  const overHeight = overRect.height || 1
  const relativeY = (activeCenterY - overTop) / overHeight

  if (relativeY >= top && relativeY <= bottom) return "middle"
  if (relativeY < top) return "top"
  return "bottom"
}
