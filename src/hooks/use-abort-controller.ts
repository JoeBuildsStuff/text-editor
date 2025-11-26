import { useCallback, useEffect, useRef } from "react"

export type AbortControllerManager = {
  getSignal: () => AbortSignal
  abort: (reason?: string) => void
  isAborted: () => boolean
}

/**
 * Ensures every component instance has a single AbortController that is
 * automatically terminated when the component unmounts.
 */
export function useAbortController(): AbortControllerManager {
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      controllerRef.current?.abort("Component unmounted")
    }
  }, [])

  const getSignal = useCallback(() => {
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      controllerRef.current = new AbortController()
    }
    return controllerRef.current.signal
  }, [])

  const abort = useCallback((reason?: string) => {
    controllerRef.current?.abort(reason)
  }, [])

  const isAborted = useCallback(() => {
    return controllerRef.current?.signal.aborted ?? false
  }, [])

  return { getSignal, abort, isAborted }
}
