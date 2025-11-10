import { mkdir, readdir, readFile } from "node:fs/promises"
import path from "node:path"

export const MARKDOWN_DIR = path.join(process.cwd(), "server", "documents")

export type MarkdownFileMeta = {
  filename: string
  relativePath: string
  documentPath: string
  slug: string
  content?: string
}

const MARKDOWN_EXTENSION = /\.md$/i

export function ensureMarkdownExtension(filename: string) {
  return filename.toLowerCase().endsWith(".md") ? filename : `${filename}.md`
}

export function sanitizeFilename(input?: string | null) {
  const trimmed = input?.trim()
  if (!trimmed) return ""
  const withoutExtension = trimmed.replace(MARKDOWN_EXTENSION, "")
  const safe = withoutExtension
    .replace(/[^a-zA-Z0-9-_ ]+/g, "-")
    .replace(/\s+/g, "-")
  return safe.replace(/-+/g, "-").replace(/^-|-$/g, "")
}

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join("/")
}

export function pathToSlug(relativePath?: string | null) {
  if (!relativePath) return ""
  const posixPath = toPosixPath(relativePath)
  return posixPath
    .replace(MARKDOWN_EXTENSION, "")
    .split("/")
    .map((segment) => sanitizeFilename(segment))
    .filter(Boolean)
    .join("/")
    .toLowerCase()
}

export function normalizeSlugInput(slug?: string | string[] | null) {
  if (!slug) return ""
  const value = Array.isArray(slug) ? slug.join("/") : slug
  return pathToSlug(value)
}

export async function ensureMarkdownDirectory() {
  await mkdir(MARKDOWN_DIR, { recursive: true })
}

type ListOptions = {
  includeContent?: boolean
}

async function walkMarkdownDirectory(
  currentDir: string,
  includeContent: boolean
): Promise<MarkdownFileMeta[]> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const files: MarkdownFileMeta[] = []

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownDirectory(entryPath, includeContent)))
      continue
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue
    }

    const relativePath = path.relative(process.cwd(), entryPath)
    const documentPath = toPosixPath(path.relative(MARKDOWN_DIR, entryPath))

    files.push({
      filename: entry.name,
      relativePath,
      documentPath,
      slug: pathToSlug(documentPath),
      content: includeContent ? await readFile(entryPath, "utf-8") : undefined,
    })
  }

  return files
}

export async function listMarkdownFiles({
  includeContent = true,
}: ListOptions = {}): Promise<MarkdownFileMeta[]> {
  await ensureMarkdownDirectory()
  return walkMarkdownDirectory(MARKDOWN_DIR, includeContent)
}

export async function getMarkdownFileBySlug(slug?: string | string[] | null) {
  const normalizedSlug = normalizeSlugInput(slug)
  if (!normalizedSlug) return undefined
  const files = await listMarkdownFiles({ includeContent: true })
  return files.find((file) => file.slug === normalizedSlug)
}
