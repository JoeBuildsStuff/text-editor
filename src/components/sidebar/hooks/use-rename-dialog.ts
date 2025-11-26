import { useCallback, useReducer } from 'react'
import {
  initialRenameDialogState,
  renameDialogReducer,
  type RenameDialogState,
} from './rename-dialog-reducer'

export type UseRenameDialogReturn = {
  state: RenameDialogState
  openForDocument: (documentId: string, currentName: string) => void
  openForFolder: (folderPath: string, currentName: string) => void
  updateNewName: (newName: string) => void
  close: () => void
  isOpen: boolean
  canSubmit: boolean
}

export function useRenameDialog(): UseRenameDialogReturn {
  const [state, dispatch] = useReducer(renameDialogReducer, initialRenameDialogState)

  const openForDocument = useCallback((documentId: string, currentName: string) => {
    dispatch({ type: 'OPEN_FOR_DOCUMENT', documentId, currentName })
  }, [])

  const openForFolder = useCallback((folderPath: string, currentName: string) => {
    dispatch({ type: 'OPEN_FOR_FOLDER', folderPath, currentName })
  }, [])

  const updateNewName = useCallback((newName: string) => {
    dispatch({ type: 'UPDATE_NEW_NAME', newName })
  }, [])

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE' })
  }, [])

  const isOpen = state.status === 'open'
  const canSubmit =
    state.status === 'open' &&
    state.newName.trim().length > 0 &&
    state.newName.trim() !== state.currentName

  return {
    state,
    openForDocument,
    openForFolder,
    updateNewName,
    close,
    isOpen,
    canSubmit,
  }
}

