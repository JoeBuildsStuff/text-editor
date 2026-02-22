import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromHeaders } from "@/lib/auth/session"
import type { AuthSession } from "@/lib/auth/types"
import { createComment } from "@/lib/comments"

async function ensureAuthenticated(request: Request): Promise<AuthSession | NextResponse> {
  const session = await getSessionFromHeaders(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return session
}

const createSchema = z.object({
  content: z.string().trim().min(1).max(10000),
})

type RouteContext = {
  params: Promise<{
    id: string
    threadId: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id, threadId } = await context.params

  let payload: z.infer<typeof createSchema>
  try {
    payload = createSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid payload" : "Invalid JSON body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const comment = createComment({
      documentId: id,
      threadId,
      userId: sessionOrResponse.user.id,
      content: payload.content,
    })

    return NextResponse.json({ comment }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && (error.message === "Document not found" || error.message === "Thread not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof Error && error.message === "Comment content is required") {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("Failed to create comment", error)
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 })
  }
}
