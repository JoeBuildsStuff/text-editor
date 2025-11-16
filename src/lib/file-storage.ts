import { randomUUID } from "node:crypto"
import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { createReadStream } from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"

import { ALLOWED_UPLOAD_MIME_TYPES, DEFAULT_UPLOAD_PATH_PREFIX, FILE_UPLOAD_MAX_BYTES } from "./uploads/config"

const FILE_STORAGE_ROOT = process.env.FILE_STORAGE_DIR
  ? path.isAbsolute(process.env.FILE_STORAGE_DIR)
    ? process.env.FILE_STORAGE_DIR
    : path.join(process.cwd(), process.env.FILE_STORAGE_DIR)
  : path.join(process.cwd(), "server", "uploads")

export class FileStorageError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "FileStorageError"
    this.status = status
  }
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "text/plain": ".txt",
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/msword": ".doc",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/zip": ".zip",
  "application/x-rar-compressed": ".rar",
  "application/x-7z-compressed": ".7z",
  "application/json": ".json",
  "text/csv": ".csv",
  "text/html": ".html",
  "text/css": ".css"
}

function sanitizeSegment(input: string) {
  return input.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

function sanitizeFilename(input: string) {
  const base = input.replace(/\.[^/.]+$/, "")
  const sanitized = sanitizeSegment(base)
  return sanitized || "file"
}

function sanitizePathPrefix(input?: string | null) {
  if (!input) return [DEFAULT_UPLOAD_PATH_PREFIX]
  const segments = input
    .split("/")
    .map((segment) => sanitizeSegment(segment))
    .filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    segments.push(DEFAULT_UPLOAD_PATH_PREFIX)
  }
  return segments
}

function normalizeStoredPath(input: string) {
  const normalized = path.posix.normalize(input.replace(/\\/g, "/"))
  if (!normalized || normalized === ".") {
    throw new FileStorageError("Invalid file path", 400)
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new FileStorageError("Invalid file path", 400)
  }
  const trimmed = normalized.replace(/^\/+/, "")
  const segments = trimmed.split("/").filter(Boolean)
  if (segments.length === 0) {
    throw new FileStorageError("Invalid file path", 400)
  }
  if (segments.some((segment) => segment === "..")) {
    throw new FileStorageError("Invalid file path", 400)
  }
  return segments.join("/")
}

function ensureUserScope(normalizedPath: string, userId: string) {
  const userSegment = sanitizeSegment(userId)
  if (!userSegment) {
    throw new FileStorageError("Invalid user identifier", 400)
  }
  const segments = normalizedPath.split("/").filter(Boolean)
  if (segments.length === 0 || segments[0] !== userSegment) {
    throw new FileStorageError("Access denied", 403)
  }
  const absolutePath = path.join(FILE_STORAGE_ROOT, ...segments)
  return { absolutePath, segments }
}

function inferMimeType(filePath: string, fallback?: string) {
  const ext = path.extname(filePath).toLowerCase()
  const entry = Object.entries(MIME_EXTENSION_MAP).find(([, value]) => value === ext)
  if (entry) return entry[0]
  return fallback ?? "application/octet-stream"
}

export function getNormalizedFilePath(filePath: string, userId: string) {
  const normalized = normalizeStoredPath(filePath)
  ensureUserScope(normalized, userId)
  return normalized
}

export type StoredFileInfo = {
  filePath: string
  absolutePath: string
  size: number
  mimeType: string
}

export async function saveUploadedFile(
  file: File,
  {
    userId,
    pathPrefix,
    allowedMimeTypes = ALLOWED_UPLOAD_MIME_TYPES,
    maxSize = FILE_UPLOAD_MAX_BYTES,
  }: {
    userId: string
    pathPrefix?: string | null
    allowedMimeTypes?: string[]
    maxSize?: number
  }
): Promise<StoredFileInfo> {
  if (!(file instanceof File)) {
    throw new FileStorageError("Invalid file upload", 400)
  }

  const mimeType = file.type || "application/octet-stream"
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new FileStorageError("Unsupported file type", 415)
  }

  if (file.size > maxSize) {
    throw new FileStorageError("File exceeds maximum size", 413)
  }

  const userSegment = sanitizeSegment(userId)
  if (!userSegment) {
    throw new FileStorageError("Invalid user identifier", 400)
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const segments = [userSegment, ...sanitizePathPrefix(pathPrefix)]
  const baseName = sanitizeFilename(file.name || "upload")
  const extension = path.extname(file.name || "") || MIME_EXTENSION_MAP[mimeType] || ""
  const uniqueName = `${baseName}-${randomUUID().slice(0, 8)}${extension}`
  segments.push(uniqueName)

  const absolutePath = path.join(FILE_STORAGE_ROOT, ...segments)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)

  const filePath = segments.join("/")
  return {
    filePath,
    absolutePath,
    size: buffer.length,
    mimeType,
  }
}

export async function deleteStoredFile(filePath: string, userId: string) {
  const normalized = normalizeStoredPath(filePath)
  const { absolutePath } = ensureUserScope(normalized, userId)
  await rm(absolutePath, { force: true })
}

export async function statStoredFile(filePath: string, userId: string) {
  const normalized = normalizeStoredPath(filePath)
  const { absolutePath } = ensureUserScope(normalized, userId)
  let fileStats: Awaited<ReturnType<typeof stat>>
  try {
    fileStats = await stat(absolutePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FileStorageError("File not found", 404)
    }
    throw error
  }
  return {
    filePath: normalized,
    absolutePath,
    size: fileStats.size,
    mimeType: inferMimeType(absolutePath),
  }
}

export async function getFileReadableStream(filePath: string, userId: string) {
  const fileInfo = await statStoredFile(filePath, userId)
  const stream = Readable.toWeb(createReadStream(fileInfo.absolutePath)) as ReadableStream
  return { ...fileInfo, stream }
}

export function getFileStorageRoot() {
  return FILE_STORAGE_ROOT
}
