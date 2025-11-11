import { randomUUID } from "node:crypto"
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export const MARKDOWN_DIR = path.join(process.cwd(), "server", "documents")
const METADATA_PATH = path.join(MARKDOWN_DIR, "index.json")

const MARKDOWN_EXTENSION = /\.md$/i

type BaseRecord = {
  id: string
  createdAt: string
  updatedAt: string
}

export type DocumentRecord = BaseRecord & {
  kind: "document"
  title: string
  documentPath: string
}

export type FolderRecord = BaseRecord & {
  kind: "folder"
  folderPath: string
}

export type MetadataRecord = DocumentRecord | FolderRecord

export function isDocumentRecord(record: MetadataRecord): record is DocumentRecord {
  return record.kind === "document"
}

export function isFolderRecord(record: MetadataRecord): record is FolderRecord {
  return record.kind === "folder"
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

function sanitizeFolderSegments(input?: string | null) {
  return (input ?? "")
    .split("/")
    .map((segment) => sanitizeFilename(segment))
    .filter((segment) => segment.length > 0)
}

function sanitizeFolderPath(input?: string | null) {
  return sanitizeFolderSegments(input).join("/")
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

function isValidIsoString(value: unknown): value is string {
  if (typeof value !== "string") return false
  const date = new Date(value)
  return !Number.isNaN(date.valueOf())
}

function toIsoStringOrNow(value: unknown) {
  if (isValidIsoString(value)) return value
  return new Date().toISOString()
}

function normalizeRecord(candidate: unknown): MetadataRecord | null {
  if (!candidate || typeof candidate !== "object") return null

  const record = candidate as Record<string, unknown>

  const idValue = record.id
  if (typeof idValue !== "string" || idValue.length === 0) {
    return null
  }

  const timestamps = {
    createdAt: toIsoStringOrNow(record.createdAt),
    updatedAt: toIsoStringOrNow(record.updatedAt),
  }

  const kindValue = record.kind

  if (kindValue === "folder") {
    const folderPathValue = record.folderPath
    if (typeof folderPathValue !== "string" || folderPathValue.length === 0) {
      return null
    }
    return {
      id: idValue,
      kind: "folder",
      folderPath: folderPathValue,
      ...timestamps,
    }
  }

  const documentPathValue = record.documentPath
  if (typeof documentPathValue !== "string" || documentPathValue.length === 0) {
    return null
  }

  const titleValue = typeof record.title === "string" ? record.title : ""

  return {
    id: idValue,
    kind: "document",
    title: titleValue,
    documentPath: documentPathValue,
    ...timestamps,
  }
}

async function readMetadata(): Promise<MetadataRecord[]> {
  await ensureMetadataFile()
  const data = await readFile(METADATA_PATH, "utf-8")
  try {
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    const records: MetadataRecord[] = []
    for (const candidate of parsed) {
      const normalized = normalizeRecord(candidate)
      if (normalized) {
        records.push(normalized)
      }
    }
    return records
  } catch {
    return []
  }
}

async function writeMetadata(records: MetadataRecord[]) {
  await ensureMetadataFile()
  await writeFile(METADATA_PATH, JSON.stringify(records, null, 2), "utf-8")
}

type WalkResult = {
  documents: string[]
  folders: string[]
}

async function walkDocumentsAndFolders(
  currentDir = MARKDOWN_DIR,
  base = ""
): Promise<WalkResult> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const aggregated: WalkResult = { documents: [], folders: [] }

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      const folderPath = base ? `${base}/${entry.name}` : entry.name
      const normalizedFolder = toPosixPath(folderPath)
      aggregated.folders.push(normalizedFolder)
      const nested = await walkDocumentsAndFolders(entryPath, folderPath)
      aggregated.documents.push(...nested.documents)
      aggregated.folders.push(...nested.folders)
      continue
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue
    }

    const documentPath = base ? `${base}/${entry.name}` : entry.name
    aggregated.documents.push(toPosixPath(documentPath))
  }

  return aggregated
}

async function syncMetadataWithFilesystem() {
  const metadata = await readMetadata()
  const documentRecords = metadata.filter(isDocumentRecord)
  const folderRecords = metadata.filter(isFolderRecord)
  const { documents: filePaths, folders: folderPaths } = await walkDocumentsAndFolders()
  const filePathSet = new Set(filePaths)
  const folderPathSet = new Set(folderPaths)
  let changed = false

  const validDocuments: DocumentRecord[] = documentRecords.filter((record) => {
    const exists = filePathSet.has(record.documentPath)
    if (!exists) {
      changed = true
    }
    return exists
  })

  const existingPaths = new Set(validDocuments.map((record) => record.documentPath))

  for (const documentPath of filePaths) {
    if (existingPaths.has(documentPath)) continue
    const timestamp = new Date().toISOString()
    validDocuments.push({
      id: randomUUID(),
      kind: "document",
      title: stripMarkdownExtension(path.basename(documentPath)),
      documentPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    changed = true
  }

  const validFolders: FolderRecord[] = folderRecords.filter((record) => {
    const exists = folderPathSet.has(record.folderPath)
    if (!exists) {
      changed = true
    }
    return exists
  })

  const existingFolderPaths = new Set(validFolders.map((record) => record.folderPath))

  for (const folderPath of folderPaths) {
    if (existingFolderPaths.has(folderPath)) continue
    const timestamp = new Date().toISOString()
    validFolders.push({
      id: randomUUID(),
      kind: "folder",
      folderPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    changed = true
  }

  if (changed) {
    const nextRecords: MetadataRecord[] = [...validDocuments, ...validFolders]
    await writeMetadata(nextRecords)
    return nextRecords
  }

  return [...validDocuments, ...validFolders]
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
  const { documents } = await listMarkdownItems({ includeContent })
  return documents
}

export async function getMarkdownFileById(id?: string | null) {
  if (!id) return undefined
  const records = await syncMetadataWithFilesystem()
  const record = records.find(
    (candidate): candidate is DocumentRecord =>
      isDocumentRecord(candidate) && candidate.id === id
  )
  if (!record) return undefined
  return documentRecordToMeta(record, true)
}

export async function listMarkdownItems({ includeContent = true }: ListOptions = {}) {
  const records = await syncMetadataWithFilesystem()
  const documentRecords = records.filter(isDocumentRecord)
  const folderRecords = records.filter(isFolderRecord)
  const documents = await Promise.all(
    documentRecords.map((record) => documentRecordToMeta(record, includeContent))
  )

  return {
    documents,
    folders: folderRecords,
  }
}

export class MarkdownFileOperationError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message)
    this.name = "MarkdownFileOperationError"
  }
}

async function upsertRecordTitle(documentPath: string, title: string) {
  const records = await syncMetadataWithFilesystem()
  const documents = records.filter(isDocumentRecord)
  const folders = records.filter(isFolderRecord)
  const index = documents.findIndex((record) => record.documentPath === documentPath)
  const timestamp = new Date().toISOString()

  if (index >= 0) {
    const updatedRecord = { ...documents[index], title, updatedAt: timestamp }
    documents[index] = updatedRecord
    await writeMetadata([...documents, ...folders])
    return updatedRecord
  }

  const newRecord: DocumentRecord = {
    id: randomUUID(),
    kind: "document",
    title,
    documentPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  documents.push(newRecord)
  await writeMetadata([...documents, ...folders])
  return newRecord
}

async function resolveDocumentPath(baseName: string) {
  const filename = ensureMarkdownExtension(baseName)
  const documentPath = toPosixPath(filename)
  const absolutePath = path.join(MARKDOWN_DIR, documentPath)
  return { documentPath, absolutePath }
}

async function findAvailableDocumentPath(baseName: string) {
  let attempt = 0

  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt}`
    const candidateBase = `${baseName}${suffix}`
    const { documentPath, absolutePath } = await resolveDocumentPath(candidateBase)

    try {
      await access(absolutePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { documentPath, absolutePath }
      }
      throw error
    }

    attempt += 1
  }

  throw new MarkdownFileOperationError("Unable to create a unique filename", 500)
}

export async function createMarkdownFile(
  titleInput: string,
  content: string,
  overwrite?: boolean,
  folderPath?: string
) {
  const title = titleInput.trim()
  if (!title) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const sanitizedBase = sanitizeFilename(title)
  if (!sanitizedBase) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  await ensureMarkdownDirectory()

  let documentPath: string
  let absolutePath: string

  if (folderPath) {
    // Create file in specified folder
    const sanitizedFolderPath = sanitizeFolderPath(folderPath)

    if (!sanitizedFolderPath) {
      throw new MarkdownFileOperationError("Invalid folder path", 422)
    }

    const filename = ensureMarkdownExtension(sanitizedBase)
    documentPath = toPosixPath(`${sanitizedFolderPath}/${filename}`)
    absolutePath = path.join(MARKDOWN_DIR, documentPath)

    // Ensure the folder exists
    const folderAbsolutePath = path.dirname(absolutePath)
    await mkdir(folderAbsolutePath, { recursive: true })

    // Check if file already exists (unless overwrite is true)
    if (!overwrite) {
      try {
        await access(absolutePath)
        // File exists, find available name
        let attempt = 0
        while (attempt < 1000) {
          const suffix = attempt === 0 ? "" : `-${attempt}`
          const candidateFilename = `${sanitizedBase}${suffix}.md`
          const candidatePath = toPosixPath(`${sanitizedFolderPath}/${candidateFilename}`)
          const candidateAbsolutePath = path.join(MARKDOWN_DIR, candidatePath)
          try {
            await access(candidateAbsolutePath)
            attempt += 1
          } catch {
            documentPath = candidatePath
            absolutePath = candidateAbsolutePath
            break
          }
        }
        if (attempt >= 1000) {
          throw new MarkdownFileOperationError("Unable to create a unique filename", 500)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error
        }
      }
    }
  } else {
    // Create file at root level (existing behavior)
    const resolved = overwrite
      ? await resolveDocumentPath(sanitizedBase)
      : await findAvailableDocumentPath(sanitizedBase)
    documentPath = resolved.documentPath
    absolutePath = resolved.absolutePath
  }

  await writeFile(absolutePath, content ?? "", "utf-8")
  const record = await upsertRecordTitle(documentPath, title)
  return documentRecordToMeta(record, false)
}

export async function createFolder(folderPathInput: string) {
  const segments = sanitizeFolderSegments(folderPathInput)
  if (!segments.length) {
    throw new MarkdownFileOperationError("Folder name must contain alphanumeric characters", 422)
  }

  await ensureMarkdownDirectory()

  const parentSegments = segments.slice(0, -1)
  const baseName = segments[segments.length - 1]
  const parentRelativePath = parentSegments.join("/")

  if (parentRelativePath.length > 0) {
    const parentAbsolutePath = path.join(MARKDOWN_DIR, parentRelativePath)
    await mkdir(parentAbsolutePath, { recursive: true })
  }

  let folderRelativePath = ""
  let attempt = 0

  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt}`
    const candidateName = `${baseName}${suffix}`
    const candidateRelativePath = parentRelativePath
      ? `${parentRelativePath}/${candidateName}`
      : candidateName
    const candidateAbsolutePath = path.join(MARKDOWN_DIR, candidateRelativePath)

    try {
      await mkdir(candidateAbsolutePath, { recursive: false })
      folderRelativePath = toPosixPath(candidateRelativePath)
      break
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "EEXIST") {
        attempt += 1
        continue
      }
      throw error
    }
  }

  if (!folderRelativePath) {
    throw new MarkdownFileOperationError("Unable to create a unique folder name", 500)
  }

  const records = await syncMetadataWithFilesystem()
  const folderRecord = records.find(
    (candidate): candidate is FolderRecord =>
      isFolderRecord(candidate) && candidate.folderPath === folderRelativePath
  )

  if (!folderRecord) {
    throw new MarkdownFileOperationError("Failed to create folder metadata", 500)
  }

  return folderRecord
}

export async function renameMarkdownFile(id: string, proposedTitle: string) {
  const title = proposedTitle.trim()
  if (!title) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const records = await syncMetadataWithFilesystem()
  const documents = records.filter(isDocumentRecord)
  const folders = records.filter(isFolderRecord)
  const index = documents.findIndex((record) => record.id === id)
  if (index === -1) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  const record = documents[index]
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

  documents[index] = updatedRecord
  await writeMetadata([...documents, ...folders])

  return documentRecordToMeta(updatedRecord, false)
}

export async function deleteMarkdownFile(id: string) {
  const records = await syncMetadataWithFilesystem()
  const documents = records.filter(isDocumentRecord)
  const folders = records.filter(isFolderRecord)
  const index = documents.findIndex((record) => record.id === id)

  if (index === -1) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  const record = documents[index]
  const absolutePath = path.join(MARKDOWN_DIR, record.documentPath)

  await rm(absolutePath, { force: true })

  documents.splice(index, 1)
  await writeMetadata([...documents, ...folders])

  return documentRecordToMeta(record, false)
}
