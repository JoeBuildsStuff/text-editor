"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import { getSessionFromHeaders } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db";
import { deleteStoredFile } from "@/lib/file-storage";
import type { Json } from "@/types/chat";

export type ChatRole = "user" | "assistant" | "system";

async function requireSessionUserId() {
  const session = await getSessionFromHeaders(await headers());
  if (!session) return null;
  return session.user.id;
}

type ChatMessageRow = {
  id: string;
  session_id: string;
  role: ChatRole;
  content: string;
  reasoning: string | null;
  context: string | null;
  function_result: string | null;
  citations: string | null;
  created_at: string;
};

type ChatAttachmentRow = {
  id: string;
  message_id: string;
  name: string;
  mime_type: string;
  size: number;
  storage_path: string;
};

function parseJson(value: string | null): Json | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Json;
  } catch {
    return null;
  }
}

function toSqlJson(value: Json | null | undefined): string | null {
  if (value == null) return null;
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
}

function getOwnedSession(db: ReturnType<typeof getDatabase>, sessionId: string, userId: string) {
  return db
    .prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as { id: string } | undefined;
}

export interface CreateSessionParams {
  title?: string;
  context?: Json | null;
}

export async function createChatSession(params: CreateSessionParams = {}) {
  const userId = await requireSessionUserId();
  if (!userId) return { error: "Not authenticated" };

  const db = getDatabase();
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO chat_sessions (id, user_id, title, context, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, params.title || "New Chat", params.context ? JSON.stringify(params.context) : null, now, now);

  return {
    data: {
      id,
      title: params.title || "New Chat",
      created_at: now,
      updated_at: now,
      context: params.context ?? null,
    },
  };
}

export async function updateChatSessionTitle(sessionId: string, title: string) {
  const userId = await requireSessionUserId();
  if (!userId) return { error: "Not authenticated" };

  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db
    .prepare("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(title, now, sessionId, userId);

  if (result.changes === 0) return { error: "Session not found" };
  return { data: { id: sessionId, title, updated_at: now } };
}

export async function deleteChatSession(sessionId: string) {
  const userId = await requireSessionUserId();
  if (!userId) return { error: "Not authenticated" };

  const db = getDatabase();
  if (!getOwnedSession(db, sessionId, userId)) {
    return { error: "Session not found" };
  }

  const attachments = db
    .prepare(
      `SELECT a.storage_path
       FROM chat_attachments a
       JOIN chat_messages m ON a.message_id = m.id
       WHERE m.session_id = ? AND m.user_id = ?`
    )
    .all(sessionId, userId) as Array<{ storage_path: string }>;

  for (const attachment of attachments) {
    try {
      await deleteStoredFile(attachment.storage_path, userId);
    } catch {
      // Best-effort cleanup; DB delete still proceeds.
    }
  }

  db.prepare("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?").run(sessionId, userId);
  return { data: { success: true } };
}

export async function listChatSessions() {
  const userId = await requireSessionUserId();
  if (!userId) return { error: "Not authenticated" };

  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT s.id, s.title, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as message_count
       FROM chat_sessions s
       WHERE s.user_id = ?
       ORDER BY s.updated_at DESC`
    )
    .all(userId) as Array<{
      id: string;
      title: string;
      created_at: string;
      updated_at: string;
      message_count: number;
    }>;

  return { data: rows };
}

export interface AddMessageParams {
  sessionId: string;
  role: ChatRole;
  content: string;
  parentId?: string | null;
  reasoning?: string | null;
  context?: Json | null;
  functionResult?: Json | null;
  citations?: Json | null;
  rootUserMessageId?: string | null;
  variantGroupId?: string | null;
  variantIndex?: number | null;
}

export async function addChatMessage(params: AddMessageParams) {
  const userId = await requireSessionUserId();
  if (!userId) return { error: "Not authenticated" };

  const db = getDatabase();
  if (!getOwnedSession(db, params.sessionId, userId)) {
    return { error: "Session not found" };
  }

  const nextSeq = db
    .prepare("SELECT COALESCE(MAX(seq), 0) + 1 as next_seq FROM chat_messages WHERE session_id = ?")
    .get(params.sessionId) as { next_seq: number };

  const id = randomUUID();
  const now = new Date().toISOString();
  const bind = {
    id: String(id),
    session_id: String(params.sessionId),
    user_id: String(userId),
    role: String(params.role),
    content: String(params.content ?? ""),
    reasoning: params.reasoning == null ? null : String(params.reasoning),
    context: toSqlJson(params.context),
    function_result: toSqlJson(params.functionResult),
    citations: toSqlJson(params.citations),
    seq:
      typeof nextSeq.next_seq === "number" && Number.isFinite(nextSeq.next_seq)
        ? nextSeq.next_seq
        : 0,
    created_at: String(now),
  };

  db.prepare(
    `INSERT INTO chat_messages (
      id, session_id, user_id, role, content, reasoning, context, function_result, citations, seq, created_at
    ) VALUES (@id, @session_id, @user_id, @role, @content, @reasoning, @context, @function_result, @citations, @seq, @created_at)`
  ).run(bind);

  db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ? AND user_id = ?").run(now, params.sessionId, userId);

  return { data: { id, created_at: now } };
}

export interface AttachmentInput {
  name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  width?: number | null;
  height?: number | null;
}

export async function addChatAttachments(messageId: string, attachments: AttachmentInput[]) {
  if (!attachments || attachments.length === 0) return { data: [] as Array<{ id: string; name: string; storage_path: string }> };

  const userId = await requireSessionUserId();
  if (!userId) return { error: "Not authenticated" };

  const db = getDatabase();
  const message = db
    .prepare("SELECT id, user_id FROM chat_messages WHERE id = ?")
    .get(messageId) as { id: string; user_id: string } | undefined;

  if (!message || message.user_id !== userId) return { error: "Message not found" };

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO chat_attachments (id, message_id, name, mime_type, size, storage_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const created = attachments.map((attachment) => {
    const id = randomUUID();
    insert.run(
      id,
      messageId,
      String(attachment.name ?? "attachment"),
      String(attachment.mime_type ?? "application/octet-stream"),
      typeof attachment.size === "number" && Number.isFinite(attachment.size)
        ? attachment.size
        : 0,
      String(attachment.storage_path ?? ""),
      now
    );
    return { id, name: attachment.name, storage_path: attachment.storage_path };
  });

  return { data: created };
}

export interface ToolCallInput {
  name: string;
  arguments: Json;
  result?: Json | null;
  reasoning?: string | null;
}

export async function addChatToolCalls(_messageId: string, _calls: ToolCallInput[]) {
  void _messageId;
  void _calls;
  // SQLite schema in this app currently does not persist tool-calls.
  return { data: [] as Array<{ id: string; name: string }> };
}

export interface SuggestedActionInput {
  type: "filter" | "sort" | "navigate" | "create" | "function_call";
  label: string;
  payload: Json;
}

export async function addChatSuggestedActions(_messageId: string, _actions: SuggestedActionInput[]) {
  void _messageId;
  void _actions;
  // SQLite schema in this app currently does not persist suggested actions.
  return { data: [] as Array<{ id: string; type: string; label: string }> };
}

export async function getChatMessages(sessionId: string) {
  const userId = await requireSessionUserId();
  if (!userId) return { error: "Not authenticated" };

  const db = getDatabase();
  if (!getOwnedSession(db, sessionId, userId)) {
    return { error: "Session not found" };
  }

  const messageRows = db
    .prepare(
      `SELECT id, session_id, role, content, reasoning, context, function_result, citations, created_at
       FROM chat_messages
       WHERE session_id = ? AND user_id = ?
       ORDER BY seq ASC`
    )
    .all(sessionId, userId) as ChatMessageRow[];

  const attachmentRows = db
    .prepare(
      `SELECT a.id, a.message_id, a.name, a.mime_type, a.size, a.storage_path
       FROM chat_attachments a
       JOIN chat_messages m ON a.message_id = m.id
       WHERE m.session_id = ? AND m.user_id = ?`
    )
    .all(sessionId, userId) as ChatAttachmentRow[];

  const attachmentsByMessage = new Map<string, ChatAttachmentRow[]>();
  for (const row of attachmentRows) {
    const list = attachmentsByMessage.get(row.message_id) ?? [];
    list.push(row);
    attachmentsByMessage.set(row.message_id, list);
  }

  const data = messageRows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
    reasoning: row.reasoning,
    context: parseJson(row.context),
    function_result: parseJson(row.function_result),
    citations: parseJson(row.citations),
    chat_attachments: (attachmentsByMessage.get(row.id) ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      mime_type: a.mime_type,
      storage_path: a.storage_path,
    })),
    chat_suggested_actions: [],
    chat_tool_calls: [],
  }));

  return { data };
}

export interface SetActiveVariantParams {
  sessionId: string;
  userMessageId: string;
  activeIndex: number;
  signature?: string | null;
  signatures?: string[] | null;
}

export async function setActiveVariant(_params: SetActiveVariantParams) {
  void _params;
  return { data: { id: "sqlite-noop", active_index: 0 } };
}

export async function getBranchState(_sessionId: string) {
  void _sessionId;
  return { data: [] as Array<{ user_message_id: string; active_index: number; signature: string | null; signatures: string[] | null }> };
}
