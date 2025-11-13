import { notFound, redirect } from "next/navigation"

import { DocumentTitleEditor } from "@/components/documents/document-title-editor"
import { DocumentEditor } from "@/components/documents/document-editor"
import { getMarkdownFileById } from "@/lib/markdown-files"
import { getServerSession } from "@/lib/auth/session"

type DocumentPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function DocumentDetailPage({ params }: DocumentPageProps) {
  const { id } = await params
  const session = await getServerSession()
  if (!session) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/documents/${id}`)}`)
  }
  const file = await getMarkdownFileById(id, session.user.id)

  if (!file) {
    notFound()
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-2">
      <DocumentTitleEditor id={file.id} title={file.title} slug={file.slug} />
      <DocumentEditor documentId={file.id} initialContent={file.content ?? ""} />
    </div>
  )
}
