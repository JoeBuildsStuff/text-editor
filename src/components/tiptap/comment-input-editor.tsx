"use client"

import { useEffect, useMemo } from "react"
import { Extension } from "@tiptap/core"
import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { cn } from "@/lib/utils"

type CommentInputEditorProps = {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  onSubmitShortcut?: () => void
  readOnly?: boolean
  editorClassName?: string
  autoFocus?: boolean
}

export function CommentInputEditor({
  value,
  onChange,
  placeholder = "Write a comment",
  onSubmitShortcut,
  readOnly = false,
  editorClassName,
  autoFocus = true,
}: CommentInputEditorProps) {
  const submitShortcutExtension = useMemo(() => {
    if (!onSubmitShortcut || readOnly) {
      return null
    }

    return Extension.create({
      name: "commentSubmitShortcut",
      addKeyboardShortcuts() {
        return {
          "Mod-Enter": () => {
            onSubmitShortcut()
            return true
          },
        }
      },
    })
  }, [onSubmitShortcut, readOnly])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        horizontalRule: false,
      }),
      ...(readOnly
        ? []
        : [
            Placeholder.configure({
              placeholder,
            }),
          ]),
      ...(submitShortcutExtension ? [submitShortcutExtension] : []),
    ],
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          readOnly
            ? "text-sm [&_.tiptap]:outline-none [&_.tiptap_p]:my-2 [&_.tiptap_p:first-child]:mt-0 [&_.tiptap_p:last-child]:mb-0 [&_.tiptap_ul]:my-2 [&_.tiptap_ol]:my-2 [&_.tiptap_li]:my-0"
            : "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          editorClassName
        ),
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange?.(nextEditor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    const currentHtml = editor.getHTML()
    if (currentHtml !== value) {
      editor.commands.setContent(value || "", {
        emitUpdate: false,
      })
    }
  }, [editor, value])

  useEffect(() => {
    if (!editor || readOnly || !autoFocus) {
      return
    }

    const timeout = setTimeout(() => {
      editor.commands.focus("end")
    }, 0)

    return () => clearTimeout(timeout)
  }, [autoFocus, editor, readOnly])

  if (!editor) {
    return (
      <div
        className={cn(
          readOnly
            ? "text-sm text-muted-foreground"
            : "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground",
          editorClassName
        )}
      >
        {placeholder}
      </div>
    )
  }

  return (
    <div className={editorClassName}>
      <EditorContent editor={editor} />
    </div>
  )
}
