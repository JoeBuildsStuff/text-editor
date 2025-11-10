import { notFound } from "next/navigation"

import Tiptap from "@/components/tiptap/tiptap"
import { getMarkdownFileBySlug } from "@/lib/markdown-files"

type DocumentPageProps = {
  params: Promise<{
    slug: string[]
  }>
}

export default async function DocumentDetailPage({ params }: DocumentPageProps) {
  const { slug } = await params
  const file = await getMarkdownFileBySlug(slug)

  if (!file) {
    notFound()
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">{file.filename}</h1>
        <p className="text-sm text-muted-foreground">{file.relativePath}</p>
      </div>
      <Tiptap content={file.content ?? ""} />
    </div>
  )
}
