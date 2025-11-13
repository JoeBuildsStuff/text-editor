import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromHeaders } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";
import {
  createFolder,
  createMarkdownFile,
  deleteFolder,
  deleteMarkdownFile,
  listMarkdownItems,
  MarkdownFileOperationError,
  renameMarkdownFile,
  renameFolder,
  updateMarkdownFileContent,
} from "@/lib/markdown-files";

async function ensureAuthenticated(request: Request): Promise<AuthSession | NextResponse> {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

const payloadSchema = z
  .object({
    type: z.enum(["document", "folder"]).default("document"),
    filename: z.string().min(1).max(128).optional(),
    title: z.string().min(1).max(128).optional(),
    content: z.string().default(""),
    overwrite: z.boolean().optional(),
    folderPath: z.string().max(256).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "document" && !(data.title ?? data.filename)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Title is required",
        path: ["title"],
      });
    }
    if (data.type === "folder" && !data.folderPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Folder path is required",
        path: ["folderPath"],
      });
    }
  });

const renameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(128, "Title is too long"),
});

const renameFolderSchema = z.object({
  type: z.literal("folder"),
  folderPath: z.string().min(1, "Folder path is required"),
  newName: z.string().min(1, "Folder name is required").max(128, "Folder name is too long"),
});

const updateContentSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
});

const deleteSchema = z.union([
  z.object({
    type: z.literal("folder"),
    folderPath: z.string().min(1),
  }),
  z.object({
    type: z.literal("document").optional(),
    id: z.string().uuid(),
  }),
]);

export async function POST(request: Request) {
  const sessionOrResponse = await ensureAuthenticated(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }
  const session = sessionOrResponse as AuthSession;
  let payload: z.infer<typeof payloadSchema>;

  try {
    const data = await request.json();
    payload = payloadSchema.parse(data);
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid payload" : "Invalid JSON body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (payload.type === "folder") {
      const folder = await createFolder(payload.folderPath as string, session.user.id);
      return NextResponse.json({ folder }, { status: 201 });
    }

    const title = (payload.title ?? payload.filename) as string;
    const document = await createMarkdownFile(
      title,
      payload.content ?? "",
      session.user.id,
      payload.overwrite,
      payload.folderPath
    );

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

export async function GET(request: Request) {
  const sessionOrResponse = await ensureAuthenticated(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }
  const session = sessionOrResponse as AuthSession;
  try {
    const { documents, folders } = await listMarkdownItems({ includeContent: false, userId: session.user.id });

    return NextResponse.json({ documents, folders });
  } catch (error) {
    console.error("Failed to read markdown files", error);
    return NextResponse.json({ error: "Failed to read markdown files" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const sessionOrResponse = await ensureAuthenticated(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }
  const session = sessionOrResponse as AuthSession;
  try {
    const data = await request.json();
    
    // Check if this is a content update (has content field) or rename (has title field)
    if ("content" in data && !("title" in data)) {
      const payload = updateContentSchema.parse(data);
      const document = await updateMarkdownFileContent(payload.id, payload.content, session.user.id);
      return NextResponse.json({ document });
    }
    
    // Check if this is a folder rename
    if ("type" in data && data.type === "folder" && "newName" in data) {
      const payload = renameFolderSchema.parse(data);
      const folder = await renameFolder(payload.folderPath, payload.newName, session.user.id);
      return NextResponse.json({ folder });
    }
    
    // Otherwise, treat as document rename
    const payload = renameSchema.parse(data);
    const document = await renameMarkdownFile(payload.id, payload.title, session.user.id);
    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid payload";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof MarkdownFileOperationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to update markdown file", error);
    return NextResponse.json({ error: "Failed to update markdown file" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const sessionOrResponse = await ensureAuthenticated(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }
  const session = sessionOrResponse as AuthSession;
  try {
    const data = await request.json();
    const payload = deleteSchema.parse(data);
    if ("folderPath" in payload) {
      const folderPath = await deleteFolder(payload.folderPath, session.user.id);
      return NextResponse.json({ folderPath });
    }

    const document = await deleteMarkdownFile(payload.id, session.user.id);

    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid payload";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof MarkdownFileOperationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to delete markdown file", error);
    return NextResponse.json({ error: "Failed to delete markdown file" }, { status: 500 });
  }
}
