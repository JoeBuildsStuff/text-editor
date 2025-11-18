import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { getDatabase } from "./db"
import { deleteStoredFile, FileStorageError } from "./file-storage"
import { sanitizeUserSegment } from "./user-paths"

export const MARKDOWN_DIR = path.join(process.cwd(), "server", "documents")
const MARKDOWN_EXTENSION = /\.md$/i

function getUserDocumentsDir(userId: string): string {
  return path.join(MARKDOWN_DIR, userId)
}

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

function buildRelativePath(documentPath: string, userId: string) {
  return path.relative(process.cwd(), path.join(getUserDocumentsDir(userId), documentPath))
}

function getAbsoluteFilePath(documentPath: string, userId: string): string {
  return path.join(getUserDocumentsDir(userId), documentPath)
}

async function readFileContent(documentPath: string, userId: string): Promise<string> {
  try {
    const absolutePath = getAbsoluteFilePath(documentPath, userId)
    return await readFile(absolutePath, "utf-8")
  } catch (error) {
    // File doesn't exist yet, return empty string
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return ""
    }
    throw error
  }
}

async function writeFileContent(documentPath: string, content: string, userId: string): Promise<void> {
  const absolutePath = getAbsoluteFilePath(documentPath, userId)
  const dir = path.dirname(absolutePath)
  
  // Ensure directory exists
  await mkdir(dir, { recursive: true })
  
  // Write file
  await writeFile(absolutePath, content, "utf-8")
}

function resolveStoredPath(src: string, userId: string) {
  const trimmed = src.replace(/^\/+/, "")
  const userSegment = sanitizeUserSegment(userId)
  if (!userSegment) return trimmed
  const parts = trimmed.split("/").filter(Boolean)
  if (parts[0] === userSegment) return trimmed
  return [userSegment, ...parts].join("/")
}

function extractUploadPathsFromMarkdown(content: string, userId: string): string[] {
  const paths = new Set<string>()
  const userSegment = sanitizeUserSegment(userId)

  // Catch file-node placeholder links
  const fileNodeRegex = /file-node:\/\/file[^\s\)]*/g
  const matches = content.match(fileNodeRegex) || []
  for (const match of matches) {
    try {
      const url = new URL(match)
      const src = url.searchParams.get("src") || ""
      if (src) {
        paths.add(resolveStoredPath(src, userSegment))
      }
    } catch {
      // ignore malformed
    }
  }

  // Catch markdown images ![alt](path)
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  let imgMatch: RegExpExecArray | null
  while ((imgMatch = imageRegex.exec(content)) !== null) {
    const src = imgMatch[1]
    if (!src || src.startsWith("http") || src.startsWith("data:")) continue
    paths.add(resolveStoredPath(src, userSegment))
  }

  return Array.from(paths)
}

async function deleteUploadsForMarkdown(content: string, userId: string) {
  const paths = extractUploadPathsFromMarkdown(content, userId)
  if (!paths.length) return

  await Promise.allSettled(
    paths.map(async (filePath) => {
      try {
        await deleteStoredFile(filePath, userId)
      } catch (error) {
        if (!(error instanceof FileStorageError) || error.status !== 404) {
          console.warn(`Failed to delete stored file ${filePath}:`, error)
        }
      }
    })
  )
}

async function documentRecordToMeta(
  row: {
    id: string
    user_id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  },
  includeContent: boolean
): Promise<MarkdownFileMeta> {
  const filename = path.basename(row.document_path)
  const relativePath = buildRelativePath(row.document_path, row.user_id)
  
  let content: string | undefined
  if (includeContent) {
    content = await readFileContent(row.document_path, row.user_id)
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
  userId: string
}

export async function listMarkdownFiles({ includeContent = true, userId }: ListOptions) {
  const { documents } = await listMarkdownItems({ includeContent, userId })
  return documents
}

export async function getMarkdownFileById(id?: string | null, userId?: string) {
  if (!id || !userId) return undefined

  const db = getDatabase()
  const row = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as
    | {
        id: string
        user_id: string
        title: string
        document_path: string
        created_at: string
        updated_at: string
      }
    | undefined

  if (!row) return undefined

  return documentRecordToMeta(row, true)
}

export async function listMarkdownItems({ includeContent = true, userId }: ListOptions) {
  const db = getDatabase()

  // Get all documents for this user
  const documentRows = db
    .prepare("SELECT * FROM documents WHERE user_id = ? ORDER BY document_path")
    .all(userId) as Array<{
    id: string
    user_id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }>

  const documents = await Promise.all(
    documentRows.map((row) => documentRecordToMeta(row, includeContent))
  )

  // Get all folders for this user
  const folderRows = db
    .prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY folder_path")
    .all(userId) as Array<{
    id: string
    user_id: string
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
  userId: string,
  folderPath?: string
): string {
  const sanitizedBase = sanitizeFilename(baseName)
  const filename = ensureMarkdownExtension(sanitizedBase)
  const documentPath = folderPath
    ? toPosixPath(`${folderPath}/${filename}`)
    : toPosixPath(filename)

  // Check if path exists for this user
  const existing = db
    .prepare("SELECT document_path FROM documents WHERE document_path = ? AND user_id = ?")
    .get(documentPath, userId)

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
      .prepare("SELECT document_path FROM documents WHERE document_path = ? AND user_id = ?")
      .get(candidatePath, userId)

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
  userId: string,
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
      .prepare("SELECT id FROM folders WHERE folder_path = ? AND user_id = ?")
      .get(sanitizedFolderPath, userId)

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
        .prepare("SELECT id FROM documents WHERE document_path = ? AND user_id = ?")
        .get(documentPath, userId)

      if (existing) {
        documentPath = findAvailableDocumentPath(db, sanitizedBase, userId, sanitizedFolderPath)
      }
    }
  } else {
    documentPath = overwrite
      ? toPosixPath(filename)
      : findAvailableDocumentPath(db, sanitizedBase, userId)
  }

  // Check if overwriting
  if (overwrite) {
    const existing = db
      .prepare("SELECT id FROM documents WHERE document_path = ? AND user_id = ?")
      .get(documentPath, userId)

    if (existing) {
      // Update existing
      const timestamp = new Date().toISOString()
      db.prepare(
        "UPDATE documents SET title = ?, updated_at = ? WHERE document_path = ? AND user_id = ?"
      ).run(title, timestamp, documentPath, userId)

      // Write content to file
      await writeFileContent(documentPath, content ?? "", userId)

      const updated = db
        .prepare("SELECT * FROM documents WHERE document_path = ? AND user_id = ?")
        .get(documentPath, userId) as {
        id: string
        user_id: string
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
    "INSERT INTO documents (id, user_id, title, document_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, userId, title, documentPath, timestamp, timestamp)

  // Write content to file
  await writeFileContent(documentPath, content ?? "", userId)

  const created = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as {
    id: string
    user_id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }

  return documentRecordToMeta(created, false)
}

export async function createFolder(folderPathInput: string, userId: string) {
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
      .prepare("SELECT id FROM folders WHERE folder_path = ? AND user_id = ?")
      .get(parentRelativePath, userId)

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
      .prepare("SELECT id FROM folders WHERE folder_path = ? AND user_id = ?")
      .get(normalizedPath, userId)

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
  const folderAbsolutePath = path.join(getUserDocumentsDir(userId), folderRelativePath)
  await mkdir(folderAbsolutePath, { recursive: true })

  const id = randomUUID()
  const timestamp = new Date().toISOString()

  db.prepare(
    "INSERT INTO folders (id, user_id, folder_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, folderRelativePath, timestamp, timestamp)

  const created = db
    .prepare("SELECT * FROM folders WHERE id = ? AND user_id = ?")
    .get(id, userId) as {
    id: string
    user_id: string
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

export async function renameMarkdownFile(id: string, proposedTitle: string, userId: string) {
  const title = proposedTitle.trim()
  if (!title) {
    throw new MarkdownFileOperationError("Title must contain alphanumeric characters", 422)
  }

  const db = getDatabase()

  // Get existing document
  const existing = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as
    | {
        id: string
        user_id: string
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
      .prepare("SELECT id FROM documents WHERE document_path = ? AND id != ? AND user_id = ?")
      .get(nextDocumentPath, id, userId)

    if (conflict) {
      throw new MarkdownFileOperationError("A document with that title already exists", 409)
    }

    // Rename the file
    const oldAbsolutePath = getAbsoluteFilePath(existing.document_path, userId)
    const newAbsolutePath = getAbsoluteFilePath(nextDocumentPath, userId)
    
    await rename(oldAbsolutePath, newAbsolutePath)
  }

  const timestamp = new Date().toISOString()

  db.prepare(
    "UPDATE documents SET title = ?, document_path = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(title, nextDocumentPath, timestamp, id, userId)

  const updated = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as {
    id: string
    user_id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }

  return documentRecordToMeta(updated, false)
}

export async function updateMarkdownFileContent(id: string, content: string, userId: string) {
  const db = getDatabase()

  // Get document path
  const existing = db
    .prepare("SELECT document_path FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as { document_path: string } | undefined

  if (!existing) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  // Update timestamp in database
  const timestamp = new Date().toISOString()
  db.prepare("UPDATE documents SET updated_at = ? WHERE id = ? AND user_id = ?").run(timestamp, id, userId)

  // Write content to file
  await writeFileContent(existing.document_path, content, userId)

  const updated = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as {
    id: string
    user_id: string
    title: string
    document_path: string
    created_at: string
    updated_at: string
  }

  return documentRecordToMeta(updated, true)
}

export async function deleteMarkdownFile(id: string, userId: string) {
  const db = getDatabase()

  const existing = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(id, userId) as
    | {
        id: string
        user_id: string
        title: string
        document_path: string
        created_at: string
        updated_at: string
      }
    | undefined

  if (!existing) {
    throw new MarkdownFileOperationError("Document not found", 404)
  }

  // Attempt to cleanup uploaded assets referenced in markdown before deletion
  try {
    const content = await readFileContent(existing.document_path, userId)
    await deleteUploadsForMarkdown(content, userId)
  } catch (error) {
    console.warn(`Failed to cleanup uploads for document ${existing.document_path}:`, error)
  }

  // Delete file
  const absolutePath = getAbsoluteFilePath(existing.document_path, userId)
  await rm(absolutePath, { force: true })

  // Delete from database
  db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(id, userId)

  return documentRecordToMeta(existing, false)
}

export async function renameFolder(folderPathInput: string, newNameInput: string, userId: string) {
  const sanitizedOldPath = sanitizeFolderPath(folderPathInput)
  if (!sanitizedOldPath) {
    throw new MarkdownFileOperationError("Invalid folder path", 422)
  }

  const newNameSegments = sanitizeFolderSegments(newNameInput)
  if (!newNameSegments.length) {
    throw new MarkdownFileOperationError("Folder name must contain alphanumeric characters", 422)
  }

  const db = getDatabase()

  // Check if folder exists
  const folder = db
    .prepare("SELECT id FROM folders WHERE folder_path = ? AND user_id = ?")
    .get(sanitizedOldPath, userId) as { id: string } | undefined

  if (!folder) {
    throw new MarkdownFileOperationError("Folder not found", 404)
  }

  // Build new folder path
  const parentSegments = sanitizedOldPath.split("/").slice(0, -1)
  const newBaseName = newNameSegments[0]
  const newFolderPath = parentSegments.length > 0
    ? `${parentSegments.join("/")}/${newBaseName}`
    : newBaseName

  // Check if new path already exists
  const existing = db
    .prepare("SELECT id FROM folders WHERE folder_path = ? AND user_id = ?")
    .get(newFolderPath, userId)

  if (existing) {
    throw new MarkdownFileOperationError("A folder with that name already exists", 409)
  }

  // Rename the folder directory
  const oldAbsolutePath = path.join(getUserDocumentsDir(userId), sanitizedOldPath)
  const newAbsolutePath = path.join(getUserDocumentsDir(userId), newFolderPath)
  
  try {
    await rename(oldAbsolutePath, newAbsolutePath)
  } catch (error) {
    throw new MarkdownFileOperationError(
      `Failed to rename folder: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    )
  }

  // Get all documents and nested folders before updating database
  const documents = db
    .prepare("SELECT id, document_path FROM documents WHERE document_path LIKE ? AND user_id = ?")
    .all(`${sanitizedOldPath}/%`, userId) as Array<{ id: string; document_path: string }>

  const nestedFolders = db
    .prepare("SELECT folder_path FROM folders WHERE folder_path LIKE ? AND folder_path != ? AND user_id = ?")
    .all(`${sanitizedOldPath}/%`, sanitizedOldPath, userId) as Array<{ folder_path: string }>

    // Rename all document files
  for (const doc of documents) {
    const newDocPath = doc.document_path.replace(sanitizedOldPath, newFolderPath)
    const oldDocAbsolutePath = getAbsoluteFilePath(doc.document_path, userId)
    const newDocAbsolutePath = getAbsoluteFilePath(newDocPath, userId)
    
    try {
      await rename(oldDocAbsolutePath, newDocAbsolutePath)
    } catch (error) {
      // Log but continue - file might not exist
      console.warn(`Failed to rename document file: ${doc.document_path}`, error)
    }
  }

  // Update database in transaction
  const timestamp = new Date().toISOString()

  const transaction = db.transaction(() => {
    // Update the folder itself first
    db.prepare("UPDATE folders SET folder_path = ?, updated_at = ? WHERE folder_path = ? AND user_id = ?").run(
      newFolderPath,
      timestamp,
      sanitizedOldPath,
      userId
    )

    // Update all nested folder paths
    for (const nestedFolder of nestedFolders) {
      const newNestedPath = nestedFolder.folder_path.replace(sanitizedOldPath, newFolderPath)
      db.prepare("UPDATE folders SET folder_path = ?, updated_at = ? WHERE folder_path = ? AND user_id = ?").run(
        newNestedPath,
        timestamp,
        nestedFolder.folder_path,
        userId
      )
    }

    // Update all document paths
    for (const doc of documents) {
      const newDocPath = doc.document_path.replace(sanitizedOldPath, newFolderPath)
      db.prepare("UPDATE documents SET document_path = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
        newDocPath,
        timestamp,
        doc.id,
        userId
      )
    }

    return {
      id: folder.id,
      kind: "folder" as const,
      folderPath: newFolderPath,
      createdAt: new Date().toISOString(),
      updatedAt: timestamp,
    }
  })

  return transaction()
}

export async function deleteFolder(folderPathInput: string, userId: string) {
  const sanitized = sanitizeFolderPath(folderPathInput)
  if (!sanitized) {
    throw new MarkdownFileOperationError("Invalid folder path", 422)
  }

  const db = getDatabase()

  // Check if folder exists
  const folder = db
    .prepare("SELECT id FROM folders WHERE folder_path = ? AND user_id = ?")
    .get(sanitized, userId) as { id: string } | undefined

  if (!folder) {
    throw new MarkdownFileOperationError("Folder not found", 404)
  }

  // Get all documents in this folder to delete their files
  const documentsToDelete = db
    .prepare("SELECT document_path FROM documents WHERE (document_path = ? OR document_path LIKE ?) AND user_id = ?")
    .all(sanitized, `${sanitized}/%`, userId) as Array<{ document_path: string }>

  // Clean up uploaded assets referenced in markdown files within this folder tree
  await Promise.allSettled(
    documentsToDelete.map(async (doc) => {
      try {
        const content = await readFileContent(doc.document_path, userId)
        await deleteUploadsForMarkdown(content, userId)
      } catch (error) {
        console.warn(`Failed to cleanup uploads for document ${doc.document_path}:`, error)
      }
    })
  )

  const transaction = db.transaction(() => {
    // Delete files
    for (const doc of documentsToDelete) {
      const absolutePath = getAbsoluteFilePath(doc.document_path, userId)
      rm(absolutePath, { force: true }).catch(() => {
        // Ignore errors if file doesn't exist
      })
    }

    // Delete folder directory
    const folderAbsolutePath = path.join(getUserDocumentsDir(userId), sanitized)
    rm(folderAbsolutePath, { recursive: true, force: true }).catch(() => {
      // Ignore errors if folder doesn't exist
    })

    // Delete all documents in this folder and subfolders
    db.prepare("DELETE FROM documents WHERE (document_path = ? OR document_path LIKE ?) AND user_id = ?").run(
      sanitized,
      `${sanitized}/%`,
      userId
    )

    // Delete all subfolders
    db.prepare("DELETE FROM folders WHERE (folder_path = ? OR folder_path LIKE ?) AND user_id = ?").run(
      sanitized,
      `${sanitized}/%`,
      userId
    )

    return sanitized
  })

  return transaction()
}
