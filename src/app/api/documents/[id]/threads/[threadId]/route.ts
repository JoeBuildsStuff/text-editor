import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromHeaders } from "@/lib/auth/session"
import type { AuthSession } from "@/lib/auth/types"
import { deleteThread, updateThread } from "@/lib/comments"

async function ensureAuthenticated(request: Request): Promise<AuthSession | NextResponse> {
  const session = await getSessionFromHeaders(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return session
}

const patchSchema = z.object({
  resolved: z.boolean().optional(),
})

type RouteContext = {
  params: Promise<{
    id: string
    threadId: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id, threadId } = await context.params

  let payload: z.infer<typeof patchSchema>
  try {
    payload = patchSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid payload" : "Invalid JSON body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const updates = payload.resolved === undefined ? {} : { resolved: payload.resolved }
    const thread = updateThread(id, threadId, sessionOrResponse.user.id, {
      ...updates,
    })
    return NextResponse.json({ thread })
  } catch (error) {
    if (error instanceof Error && (error.message === "Document not found" || error.message === "Thread not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.error("Failed to update thread", error)
    return NextResponse.json({ error: "Failed to update thread" }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id, threadId } = await context.params

  try {
    deleteThread(id, threadId, sessionOrResponse.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && (error.message === "Document not found" || error.message === "Thread not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.error("Failed to delete thread", error)
    return NextResponse.json({ error: "Failed to delete thread" }, { status: 500 })
  }
}
