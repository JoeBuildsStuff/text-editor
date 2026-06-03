import { NextRequest, NextResponse } from "next/server";

import { FileStorageError, statStoredFile } from "@/lib/file-storage";
import { requireUserSession } from "@/app/api/files/_utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireUserSession(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return NextResponse.json({ error: "File path is required" }, { status: 400 });
  }

  try {
    const fileInfo = await statStoredFile(filePath, sessionOrResponse.user.id);
    return NextResponse.json({
      success: true,
      imageUrl: `/api/files/raw?path=${encodeURIComponent(fileInfo.filePath)}`,
      size: fileInfo.size,
      mimeType: fileInfo.mimeType,
    });
  } catch (error) {
    if (error instanceof FileStorageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to serve image metadata", error);
    return NextResponse.json({ error: "Failed to load image" }, { status: 500 });
  }
}
