import type { SidebarTreeElement, DragData, FolderDragData } from "@/components/sidebar/tree/tree-types"

export type ReorderSameParentScenario = {
  type: "reorder-same-parent"
  activeId: string
  overId: string
  itemType: DragData["type"]
  activeData: DragData
  siblings: SidebarTreeElement[]
  oldIndex: number
  newIndex: number
}

export type MoveToDifferentParentScenario = {
  type: "move-to-different-parent"
  activeId: string
  activeData: DragData
  targetParentPath: string | undefined
  insertionIndex: number
  targetSiblings: SidebarTreeElement[]
}

export type DropIntoFolderMiddleScenario = {
  type: "drop-into-folder-middle"
  activeData: DragData
  targetFolderPath: string
  targetFolderChildren: SidebarTreeElement[]
}

export type DropIntoRootScenario = {
  type: "drop-into-root"
  activeData: DragData
  rootChildren: SidebarTreeElement[]
}

export type DropScenario =
  | ReorderSameParentScenario
  | MoveToDifferentParentScenario
  | DropIntoFolderMiddleScenario
  | DropIntoRootScenario
  | { type: "no-op"; reason: string }

export type FolderMoveScenario = DropIntoFolderMiddleScenario & {
  activeData: FolderDragData
}
