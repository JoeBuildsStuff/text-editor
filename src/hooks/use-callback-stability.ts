import { useEffect, useRef } from "react"

/**
 * Development helper to understand when callbacks are recreated and why.
 */
export function useCallbackStability(
  name: string,
  _callback: (...args: unknown[]) => unknown,
  deps: readonly unknown[]
): void {
  const isDev = process.env.NODE_ENV === "development"
  const invocationCountRef = useRef(0)
  const prevDepsRef = useRef<readonly unknown[]>([])

  useEffect(() => {
    if (!isDev) return

    invocationCountRef.current += 1

    const changedIndices: number[] = []
    deps.forEach((dep, index) => {
      if (!Object.is(dep, prevDepsRef.current[index])) {
        changedIndices.push(index)
      }
    })

    if (changedIndices.length > 0 && invocationCountRef.current > 1) {
      console.debug(
        `[useCallbackStability] ${name} recreated (${invocationCountRef.current}x)`,
        changedIndices
      )
    }

    prevDepsRef.current = deps
  }, [deps, isDev, name])
}
