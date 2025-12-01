import { NextRequest, NextResponse } from "next/server"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const DOCS_DIR = path.join(process.cwd(), "docs")

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const file = searchParams.get("file")

    if (file) {
      // Read a specific file
      const filePath = path.join(DOCS_DIR, file)
      // Security: ensure the file is within the docs directory
      if (!filePath.startsWith(DOCS_DIR)) {
        return NextResponse.json({ error: "Invalid file path" }, { status: 400 })
      }
      
      try {
        const content = await readFile(filePath, "utf-8")
        return NextResponse.json({ content })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return NextResponse.json({ error: "File not found" }, { status: 404 })
        }
        throw error
      }
    } else {
      // List all markdown files
      const files = await readdir(DOCS_DIR)
      const markdownFiles = files
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          name: f,
          title: f.replace(/\.md$/, "").replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return NextResponse.json({ files: markdownFiles })
    }
  } catch (error) {
    console.error("Failed to read docs", error)
    return NextResponse.json({ error: "Failed to read docs" }, { status: 500 })
  }
}

