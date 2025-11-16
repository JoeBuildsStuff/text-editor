import { NextRequest, NextResponse } from "next/server"

import { FileStorageError, getFileReadableStream } from "@/lib/file-storage"
import { requireUserSession } from "../_utils"

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
    const fileInfo = await getFileReadableStream(filePath, session.user.id)
    return new NextResponse(fileInfo.stream, {
      headers: {
        "Content-Type": fileInfo.mimeType,
        "Content-Length": fileInfo.size.toString(),
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (error) {
    if (error instanceof FileStorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Failed to read file", error)
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 })
  }
}
