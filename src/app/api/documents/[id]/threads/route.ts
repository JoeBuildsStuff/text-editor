import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromHeaders } from "@/lib/auth/session"
import type { AuthSession } from "@/lib/auth/types"
import { createThread, listThreads } from "@/lib/comments"

async function ensureAuthenticated(request: Request): Promise<AuthSession | NextResponse> {
  const session = await getSessionFromHeaders(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return session
}

const createThreadSchema = z
  .object({
    anchorFrom: z.number().int().min(1),
    anchorTo: z.number().int().min(1),
    anchorExact: z.string().default(""),
    anchorPrefix: z.string().default(""),
    anchorSuffix: z.string().default(""),
    content: z.string().trim().min(1).max(10000),
  })
  .refine((value) => value.anchorTo > value.anchorFrom, {
    message: "Selection is required",
    path: ["anchorTo"],
  })

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id } = await context.params

  try {
    const threads = listThreads(id, sessionOrResponse.user.id)
    return NextResponse.json({ threads })
  } catch (error) {
    if (error instanceof Error && error.message === "Document not found") {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.error("Failed to list threads", error)
    return NextResponse.json({ error: "Failed to list threads" }, { status: 500 })
  }
}

export async function POST(request: Request, context: RouteContext) {
  const sessionOrResponse = await ensureAuthenticated(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }

  const { id } = await context.params

  let payload: z.infer<typeof createThreadSchema>
  try {
    payload = createThreadSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid payload" : "Invalid JSON body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const thread = createThread({
      documentId: id,
      userId: sessionOrResponse.user.id,
      anchorFrom: payload.anchorFrom,
      anchorTo: payload.anchorTo,
      anchorExact: payload.anchorExact,
      anchorPrefix: payload.anchorPrefix,
      anchorSuffix: payload.anchorSuffix,
      content: payload.content,
    })

    return NextResponse.json({ thread }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === "Document not found") {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof Error && error.message === "Invalid anchor range") {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof Error && error.message === "Comment content is required") {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("Failed to create thread", error)
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 })
  }
}
