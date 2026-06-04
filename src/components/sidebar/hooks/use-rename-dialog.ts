import { useCallback, useReducer } from "react"

import type { ItemIconColorId } from "@/lib/icon-colors"
import {
  documentRenameHasChanges,
  folderRenameHasChanges,
  initialRenameDialogState,
  renameDialogReducer,
  type RenameDialogState,
} from "./rename-dialog-reducer"

export type OpenFolderRenameOptions = {
  iconColor?: string | null | undefined
  description?: string | null | undefined
}

export type UseRenameDialogReturn = {
  state: RenameDialogState
  openForDocument: (
    documentId: string,
    currentName: string,
    options?: OpenFolderRenameOptions
  ) => void
  openForFolder: (folderPath: string, currentName: string, options?: OpenFolderRenameOptions) => void
  updateNewName: (newName: string) => void
  updateIconColor: (iconColor: ItemIconColorId | null) => void
  updateDescription: (description: string) => void
  close: () => void
  isOpen: boolean
  canSubmit: boolean
}

export function useRenameDialog(): UseRenameDialogReturn {
  const [state, dispatch] = useReducer(renameDialogReducer, initialRenameDialogState)

  const openForDocument = useCallback(
    (documentId: string, currentName: string, options?: OpenFolderRenameOptions) => {
      dispatch({ type: "OPEN_FOR_DOCUMENT", documentId, currentName, iconColor: options?.iconColor })
    },
    []
  )

  const openForFolder = useCallback(
    (folderPath: string, currentName: string, options?: OpenFolderRenameOptions) => {
      dispatch({
        type: "OPEN_FOR_FOLDER",
        folderPath,
        currentName,
        iconColor: options?.iconColor,
        description: options?.description,
      })
    },
    []
  )

  const updateNewName = useCallback((newName: string) => {
    dispatch({ type: "UPDATE_NEW_NAME", newName })
  }, [])

  const updateIconColor = useCallback((iconColor: ItemIconColorId | null) => {
    dispatch({ type: "UPDATE_ICON_COLOR", iconColor })
  }, [])

  const updateDescription = useCallback((description: string) => {
    dispatch({ type: "UPDATE_DESCRIPTION", description })
  }, [])

  const close = useCallback(() => {
    dispatch({ type: "CLOSE" })
  }, [])

  const isOpen = state.status === "open"
  const canSubmit =
    state.status === "open" &&
    (state.entityType === "document" ? documentRenameHasChanges(state) : folderRenameHasChanges(state))

  return {
    state,
    openForDocument,
    openForFolder,
    updateNewName,
    updateIconColor,
    updateDescription,
    close,
    isOpen,
    canSubmit,
  }
}
