import { NextRequest, NextResponse } from "next/server"

import { deleteStoredFile, FileStorageError } from "@/lib/file-storage"
import { requireUserSession } from "../_utils"

export const runtime = "nodejs"

export async function DELETE(request: NextRequest) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }
  const session = sessionOrResponse

  const filePath = request.nextUrl.searchParams.get("path")
  if (!filePath) {
    return NextResponse.json({ error: "File path is required" }, { status: 400 })
  }

  try {
    await deleteStoredFile(filePath, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof FileStorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Failed to delete stored file", error)
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 })
  }
}
