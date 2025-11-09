import { mkdir, readdir, readFile } from "node:fs/promises"
import path from "node:path"

export const MARKDOWN_DIR = path.join(process.cwd(), "server", "documents")

export type MarkdownFileMeta = {
  filename: string
  relativePath: string
  slug: string
  content?: string
}

export function ensureMarkdownExtension(filename: string) {
  return filename.toLowerCase().endsWith(".md") ? filename : `${filename}.md`
}

export function sanitizeFilename(input?: string | null) {
  const trimmed = input?.trim()
  if (!trimmed) return ""
  const withoutExtension = trimmed.replace(/\.md$/i, "")
  const safe = withoutExtension
    .replace(/[^a-zA-Z0-9-_ ]+/g, "-")
    .replace(/\s+/g, "-")
  return safe.replace(/-+/g, "-").replace(/^-|-$/g, "")
}

export function filenameToSlug(filename?: string | null) {
  const sanitized = sanitizeFilename(filename)
  return sanitized.toLowerCase()
}

export async function ensureMarkdownDirectory() {
  await mkdir(MARKDOWN_DIR, { recursive: true })
}

type ListOptions = {
  includeContent?: boolean
}

export async function listMarkdownFiles({
  includeContent = true,
}: ListOptions = {}): Promise<MarkdownFileMeta[]> {
  await ensureMarkdownDirectory()
  const entries = await readdir(MARKDOWN_DIR, { withFileTypes: true })

  const files = entries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md")
  )

  return Promise.all(
    files.map(async (entry) => {
      const filePath = path.join(MARKDOWN_DIR, entry.name)
      return {
        filename: entry.name,
        relativePath: path.relative(process.cwd(), filePath),
        slug: filenameToSlug(entry.name),
        content: includeContent ? await readFile(filePath, "utf-8") : undefined,
      }
    })
  )
}

export async function getMarkdownFileBySlug(slug?: string | null) {
  const normalizedSlug = filenameToSlug(slug)
  if (!normalizedSlug) return undefined
  const files = await listMarkdownFiles({ includeContent: true })
  return files.find((file) => file.slug === normalizedSlug)
}
