import { resolveItemIconColorId, type ItemIconColorId } from "@/lib/icon-colors"

export type RenameDialogState =
  | { status: "closed" }
  | {
      status: "open"
      entityType: "document"
      documentId: string
      currentName: string
      newName: string
      currentIconColor: ItemIconColorId | null
      iconColor: ItemIconColorId | null
    }
  | {
      status: "open"
      entityType: "folder"
      folderPath: string
      currentName: string
      newName: string
      currentIconColor: ItemIconColorId | null
      iconColor: ItemIconColorId | null
      currentDescription: string
      description: string
    }

export type RenameDialogAction =
  | {
      type: "OPEN_FOR_DOCUMENT"
      documentId: string
      currentName: string
      iconColor?: string | null | undefined
    }
  | {
      type: "OPEN_FOR_FOLDER"
      folderPath: string
      currentName: string
      iconColor?: string | null | undefined
      description?: string | null | undefined
    }
  | { type: "UPDATE_NEW_NAME"; newName: string }
  | { type: "UPDATE_ICON_COLOR"; iconColor: ItemIconColorId | null }
  | { type: "UPDATE_DESCRIPTION"; description: string }
  | { type: "CLOSE" }

export const initialRenameDialogState: RenameDialogState = { status: "closed" }

function normalizeIconColor(value: string | null | undefined): ItemIconColorId | null {
  return resolveItemIconColorId(value)
}

export function renameDialogReducer(
  state: RenameDialogState,
  action: RenameDialogAction
): RenameDialogState {
  switch (action.type) {
    case "OPEN_FOR_DOCUMENT": {
      const documentIconColor = normalizeIconColor(action.iconColor)
      return {
        status: "open",
        entityType: "document",
        documentId: action.documentId,
        currentName: action.currentName,
        newName: action.currentName,
        currentIconColor: documentIconColor,
        iconColor: documentIconColor,
      }
    }

    case "OPEN_FOR_FOLDER": {
      const iconColor = normalizeIconColor(action.iconColor)
      const description = action.description?.trim() ?? ""
      return {
        status: "open",
        entityType: "folder",
        folderPath: action.folderPath,
        currentName: action.currentName,
        newName: action.currentName,
        currentIconColor: iconColor,
        iconColor,
        currentDescription: description,
        description,
      }
    }

    case "UPDATE_NEW_NAME":
      if (state.status === "closed") return state
      return { ...state, newName: action.newName }

    case "UPDATE_ICON_COLOR":
      if (state.status === "closed") return state
      return { ...state, iconColor: action.iconColor }

    case "UPDATE_DESCRIPTION":
      if (state.status === "closed" || state.entityType !== "folder") return state
      return { ...state, description: action.description }

    case "CLOSE":
      return { status: "closed" }

    default:
      return state
  }
}

export function folderRenameHasChanges(state: Extract<RenameDialogState, { entityType: "folder" }>): boolean {
  const trimmedName = state.newName.trim()
  if (!trimmedName) {
    return false
  }
  const trimmedDescription = state.description.trim()
  const currentTrimmedDescription = state.currentDescription.trim()
  return (
    trimmedName !== state.currentName ||
    state.iconColor !== state.currentIconColor ||
    trimmedDescription !== currentTrimmedDescription
  )
}

export function documentRenameHasChanges(
  state: Extract<RenameDialogState, { entityType: "document" }>
): boolean {
  const trimmedName = state.newName.trim()
  if (!trimmedName) {
    return false
  }

  return trimmedName !== state.currentName || state.iconColor !== state.currentIconColor
}
