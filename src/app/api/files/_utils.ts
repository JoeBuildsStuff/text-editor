import { NextRequest, NextResponse } from "next/server"

import { getSessionFromHeaders } from "@/lib/auth/session"
import type { AuthSession } from "@/lib/auth/types"

export async function requireUserSession(request: NextRequest): Promise<AuthSession | NextResponse> {
  const session = await getSessionFromHeaders(request.headers)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return session
}

export function buildFileDownloadUrl(filePath: string) {
  return `/api/files/raw?path=${encodeURIComponent(filePath)}`
}
