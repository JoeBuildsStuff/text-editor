import { useCallback, useMemo, useState } from "react"

import {
  DOCUMENTS_ROOT_ID,
  type SidebarTreeElement,
} from "@/components/sidebar/tree/tree-types"
import { findAncestorFolderIds } from "@/components/sidebar/tree/tree-utils"

export type UseFolderStateReturn = {
  openFolders: Set<string>
  toggleFolder: (folderId: string) => void
  openFolderPath: (folderPath?: string) => void
  closeFolderPath: (folderPath: string) => void
}

export function useFolderState(
  treeElements: SidebarTreeElement[],
  selectedSlug?: string
): UseFolderStateReturn {
  const [explicitOpenFolders, setExplicitOpenFolders] = useState<Set<string>>(new Set())

  const autoOpenFolders = useMemo(() => {
    if (!selectedSlug || !treeElements.length) {
      return [] as string[]
    }
    return findAncestorFolderIds(treeElements, selectedSlug)
  }, [selectedSlug, treeElements])

  const openFolders = useMemo(() => {
    if (!autoOpenFolders.length) {
      return explicitOpenFolders
    }
    const merged = new Set(explicitOpenFolders)
    autoOpenFolders.forEach((id) => merged.add(id))
    return merged
  }, [explicitOpenFolders, autoOpenFolders])

  const toggleFolder = useCallback((folderId: string) => {
    setExplicitOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const openFolderPath = useCallback((folderPath?: string) => {
    if (!folderPath) {
      return
    }
    const segments = folderPath.split("/").filter(Boolean)
    if (!segments.length) {
      return
    }
    setExplicitOpenFolders((prev) => {
      const next = new Set(prev)
      segments.forEach((_, index) => {
        const partial = segments.slice(0, index + 1).join("/")
        next.add(`${DOCUMENTS_ROOT_ID}/${partial}`)
      })
      return next
    })
  }, [])

  const closeFolderPath = useCallback((folderPath: string) => {
    setExplicitOpenFolders((prev) => {
      const targetPrefix = `${DOCUMENTS_ROOT_ID}/${folderPath}`
      const filtered = [...prev].filter(
        (id) => id !== targetPrefix && !id.startsWith(`${targetPrefix}/`)
      )
      return new Set(filtered)
    })
  }, [])

  return {
    openFolders,
    toggleFolder,
    openFolderPath,
    closeFolderPath,
  }
}
