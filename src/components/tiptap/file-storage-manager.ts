import { ALLOWED_UPLOAD_MIME_TYPES, DEFAULT_UPLOAD_PATH_PREFIX, FILE_UPLOAD_MAX_BYTES } from "@/lib/uploads/config"

/**
 * Unified File Manager for server-backed uploads.
 * 
 * Consolidates upload, serve, and delete operations behind a shared interface so
 * the editor can remain storage-agnostic.
 */

export interface FileUploadOptions {
  pathPrefix?: string
  maxFileSize?: number
  allowedMimeTypes?: string[]
}

export interface FileUploadResult {
  success: boolean
  url?: string
  filePath?: string
  error?: string
}

export interface FileDeleteResult {
  success: boolean
  error?: string
}

export interface FileServeResult {
  success: boolean
  url?: string
  error?: string
}

const DEFAULT_OPTIONS: Required<FileUploadOptions> = {
  pathPrefix: DEFAULT_UPLOAD_PATH_PREFIX,
  maxFileSize: FILE_UPLOAD_MAX_BYTES,
  allowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES,
}

/**
 * Uploads a file to the local storage API
 */
export async function uploadFile(
  file: File,
  options: Partial<FileUploadOptions> = {}
): Promise<FileUploadResult> {
  const config: Required<FileUploadOptions> = {
    pathPrefix: options.pathPrefix ?? DEFAULT_OPTIONS.pathPrefix,
    maxFileSize:
      typeof options.maxFileSize === "number" && options.maxFileSize > 0
        ? options.maxFileSize
        : DEFAULT_OPTIONS.maxFileSize,
    allowedMimeTypes:
      Array.isArray(options.allowedMimeTypes) && options.allowedMimeTypes.length > 0
        ? options.allowedMimeTypes
        : DEFAULT_OPTIONS.allowedMimeTypes,
  }
  
  try {
    // Validate file type
    if (!config.allowedMimeTypes.includes(file.type)) {
      return {
        success: false,
        error: `Unsupported file type: ${file.type}. Allowed types: ${config.allowedMimeTypes.join(', ')}`
      }
    }

    // Validate file size
    if (file.size > config.maxFileSize) {
      return {
        success: false,
        error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size: ${(config.maxFileSize / 1024 / 1024).toFixed(1)}MB`
      }
    }

    // Use API route for upload
    const formData = new FormData()
    formData.append('file', file)
    formData.append('pathPrefix', config.pathPrefix || DEFAULT_UPLOAD_PATH_PREFIX)

    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || `Upload failed with status: ${response.status}`
      }
    }

    const result = await response.json()
    
    if (!result.success || !result.filePath) {
      return {
        success: false,
        error: 'Invalid response from upload API'
      }
    }

    return {
      success: true,
      url: result.filePath,
      filePath: result.filePath
    }

  } catch (error) {
    console.error('Unexpected error in file upload:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Deletes a file from storage
 */
export async function deleteFile(filePath: string): Promise<FileDeleteResult> {
  try {
    const response = await fetch(`/api/files/delete?path=${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error(`Failed to delete file ${filePath}:`, errorData.error || response.statusText)
      return {
        success: false,
        error: errorData.error || response.statusText
      }
    }
    
    const result = await response.json()
    console.log(`Successfully deleted file: ${filePath}`)
    return { success: result.success === true }
    
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Gets a URL for serving a file
 */
export async function getFileUrl(filePath: string): Promise<FileServeResult> {
  try {
    const response = await fetch(`/api/files/serve?path=${encodeURIComponent(filePath)}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error || `Failed to get file URL: ${response.status}`
      }
    }
    
    const result = await response.json()
    
    if (!result.success || !result.fileUrl) {
      return {
        success: false,
        error: 'Invalid response from serve API'
      }
    }
    
    return {
      success: true,
      url: result.fileUrl
    }
    
  } catch (error) {
    console.error(`Error getting file URL for ${filePath}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Deletes multiple files from storage
 */
export async function deleteFiles(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  
  const deletePromises = filePaths.map(path => deleteFile(path))
  await Promise.allSettled(deletePromises)
}

/**
 * Factory function to create a file uploader with specific options
 */
export function createFileUploader(
  options: Partial<FileUploadOptions> = {}
) {
  return (file: File) => uploadFile(file, options)
}

// Legacy alias for cleanup helper
export const cleanupFiles = deleteFiles
export const cleanupImages = deleteFiles
