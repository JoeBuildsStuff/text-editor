import { NextRequest, NextResponse } from "next/server"

import { requireUserSession } from "@/app/api/files/_utils"
import { getChatSessionById, listChatMessages } from "@/lib/chat/repository"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id } = await context.params
  const session = getChatSessionById(id, sessionOrResponse.user.id)
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const messages = listChatMessages(id, sessionOrResponse.user.id)
  return NextResponse.json({ messages })
}
