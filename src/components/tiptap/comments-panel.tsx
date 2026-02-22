"use client"

import { useState } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { Pencil, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { isRichTextContentEmpty } from "@/components/tiptap/comment-content-utils"
import { CommentInputEditor } from "@/components/tiptap/comment-input-editor"
import type { Thread } from "@/components/tiptap/comment-thread-types"

function formatCommentTimestamp(timestamp: string) {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  if (isToday(parsed)) {
    return `Today at ${format(parsed, "p")}`
  }

  if (isYesterday(parsed)) {
    return `Yesterday at ${format(parsed, "p")}`
  }

  return format(parsed, "MMM d, yyyy 'at' p")
}

function userDisplay(userId: string, currentUserId: string | null) {
  return userId === currentUserId ? "You" : userId.slice(0, 8)
}

function userInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "U"
  )
}

function isInteractiveKeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest(
      "input, textarea, button, select, [contenteditable='true'], [role='textbox'], [data-role='comment-input']"
    )
  )
}

type CommentsPanelProps = {
  showComments: boolean
  isLoadingThreads: boolean
  threads: Thread[]
  selectedThreadId: string | null
  currentUserId: string | null
  currentUserInitials: string
  replyContent: string
  onReplyContentChange: (content: string) => void
  onSelectThread: (threadId: string) => void
  onHoverThread: (threadId: string | null) => void
  onCreateReply: () => void
  onToggleThreadResolved: (threadId: string, resolved: boolean) => void
  onDeleteThread: (threadId: string) => void
  onDeleteComment: (threadId: string, commentId: string) => void
  onUpdateComment: (threadId: string, commentId: string, content: string) => Promise<boolean> | boolean
  onCloseComments: () => void
}

export function CommentsPanel({
  showComments,
  isLoadingThreads,
  threads,
  selectedThreadId,
  currentUserId,
  currentUserInitials,
  replyContent,
  onReplyContentChange,
  onSelectThread,
  onHoverThread,
  onCreateReply,
  onToggleThreadResolved,
  onDeleteThread,
  onDeleteComment,
  onUpdateComment,
  onCloseComments,
}: CommentsPanelProps) {
  const [editingComment, setEditingComment] = useState<{ threadId: string; commentId: string } | null>(null)
  const [editingContent, setEditingContent] = useState("")
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)

  const clearEditingState = () => {
    setEditingComment(null)
    setEditingContent("")
  }

  const submitEdit = (threadId: string, commentId: string) => {
    if (isRichTextContentEmpty(editingContent) || isSubmittingEdit) {
      return
    }

    setIsSubmittingEdit(true)
    void Promise.resolve(onUpdateComment(threadId, commentId, editingContent))
      .then((didUpdate) => {
        if (didUpdate) {
          clearEditingState()
        }
      })
      .finally(() => {
        setIsSubmittingEdit(false)
      })
  }

  if (!showComments) {
    return null
  }

  const orderedThreads = [...threads].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "unresolved" ? -1 : 1
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  return (
    <aside className="flex min-h-0 flex-col rounded-md border border-border bg-card">
      <div className="border-b border-border p-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Comments</h2>
          <Button size="sm" variant="ghost" onClick={onCloseComments} aria-label="Close comments">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        {isLoadingThreads ? (
          <p className="text-xs text-muted-foreground">Loading threads…</p>
        ) : (
          <div className="space-y-2">
            {orderedThreads.map((thread) => {
              const isSelected = selectedThreadId === thread.id
              const firstComment = thread.comments[0]
              const authorName = userDisplay(firstComment?.userId ?? thread.createdBy, currentUserId)
              const authorInitials = userInitials(authorName)
              const createdAt = formatCommentTimestamp(firstComment?.createdAt ?? thread.createdAt)
              const replies = thread.comments.slice(1)
              const isEditingFirstComment = Boolean(
                firstComment &&
                  editingComment?.threadId === thread.id &&
                  editingComment.commentId === firstComment.id
              )
              const canEditFirstComment = firstComment?.userId === currentUserId

              return (
                <div
                  key={thread.id}
                  className={`w-full overflow-hidden rounded-xl border text-left text-xs transition ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => onSelectThread(thread.id)}
                  onMouseEnter={() => onHoverThread(thread.id)}
                  onMouseLeave={() => onHoverThread(null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (isInteractiveKeyTarget(event.target)) {
                      return
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onSelectThread(thread.id)
                    }
                  }}
                >
                  <div className="px-3 pb-3 pt-3">
                    <div className="flex items-start gap-2">
                      <Avatar className="size-9 shrink-0">
                        <AvatarFallback>{authorInitials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="truncate text-sm font-semibold">{authorName}</p>
                            <p className="truncate text-xs text-muted-foreground">{createdAt}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Checkbox
                              checked={thread.status === "resolved"}
                              onCheckedChange={(checked) => {
                                onToggleThreadResolved(thread.id, Boolean(checked))
                              }}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={thread.status === "resolved" ? "Reopen thread" : "Resolve thread"}
                            />
                            {canEditFirstComment && firstComment ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setEditingComment({
                                    threadId: thread.id,
                                    commentId: firstComment.id,
                                  })
                                  setEditingContent(firstComment.content)
                                }}
                                aria-label="Edit comment"
                              >
                                <Pencil className="size-4" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation()
                                onDeleteThread(thread.id)
                              }}
                              aria-label="Delete thread"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2">
                          {isEditingFirstComment && firstComment ? (
                            <div onClick={(event) => event.stopPropagation()}>
                              <CommentInputEditor
                                value={editingContent}
                                onChange={setEditingContent}
                                onSubmitShortcut={() => {
                                  submitEdit(thread.id, firstComment.id)
                                }}
                                placeholder="Edit comment"
                                editorClassName="text-sm"
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    clearEditingState()
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    submitEdit(thread.id, firstComment.id)
                                  }}
                                  disabled={isRichTextContentEmpty(editingContent) || isSubmittingEdit}
                                >
                                  Submit Edit
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <CommentInputEditor
                              value={firstComment?.content ?? ""}
                              readOnly
                              autoFocus={false}
                              editorClassName="text-sm"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {replies.length > 0 ? (
                    <div>
                      {replies.map((reply) => {
                        const replyAuthor = userDisplay(reply.userId, currentUserId)
                        const replyInitials =
                          reply.userId === currentUserId ? currentUserInitials : userInitials(replyAuthor)
                        const isEditingReply = Boolean(
                          editingComment?.threadId === thread.id && editingComment.commentId === reply.id
                        )
                        return (
                          <div key={reply.id} className="border-t border-border">
                            <div className="flex items-start gap-2 px-3 py-3">
                              <Avatar className="size-8 shrink-0">
                                <AvatarFallback>{replyInitials}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="truncate text-sm font-semibold">{replyAuthor}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {formatCommentTimestamp(reply.createdAt)}
                                    </p>
                                  </div>
                                  {reply.userId === currentUserId ? (
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setEditingComment({
                                            threadId: thread.id,
                                            commentId: reply.id,
                                          })
                                          setEditingContent(reply.content)
                                        }}
                                        aria-label="Edit reply"
                                      >
                                        <Pencil className="size-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          onDeleteComment(thread.id, reply.id)
                                        }}
                                        aria-label="Delete reply"
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-2">
                                  {isEditingReply ? (
                                    <div onClick={(event) => event.stopPropagation()}>
                                      <CommentInputEditor
                                        value={editingContent}
                                        onChange={setEditingContent}
                                        onSubmitShortcut={() => {
                                          submitEdit(thread.id, reply.id)
                                        }}
                                        placeholder="Edit reply"
                                        editorClassName="text-sm"
                                      />
                                      <div className="mt-2 flex justify-end gap-2">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            clearEditingState()
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            submitEdit(thread.id, reply.id)
                                          }}
                                          disabled={isRichTextContentEmpty(editingContent) || isSubmittingEdit}
                                        >
                                          Submit Edit
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <CommentInputEditor
                                      value={reply.content}
                                      readOnly
                                      autoFocus={false}
                                      editorClassName="text-sm"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  {isSelected ? (
                    <div className="border-t border-border bg-background/60">
                      <div className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          <Avatar className="size-8 shrink-0">
                            <AvatarFallback>{currentUserInitials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1" data-role="comment-input">
                            <CommentInputEditor
                              value={replyContent}
                              onChange={onReplyContentChange}
                              placeholder="Add a reply"
                              onSubmitShortcut={onCreateReply}
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button size="sm" onClick={onCreateReply} disabled={isRichTextContentEmpty(replyContent)}>
                            Add Reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
