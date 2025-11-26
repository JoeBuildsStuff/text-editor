import type { DragEndEvent } from "@dnd-kit/core"

import {
  SIDEBAR_TREE_ROOT_DROPPABLE_ID,
  type SidebarTreeElement,
} from "@/components/sidebar/tree/tree-types"
import { getDropPosition, resolveSortableId, parseDragEvent } from "@/components/sidebar/tree/dnd-utils"
import { DOCUMENT_DROP_SPLIT } from "@/components/sidebar/constants"
import { findElementById } from "@/components/sidebar/tree/tree-utils"
import type { DropScenario } from "@/components/sidebar/hooks/drag-end-types"

export function resolveDropScenario(
  event: DragEndEvent,
  treeElements: SidebarTreeElement[]
): DropScenario {
  const parsed = parseDragEvent(event)
  if (!parsed) {
    return { type: "no-op", reason: "invalid-drag-data" }
  }

  const { active, over } = event
  if (!over) {
    return { type: "no-op", reason: "no-over-target" }
  }

  const { activeData, overData, activeRect, overRect } = parsed
  const dropZone = getDropPosition(
    activeRect,
    overRect,
    overData.type === "document"
      ? { top: DOCUMENT_DROP_SPLIT, bottom: DOCUMENT_DROP_SPLIT }
      : undefined
  )

  const activeId = String(active.id)
  const resolvedOverId = resolveSortableId(over.id as string)
  const activeContext = findElementById(treeElements, activeId)

  if (!activeContext) {
    return { type: "no-op", reason: "active-context-missing" }
  }

  if (resolvedOverId === SIDEBAR_TREE_ROOT_DROPPABLE_ID) {
    return {
      type: "drop-into-root",
      activeData,
      rootChildren: treeElements,
    }
  }

  const overContext = resolvedOverId ? findElementById(treeElements, resolvedOverId) : null
  if (!overContext) {
    return { type: "no-op", reason: "over-context-missing" }
  }

  if (overContext.element.id === activeId) {
    return { type: "no-op", reason: "drop-on-self" }
  }

  const activeParentId = activeContext.parent?.id ?? SIDEBAR_TREE_ROOT_DROPPABLE_ID
  const overParentId = overContext.parent?.id ?? SIDEBAR_TREE_ROOT_DROPPABLE_ID
  const sameParent = activeParentId === overParentId

  if (sameParent) {
    const oldIndex = activeContext.index
    const newIndex = overContext.index

    if (oldIndex === newIndex) {
      return { type: "no-op", reason: "same-position" }
    }

    return {
      type: "reorder-same-parent",
      activeId,
      overId: overContext.element.id,
      itemType: activeData.type,
      activeData,
      siblings: overContext.siblings,
      oldIndex,
      newIndex,
    }
  }

  const overIsFolder = overData.type === "folder"
  const targetFolderPath = overContext.element.folderPath

  if (overIsFolder && dropZone === "middle" && targetFolderPath) {
    return {
      type: "drop-into-folder-middle",
      activeData,
      targetFolderPath,
      targetFolderChildren: overContext.element.children ?? [],
    }
  }

  const baseInsertionIndex = overContext.index
  const insertionIndex = dropZone === "top" ? baseInsertionIndex : baseInsertionIndex + 1

  return {
    type: "move-to-different-parent",
    activeId,
    activeData,
    targetParentPath: overContext.parent?.folderPath,
    insertionIndex,
    targetSiblings: overContext.siblings,
  }
}
