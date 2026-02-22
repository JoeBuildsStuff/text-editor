"use client"

import type { RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { isRichTextContentEmpty } from "@/components/tiptap/comment-content-utils"
import { CommentInputEditor } from "@/components/tiptap/comment-input-editor"

type ComposerUser = {
  email?: string | null
}

type CommentComposerPopoverProps = {
  composerRef: RefObject<HTMLDivElement | null>
  left: number
  top: number
  initials: string
  displayName: string
  currentUser: ComposerUser | null
  content: string
  onChangeContent: (value: string) => void
  isSubmitting: boolean
  onCancel: () => void
  onSubmit: () => void
}

export function CommentComposerPopover({
  composerRef,
  left,
  top,
  initials,
  displayName,
  currentUser,
  content,
  onChangeContent,
  isSubmitting,
  onCancel,
  onSubmit,
}: CommentComposerPopoverProps) {
  return (
    <div
      ref={composerRef}
      className="fixed z-50 w-[360px] rounded-lg border border-border bg-popover p-3 shadow-lg"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Avatar className="size-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="grid text-left text-sm leading-tight">
          <span className="truncate font-medium">{displayName}</span>
          {currentUser?.email ? (
            <span className="truncate text-xs text-muted-foreground">{currentUser.email}</span>
          ) : null}
        </div>
      </div>

      <CommentInputEditor
        value={content}
        onChange={onChangeContent}
        placeholder="Add a comment"
        onSubmitShortcut={onSubmit}
      />

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isSubmitting || isRichTextContentEmpty(content)}>
          Send
        </Button>
      </div>
    </div>
  )
}
