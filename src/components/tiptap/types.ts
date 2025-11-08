// Types for configurable Tiptap component
export interface TiptapFileUploadConfig {
  /** Upload function that returns a promise with the uploaded file path */
  uploadFn?: (file: File) => Promise<string>
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number
  /** Allowed file MIME types */
  allowedMimeTypes?: string[]
  /** Supabase bucket name for uploads */
  supabaseBucket?: string
  /** Custom path prefix for uploads */
  pathPrefix?: string
}

export interface TiptapProps {
  content?: string
  showFixedMenu?: boolean
  showBubbleMenu?: boolean
  showDragHandle?: boolean
  onChange?: (content: string) => void
  onFileDrop?: (files: File[]) => void
  /** File upload configuration */
  fileUploadConfig?: TiptapFileUploadConfig
  /** Whether to show file nodes for non-image files */
  enableFileNodes?: boolean
}

export interface FileUploadResult {
  success: boolean
  filePath?: string
  error?: string
}