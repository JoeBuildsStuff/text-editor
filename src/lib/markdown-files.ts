import { randomUUID } from "node:crypto"
import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import path from "node:path"

export const MARKDOWN_DIR = path.join(process.cwd(), "server", "documents")
const METADATA_PATH = path.join(MARKDOWN_DIR, "index.json")

const MARKDOWN_EXTENSION = /\.md$/i

export type DocumentRecord = {
  id: string
  title: string
  documentPath: string
  createdAt: string
  updatedAt: string
}

export type MarkdownFileMeta = DocumentRecord & {
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
  const withoutExtension = trimmed.replace(MARKDOWN_EXTENSION, "")
  const safe = withoutExtension
    .replace(/[^a-zA-Z0-9-_ ]+/g, "-")
    .replace(/\s+/g, "-")
  return safe.replace(/-+/g, "-").replace(/^-|-$/g, "")
}

export function stripMarkdownExtension(input: string) {
  return input.replace(MARKDOWN_EXTENSION, "")
}

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join("/")
}

export async function ensureMarkdownDirectory() {
  await mkdir(MARKDOWN_DIR, { recursive: true })
}

async function ensureMetadataFile() {
  await ensureMarkdownDirectory()
  try {
    await access(METADATA_PATH)
  } catch {
    await writeFile(METADATA_PATH, JSON.stringify([], null, 2), "utf-8")
  }
}

async function readMetadata(): Promise<DocumentRecord[]> {
  await ensureMetadataFile()
  const data = await readFile(METADATA_PATH, "utf-8")
  try {
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? (parsed as DocumentRecord[]) : []
  } catch {
    return []
  }
}

async function writeMetadata(records: DocumentRecord[]) {
  await ensureMetadataFile()
  await writeFile(METADATA_PATH, JSON.stringify(records, null, 2), "utf-8")
}

async function walkDocumentPaths(currentDir = MARKDOWN_DIR, base = ""): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      const nextBase = base ? `${base}/${entry.name}` : entry.name
      files.push(...(await walkDocumentPaths(entryPath, nextBase)))
      continue
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue
    }

    const documentPath = base ? `${base}/${entry.name}` : entry.name
    files.push(toPosixPath(documentPath))
  }

  return files
}

async function syncMetadataWithFilesystem() {
  const metadata = await readMetadata()
  const filePaths = await walkDocumentPaths()
  const filePathSet = new Set(filePaths)
  let changed = false

  const validRecords: DocumentRecord[] = metadata.filter((record) => {
    const exists = filePathSet.has(record.documentPath)
    if (!exists) {
      changed = true
    }
    return exists
  })

  const existingPaths = new Set(validRecords.map((record) => record.documentPath))

  for (const documentPath of filePaths) {
    if (existingPaths.has(documentPath)) continue
    const timestamp = new Date().toISOString()
    validRecords.push({
      id: randomUUID(),
      title: stripMarkdownExtension(path.basename(documentPath)),
      documentPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    changed = true
  }

  if (changed) {
    await writeMetadata(validRecords)
  }

  return validRecords
}

function buildRelativePath(documentPath: string) {
  return path.relative(process.cwd(), path.join(MARKDOWN_DIR, documentPath))
}

async function documentRecordToMeta(
  record: DocumentRecord,
  includeContent: boolean
): Promise<MarkdownFileMeta> {
  const absolutePath = path.join(MARKDOWN_DIR, record.documentPath)
  const relativePath = buildRelativePath(record.documentPath)
  const filename = path.basename(record.documentPath)
  let content: string | undefined

  if (includeContent) {
    try {
      content = await readFile(absolutePath, "utf-8")
    } catch {
      content = undefined
    }
  }

  return {
    ...record,
    filename,
    relativePath,
    slug: record.id,
    content,
  }
}

type ListOptions = {
  includeContent?: boolean
}

export async function listMarkdownFiles({ includeContent = true }: ListOptions = {}) {
  const records = await syncMetadataWithFilesystem()
  return Promise.all(records.map((record) => documentRecordToMeta(record, includeContent)))
}

export async function getMarkdownFileById(id?: string | null) {
  if (!id) return undefined
  const records = await syncMetadataWithFilesystem()
  const record = records.find((candidate) => candidate.id === id)
  if (!record) return undefined
  return documentRecordToMeta(record, true)
}

export class MarkdownFileOperationError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message)
    this.name = "MarkdownFileOperationError"
  }
}

async function upsertRecordTitle(documentPath: string, title: string) {
  const records = await syncMetadataWithFilesystem()
  const index = records.findIndex((record) => record.documentPath === documentPath)
  const timestamp = new Date().toISOString()

  if (index >= 0) {
    records[index] = { ...records[index], title, updatedAt: timestamp }
    await writeMetadata(records)
    return records[index]
  }

  const newRecord: DocumentRecord = {
    id: randomUUID(),
    title,
    documentPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  records.push(newRecord)
  await writeMetadata(records)
  return newRecord
}

export async function createMarkdownFile(titleInput: string, content: string, overwrite?: boolean) {
  const title = titleInput.trim()
  if (!title) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const sanitizedBase = sanitizeFilename(title)
  if (!sanitizedBase) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const filename = ensureMarkdownExtension(sanitizedBase)
  const documentPath = toPosixPath(filename)
  const absolutePath = path.join(MARKDOWN_DIR, documentPath)

  await ensureMarkdownDirectory()

  if (!overwrite) {
    try {
      await access(absolutePath)
      throw new MarkdownFileOperationError(
        "File already exists. Pass overwrite=true to replace it.",
        409
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
  }

  await writeFile(absolutePath, content ?? "", "utf-8")
  const record = await upsertRecordTitle(documentPath, title)
  return documentRecordToMeta(record, false)
}

export async function renameMarkdownFile(id: string, proposedTitle: string) {
  const title = proposedTitle.trim()
  if (!title) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const records = await syncMetadataWithFilesystem()
  const index = records.findIndex((record) => record.id === id)
  if (index === -1) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  const record = records[index]
  const sanitizedBase = sanitizeFilename(title)
  if (!sanitizedBase) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const nextFilename = ensureMarkdownExtension(sanitizedBase)
  const parentDir = path.posix.dirname(record.documentPath)
  const nextDocumentPath = parentDir === "." ? nextFilename : `${parentDir}/${nextFilename}`
  const currentAbsolutePath = path.join(MARKDOWN_DIR, record.documentPath)
  const nextAbsolutePath = path.join(MARKDOWN_DIR, nextDocumentPath)

  if (currentAbsolutePath !== nextAbsolutePath) {
    try {
      await access(nextAbsolutePath)
      throw new MarkdownFileOperationError(
        "A document with that title already exists",
        409
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }

    await rename(currentAbsolutePath, nextAbsolutePath)
  }

  const timestamp = new Date().toISOString()
  const updatedRecord: DocumentRecord = {
    ...record,
    title,
    documentPath: toPosixPath(nextDocumentPath),
    updatedAt: timestamp,
  }

  records[index] = updatedRecord
  await writeMetadata(records)

  return documentRecordToMeta(updatedRecord, false)
}
