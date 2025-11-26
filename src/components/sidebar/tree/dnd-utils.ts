import type { DragEndEvent } from "@dnd-kit/core"
import {
  SIDEBAR_TREE_ROOT_DROPPABLE_ID,
  isDragData,
  isRootDroppableData,
  type DragData,
  type DroppableData,
  type SidebarTreeElement,
} from "./tree-types"
import {
  DND_FOLDER_BOTTOM_BOUND,
  DND_FOLDER_TOP_BOUND,
} from "@/components/sidebar/constants"

const FOLDER_DROPPABLE_PREFIX = "folder:" as const

// Keep legacy exports used elsewhere while sourcing from centralized constants
export const TOP_BOUND = DND_FOLDER_TOP_BOUND
export const BOTTOM_BOUND = DND_FOLDER_BOTTOM_BOUND

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

type RectLike = { top: number; left: number; width: number; height: number; bottom?: number }

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

export type ParsedDragEvent = {
  activeData: DragData
  overData: DroppableData
  activeRect: RectLike | null
  overRect: RectLike | null
}

export function parseDragEvent(event: DragEndEvent): ParsedDragEvent | null {
  const { active, over } = event
  if (!over) return null

  const activeData = active.data.current
  const overData = over.data.current

  if (!isDragData(activeData)) {
    console.warn("Invalid active drag data:", activeData)
    return null
  }

  if (!isDragData(overData) && !isRootDroppableData(overData)) {
    console.warn("Invalid over drag data:", overData)
    return null
  }

  return {
    activeData,
    overData,
    activeRect: (active.rect.current.translated ?? null) as RectLike | null,
    overRect: (over.rect ?? null) as RectLike | null,
  }
}
