export const DEFAULT_UPLOAD_PATH_PREFIX = "notes"

export const FILE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024 // 10MB cap for attachments

export const ALLOWED_UPLOAD_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documents
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  // Archives
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  // Other common developer types
  "application/json",
  "text/csv",
  "text/html",
  "text/css"
]
