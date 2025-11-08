/**
 * Unified Supabase File Manager
 * 
 * Consolidates all file operations (upload, serve, delete) into a single interface
 * for better maintainability and consistency.
 */

export interface SupabaseFileUploadOptions {
  bucket: string
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

const DEFAULT_OPTIONS: Required<SupabaseFileUploadOptions> = {
  bucket: 'ai-transcriber-files',
  pathPrefix: 'notes',
  maxFileSize: 10 * 1024 * 1024, // 10MB for documents
  allowedMimeTypes: [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Documents
    'text/plain', 'application/pdf', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Other common types
    'application/json', 'text/csv', 'text/html', 'text/css'
  ]
}

/**
 * Uploads a file to Supabase storage
 */
export async function uploadFile(
  file: File,
  options: Partial<SupabaseFileUploadOptions> = {}
): Promise<FileUploadResult> {
  const config = { ...DEFAULT_OPTIONS, ...options }
  
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
    formData.append('pathPrefix', config.pathPrefix || 'notes')

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
 * Deletes a file from Supabase storage
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
 * Gets a signed URL for serving a file
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
    
    if (!result.success || !result.url) {
      return {
        success: false,
        error: 'Invalid response from serve API'
      }
    }
    
    return {
      success: true,
      url: result.url
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
 * Deletes multiple files from Supabase storage
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
  options: Partial<SupabaseFileUploadOptions> = {}
) {
  return (file: File) => uploadFile(file, options)
}

// Legacy aliases for backward compatibility
export const uploadFileToSupabase = uploadFile
export const deleteFileFromStorage = deleteFile
export const cleanupFiles = deleteFiles
export const cleanupImages = deleteFiles
export const deleteImageFromStorage = deleteFile
