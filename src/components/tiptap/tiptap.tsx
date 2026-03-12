'use client'

import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import { Placeholder, Gapcursor } from '@tiptap/extensions'
import CodeBlockLowlight, { type CodeBlockLowlightOptions } from '@tiptap/extension-code-block-lowlight'
import { Link } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table/row'
import { TableCell } from '@tiptap/extension-table/cell'
import { TableHeader } from '@tiptap/extension-table/header'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { FileNode } from '@/components/tiptap/file-node'
import { createLowlight, common } from 'lowlight'
import { useEffect, useMemo, useState } from 'react'
import { TiptapProps } from './types'
import { Image } from '@tiptap/extension-image'
import { CustomImageView } from './custom-image-view'
import { deleteFile } from './file-storage-manager'
import { Markdown } from '@tiptap/markdown'
import { Plugin } from '@tiptap/pm/state'
import { Fragment, Slice } from '@tiptap/pm/model'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'

import { TooltipProvider } from '@/components/ui/tooltip'
import {
    Strikethrough,
    Type,
    AlignLeft,
    GripVertical,
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Code,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { CodeBlock } from '@/components/tiptap/code-block'
import FixedMenu from '@/components/tiptap/fixed-menu'
import BubbleMenuComponent from '@/components/tiptap/bubble-menu'
import { CommentComposerPopover } from '@/components/tiptap/comment-composer-popover'
import { CommentsPanel } from '@/components/tiptap/comments-panel'
import { useDocumentComments } from '@/components/tiptap/use-document-comments'
import { createFileHandlerConfig } from '@/components/tiptap/file-handler'
import { authClient } from '@/lib/auth-client'
import { getMarkdownWithFileNodes, restoreFileNodes } from '@/components/tiptap/file-node-serialization'
import { cn } from '@/lib/utils'

type CodeExecutionAttrs = {
  lastOutput?: string
  lastError?: string | null
}

type CustomCodeBlockOptions = CodeBlockLowlightOptions & {
  codeExecution?: {
    enabled?: boolean
  }
}

function createExecutionCopyNodes(schema: Schema, attrs: CodeExecutionAttrs): PMNode[] {
  const output = typeof attrs.lastOutput === 'string' ? attrs.lastOutput : ''
  const error = typeof attrs.lastError === 'string' ? attrs.lastError : ''
  if (!output && !error) {
    return []
  }

  const nodes: PMNode[] = []
  const paragraphType = schema.nodes.paragraph
  const codeBlockType = schema.nodes.codeBlock

  if (!codeBlockType) {
    return nodes
  }

  const addSection = (label: string, content: string) => {
    if (!content) return

    if (paragraphType) {
      nodes.push(paragraphType.create({}, schema.text(label)))
    }

    nodes.push(
      codeBlockType.create(
        { language: null },
        schema.text(content)
      )
    )
  }

  addSection('Execution output:', output)
  addSection('Execution error:', error)

  return nodes
}

function appendExecutionDataToFragment(fragment: Fragment, schema: Schema, codeBlockName: string) {
  let changed = false
  const nodes: PMNode[] = []

  fragment.forEach((node) => {
    let currentNode = node
    if (node.content.size) {
      const { fragment: childFragment, changed: childChanged } = appendExecutionDataToFragment(node.content, schema, codeBlockName)
      if (childChanged) {
        currentNode = node.copy(childFragment)
        changed = true
      }
    }

    nodes.push(currentNode)

    if (currentNode.type.name === codeBlockName) {
      const extras = createExecutionCopyNodes(schema, currentNode.attrs as CodeExecutionAttrs)
      if (extras.length) {
        nodes.push(...extras)
        changed = true
      }
    }
  })

  if (!changed) {
    return { fragment, changed }
  }

  return { fragment: Fragment.fromArray(nodes), changed }
}

const lowlight = createLowlight(common)
const CustomCodeBlock = CodeBlockLowlight.extend<CustomCodeBlockOptions>({
  addOptions() {
    const parentOptions = (this.parent?.() ?? { lowlight }) as CustomCodeBlockOptions
    return {
      ...parentOptions,
      codeExecution: {
        enabled: false,
      },
    }
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      lastOutput: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-last-output') || '',
        renderHTML: (attributes: { lastOutput?: string }) => {
          if (!attributes.lastOutput) return {}
          return { 'data-last-output': attributes.lastOutput }
        },
      },
      lastError: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-last-error') || null,
        renderHTML: (attributes: { lastError?: string | null }) => {
          if (!attributes.lastError) return {}
          return { 'data-last-error': attributes.lastError }
        },
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlock)
  },
  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || []

    const copyPlugin = new Plugin({
      props: {
        transformCopied: (slice) => {
          const schema = this.editor?.schema
          if (!schema) {
            return slice
          }

          const { fragment, changed } = appendExecutionDataToFragment(slice.content, schema, this.name)
          if (!changed) {
            return slice
          }

          return new Slice(fragment, slice.openStart, slice.openEnd)
        },
      },
    })

    return [...parentPlugins, copyPlugin]
  },
})

const Tiptap = ({ 
  content, 
  showFixedMenu = true, 
  showBubbleMenu = true, 
  showDragHandle = true, 
  onChange, 
  onFileDrop,
  fileUploadConfig,
  enableFileNodes = true,
  enableCodeExecution = false,
  readonly = false,
  className,
  extensions = [],
  onEditorReady,
  onRequestCommentFromSelection,
  showComments,
  onShowCommentsChange,
  commentsDocumentId,
}: TiptapProps) => {
  // Track the currently selected node for drag handle functionality
  const [, setSelectedNode] = useState<{ type: { name: string } } | null>(null)
  const sessionState = authClient.useSession()
  const userId = sessionState.data?.user?.id
  const commentsEnabled = Boolean(commentsDocumentId)
  const {
    setEditor: setCommentsEditor,
    commentExtension,
    queueAnchorSync,
    currentUser,
    currentUserId,
    displayName,
    initials,
    composerRef,
    composerSelection,
    composerLeft,
    composerTop,
    composerContent,
    setComposerContent,
    isSubmittingComposer,
    closeComposer,
    handleOpenComposer,
    handleSubmitComposer,
    isLoadingThreads,
    threads,
    selectedThreadId,
    setSelectedThreadId,
    replyContent,
    setReplyContent,
    handleCreateReply,
    handleToggleThreadResolved,
    handleDeleteThread,
    handleDeleteComment,
    handleUpdateComment,
  } = useDocumentComments(commentsDocumentId ? { documentId: commentsDocumentId } : {})
  const tiptapExtensions = useMemo(
    () => (commentsEnabled ? [...extensions, commentExtension] : extensions),
    [commentExtension, commentsEnabled, extensions]
  )
  const commentSelectionHandler = commentsEnabled ? handleOpenComposer : onRequestCommentFromSelection

  const editor = useEditor({
    editable: !readonly,
    extensions: [
        Markdown,
        StarterKit,
        Underline,
        TextAlign.configure({
            types: ['heading', 'paragraph'],
        }),
        Placeholder.configure({
            placeholder:'Write something…',
        }),
        CustomCodeBlock.configure({
            lowlight,
            HTMLAttributes: {
              class: 'hljs',
            },
            codeExecution: {
              enabled: enableCodeExecution,
            }
        }),
        Link.configure({
            openOnClick: false,
            autolink: true,
            defaultProtocol: 'https',
            protocols: ['http', 'https'],
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableCell,
        TableHeader,
        Gapcursor,
        ...(enableFileNodes ? [
          createFileHandlerConfig({ 
            onFileDrop,
            fileUploadConfig
          })
        ] : []),
        
        Image.extend({
          addAttributes() {
            return {
              ...this.parent?.(),
              width: {
                default: null,
                parseHTML: (element) => {
                  const width = element.getAttribute('width')
                  if (!width) return null
                  const parsed = parseInt(width, 10)
                  return Number.isNaN(parsed) ? null : parsed
                },
                renderHTML: (attributes) =>
                  attributes.width ? { width: String(attributes.width) } : {},
              },
              height: {
                default: null,
                parseHTML: (element) => {
                  const height = element.getAttribute('height')
                  if (!height) return null
                  const parsed = parseInt(height, 10)
                  return Number.isNaN(parsed) ? null : parsed
                },
                renderHTML: (attributes) =>
                  attributes.height ? { height: String(attributes.height) } : {},
              },
            }
          },
          addNodeView() {
            return ReactNodeViewRenderer(CustomImageView)
          },
        }).configure({
          inline: false,
          allowBase64: false, // Always false - we store file paths, not base64
          HTMLAttributes: {
            class: 'tiptap-image',
          }
        }),
        ...(enableFileNodes ? [
          FileNode
        ] : []),
        ...tiptapExtensions,
    ],
    content: content || ``,
    contentType: 'markdown',
    immediatelyRender: false,
    onDelete(params: { type: string; node?: { type: { name: string }; attrs?: { src?: string } }; [key: string]: unknown }) {
      // Handle cleanup of deleted image and file nodes
      const { type, node } = params
      if (type === 'node' && node?.attrs?.src) {
        const src = node.attrs.src
        // Only cleanup locally stored file paths, not external URLs
        if (typeof src === 'string' && !src.startsWith('http') && !src.startsWith('data:')) {
          deleteFile(src).catch((error: unknown) => {
            console.error('Failed to cleanup deleted file:', error)
          })
        }
      }
    },
    onUpdate: ({ editor }) => {
      if (commentsEnabled) {
        queueAnchorSync()
      }

      if (onChange) {
        try {
          // Return markdown (with file nodes preserved) if available, otherwise fall back to HTML
          const markdown = getMarkdownWithFileNodes(editor, userId)
          onChange(markdown)
        } catch {
          // Fallback to HTML if markdown conversion fails
          onChange(editor.getHTML())
        }
      }
    },
    editorProps: {
      attributes: {
        class: [
          "prose",
          "max-w-none",
          "mx-auto",
          "focus:outline-none",
          "dark:prose-invert",
          // INLINE CODE STYLING
          "prose-code:before:content-none",
          "prose-code:after:content-none",
          "prose-code:bg-muted",
          "prose-code:px-2.5",
          "prose-code:py-1",
          "prose-code:rounded-sm",
          // CODE BLOCK FIX — remove inline styles leaking into blocks
          "[&_pre_code]:!bg-transparent",
          "[&_pre_code]:!px-0",
          "[&_pre_code]:!py-0",
          "[&_pre_code]:!rounded-none",
          // Ensure prose defaults don't add spacing around code blocks
          "[&_pre]:!m-0",
          "[&_pre]:!bg-transparent",
          "[&_pre]:!p-0",
        ].join(" "),
      },
      handleKeyDown: (_view, event) => {
        // Handle Cmd+K (or Ctrl+K) for link
        if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
          event.preventDefault()
          // Note: Link functionality is now handled by LinkButton components
          return true
        }
        return false
      },
    }
  })

  useEffect(() => {
    if (!commentsEnabled) {
      return
    }

    setCommentsEditor(editor ?? null)
  }, [commentsEnabled, editor, setCommentsEditor])

  // Convert placeholder file links (stored in markdown) back into file nodes so they render
  useEffect(() => {
    if (editor) {
      try {
        // Try to get markdown content for comparison (with file nodes preserved)
        const editorMarkdown = getMarkdownWithFileNodes(editor, userId)
        // Compare the content and update only if it's different.
        // This prevents an infinite loop.
        if (content !== editorMarkdown) {
          editor.commands.setContent((content as string) || '', { 
            contentType: 'markdown',
            emitUpdate: false 
          })
          restoreFileNodes(editor, userId)
        }
      } catch {
        // Fallback to HTML comparison if markdown is not available
        const editorContent = editor.getHTML()
        if (content !== editorContent) {
          editor.commands.setContent((content as string) || '', { emitUpdate: false })
          restoreFileNodes(editor, userId)
        }
      }
    }
  }, [content, editor, userId])

  useEffect(() => {
    restoreFileNodes(editor, userId)
  }, [editor, userId])

  useEffect(() => {
    if (!onEditorReady) {
      return
    }

    onEditorReady(editor ?? null)

    return () => {
      onEditorReady(null)
    }
  }, [editor, onEditorReady])

  // Skeleton
  if (!editor) {
    return (
        <div className='relative border border-border rounded-md bg-card'>
            {showFixedMenu && (
                <div className='bg-card rounded-t-md border-b border-border' >
                    <div className='flex flex-row gap-1 p-2'>
                        <div className='flex flex-row gap-0.5 w-fit'>
                            <Button size='sm' variant='secondary' disabled>
                                <Type className='' />
                            </Button>
                        </div>
                        <div className='flex flex-row gap-0.5 w-fit'>
                            <Button size='sm' variant='secondary' disabled>
                                <AlignLeft className='' />
                            </Button>
                        </div>
                        <div className='flex flex-row gap-0.5 w-fit'>
                            <Toggle size='sm' disabled>
                                <Bold className='' />
                            </Toggle>
                            <Toggle size='sm' disabled>
                                <Italic className='' />
                            </Toggle>
                            <Toggle size='sm' disabled>
                                <Strikethrough className='' />
                            </Toggle>
                            <Toggle size='sm' disabled>
                                <UnderlineIcon className='' />
                            </Toggle>
                            <Toggle size='sm' disabled>
                                <Code className='' />
                            </Toggle>
                        </div>
                    </div>
                </div>
            )}
            <div className='py-2 px-3 h-full'>
                <div className='prose prose-base dark:prose-invert max-w-none'>
                    <Skeleton className='h-6 w-1/3 mb-4' />
                    <Skeleton className='h-4 w-full mb-2' />
                    <Skeleton className='h-4 w-3/4 mb-2' />
                </div>
            </div>
        </div>
    )
  }

    // Editor
    return (
        <div className={commentsEnabled && showComments ? 'grid h-full gap-3 grid-cols-[minmax(0,1fr)_320px]' : 'h-full'}>
        <div className={cn('relative border border-border rounded-md bg-card h-full w-full flex flex-col', className)}>
            <TooltipProvider>

                {/* start fixed menu */}
                {showFixedMenu && !readonly && (
                    <div className='sticky top-0 z-10 bg-card/80 backdrop-blur-lg rounded-lg'>
                        <FixedMenu
                          editor={editor}
                          {...(showComments !== undefined ? { showComments } : {})}
                          {...(onShowCommentsChange ? { onShowCommentsChange } : {})}
                        />
                    </div>
                )}
                {/* end fixed menu */}

                {/* start bubble menu */}
                {showBubbleMenu && !readonly && (
                  commentSelectionHandler ? (
                    <BubbleMenuComponent
                      editor={editor}
                      onRequestCommentFromSelection={commentSelectionHandler}
                    />
                  ) : (
                    <BubbleMenuComponent editor={editor} />
                  )
                )}
                {/* end bubble menu */}

                {/* start drag handle */}
                {showDragHandle && !readonly && (
                  <DragHandle
                    editor={editor}
                    onNodeChange={({ node }) => {
                      setSelectedNode(node)
                      // You can add custom logic here to highlight the selected node
                      if (node) {
                        // console.log('Selected node:', node.type.name)
                      }
                    }}
                  >
                    <div className="flex items-center justify-center w-4 h-8 mr-1 hover:bg-muted/80 rounded cursor-grab active:cursor-grabbing transition-colors">
                      <GripVertical className="size-4 text-muted-foreground/70" />
                    </div>
                  </DragHandle>
                )}
                {/* end drag handle */}

                {/* start editor */}
                <div className='h-full flex-1 overflow-y-auto py-2 px-6 prose prose-base dark:prose-invert max-w-none'>
                    <EditorContent 
                        editor={editor} 
                        className='[&_a:hover]:cursor-pointer h-full flex-1 [&_.ProseMirror]:outline-none [&_.ProseMirror]:focus:outline-none [&_.ProseMirror-focused]:outline-none [&_.ProseMirror]:border-none [&_.ProseMirror]:focus:border-none [&_.ProseMirror-focused]:border-none [&_.ProseMirror]:ring-0 [&_.ProseMirror]:focus:ring-0 [&_.ProseMirror-focused]:ring-0 [&_.ProseMirror]:shadow-none [&_.ProseMirror]:focus:shadow-none [&_.ProseMirror-focused]:shadow-none' 
                    />
                </div>
                {/* end editor */}

            </TooltipProvider>
            {commentsEnabled && composerSelection ? (
              <CommentComposerPopover
                composerRef={composerRef}
                left={composerLeft}
                top={composerTop}
                initials={initials}
                displayName={displayName}
                currentUser={currentUser}
                content={composerContent}
                onChangeContent={setComposerContent}
                isSubmitting={isSubmittingComposer}
                onCancel={closeComposer}
                onSubmit={() => void handleSubmitComposer()}
              />
            ) : null}
        </div>

        {commentsEnabled ? (
          <CommentsPanel
            showComments={Boolean(showComments)}
            isLoadingThreads={isLoadingThreads}
            threads={threads}
            selectedThreadId={selectedThreadId}
            currentUserId={currentUserId}
            currentUserInitials={initials}
            replyContent={replyContent}
            onReplyContentChange={setReplyContent}
            onSelectThread={setSelectedThreadId}
            onHoverThread={(threadId) => editor?.commands.hoverCommentThread(threadId)}
            onCreateReply={() => void handleCreateReply()}
            onToggleThreadResolved={(threadId, resolved) => void handleToggleThreadResolved(threadId, resolved)}
            onDeleteThread={(threadId) => void handleDeleteThread(threadId)}
            onDeleteComment={(threadId, commentId) => void handleDeleteComment(threadId, commentId)}
            onUpdateComment={(threadId, commentId, content) => handleUpdateComment(threadId, commentId, content)}
            onCloseComments={() => onShowCommentsChange?.(false)}
          />
        ) : null}
        </div>
    )
}

export default Tiptap
