import { useCallback } from "react"
import { toast } from "sonner"

import { computeSortOrderBetween } from "@/components/sidebar/tree/tree-utils"
import type {
  MarkdownFolder,
  SidebarTreeElement,
} from "@/components/sidebar/tree/tree-types"
import { useLatestValue } from "@/hooks/use-latest-value"
import { updateMarkdownSortOrder } from "@/components/sidebar/api/markdown-actions"

export type AssignSortOrdersResult = {
  promise: Promise<void>
}

export type AssignSortOrders = (
  items: SidebarTreeElement[],
  options?: { onlyMoveId?: string; skipIds?: Set<string> }
) => AssignSortOrdersResult

export function useTreeReorder(folders: MarkdownFolder[]) {
  const getFolders = useLatestValue(folders)

  const getFolderIdByPath = useCallback((folderPath?: string) => {
    if (!folderPath) {
      return undefined
    }
    return getFolders().find((folder) => folder.folderPath === folderPath)?.id
  }, [getFolders])

  const updateSortOrder = useCallback(
    async (id: string, type: "document" | "folder", sortOrder: number) => {
      try {
        await updateMarkdownSortOrder({ id, type, sortOrder })
      } catch (error) {
        console.error("Failed to update sort order", error)
        toast.error(error instanceof Error ? error.message : "Failed to save order")
        throw error
      }
    },
    []
  )

  const assignSortOrders = useCallback<AssignSortOrders>(
    (items, options) => {
      const assignments = new Map<string, number>()
      const pending: Promise<void>[] = []
      const skipIds = options?.skipIds

      if (options?.onlyMoveId) {
        const index = items.findIndex((item) => item.id === options.onlyMoveId)
        if (index === -1) {
          return { promise: Promise.resolve() }
        }
        const prev = index > 0 ? items[index - 1] : undefined
        const next = index < items.length - 1 ? items[index + 1] : undefined
        const nextSortOrder = computeSortOrderBetween(prev?.sortOrder, next?.sortOrder)
        assignments.set(options.onlyMoveId, nextSortOrder)

        const moved = items[index]
        const dbId =
          moved.kind === "document" ? moved.documentId : getFolderIdByPath(moved.folderPath)

        if (dbId && moved.sortOrder !== nextSortOrder && !skipIds?.has(options.onlyMoveId)) {
          pending.push(updateSortOrder(dbId, moved.kind, nextSortOrder))
        }

        return {
          promise:
            pending.length > 0
              ? Promise.allSettled(pending).then(() => undefined)
              : Promise.resolve(),
        }
      }

      items.forEach((item, index) => {
        const sortOrder = (index + 1) * 1000
        assignments.set(item.id, sortOrder)

        if (skipIds?.has(item.id)) {
          return
        }

        const dbId =
          item.kind === "document" ? item.documentId : getFolderIdByPath(item.folderPath)

        if (!dbId) {
          return
        }

        if (item.sortOrder === sortOrder) {
          return
        }

        pending.push(updateSortOrder(dbId, item.kind, sortOrder))
      })

      return {
        promise:
          pending.length > 0
            ? Promise.allSettled(pending).then(() => undefined)
            : Promise.resolve(),
      }
    },
    [getFolderIdByPath, updateSortOrder]
  )

  return {
    assignSortOrders,
  }
}
