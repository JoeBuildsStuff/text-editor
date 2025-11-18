// Helpers to serialize/restore TipTap file nodes as markdown-safe links so
// custom nodes survive round-trips through the Markdown extension.
import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { sanitizeUserSegment } from '@/lib/user-paths'

const FILE_NODE_SCHEME = 'file-node'

type FileMeta = {
  src: string
  filename: string
  fileSize?: number
  fileType?: string
  previewType?: 'image' | 'document' | 'file'
}

type LinkMark = { type: 'link'; attrs?: { href?: string } }

function buildFileLinkHref(attrs: FileMeta) {
  const url = new URL(`${FILE_NODE_SCHEME}://file`)
  url.searchParams.set('src', attrs.src)
  url.searchParams.set('filename', attrs.filename)
  if (typeof attrs.fileSize === 'number') {
    url.searchParams.set('size', String(attrs.fileSize))
  }
  if (attrs.fileType) {
    url.searchParams.set('type', attrs.fileType)
  }
  if (attrs.previewType) {
    url.searchParams.set('preview', attrs.previewType)
  }
  return url.toString()
}

function parseFileLinkHref(href?: string): FileMeta | null {
  if (!href || !href.startsWith(`${FILE_NODE_SCHEME}://`)) return null
  try {
    const url = new URL(href)
    const src = url.searchParams.get('src') || ''
    const filename = url.searchParams.get('filename') || 'file'
    const fileSize = url.searchParams.get('size')
    const fileType = url.searchParams.get('type') || undefined
    const previewType = url.searchParams.get('preview') as FileMeta['previewType']

    return {
      src,
      filename,
      fileSize: fileSize ? Number(fileSize) : undefined,
      fileType,
      previewType,
    }
  } catch (error) {
    console.error('Failed to parse file node link', error)
    return null
  }
}

function stripUserFromPath(src: string, userSegment?: string) {
  const parts = src.split('/').filter(Boolean)
  if (!parts.length) return src
  if (userSegment && parts[0] === userSegment) {
    return parts.slice(1).join('/')
  }
  return parts.slice(1).join('/') || parts.join('/')
}

function addUserToPath(src: string, userSegment?: string) {
  if (!userSegment) return src
  if (src.startsWith(`${userSegment}/`)) return src
  const trimmed = src.replace(/^\/+/, '')
  return `${userSegment}/${trimmed}`
}

function replaceFileNodesWithLinks(json: JSONContent, userSegment?: string): JSONContent {
  const mapNodes = (nodes: JSONContent[]): JSONContent[] =>
    nodes.map((node): JSONContent => {
      if (node?.type === 'fileNode') {
        const attrs = node.attrs as FileMeta & { fileSize: number; fileType: string; previewType: FileMeta['previewType'] }
        const href = buildFileLinkHref({
          src: stripUserFromPath(attrs.src, userSegment),
          filename: attrs.filename,
          fileSize: attrs.fileSize,
          fileType: attrs.fileType,
          previewType: attrs.previewType,
        })

        return {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: attrs.filename || 'file',
              marks: [
                {
                  type: 'link',
                  attrs: { href }
                }
              ]
            }
          ]
        }
      }

      if (Array.isArray(node?.content)) {
        return {
          ...node,
          content: mapNodes(node.content)
        }
      }

      return node
    })

  return {
    ...json,
    content: Array.isArray(json?.content) ? mapNodes(json.content) : json?.content
  }
}

export function restoreFileNodesFromLinks(json: JSONContent, userSegment?: string) {
  let changed = false

  const mapNodes = (nodes: JSONContent[]): JSONContent[] =>
    nodes.map((node): JSONContent => {
      if (node?.type === 'paragraph' && Array.isArray(node.content) && node.content.length === 1) {
        const child = node.content[0]
        const linkMark = (child?.marks as LinkMark[] | undefined)?.find(
          (mark): mark is LinkMark => mark.type === 'link' && typeof mark.attrs?.href === 'string'
        )
        const meta = parseFileLinkHref(linkMark?.attrs?.href)

        if (meta) {
          changed = true
          return {
            type: 'fileNode',
            attrs: {
              src: addUserToPath(meta.src, userSegment),
              filename: meta.filename,
              fileSize: meta.fileSize || 0,
              fileType: meta.fileType || 'application/octet-stream',
              previewType: meta.previewType || 'file',
              uploadStatus: 'completed'
            }
          }
        }
      }

      if (Array.isArray(node?.content)) {
        return {
          ...node,
          content: mapNodes(node.content)
        }
      }

      return node
    })

  const content = Array.isArray(json?.content) ? mapNodes(json.content) : json?.content
  return { doc: { ...json, content }, changed }
}

export function getMarkdownWithFileNodes(editor: Editor, userId?: string | null) {
  const userSegment = sanitizeUserSegment(userId)
  const json = editor.getJSON() as JSONContent
  const safeJson = replaceFileNodesWithLinks(json, userSegment)
  return editor.markdown ? editor.markdown.serialize(safeJson) : editor.getMarkdown()
}

export function restoreFileNodes(editor: Editor | null, userId?: string | null) {
  if (!editor) return
  const userSegment = sanitizeUserSegment(userId)
  const json = editor.getJSON()
  const { doc, changed } = restoreFileNodesFromLinks(json, userSegment)
  if (changed) {
    editor.commands.setContent(doc, { contentType: 'json', emitUpdate: false })
  }
}
