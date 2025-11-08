'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { FileNodeView } from './file-node-view'

export interface FileNodeAttributes {
  src: string // File path in Supabase storage
  filename: string
  fileSize: number
  fileType: string
  uploadStatus?: 'pending' | 'uploading' | 'completed' | 'error'
  previewType: 'image' | 'document' | 'file'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileNode: {
      insertFile: (attributes: Partial<FileNodeAttributes>) => ReturnType
    }
  }
}

export const FileNode = Node.create({
  name: 'fileNode',
  
  group: 'block',
  
  atom: true,
  
  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-src'),
        renderHTML: (attributes: FileNodeAttributes) => ({
          'data-src': attributes.src,
        }),
      },
      filename: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-filename'),
        renderHTML: (attributes: FileNodeAttributes) => ({
          'data-filename': attributes.filename,
        }),
      },
      fileSize: {
        default: 0,
        parseHTML: (element: HTMLElement) => parseInt(element.getAttribute('data-file-size') || '0'),
        renderHTML: (attributes: FileNodeAttributes) => ({
          'data-file-size': attributes.fileSize,
        }),
      },
      fileType: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-file-type'),
        renderHTML: (attributes: FileNodeAttributes) => ({
          'data-file-type': attributes.fileType,
        }),
      },
      uploadStatus: {
        default: 'completed' as const,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-upload-status') as FileNodeAttributes['uploadStatus'],
        renderHTML: (attributes: FileNodeAttributes) => ({
          'data-upload-status': attributes.uploadStatus,
        }),
      },
      previewType: {
        default: 'file' as const,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-preview-type') as FileNodeAttributes['previewType'],
        renderHTML: (attributes: FileNodeAttributes) => ({
          'data-preview-type': attributes.previewType,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-node"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string | number | boolean | null | undefined> }) {
    return ['div', mergeAttributes({ 'data-type': 'file-node' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileNodeView)
  },

  addCommands() {
    return {
      insertFile:
        (attributes: Partial<FileNodeAttributes>) =>
        ({ commands }: { commands: { insertContent: (content: { type: string; attrs: Partial<FileNodeAttributes> }) => boolean } }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})