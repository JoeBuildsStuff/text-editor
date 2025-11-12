import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { getDatabase } from "./db"

export const MARKDOWN_DIR = path.join(process.cwd(), "server", "documents")
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

function buildRelativePath(documentPath: string) {
  return path.relative(process.cwd(), path.join(MARKDOWN_DIR, documentPath))
}

function getAbsoluteFilePath(documentPath: string): string {
  return path.join(MARKDOWN_DIR, documentPath)
}

async function readFileContent(documentPath: string): Promise<string> {
  try {
    const absolutePath = getAbsoluteFilePath(documentPath)
    return await readFile(absolutePath, "utf-8")
  } catch (error) {
    // File doesn't exist yet, return empty string
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return ""
    }
    throw error
  }
}

async function writeFileContent(documentPath: string, content: string): Promise<void> {
  const absolutePath = getAbsoluteFilePath(documentPath)
  const dir = path.dirname(absolutePath)
  
  // Ensure directory exists
  await mkdir(dir, { recursive: true })
  
  // Write file
  await writeFile(absolutePath, content, "utf-8")
}

async function documentRecordToMeta(
  row: {
    id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  },
  includeContent: boolean
): Promise<MarkdownFileMeta> {
  const filename = path.basename(row.document_path)
  const relativePath = buildRelativePath(row.document_path)
  
  let content: string | undefined
  if (includeContent) {
    content = await readFileContent(row.document_path)
  }

  return {
    id: row.id,
    kind: "document",
    title: row.title,
    documentPath: row.document_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    filename,
    relativePath,
    slug: row.id,
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

  const db = getDatabase()
  const row = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as
    | {
        id: string
        title: string
        document_path: string
        created_at: string
        updated_at: string
      }
    | undefined

  if (!row) return undefined

  return documentRecordToMeta(row, true)
}

export async function listMarkdownItems({ includeContent = true }: ListOptions = {}) {
  const db = getDatabase()

  // Get all documents
  const documentRows = db
    .prepare("SELECT * FROM documents ORDER BY document_path")
    .all() as Array<{
    id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }>

  const documents = await Promise.all(
    documentRows.map((row) => documentRecordToMeta(row, includeContent))
  )

  // Get all folders
  const folderRows = db
    .prepare("SELECT * FROM folders ORDER BY folder_path")
    .all() as Array<{
    id: string
    folder_path: string
    created_at: string
    updated_at: string
  }>

  const folders: FolderRecord[] = folderRows.map((row) => ({
    id: row.id,
    kind: "folder",
    folderPath: row.folder_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return {
    documents,
    folders,
  }
}

export class MarkdownFileOperationError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message)
    this.name = "MarkdownFileOperationError"
  }
}

function findAvailableDocumentPath(
  db: ReturnType<typeof getDatabase>,
  baseName: string,
  folderPath?: string
): string {
  const sanitizedBase = sanitizeFilename(baseName)
  const filename = ensureMarkdownExtension(sanitizedBase)
  const documentPath = folderPath
    ? toPosixPath(`${folderPath}/${filename}`)
    : toPosixPath(filename)

  // Check if path exists
  const existing = db
    .prepare("SELECT document_path FROM documents WHERE document_path = ?")
    .get(documentPath)

  if (!existing) {
    return documentPath
  }

  // Find available name with suffix
  let attempt = 0
  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt}`
    const candidateFilename = `${sanitizedBase}${suffix}.md`
    const candidatePath = folderPath
      ? toPosixPath(`${folderPath}/${candidateFilename}`)
      : toPosixPath(candidateFilename)

    const existingCandidate = db
      .prepare("SELECT document_path FROM documents WHERE document_path = ?")
      .get(candidatePath)

    if (!existingCandidate) {
      return candidatePath
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

  const db = getDatabase()

  // Validate folder exists if folderPath is provided
  if (folderPath) {
    const sanitizedFolderPath = sanitizeFolderPath(folderPath)
    if (!sanitizedFolderPath) {
      throw new MarkdownFileOperationError("Invalid folder path", 422)
    }

    const folderExists = db
      .prepare("SELECT id FROM folders WHERE folder_path = ?")
      .get(sanitizedFolderPath)

    if (!folderExists) {
      throw new MarkdownFileOperationError("Folder does not exist", 404)
    }
  }

  // Determine document path
  const filename = ensureMarkdownExtension(sanitizedBase)
  let documentPath: string

  if (folderPath) {
    const sanitizedFolderPath = sanitizeFolderPath(folderPath)!
    documentPath = toPosixPath(`${sanitizedFolderPath}/${filename}`)

    if (!overwrite) {
      // Check if file exists
      const existing = db
        .prepare("SELECT id FROM documents WHERE document_path = ?")
        .get(documentPath)

      if (existing) {
        documentPath = findAvailableDocumentPath(db, sanitizedBase, sanitizedFolderPath)
      }
    }
  } else {
    documentPath = overwrite
      ? toPosixPath(filename)
      : findAvailableDocumentPath(db, sanitizedBase)
  }

  // Check if overwriting
  if (overwrite) {
    const existing = db
      .prepare("SELECT id FROM documents WHERE document_path = ?")
      .get(documentPath)

    if (existing) {
      // Update existing
      const timestamp = new Date().toISOString()
      db.prepare(
        "UPDATE documents SET title = ?, updated_at = ? WHERE document_path = ?"
      ).run(title, timestamp, documentPath)

      // Write content to file
      await writeFileContent(documentPath, content ?? "")

      const updated = db
        .prepare("SELECT * FROM documents WHERE document_path = ?")
        .get(documentPath) as {
        id: string
        title: string
        document_path: string
        created_at: string
        updated_at: string
      }

      return documentRecordToMeta(updated, false)
    }
  }

  // Create new document
  const id = randomUUID()
  const timestamp = new Date().toISOString()

  db.prepare(
    "INSERT INTO documents (id, title, document_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, title, documentPath, timestamp, timestamp)

  // Write content to file
  await writeFileContent(documentPath, content ?? "")

  const created = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as {
    id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }

  return documentRecordToMeta(created, false)
}

export async function createFolder(folderPathInput: string) {
  const segments = sanitizeFolderSegments(folderPathInput)
  if (!segments.length) {
    throw new MarkdownFileOperationError("Folder name must contain alphanumeric characters", 422)
  }

  const db = getDatabase()

  const parentSegments = segments.slice(0, -1)
  const baseName = segments[segments.length - 1]
  const parentRelativePath = parentSegments.join("/")

  // Validate parent folder exists if there is a parent
  if (parentRelativePath.length > 0) {
    const parentExists = db
      .prepare("SELECT id FROM folders WHERE folder_path = ?")
      .get(parentRelativePath)

    if (!parentExists) {
      throw new MarkdownFileOperationError("Parent folder does not exist", 404)
    }
  }

  let folderRelativePath = ""
  let attempt = 0

  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt}`
    const candidateName = `${baseName}${suffix}`
    const candidateRelativePath = parentRelativePath
      ? `${parentRelativePath}/${candidateName}`
      : candidateName
    const normalizedPath = toPosixPath(candidateRelativePath)

    // Check if folder exists
    const existing = db
      .prepare("SELECT id FROM folders WHERE folder_path = ?")
      .get(normalizedPath)

    if (!existing) {
      folderRelativePath = normalizedPath
      break
    }

    attempt += 1
  }

  if (!folderRelativePath) {
    throw new MarkdownFileOperationError("Unable to create a unique folder name", 500)
  }

  // Create folder directory
  const folderAbsolutePath = path.join(MARKDOWN_DIR, folderRelativePath)
  await mkdir(folderAbsolutePath, { recursive: true })

  const id = randomUUID()
  const timestamp = new Date().toISOString()

  db.prepare(
    "INSERT INTO folders (id, folder_path, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run(id, folderRelativePath, timestamp, timestamp)

  const created = db
    .prepare("SELECT * FROM folders WHERE id = ?")
    .get(id) as {
    id: string
    folder_path: string
    created_at: string
    updated_at: string
  }

  return {
    id: created.id,
    kind: "folder" as const,
    folderPath: created.folder_path,
    createdAt: created.created_at,
    updatedAt: created.updated_at,
  }
}

export async function renameMarkdownFile(id: string, proposedTitle: string) {
  const title = proposedTitle.trim()
  if (!title) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const db = getDatabase()

  // Get existing document
  const existing = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as
    | {
        id: string
        title: string
        document_path: string
        created_at: string
        updated_at: string
      }
    | undefined

  if (!existing) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  const sanitizedBase = sanitizeFilename(title)
  if (!sanitizedBase) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const nextFilename = ensureMarkdownExtension(sanitizedBase)
  const parentDir = path.posix.dirname(existing.document_path)
  const nextDocumentPath =
    parentDir === "." ? nextFilename : `${parentDir}/${nextFilename}`

  // Check if new path already exists (and it's not the same document)
  if (nextDocumentPath !== existing.document_path) {
    const conflict = db
      .prepare("SELECT id FROM documents WHERE document_path = ? AND id != ?")
      .get(nextDocumentPath, id)

    if (conflict) {
      throw new MarkdownFileOperationError("A document with that title already exists", 409)
    }

    // Rename the file
    const oldAbsolutePath = getAbsoluteFilePath(existing.document_path)
    const newAbsolutePath = getAbsoluteFilePath(nextDocumentPath)
    
    await rename(oldAbsolutePath, newAbsolutePath)
  }

  const timestamp = new Date().toISOString()

  db.prepare(
    "UPDATE documents SET title = ?, document_path = ?, updated_at = ? WHERE id = ?"
  ).run(title, nextDocumentPath, timestamp, id)

  const updated = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as {
    id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }

  return documentRecordToMeta(updated, false)
}

export async function updateMarkdownFileContent(id: string, content: string) {
  const db = getDatabase()

  // Get document path
  const existing = db
    .prepare("SELECT document_path FROM documents WHERE id = ?")
    .get(id) as { document_path: string } | undefined

  if (!existing) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  // Update timestamp in database
  const timestamp = new Date().toISOString()
  db.prepare("UPDATE documents SET updated_at = ? WHERE id = ?").run(timestamp, id)

  // Write content to file
  await writeFileContent(existing.document_path, content)

  const updated = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as {
    id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }

  return documentRecordToMeta(updated, true)
}

export async function deleteMarkdownFile(id: string) {
  const db = getDatabase()

  const existing = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as
    | {
        id: string
        title: string
        document_path: string
        created_at: string
        updated_at: string
      }
    | undefined

  if (!existing) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  // Delete file
  const absolutePath = getAbsoluteFilePath(existing.document_path)
  await rm(absolutePath, { force: true })

  // Delete from database
  db.prepare("DELETE FROM documents WHERE id = ?").run(id)

  return documentRecordToMeta(existing, false)
}

export async function deleteFolder(folderPathInput: string) {
  const sanitized = sanitizeFolderPath(folderPathInput)
  if (!sanitized) {
    throw new MarkdownFileOperationError("Invalid folder path", 422)
  }

  const db = getDatabase()

  // Check if folder exists
  const folder = db
    .prepare("SELECT id FROM folders WHERE folder_path = ?")
    .get(sanitized) as { id: string } | undefined

  if (!folder) {
    throw new MarkdownFileOperationError("Folder not found", 404)
  }

  // Get all documents in this folder to delete their files
  const documentsToDelete = db
    .prepare("SELECT document_path FROM documents WHERE document_path = ? OR document_path LIKE ?")
    .all(sanitized, `${sanitized}/%`) as Array<{ document_path: string }>

  const transaction = db.transaction(() => {
    // Delete files
    for (const doc of documentsToDelete) {
      const absolutePath = getAbsoluteFilePath(doc.document_path)
      rm(absolutePath, { force: true }).catch(() => {
        // Ignore errors if file doesn't exist
      })
    }

    // Delete folder directory
    const folderAbsolutePath = path.join(MARKDOWN_DIR, sanitized)
    rm(folderAbsolutePath, { recursive: true, force: true }).catch(() => {
      // Ignore errors if folder doesn't exist
    })

    // Delete all documents in this folder and subfolders
    db.prepare("DELETE FROM documents WHERE document_path = ? OR document_path LIKE ?").run(
      sanitized,
      `${sanitized}/%`
    )

    // Delete all subfolders
    db.prepare("DELETE FROM folders WHERE folder_path = ? OR folder_path LIKE ?").run(
      sanitized,
      `${sanitized}/%`
    )

    return sanitized
  })

  return transaction()
}
