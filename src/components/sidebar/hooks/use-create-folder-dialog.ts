import { useCallback, useReducer } from "react"

import type { ItemIconColorId } from "@/lib/icon-colors"

export type CreateFolderDialogState =
  | { status: "closed" }
  | {
      status: "open"
      parentPath?: string | undefined
      name: string
      iconColor: ItemIconColorId | null
      description: string
    }

type CreateFolderDialogAction =
  | { type: "OPEN"; parentPath?: string | undefined }
  | { type: "CLOSE" }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_ICON_COLOR"; iconColor: ItemIconColorId | null }
  | { type: "SET_DESCRIPTION"; description: string }

const initialState: CreateFolderDialogState = { status: "closed" }

function createFolderDialogReducer(
  state: CreateFolderDialogState,
  action: CreateFolderDialogAction
): CreateFolderDialogState {
  switch (action.type) {
    case "OPEN":
      return {
        status: "open",
        parentPath: action.parentPath,
        name: "",
        iconColor: null,
        description: "",
      }
    case "CLOSE":
      return { status: "closed" }
    case "SET_NAME":
      if (state.status !== "open") return state
      return { ...state, name: action.name }
    case "SET_ICON_COLOR":
      if (state.status !== "open") return state
      return { ...state, iconColor: action.iconColor }
    case "SET_DESCRIPTION":
      if (state.status !== "open") return state
      return { ...state, description: action.description }
    default:
      return state
  }
}

export type UseCreateFolderDialogReturn = {
  state: CreateFolderDialogState
  open: (parentPath?: string | undefined) => void
  close: () => void
  setName: (name: string) => void
  setIconColor: (iconColor: ItemIconColorId | null) => void
  setDescription: (description: string) => void
  canSubmit: boolean
}

export function useCreateFolderDialog(): UseCreateFolderDialogReturn {
  const [state, dispatch] = useReducer(createFolderDialogReducer, initialState)

  const open = useCallback((parentPath?: string) => {
    dispatch({ type: "OPEN", parentPath })
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

  const setDescription = useCallback((description: string) => {
    dispatch({ type: "SET_DESCRIPTION", description })
  }, [])

  const canSubmit = state.status === "open" && state.name.trim().length > 0

  return {
    state,
    open,
    close,
    setName,
    setIconColor,
    setDescription,
    canSubmit,
  }
}
