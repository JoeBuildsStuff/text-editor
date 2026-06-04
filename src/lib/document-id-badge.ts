export function formatDocumentIdBadge(documentId: string): string {
  const compactId = documentId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
  const first = compactId.slice(0, 3)
  const second = compactId.slice(3, 6)

  if (!first) {
    return ""
  }

  return second ? `${first}_${second}` : first
}
