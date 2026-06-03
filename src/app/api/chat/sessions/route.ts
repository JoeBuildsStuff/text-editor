import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireUserSession } from "@/app/api/files/_utils"
import { createChatSession, listChatSessions } from "@/lib/chat/repository"

export const runtime = "nodejs"

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  context: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const sessions = listChatSessions(sessionOrResponse.user.id)
  return NextResponse.json({ sessions })
}

export async function POST(request: NextRequest) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const body = await request.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const created = createChatSession(
    sessionOrResponse.user.id,
    parsed.data.title || "New Chat",
    parsed.data.context ?? null
  )

  return NextResponse.json({ session: created }, { status: 201 })
}
