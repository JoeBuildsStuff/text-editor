import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireUserSession } from "@/app/api/files/_utils"
import { deleteChatSession, updateChatSessionTitle } from "@/lib/chat/repository"

export const runtime = "nodejs"

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120),
})

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const updated = updateChatSessionTitle(id, sessionOrResponse.user.id, parsed.data.title)
  if (!updated) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  return NextResponse.json({ session: updated })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id } = await context.params
  const ok = deleteChatSession(id, sessionOrResponse.user.id)
  if (!ok) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
