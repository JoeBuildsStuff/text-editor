import { notFound } from "next/navigation"

import Tiptap from "@/components/tiptap/tiptap"
import { getMarkdownFileBySlug } from "@/lib/markdown-files"

type DocumentPageProps = {
  params: Promise<{
    slug: string
  }>
}

export default async function DocumentDetailPage({ params }: DocumentPageProps) {
  const { slug } = await params
  const file = await getMarkdownFileBySlug(slug)

  if (!file) {
    notFound()
  }

  return (
    <div className="flex max-w-4xl mx-auto h-full w-full">
      <Tiptap content={file.content ?? ""} />
    </div>
  )
}
