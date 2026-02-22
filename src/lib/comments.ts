import { randomUUID } from "node:crypto"

import { getDatabase } from "@/lib/db"

export type CommentRecord = {
  id: string
  threadId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
}

export type ThreadRecord = {
  id: string
  documentId: string
  createdBy: string
  status: "unresolved" | "resolved"
  anchorFrom: number
  anchorTo: number
  anchorExact: string
  anchorPrefix: string
  anchorSuffix: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  comments: CommentRecord[]
}

type ThreadRow = {
  id: string
  document_id: string
  created_by: string
  status: "unresolved" | "resolved"
  anchor_from: number
  anchor_to: number
  anchor_exact: string
  anchor_prefix: string
  anchor_suffix: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

type CommentRow = {
  id: string
  thread_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

function stripRichText(content: string) {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function assertDocumentOwnership(documentId: string, userId: string) {
  const db = getDatabase()
  const row = db
    .prepare("SELECT id FROM documents WHERE id = ? AND user_id = ?")
    .get(documentId, userId) as { id: string } | undefined

  if (!row) {
    throw new Error("Document not found")
  }
}

function mapComments(rows: CommentRow[]): CommentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function mapThread(row: ThreadRow, comments: CommentRecord[]): ThreadRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    createdBy: row.created_by,
    status: row.status,
    anchorFrom: row.anchor_from,
    anchorTo: row.anchor_to,
    anchorExact: row.anchor_exact,
    anchorPrefix: row.anchor_prefix,
    anchorSuffix: row.anchor_suffix,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    comments,
  }
}

export function listThreads(documentId: string, userId: string): ThreadRecord[] {
  assertDocumentOwnership(documentId, userId)
  const db = getDatabase()

  const threadRows = db
    .prepare(
      `SELECT * FROM comment_threads
       WHERE document_id = ?
       ORDER BY created_at ASC`
    )
    .all(documentId) as ThreadRow[]

  const commentRows = db
    .prepare(
      `SELECT * FROM comments
       WHERE thread_id IN (SELECT id FROM comment_threads WHERE document_id = ?)
       ORDER BY created_at ASC`
    )
    .all(documentId) as CommentRow[]

  const commentsByThread = new Map<string, CommentRecord[]>()
  for (const comment of mapComments(commentRows)) {
    const existing = commentsByThread.get(comment.threadId) ?? []
    existing.push(comment)
    commentsByThread.set(comment.threadId, existing)
  }

  return threadRows.map((thread) => mapThread(thread, commentsByThread.get(thread.id) ?? []))
}

export function createThread(input: {
  documentId: string
  userId: string
  anchorFrom: number
  anchorTo: number
  anchorExact: string
  anchorPrefix: string
  anchorSuffix: string
  content: string
}): ThreadRecord {
  assertDocumentOwnership(input.documentId, input.userId)
  if (input.anchorTo <= input.anchorFrom) {
    throw new Error("Invalid anchor range")
  }
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }
  const db = getDatabase()
  const id = randomUUID()
  const commentId = randomUUID()
  const now = new Date().toISOString()

  const createThreadStatement = db.prepare(
    `INSERT INTO comment_threads (
      id,
      document_id,
      created_by,
      status,
      anchor_from,
      anchor_to,
      anchor_exact,
      anchor_prefix,
      anchor_suffix,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 'unresolved', ?, ?, ?, ?, ?, ?, ?)`
  )

  const createCommentStatement = db.prepare(
    `INSERT INTO comments (
      id,
      thread_id,
      user_id,
      content,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    createThreadStatement.run(
      id,
      input.documentId,
      input.userId,
      input.anchorFrom,
      input.anchorTo,
      input.anchorExact,
      input.anchorPrefix,
      input.anchorSuffix,
      now,
      now
    )

    createCommentStatement.run(commentId, id, input.userId, input.content, now, now)
  })

  tx()

  return {
    id,
    documentId: input.documentId,
    createdBy: input.userId,
    status: "unresolved",
    anchorFrom: input.anchorFrom,
    anchorTo: input.anchorTo,
    anchorExact: input.anchorExact,
    anchorPrefix: input.anchorPrefix,
    anchorSuffix: input.anchorSuffix,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    comments: [
      {
        id: commentId,
        threadId: id,
        userId: input.userId,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      },
    ],
  }
}

export function updateThread(
  documentId: string,
  threadId: string,
  userId: string,
  updates: {
    resolved?: boolean
    anchorFrom?: number
    anchorTo?: number
    anchorExact?: string
    anchorPrefix?: string
    anchorSuffix?: string
  }
): ThreadRecord {
  assertDocumentOwnership(documentId, userId)
  const db = getDatabase()

  const existing = db
    .prepare("SELECT * FROM comment_threads WHERE id = ? AND document_id = ?")
    .get(threadId, documentId) as ThreadRow | undefined

  if (!existing) {
    throw new Error("Thread not found")
  }

  const now = new Date().toISOString()
  const nextStatus = updates.resolved === undefined
    ? existing.status
    : updates.resolved
      ? "resolved"
      : "unresolved"

  const nextResolvedAt = updates.resolved === undefined
    ? existing.resolved_at
    : updates.resolved
      ? now
      : null

  const anchorFrom = updates.anchorFrom ?? existing.anchor_from
  const anchorTo = updates.anchorTo ?? existing.anchor_to
  const anchorExact = updates.anchorExact ?? existing.anchor_exact
  const anchorPrefix = updates.anchorPrefix ?? existing.anchor_prefix
  const anchorSuffix = updates.anchorSuffix ?? existing.anchor_suffix

  db.prepare(
    `UPDATE comment_threads
     SET status = ?,
         resolved_at = ?,
         anchor_from = ?,
         anchor_to = ?,
         anchor_exact = ?,
         anchor_prefix = ?,
         anchor_suffix = ?,
         updated_at = ?
     WHERE id = ? AND document_id = ?`
  ).run(
    nextStatus,
    nextResolvedAt,
    anchorFrom,
    anchorTo,
    anchorExact,
    anchorPrefix,
    anchorSuffix,
    now,
    threadId,
    documentId
  )

  const commentRows = db
    .prepare("SELECT * FROM comments WHERE thread_id = ? ORDER BY created_at ASC")
    .all(threadId) as CommentRow[]

  return {
    id: existing.id,
    documentId: existing.document_id,
    createdBy: existing.created_by,
    status: nextStatus,
    anchorFrom,
    anchorTo,
    anchorExact,
    anchorPrefix,
    anchorSuffix,
    resolvedAt: nextResolvedAt,
    createdAt: existing.created_at,
    updatedAt: now,
    comments: mapComments(commentRows),
  }
}

export function deleteThread(documentId: string, threadId: string, userId: string) {
  assertDocumentOwnership(documentId, userId)
  const db = getDatabase()

  const result = db
    .prepare("DELETE FROM comment_threads WHERE id = ? AND document_id = ?")
    .run(threadId, documentId)

  if (result.changes === 0) {
    throw new Error("Thread not found")
  }
}

export function createComment(input: {
  documentId: string
  threadId: string
  userId: string
  content: string
}): CommentRecord {
  assertDocumentOwnership(input.documentId, input.userId)
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }
  const db = getDatabase()

  const thread = db
    .prepare("SELECT id FROM comment_threads WHERE id = ? AND document_id = ?")
    .get(input.threadId, input.documentId) as { id: string } | undefined

  if (!thread) {
    throw new Error("Thread not found")
  }

  const id = randomUUID()
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO comments (id, thread_id, user_id, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.threadId, input.userId, input.content, now, now)

    db.prepare("UPDATE comment_threads SET updated_at = ? WHERE id = ?")
      .run(now, input.threadId)
  })

  tx()

  return {
    id,
    threadId: input.threadId,
    userId: input.userId,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  }
}

export function updateComment(input: {
  documentId: string
  threadId: string
  commentId: string
  userId: string
  content: string
}): CommentRecord {
  assertDocumentOwnership(input.documentId, input.userId)
  if (stripRichText(input.content).length === 0) {
    throw new Error("Comment content is required")
  }
  const db = getDatabase()

  const existing = db
    .prepare(
      `SELECT c.*
       FROM comments c
       INNER JOIN comment_threads t ON t.id = c.thread_id
       WHERE c.id = ? AND c.thread_id = ? AND t.document_id = ?`
    )
    .get(input.commentId, input.threadId, input.documentId) as CommentRow | undefined

  if (!existing) {
    throw new Error("Comment not found")
  }

  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare("UPDATE comments SET content = ?, updated_at = ? WHERE id = ?")
      .run(input.content, now, input.commentId)

    db.prepare("UPDATE comment_threads SET updated_at = ? WHERE id = ?")
      .run(now, input.threadId)
  })

  tx()

  return {
    id: existing.id,
    threadId: existing.thread_id,
    userId: existing.user_id,
    content: input.content,
    createdAt: existing.created_at,
    updatedAt: now,
  }
}

export function deleteComment(input: {
  documentId: string
  threadId: string
  commentId: string
  userId: string
}) {
  assertDocumentOwnership(input.documentId, input.userId)
  const db = getDatabase()

  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    const deleted = db
      .prepare(
        `DELETE FROM comments
         WHERE id = ?
           AND thread_id = ?
           AND thread_id IN (
             SELECT id FROM comment_threads WHERE id = ? AND document_id = ?
           )`
      )
      .run(input.commentId, input.threadId, input.threadId, input.documentId)

    if (deleted.changes === 0) {
      throw new Error("Comment not found")
    }

    db.prepare("UPDATE comment_threads SET updated_at = ? WHERE id = ?")
      .run(now, input.threadId)
  })

  tx()
}

export function updateThreadAnchors(input: {
  documentId: string
  userId: string
  anchors: Array<{
    id: string
    anchorFrom: number
    anchorTo: number
    anchorExact?: string
    anchorPrefix?: string
    anchorSuffix?: string
  }>
}) {
  assertDocumentOwnership(input.documentId, input.userId)
  if (input.anchors.length === 0) {
    return
  }

  const db = getDatabase()
  const now = new Date().toISOString()

  const updateStatement = db.prepare(
    `UPDATE comment_threads
     SET anchor_from = ?,
         anchor_to = ?,
         anchor_exact = COALESCE(?, anchor_exact),
         anchor_prefix = COALESCE(?, anchor_prefix),
         anchor_suffix = COALESCE(?, anchor_suffix),
         updated_at = ?
     WHERE id = ? AND document_id = ?`
  )

  const tx = db.transaction(() => {
    for (const anchor of input.anchors) {
      if (anchor.anchorTo <= anchor.anchorFrom) {
        continue
      }
      updateStatement.run(
        anchor.anchorFrom,
        anchor.anchorTo,
        anchor.anchorExact ?? null,
        anchor.anchorPrefix ?? null,
        anchor.anchorSuffix ?? null,
        now,
        anchor.id,
        input.documentId
      )
    }
  })

  tx()
}
