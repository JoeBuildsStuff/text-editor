import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromHeaders } from "@/lib/auth/session"
import type { AuthSession } from "@/lib/auth/types"
import { updateThreadAnchors } from "@/lib/comments"

async function ensureAuthenticated(request: Request): Promise<AuthSession | NextResponse> {
  const session = await getSessionFromHeaders(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return session
}

const anchorSchema = z.object({
  id: z.string().uuid(),
  anchorFrom: z.number().int().min(1),
  anchorTo: z.number().int().min(1),
  anchorExact: z.string().optional(),
  anchorPrefix: z.string().optional(),
  anchorSuffix: z.string().optional(),
})

const payloadSchema = z.object({
  anchors: z.array(anchorSchema).max(500),
})

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id } = await context.params

  let payload: z.infer<typeof payloadSchema>
  try {
    payload = payloadSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid payload" : "Invalid JSON body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const anchors = payload.anchors.map((anchor) => ({
      id: anchor.id,
      anchorFrom: anchor.anchorFrom,
      anchorTo: anchor.anchorTo,
      ...(anchor.anchorExact !== undefined ? { anchorExact: anchor.anchorExact } : {}),
      ...(anchor.anchorPrefix !== undefined ? { anchorPrefix: anchor.anchorPrefix } : {}),
      ...(anchor.anchorSuffix !== undefined ? { anchorSuffix: anchor.anchorSuffix } : {}),
    }))

    updateThreadAnchors({
      documentId: id,
      userId: sessionOrResponse.user.id,
      anchors,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === "Document not found") {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.error("Failed to update thread anchors", error)
    return NextResponse.json({ error: "Failed to update thread anchors" }, { status: 500 })
  }
}
