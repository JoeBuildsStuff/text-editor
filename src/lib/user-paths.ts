export function sanitizeUserSegment(input?: string | null) {
  return (input ?? '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}
