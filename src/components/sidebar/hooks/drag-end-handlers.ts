import { arrayMove } from "@dnd-kit/sortable"
import { toast } from "sonner"

import {
  computeSortOrderBetween,
  type SidebarTreeElement,
} from "@/components/sidebar/tree/tree-utils"
import type {
  DropIntoFolderMiddleScenario,
  DropIntoRootScenario,
  MoveToDifferentParentScenario,
  ReorderSameParentScenario,
} from "@/components/sidebar/hooks/drag-end-types"
import type {
  DocumentDragData,
  FolderDragData,
} from "@/components/sidebar/tree/tree-types"

export type AssignSortOrdersFn = (
  items: SidebarTreeElement[],
  options?: { onlyMoveId?: string }
) => { promise: Promise<void> }

export type DocumentMoveHandler = (options: {
  documentId: string
  targetFolderPath?: string
  sortOrder?: number
  label?: string
}) => Promise<void>

export type FolderMoveHandler = (options: {
  folderPath: string
  targetFolderPath?: string
  sortOrder?: number
}) => Promise<void>

export async function handleReorderSameParent(
  scenario: ReorderSameParentScenario,
  actions: { assignSortOrders: AssignSortOrdersFn }
) {
  const reordered = arrayMove([...scenario.siblings], scenario.oldIndex, scenario.newIndex)
  const { promise } = actions.assignSortOrders(reordered, { onlyMoveId: scenario.activeId })
  await promise
}

export async function handleMoveToDifferentParent(
  scenario: MoveToDifferentParentScenario,
  actions: { moveDocument: DocumentMoveHandler; moveFolder: FolderMoveHandler }
) {
  const insertionIndex = Math.min(
    Math.max(scenario.insertionIndex, 0),
    scenario.targetSiblings.length
  )

  const placeholder = buildPlaceholderFromDragData(scenario.activeData)
  const ordered = [...scenario.targetSiblings]
  ordered.splice(insertionIndex, 0, placeholder)

  const idx = ordered.findIndex((item) => item.id === scenario.activeId)
  const prevItem = idx > 0 ? ordered[idx - 1] : undefined
  const nextItem = idx < ordered.length - 1 ? ordered[idx + 1] : undefined
  const sortOrder = computeSortOrderBetween(prevItem?.sortOrder, nextItem?.sortOrder)

  if (scenario.activeData.type === "document") {
    await actions.moveDocument({
      documentId: scenario.activeData.documentId,
      targetFolderPath: scenario.targetParentPath,
      sortOrder,
      label: scenario.activeData.label,
    })
    return
  }

  await actions.moveFolder({
    folderPath: scenario.activeData.folderPath ?? "",
    targetFolderPath: scenario.targetParentPath,
    sortOrder,
  })
}

export async function handleDropIntoFolderMiddle(
  scenario: DropIntoFolderMiddleScenario,
  actions: { moveDocument: DocumentMoveHandler; moveFolder: FolderMoveHandler }
) {
  const siblings = scenario.targetFolderChildren
  const lastSibling = siblings[siblings.length - 1]
  const sortOrder = computeSortOrderBetween(lastSibling?.sortOrder, undefined)

  if (scenario.activeData.type === "document") {
    const currentFolderPath = scenario.activeData.currentFolderPath ?? undefined
    if (currentFolderPath === scenario.targetFolderPath) {
      return
    }
    await actions.moveDocument({
      documentId: scenario.activeData.documentId,
      targetFolderPath: scenario.targetFolderPath,
      sortOrder,
      label: scenario.activeData.label,
    })
    return
  }

  const folderPath = scenario.activeData.folderPath
  if (!folderPath) {
    return
  }
  if (folderPath === scenario.targetFolderPath) {
    toast.error("Cannot move a folder into itself")
    return
  }

  await actions.moveFolder({
    folderPath,
    targetFolderPath: scenario.targetFolderPath,
    sortOrder,
  })
}

export async function handleDropIntoRoot(
  scenario: DropIntoRootScenario,
  actions: { moveDocument: DocumentMoveHandler; moveFolder: FolderMoveHandler }
) {
  const siblings = scenario.rootChildren
  const lastSibling = siblings[siblings.length - 1]
  const sortOrder = computeSortOrderBetween(lastSibling?.sortOrder, undefined)

  if (scenario.activeData.type === "document") {
    if (!scenario.activeData.currentFolderPath) {
      return
    }
    await actions.moveDocument({
      documentId: scenario.activeData.documentId,
      targetFolderPath: undefined,
      sortOrder,
      label: scenario.activeData.label,
    })
    return
  }

  const folderPath = scenario.activeData.folderPath
  if (!folderPath) {
    return
  }
  await actions.moveFolder({ folderPath, targetFolderPath: undefined, sortOrder })
}

function buildPlaceholderFromDragData(data: DragDataForPlaceholder): SidebarTreeElement {
  if (data.type === "document") {
    return {
      id: data.slug,
      name: data.label,
      isSelectable: true,
      kind: "document",
      documentId: data.documentId,
      sortOrder: data.sortOrder,
    }
  }

  return {
    id: data.folderPath ?? data.label,
    name: data.label,
    isSelectable: true,
    kind: "folder",
    folderPath: data.folderPath,
    sortOrder: data.sortOrder,
    children: [],
  }
}

type DragDataForPlaceholder = DocumentDragData | FolderDragData
