import { useCallback, useReducer } from "react"

import { DEFAULT_DOCUMENT_TITLE } from "@/components/sidebar/constants"
import type { ItemIconColorId } from "@/lib/icon-colors"

export type CreateDocumentDialogState =
  | { status: "closed" }
  | {
      status: "open"
      folderPath?: string | undefined
      name: string
      iconColor: ItemIconColorId | null
    }

type CreateDocumentDialogAction =
  | { type: "OPEN"; folderPath?: string | undefined }
  | { type: "CLOSE" }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_ICON_COLOR"; iconColor: ItemIconColorId | null }

const initialState: CreateDocumentDialogState = { status: "closed" }

function createDocumentDialogReducer(
  state: CreateDocumentDialogState,
  action: CreateDocumentDialogAction
): CreateDocumentDialogState {
  switch (action.type) {
    case "OPEN":
      return {
        status: "open",
        folderPath: action.folderPath,
        name: DEFAULT_DOCUMENT_TITLE,
        iconColor: null,
      }
    case "CLOSE":
      return { status: "closed" }
    case "SET_NAME":
      if (state.status !== "open") return state
      return { ...state, name: action.name }
    case "SET_ICON_COLOR":
      if (state.status !== "open") return state
      return { ...state, iconColor: action.iconColor }
    default:
      return state
  }
}

export type UseCreateDocumentDialogReturn = {
  state: CreateDocumentDialogState
  open: (folderPath?: string | undefined) => void
  close: () => void
  setName: (name: string) => void
  setIconColor: (iconColor: ItemIconColorId | null) => void
  canSubmit: boolean
}

export function useCreateDocumentDialog(): UseCreateDocumentDialogReturn {
  const [state, dispatch] = useReducer(createDocumentDialogReducer, initialState)

  const open = useCallback((folderPath?: string) => {
    dispatch({ type: "OPEN", folderPath })
  }, [])

  const close = useCallback(() => {
    dispatch({ type: "CLOSE" })
  }, [])

  const setName = useCallback((name: string) => {
    dispatch({ type: "SET_NAME", name })
  }, [])

  const setIconColor = useCallback((iconColor: ItemIconColorId | null) => {
    dispatch({ type: "SET_ICON_COLOR", iconColor })
  }, [])

  const canSubmit = state.status === "open" && state.name.trim().length > 0

  return {
    state,
    open,
    close,
    setName,
    setIconColor,
    canSubmit,
  }
}
