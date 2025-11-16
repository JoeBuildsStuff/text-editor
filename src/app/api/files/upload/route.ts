import { NextRequest, NextResponse } from "next/server"

import { FileStorageError, saveUploadedFile } from "@/lib/file-storage"
import { requireUserSession } from "../_utils"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }
  const session = sessionOrResponse

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file")
  const pathPrefix = formData.get("pathPrefix")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }

  try {
    const result = await saveUploadedFile(file, {
      userId: session.user.id,
      pathPrefix: typeof pathPrefix === "string" ? pathPrefix : undefined,
    })

    return NextResponse.json({
      success: true,
      filePath: result.filePath,
      size: result.size,
      mimeType: result.mimeType,
    })
  } catch (error) {
    if (error instanceof FileStorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Failed to save uploaded file", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
