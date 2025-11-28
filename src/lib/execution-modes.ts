export const EXECUTION_MODES = ["python", "bash", "node", "typescript"] as const

export type ExecutionMode = (typeof EXECUTION_MODES)[number]

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === "string" && EXECUTION_MODES.includes(value as ExecutionMode)
}
