import { notFound } from "next/navigation"

import { DocumentTitleEditor } from "@/components/documents/document-title-editor"
import Tiptap from "@/components/tiptap/tiptap"
import { getMarkdownFileById } from "@/lib/markdown-files"

type DocumentPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function DocumentDetailPage({ params }: DocumentPageProps) {
  const { id } = await params
  const file = await getMarkdownFileById(id)

  if (!file) {
    notFound()
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-2">
      <DocumentTitleEditor id={file.id} title={file.title} slug={file.slug} />
      <Tiptap content={file.content ?? ""} />
    </div>
  )
}
