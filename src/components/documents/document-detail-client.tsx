"use client"

import { useState } from "react"

import { DocumentTitleEditor } from "@/components/documents/document-title-editor"
import { DocumentEditor } from "@/components/documents/document-editor"

type DocumentDetailClientProps = {
  id: string
  title: string
  slug: string
  initialContent: string
}

export function DocumentDetailClient({
  id,
  title,
  slug,
  initialContent,
}: DocumentDetailClientProps) {
  const [showComments, setShowComments] = useState(false)

  return (
    <>
      <DocumentTitleEditor
        id={id}
        title={title}
        slug={slug}
      />
      <DocumentEditor
        documentId={id}
        initialContent={initialContent}
        showComments={showComments}
        onShowCommentsChange={setShowComments}
      />
    </>
  )
}
