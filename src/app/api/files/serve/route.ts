import { NextRequest, NextResponse } from "next/server"

import { FileStorageError, statStoredFile } from "@/lib/file-storage"
import { buildFileDownloadUrl, requireUserSession } from "../_utils"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
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
    const fileInfo = await statStoredFile(filePath, session.user.id)
    return NextResponse.json({
      success: true,
      fileUrl: buildFileDownloadUrl(fileInfo.filePath),
      size: fileInfo.size,
      mimeType: fileInfo.mimeType,
    })
  } catch (error) {
    if (error instanceof FileStorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Failed to serve file metadata", error)
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 })
  }
}
