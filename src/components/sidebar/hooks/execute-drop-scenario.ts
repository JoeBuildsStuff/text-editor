import { toast } from "sonner"

import type { DropScenario } from "@/components/sidebar/hooks/drag-end-types"
import {
  handleDropIntoFolderMiddle,
  handleDropIntoRoot,
  handleMoveToDifferentParent,
  handleReorderSameParent,
  type AssignSortOrdersFn,
  type DocumentMoveHandler,
  type FolderMoveHandler,
} from "@/components/sidebar/hooks/drag-end-handlers"

export async function executeDropScenario(
  scenario: DropScenario,
  actions: {
    assignSortOrders: AssignSortOrdersFn
    moveDocument: DocumentMoveHandler
    moveFolder: FolderMoveHandler
  }
): Promise<void> {
  if (scenario.type === "no-op") {
    return
  }

  try {
    switch (scenario.type) {
      case "reorder-same-parent":
        await handleReorderSameParent(scenario, {
          assignSortOrders: actions.assignSortOrders,
        })
        break
      case "move-to-different-parent":
        await handleMoveToDifferentParent(scenario, {
          moveDocument: actions.moveDocument,
          moveFolder: actions.moveFolder,
        })
        break
      case "drop-into-folder-middle":
        await handleDropIntoFolderMiddle(scenario, {
          moveDocument: actions.moveDocument,
          moveFolder: actions.moveFolder,
        })
        break
      case "drop-into-root":
        await handleDropIntoRoot(scenario, {
          moveDocument: actions.moveDocument,
          moveFolder: actions.moveFolder,
        })
        break
      default:
        break
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return
    }
    const message = error instanceof Error ? error.message : "Failed to complete drag operation"
    toast.error(message)
    throw error
  }
}
