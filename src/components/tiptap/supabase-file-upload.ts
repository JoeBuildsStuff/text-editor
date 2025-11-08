export interface SupabaseFileUploadOptions {
  bucket: string
  pathPrefix?: string
  maxFileSize?: number
  allowedMimeTypes?: string[]
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

export interface FileUploadResult {
  success: boolean
  url?: string
  filePath?: string
  error?: string
}

export async function uploadFileToSupabase(
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
      url: result.filePath, // Store the file path
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

export function createSupabaseFileUploader(
  options: Partial<SupabaseFileUploadOptions> = {}
) {
  return (file: File) => uploadFileToSupabase(file, options)
}
