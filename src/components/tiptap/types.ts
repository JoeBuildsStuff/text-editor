import type { AnyExtension, Editor } from "@tiptap/core"

export type CommentSelectionPayload = {
  anchorFrom: number
  anchorTo: number
  anchorExact: string
  anchorPrefix: string
  anchorSuffix: string
  position: {
    top: number
    left: number
  }
}

// Types for configurable Tiptap component
export interface TiptapFileUploadConfig {
  /** Upload function that returns a promise with the uploaded file path */
  uploadFn?: (file: File) => Promise<string>
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number
  /** Allowed file MIME types */
  allowedMimeTypes?: string[]
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
  /** Enables executable code blocks with run controls */
  enableCodeExecution?: boolean
  /** Whether the editor is readonly (non-editable) */
  readonly?: boolean
  /** Additional CSS classes for the root container */
  className?: string
  /** Additional extensions to register in the editor */
  extensions?: AnyExtension[]
  /** Called when the editor instance is created */
  onEditorReady?: (editor: Editor | null) => void
  /** Called when the user requests to comment on the current selection from the bubble menu */
  onRequestCommentFromSelection?: (payload: CommentSelectionPayload) => void
  /** Whether the comments panel is visible */
  showComments?: boolean
  /** Callback when comments panel visibility should change */
  onShowCommentsChange?: (show: boolean) => void
  /** Document id used for built-in comments orchestration */
  commentsDocumentId?: string
}

export interface FileUploadResult {
  success: boolean
  filePath?: string
  error?: string
}
