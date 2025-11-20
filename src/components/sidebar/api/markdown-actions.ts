"use client"

import type { MarkdownDocument, MarkdownFolder } from "@/components/sidebar/tree/tree-types"

const JSON_HEADERS = { "Content-Type": "application/json" }

type MarkdownRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  body?: Record<string, unknown>
  errorMessage: string
  signal?: AbortSignal
}

type MarkdownIndexResponse = {
  documents?: unknown[]
  files?: unknown[]
  folders?: unknown[]
}

type DocumentResponse = {
  document?: Partial<MarkdownDocument> & { slug?: string; documentPath?: string }
}

type FolderResponse = {
  folder?: MarkdownFolder
}

async function markdownRequest<T>({
  method,
  body,
  errorMessage,
  signal,
}: MarkdownRequestOptions): Promise<T | undefined> {
  const response = await fetch("/api/markdown", {
    method,
    headers: body ? JSON_HEADERS : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })

  if (!response.ok) {
    let message = errorMessage
    try {
      const data = (await response.json()) as { error?: string }
      if (data?.error) {
        message = data.error
      }
    } catch {
      // Ignore parse errors and fallback to the provided message.
    }
    throw new Error(message)
  }

  try {
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

export async function fetchMarkdownIndex(signal?: AbortSignal) {
  const data = await markdownRequest<MarkdownIndexResponse>({
    method: "GET",
    signal,
    errorMessage: "Unable to load markdown files",
  })
  return data ?? { documents: [], folders: [] }
}

export async function createMarkdownDocument(payload: {
  title?: string
  folderPath?: string
}) {
  const data = await markdownRequest<DocumentResponse>({
    method: "POST",
    body: payload,
    errorMessage: "Failed to create document",
  })
  return data?.document ?? null
}

export async function createMarkdownFolder(folderPath: string) {
  const data = await markdownRequest<FolderResponse>({
    method: "POST",
    body: { type: "folder", folderPath },
    errorMessage: "Failed to create folder",
  })
  return data?.folder ?? null
}

export async function deleteMarkdownDocument(id: string) {
  await markdownRequest({
    method: "DELETE",
    body: { id },
    errorMessage: "Failed to delete document",
  })
}

export async function deleteMarkdownFolder(folderPath: string) {
  await markdownRequest({
    method: "DELETE",
    body: { type: "folder", folderPath },
    errorMessage: "Failed to delete folder",
  })
}

export async function updateMarkdownSortOrder(params: {
  id: string
  type: "document" | "folder"
  sortOrder: number
}) {
  await markdownRequest({
    method: "PATCH",
    body: params,
    errorMessage: "Failed to save order",
  })
}

export async function moveMarkdownDocument(params: {
  id: string
  targetFolderPath?: string
  sortOrder?: number
}) {
  const data = await markdownRequest<DocumentResponse>({
    method: "PATCH",
    body: {
      id: params.id,
      targetFolderPath: params.targetFolderPath ?? null,
      sortOrder: params.sortOrder,
    },
    errorMessage: "Failed to move document",
  })
  return data?.document ?? null
}

export async function renameMarkdownFolder(folderPath: string, newName: string) {
  await markdownRequest({
    method: "PATCH",
    body: { type: "folder", folderPath, newName },
    errorMessage: "Failed to rename folder",
  })
}

export async function renameMarkdownDocument(id: string, title: string) {
  const data = await markdownRequest<DocumentResponse>({
    method: "PATCH",
    body: { id, title },
    errorMessage: "Failed to rename document",
  })
  return data?.document ?? null
}
