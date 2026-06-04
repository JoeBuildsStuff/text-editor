"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getServerSession } from "@/lib/auth/session"
import { createMarkdownFile } from "@/lib/markdown-files"

export async function createDocumentAction() {
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in")
  }

  const document = await createMarkdownFile("untitled", "", session.user.id)

  revalidatePath("/documents")
  redirect(`/documents/${document.slug}`)
}
