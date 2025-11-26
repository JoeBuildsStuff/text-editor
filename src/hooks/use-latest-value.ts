import { useCallback, useEffect, useRef, type MutableRefObject } from "react"

/**
 * Stores the latest value in a ref so callbacks can always read fresh data
 * without re-subscribing to changing dependencies.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref
}

/**
 * Returns a stable getter that retrieves the latest value on demand.
 */
export function useLatestValue<T>(value: T): () => T {
  const ref = useLatestRef(value)
  return useCallback(() => ref.current, [ref])
}
