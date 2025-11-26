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

type MarkdownIndexResult = {
  documents: MarkdownDocument[]
  folders: MarkdownFolder[]
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

export async function fetchMarkdownIndex(signal?: AbortSignal): Promise<MarkdownIndexResult> {
  const data = await markdownRequest<MarkdownIndexResponse>({
    method: "GET",
    signal,
    errorMessage: "Unable to load markdown files",
  })
  const dataset = Array.isArray(data?.documents)
    ? data?.documents
    : Array.isArray(data?.files)
      ? data?.files
      : []

  const documents = dataset.filter(
    (doc: Partial<MarkdownDocument>): doc is MarkdownDocument => {
      const hasValidSortOrder =
        typeof doc?.sortOrder === "number" || typeof doc?.sortOrder === "undefined"

      return (
        typeof doc?.id === "string" &&
        typeof doc?.slug === "string" &&
        typeof doc?.documentPath === "string" &&
        typeof doc?.title === "string" &&
        hasValidSortOrder
      )
    }
  )

  const rawFolders = Array.isArray(data?.folders) ? data.folders : []
  const folders = rawFolders.filter(
    (folder: Partial<MarkdownFolder>): folder is MarkdownFolder => {
      const hasValidSortOrder =
        typeof folder?.sortOrder === "number" || typeof folder?.sortOrder === "undefined"

      return (
        typeof folder?.id === "string" &&
        typeof folder?.folderPath === "string" &&
        typeof folder?.createdAt === "string" &&
        typeof folder?.updatedAt === "string" &&
        hasValidSortOrder
      )
    }
  )

  return { documents, folders }
}

export async function createMarkdownDocument(
  payload: {
    title?: string
    folderPath?: string
  },
  signal?: AbortSignal
) {
  const data = await markdownRequest<DocumentResponse>({
    method: "POST",
    body: payload,
    errorMessage: "Failed to create document",
    signal,
  })
  return data?.document ?? null
}

export async function createMarkdownFolder(folderPath: string, signal?: AbortSignal) {
  const data = await markdownRequest<FolderResponse>({
    method: "POST",
    body: { type: "folder", folderPath },
    errorMessage: "Failed to create folder",
    signal,
  })
  return data?.folder ?? null
}

export async function deleteMarkdownDocument(id: string, signal?: AbortSignal) {
  await markdownRequest({
    method: "DELETE",
    body: { id },
    errorMessage: "Failed to delete document",
    signal,
  })
}

export async function deleteMarkdownFolder(folderPath: string, signal?: AbortSignal) {
  await markdownRequest({
    method: "DELETE",
    body: { type: "folder", folderPath },
    errorMessage: "Failed to delete folder",
    signal,
  })
}

export async function updateMarkdownSortOrder(
  params: {
    id: string
    type: "document" | "folder"
    sortOrder: number
  },
  signal?: AbortSignal
) {
  await markdownRequest({
    method: "PATCH",
    body: params,
    errorMessage: "Failed to save order",
    signal,
  })
}

export async function moveMarkdownDocument(
  params: {
    id: string
    targetFolderPath?: string
    sortOrder?: number
  },
  signal?: AbortSignal
) {
  const data = await markdownRequest<DocumentResponse>({
    method: "PATCH",
    body: {
      id: params.id,
      targetFolderPath: params.targetFolderPath ?? null,
      sortOrder: params.sortOrder,
    },
    errorMessage: "Failed to move document",
    signal,
  })
  return data?.document ?? null
}

export async function moveMarkdownFolder(
  folderPath: string,
  targetFolderPath?: string | null,
  sortOrder?: number,
  signal?: AbortSignal
) {
  const data = await markdownRequest<FolderResponse>({
    method: "PATCH",
    body: {
      type: "folder",
      folderPath,
      targetFolderPath: targetFolderPath ?? null,
      sortOrder,
    },
    errorMessage: "Failed to move folder",
    signal,
  })
  return data?.folder ?? null
}

export async function renameMarkdownFolder(folderPath: string, newName: string, signal?: AbortSignal) {
  await markdownRequest({
    method: "PATCH",
    body: { type: "folder", folderPath, newName },
    errorMessage: "Failed to rename folder",
    signal,
  })
}

export async function renameMarkdownDocument(id: string, title: string, signal?: AbortSignal) {
  const data = await markdownRequest<DocumentResponse>({
    method: "PATCH",
    body: { id, title },
    errorMessage: "Failed to rename document",
    signal,
  })
  return data?.document ?? null
}
