import { NextRequest, NextResponse } from "next/server"

import { requireUserSession } from "@/app/api/files/_utils"
import { getAssistantResponse } from "@/lib/chat/openai"
import {
  addChatAttachments,
  addChatMessage,
  createChatSession,
  getChatSessionById,
  listChatMessages,
} from "@/lib/chat/repository"
import { saveUploadedFile } from "@/lib/file-storage"
import { getMarkdownFileById } from "@/lib/markdown-files"
import { listThreads } from "@/lib/comments"

export const runtime = "nodejs"

function getDefaultModel(pathname: string) {
  if (pathname.endsWith("/chat/openai")) return "gpt-5"
  if (pathname.endsWith("/chat/cerebras")) return "gpt-oss-120b"
  return "claude-sonnet-4-6"
}

function buildSessionTitle(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ")
  if (!normalized) return "New Chat"
  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized
}

function summarizeThreads(threads: Array<{ status: string; comments: Array<{ content: string }> }>) {
  if (threads.length === 0) {
    return "No comments on this document yet."
  }

  const unresolved = threads.filter((thread) => thread.status === "unresolved").length
  const samples = threads
    .flatMap((thread) => thread.comments)
    .slice(0, 5)
    .map((comment) => comment.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)

  return `Threads: ${threads.length}. Unresolved: ${unresolved}. Sample comments: ${samples.join(" | ") || "none"}`
}

export async function POST(request: NextRequest) {
  const sessionOrResponse = await requireUserSession(request)
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse
  }
  const userId = sessionOrResponse.user.id

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const message = String(formData.get("message") || "").trim()
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 })
  }

  let sessionId = String(formData.get("sessionId") || "").trim()
  const documentId = String(formData.get("documentId") || "").trim()
  const model = String(formData.get("model") || "").trim() || getDefaultModel(request.nextUrl.pathname)
  const reasoningEffortRaw = String(formData.get("reasoning_effort") || "").trim()
  const reasoningEffort =
    reasoningEffortRaw === "medium" || reasoningEffortRaw === "high"
      ? reasoningEffortRaw
      : "low"

  if (!sessionId) {
    const created = createChatSession(userId, buildSessionTitle(message), {
      documentId: documentId || null,
    })
    if (!created) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 })
    }
    sessionId = created.id
  }

  const existingSession = getChatSessionById(sessionId, userId)
  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const userMessage = addChatMessage({
    sessionId,
    userId,
    role: "user",
    content: message,
    context: documentId ? { documentId } : null,
  })

  if (!userMessage) {
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 })
  }

  const incomingFiles = Array.from(formData.entries())
    .filter(([, value]) => value instanceof File)
    .map(([, value]) => value as File)

  if (incomingFiles.length > 0) {
    const stored = [] as Array<{ name: string; mimeType: string; size: number; storagePath: string }>
    for (const file of incomingFiles) {
      try {
        const result = await saveUploadedFile(file, {
          userId,
          pathPrefix: "chat",
        })
        stored.push({
          name: file.name || "attachment",
          mimeType: file.type || result.mimeType,
          size: file.size,
          storagePath: result.filePath,
        })
      } catch (error) {
        console.error("Failed to store chat attachment", error)
      }
    }

    if (stored.length > 0) {
      addChatAttachments({
        messageId: userMessage.id,
        items: stored,
      })
    }
  }

  const history = listChatMessages(sessionId, userId)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }))

  let documentTitle: string | undefined
  let documentContent: string | undefined
  let threadSummary: string | undefined

  if (documentId) {
    try {
      const document = await getMarkdownFileById(documentId, userId)
      if (document) {
        documentTitle = document.title
        documentContent = document.content || ""
      }
    } catch (error) {
      console.error("Failed to load document for chat context", error)
    }

    try {
      const threads = listThreads(documentId, userId)
      threadSummary = summarizeThreads(threads)
    } catch {
      // Ignore document/thread lookup issues for optional context.
    }
  }

  try {
    const result = await getAssistantResponse({
      message,
      history,
      model,
      reasoningEffort,
      context: {
        ...(documentTitle ? { documentTitle } : {}),
        ...(documentContent ? { documentContent } : {}),
        ...(threadSummary ? { threadSummary } : {}),
      },
    })

    const assistantMessage = addChatMessage({
      sessionId,
      userId,
      role: "assistant",
      content: result.message,
      reasoning: result.reasoning ?? null,
      context: documentId ? { documentId } : null,
    })

    if (!assistantMessage) {
      return NextResponse.json({ error: "Failed to save assistant message" }, { status: 500 })
    }

    return NextResponse.json({
      sessionId,
      message: assistantMessage.content,
      reasoning: assistantMessage.reasoning ?? undefined,
      actions: [],
      toolCalls: [],
      citations: assistantMessage.citations ?? undefined,
    })
  } catch (error) {
    console.error("Failed to generate assistant response", error)

    const fallback = addChatMessage({
      sessionId,
      userId,
      role: "assistant",
      content: "I hit an error while generating a response. Please try again.",
      context: documentId ? { documentId } : null,
    })

    return NextResponse.json({
      sessionId,
      message: fallback?.content ?? "I hit an error while generating a response. Please try again.",
      actions: [],
      toolCalls: [],
      citations: [],
      error: error instanceof Error ? error.message : "Failed to generate response",
    })
  }
}
