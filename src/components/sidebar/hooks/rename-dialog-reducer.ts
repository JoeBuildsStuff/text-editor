export type RenameDialogState =
  | { status: 'closed' }
  | {
      status: 'open'
      entityType: 'document'
      documentId: string
      currentName: string
      newName: string
    }
  | {
      status: 'open'
      entityType: 'folder'
      folderPath: string
      currentName: string
      newName: string
    }

export type RenameDialogAction =
  | { type: 'OPEN_FOR_DOCUMENT'; documentId: string; currentName: string }
  | { type: 'OPEN_FOR_FOLDER'; folderPath: string; currentName: string }
  | { type: 'UPDATE_NEW_NAME'; newName: string }
  | { type: 'CLOSE' }

export const initialRenameDialogState: RenameDialogState = { status: 'closed' }

export function renameDialogReducer(
  state: RenameDialogState,
  action: RenameDialogAction
): RenameDialogState {
  switch (action.type) {
    case 'OPEN_FOR_DOCUMENT':
      return {
        status: 'open',
        entityType: 'document',
        documentId: action.documentId,
        currentName: action.currentName,
        newName: action.currentName,
      }

    case 'OPEN_FOR_FOLDER':
      return {
        status: 'open',
        entityType: 'folder',
        folderPath: action.folderPath,
        currentName: action.currentName,
        newName: action.currentName,
      }

    case 'UPDATE_NEW_NAME':
      if (state.status === 'closed') return state
      return { ...state, newName: action.newName }

    case 'CLOSE':
      return { status: 'closed' }

    default:
      return state
  }
}

