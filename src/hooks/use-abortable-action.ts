import { useCallback, useEffect, useRef } from "react"

/**
 * Wraps an async action so that the previous request is aborted when a new one starts.
 */
export function useAbortableAction<T extends (...args: never[]) => Promise<unknown>>(
  action: (signal: AbortSignal, ...args: Parameters<T>) => ReturnType<T>
): [((...args: Parameters<T>) => ReturnType<T>), () => void] {
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      controllerRef.current?.abort("Component unmounted")
    }
  }, [])

  const wrappedAction = useCallback((...args: Parameters<T>): ReturnType<T> => {
    controllerRef.current?.abort("Superseded by new request")
    controllerRef.current = new AbortController()

    const signal = controllerRef.current.signal
    return action(signal, ...args)
  }, [action])

  const abort = useCallback(() => {
    controllerRef.current?.abort("Manually aborted")
  }, [])

  return [wrappedAction, abort]
}
