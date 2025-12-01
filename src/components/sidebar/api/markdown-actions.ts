"use client"

import type { MarkdownDocument, MarkdownFolder } from "@/components/sidebar/tree/tree-types"

const JSON_HEADERS = { "Content-Type": "application/json" }

type RetryOptions = {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatuses: number[]
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
}

type MarkdownRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  body?: Record<string, unknown>
  errorMessage: string
  signal?: AbortSignal | undefined
  retry?: RetryOptions
}

type MarkdownIndexResponse = {
  documents?: unknown[]
  files?: unknown[]
  folders?: unknown[]
}

export type MarkdownIndexResult = {
  documents: MarkdownDocument[]
  folders: MarkdownFolder[]
}

type DocumentResponse = {
  document?: Partial<MarkdownDocument> & { slug?: string; documentPath?: string }
}

type FolderResponse = {
  folder?: MarkdownFolder
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calculateBackoff(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt)
  const jitter = Math.random() * 100
  return Math.min(exponentialDelay + jitter, options.maxDelayMs)
}

async function extractErrorFromResponse(
  response: Response,
  fallbackMessage: string
): Promise<Error> {
  try {
    const data = (await response.json()) as { error?: string; message?: string }
    const message = data?.error ?? data?.message ?? fallbackMessage
    return new Error(message)
  } catch {
    return new Error(fallbackMessage)
  }
}

async function markdownRequest<T>({
  method,
  body,
  errorMessage,
  signal,
  retry = DEFAULT_RETRY_OPTIONS,
}: MarkdownRequestOptions): Promise<T | undefined> {
  let lastError: Error = new Error(errorMessage)

  for (let attempt = 0; attempt < retry.maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Request aborted", "AbortError")
    }

    try {
      const requestInit: RequestInit = { method }
      if (body) {
        requestInit.headers = JSON_HEADERS
        requestInit.body = JSON.stringify(body)
      }
      if (signal) {
        requestInit.signal = signal
      }
      const response = await fetch("/api/markdown", requestInit)

      if (response.ok) {
        try {
          return (await response.json()) as T
        } catch {
          return undefined
        }
      }

      if (response.status >= 400 && response.status < 500) {
        if (!retry.retryableStatuses.includes(response.status)) {
          lastError = await extractErrorFromResponse(response, errorMessage)
          break
        }
      }

      lastError = new Error(`Server error: ${response.status}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error
      }
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    if (attempt < retry.maxAttempts - 1) {
      const backoff = calculateBackoff(attempt, retry)
      await delay(backoff)
    }
  }

  throw lastError
}

export async function fetchMarkdownIndex(signal?: AbortSignal): Promise<MarkdownIndexResult> {
  const data = await markdownRequest<MarkdownIndexResponse>({
    method: "GET",
    signal,
    errorMessage: "Unable to load markdown files",
  })
  const dataset: unknown[] = Array.isArray(data?.documents)
    ? data.documents ?? []
    : Array.isArray(data?.files)
      ? data.files ?? []
      : []

  const documents = dataset.filter((doc): doc is MarkdownDocument => {
    if (!doc || typeof doc !== "object") {
      return false
    }
    const candidate = doc as Partial<MarkdownDocument>
    const hasValidSortOrder =
      typeof candidate.sortOrder === "number" || typeof candidate.sortOrder === "undefined"

    return (
      typeof candidate.id === "string" &&
      typeof candidate.slug === "string" &&
      typeof candidate.documentPath === "string" &&
      typeof candidate.title === "string" &&
      hasValidSortOrder
    )
  })

  const rawFolders: unknown[] = Array.isArray(data?.folders) ? data.folders ?? [] : []
  const folders = rawFolders.filter((folder): folder is MarkdownFolder => {
    if (!folder || typeof folder !== "object") {
      return false
    }
    const candidate = folder as Partial<MarkdownFolder>
    const hasValidSortOrder =
      typeof candidate.sortOrder === "number" || typeof candidate.sortOrder === "undefined"

    return (
      typeof candidate.id === "string" &&
      typeof candidate.folderPath === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.updatedAt === "string" &&
      hasValidSortOrder
    )
  })

  return { documents, folders }
}

export async function createMarkdownDocument(
  payload: {
    title?: string | undefined
    folderPath?: string | undefined
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
    targetFolderPath?: string | undefined
    sortOrder?: number | undefined
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
  targetFolderPath?: string | null | undefined,
  sortOrder?: number | undefined,
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
