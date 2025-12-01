// Helpers to serialize/restore TipTap custom nodes so they survive when the
// document is converted to Markdown and back again.
import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { sanitizeUserSegment } from '@/lib/user-paths'

const FILE_NODE_SCHEME = 'file-node'
const CODE_BLOCK_META_LANGUAGE = '__code_execution_meta__'

type FileMeta = {
  src: string
  filename: string
  fileSize?: number | undefined
  fileType?: string | undefined
  previewType?: 'image' | 'document' | 'file' | undefined
}

type LinkMark = { type: 'link'; attrs?: { href?: string } }

type CodeBlockAttrs = {
  lastOutput?: string
  lastError?: string | null
}

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

  const mappedContent = Array.isArray(json?.content) ? mapNodes(json.content) : json?.content
  if (mappedContent === undefined) {
    return json
  }
  return {
    ...json,
    content: mappedContent,
  }
}

function insertCodeBlockExecutionMeta(json: JSONContent): JSONContent {
  const mapNodes = (nodes?: JSONContent[]): JSONContent[] => {
    if (!Array.isArray(nodes)) return nodes ?? []

    const result: JSONContent[] = []

    nodes.forEach((node) => {
      if (!node) return

      const mappedNode = Array.isArray(node.content)
        ? { ...node, content: mapNodes(node.content) }
        : node

      result.push(mappedNode)

      if (mappedNode.type !== 'codeBlock') {
        return
      }

      const attrs = (mappedNode.attrs as CodeBlockAttrs | undefined) ?? {}
      const lastOutput = typeof attrs.lastOutput === 'string' ? attrs.lastOutput : ''
      const lastError = typeof attrs.lastError === 'string' ? attrs.lastError : null
      const hasPersistedData = Boolean(lastOutput) || Boolean(lastError)

      if (!hasPersistedData) {
        return
      }

      result.push({
        type: 'codeBlock',
        attrs: { language: CODE_BLOCK_META_LANGUAGE },
        content: [
          {
            type: 'text',
            text: JSON.stringify({ lastOutput, lastError }),
          },
        ],
      })
    })

    return result
  }

  const mappedContent = Array.isArray(json?.content) ? mapNodes(json.content) : json?.content
  if (mappedContent === undefined) {
    return json
  }

  return {
    ...json,
    content: mappedContent,
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
  const doc: JSONContent = content === undefined ? json : { ...json, content }
  return { doc, changed }
}

function restoreCodeBlockExecutionMeta(json: JSONContent) {
  let changed = false

  const mapNodes = (nodes?: JSONContent[]): JSONContent[] => {
    if (!Array.isArray(nodes)) return nodes ?? []

    const result: JSONContent[] = []

    nodes.forEach((node) => {
      if (!node) return

      if (node.type === 'codeBlock' && node.attrs?.language === CODE_BLOCK_META_LANGUAGE) {
        const payload = (node.content ?? [])
          .map((child) => (typeof child.text === 'string' ? child.text : ''))
          .join('')

        const meta = (() => {
          try {
            return JSON.parse(payload) as CodeBlockAttrs
          } catch {
            return null
          }
        })()

        const previous = result[result.length - 1]
        if (meta && previous?.type === 'codeBlock') {
          const attrs = {
            ...(previous.attrs || {}),
            lastOutput: typeof meta.lastOutput === 'string' ? meta.lastOutput : '',
            lastError: typeof meta.lastError === 'string' ? meta.lastError : null,
          }
          result[result.length - 1] = { ...previous, attrs }
        }

        changed = true
        return
      }

      const mappedNode = Array.isArray(node.content)
        ? { ...node, content: mapNodes(node.content) }
        : node

      result.push(mappedNode)
    })

    return result
  }

  const content = Array.isArray(json?.content) ? mapNodes(json.content) : json?.content
  const doc: JSONContent = content === undefined ? json : { ...json, content }
  return { doc, changed }
}

export function getMarkdownWithFileNodes(editor: Editor, userId?: string | null) {
  const userSegment = sanitizeUserSegment(userId)
  const json = editor.getJSON() as JSONContent
  const withFileLinks = replaceFileNodesWithLinks(json, userSegment)
  const safeJson = insertCodeBlockExecutionMeta(withFileLinks)
  return editor.markdown ? editor.markdown.serialize(safeJson) : editor.getMarkdown()
}

export function restoreFileNodes(editor: Editor | null, userId?: string | null) {
  if (!editor) return
  const userSegment = sanitizeUserSegment(userId)
  const json = editor.getJSON()
  const { doc: fileDoc, changed: fileChanged } = restoreFileNodesFromLinks(json, userSegment)
  const { doc, changed: codeChanged } = restoreCodeBlockExecutionMeta(fileDoc)
  if (fileChanged || codeChanged) {
    editor.commands.setContent(doc, { contentType: 'json', emitUpdate: false })
  }
}
