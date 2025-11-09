import { NextResponse } from "next/server";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  MARKDOWN_DIR,
  ensureMarkdownDirectory,
  ensureMarkdownExtension,
  listMarkdownFiles,
  sanitizeFilename,
} from "@/lib/markdown-files";
const payloadSchema = z.object({
  filename: z.string().min(1, "Filename is required").max(128, "Filename is too long"),
  content: z.string().default(""),
  overwrite: z.boolean().optional(),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof payloadSchema>;

  try {
    const data = await request.json();
    payload = payloadSchema.parse(data);
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid payload" : "Invalid JSON body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const sanitizedBase = sanitizeFilename(payload.filename);
  if (!sanitizedBase) {
    return NextResponse.json({ error: "Filename must contain alphanumeric characters" }, { status: 400 });
  }

  const finalName = ensureMarkdownExtension(sanitizedBase);
  const filePath = path.join(MARKDOWN_DIR, finalName);

  try {
    await ensureMarkdownDirectory();

    if (!payload.overwrite) {
      try {
        await access(filePath);
        return NextResponse.json({ error: "File already exists. Pass overwrite=true to replace it." }, { status: 409 });
      } catch {
        // File does not exist, safe to proceed
      }
    }

    await writeFile(filePath, payload.content ?? "", "utf-8");

    return NextResponse.json(
      {
        filename: finalName,
        relativePath: path.relative(process.cwd(), filePath),
      },
      { status: payload.overwrite ? 200 : 201 }
    );
  } catch (error) {
    console.error("Failed to write markdown file", error);
    return NextResponse.json({ error: "Failed to write markdown file" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const files = await listMarkdownFiles();

    return NextResponse.json({ files });
  } catch (error) {
    console.error("Failed to read markdown files", error);
    return NextResponse.json({ error: "Failed to read markdown files" }, { status: 500 });
  }
}
