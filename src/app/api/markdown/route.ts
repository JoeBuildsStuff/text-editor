import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createMarkdownFile,
  MarkdownFileOperationError,
  listMarkdownFiles,
  renameMarkdownFile,
} from "@/lib/markdown-files";

const payloadSchema = z
  .object({
    filename: z.string().min(1).max(128).optional(),
    title: z.string().min(1).max(128).optional(),
    content: z.string().default(""),
    overwrite: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.title ?? data.filename), {
    message: "Title is required",
    path: ["title"],
  });

const renameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(128, "Title is too long"),
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

  try {
    const title = (payload.title ?? payload.filename) as string;
    const document = await createMarkdownFile(title, payload.content ?? "", payload.overwrite);

    return NextResponse.json(
      {
        document,
      },
      { status: payload.overwrite ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof MarkdownFileOperationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to write markdown file", error);
    return NextResponse.json({ error: "Failed to write markdown file" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const documents = await listMarkdownFiles({ includeContent: false });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Failed to read markdown files", error);
    return NextResponse.json({ error: "Failed to read markdown files" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const data = await request.json();
    const payload = renameSchema.parse(data);
    const document = await renameMarkdownFile(payload.id, payload.title);

    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid payload";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof MarkdownFileOperationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to rename markdown file", error);
    return NextResponse.json({ error: "Failed to rename markdown file" }, { status: 500 });
  }
}
