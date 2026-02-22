import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromHeaders } from "@/lib/auth/session"
import type { AuthSession } from "@/lib/auth/types"
import { deleteComment, updateComment } from "@/lib/comments"

async function ensureAuthenticated(request: Request): Promise<AuthSession | NextResponse> {
  const session = await getSessionFromHeaders(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return session
}

const patchSchema = z.object({
  content: z.string().trim().min(1).max(10000),
})

type RouteContext = {
  params: Promise<{
    id: string
    threadId: string
    commentId: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id, threadId, commentId } = await context.params

  let payload: z.infer<typeof patchSchema>
  try {
    payload = patchSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid payload" : "Invalid JSON body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const comment = updateComment({
      documentId: id,
      threadId,
      commentId,
      userId: sessionOrResponse.user.id,
      content: payload.content,
    })

    return NextResponse.json({ comment })
  } catch (error) {
    if (error instanceof Error && (error.message === "Document not found" || error.message === "Comment not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof Error && error.message === "Comment content is required") {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("Failed to update comment", error)
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id, threadId, commentId } = await context.params

  try {
    deleteComment({
      documentId: id,
      threadId,
      commentId,
      userId: sessionOrResponse.user.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && (error.message === "Document not found" || error.message === "Comment not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.error("Failed to delete comment", error)
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 })
  }
}
