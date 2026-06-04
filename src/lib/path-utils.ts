const MARKDOWN_EXTENSION = /\.md$/i

/**
 * Sanitizes a single folder or file name segment for use in paths.
 */
export function sanitizePathSegment(input?: string | null): string {
  const trimmed = input?.trim()
  if (!trimmed) return ""
  const withoutExtension = trimmed.replace(MARKDOWN_EXTENSION, "")
  const safe = withoutExtension
    .replace(/[^a-zA-Z0-9-_ ]+/g, "-")
    .replace(/\s+/g, "-")
  return safe.replace(/-+/g, "-").replace(/^-|-$/g, "")
}

/**
 * Extracts the last non-empty path segment from a `/` separated path.
 */
export function getLastPathSegment(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const trimmed = path.trim()
  if (!trimmed) return undefined
  const segments = trimmed.split("/").filter(Boolean)
  if (!segments.length) return undefined
  return segments[segments.length - 1]
}

/**
 * Returns the parent path for a `/` separated path. Undefined for top-level paths.
 */
export function getParentPath(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const segments = path.split("/").filter(Boolean)
  if (segments.length <= 1) return undefined
  return segments.slice(0, -1).join("/")
}

/**
 * Filters out empty segments and joins them with `/`.
 */
export function joinPaths(...segments: Array<string | null | undefined>): string {
  return segments.filter((segment): segment is string => Boolean(segment && segment.length > 0)).join("/")
}

/**
 * Parses a potential numeric sort order, returning undefined for invalid values.
 */
export function parseSortOrder(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  return undefined
}
