import { randomUUID } from "node:crypto";

import { getDatabase } from "@/lib/db";

export type ChatRole = "user" | "assistant" | "system";

export type ChatSession = {
  id: string;
  userId: string;
  title: string;
  context: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  userId: string;
  role: ChatRole;
  content: string;
  reasoning: string | null;
  context: Record<string, unknown> | null;
  citations: Array<{ url: string; title: string; cited_text: string }> | null;
  functionResult: Record<string, unknown> | null;
  seq: number;
  createdAt: string;
  attachments: Array<{
    id: string;
    messageId: string;
    name: string;
    mimeType: string;
    size: number;
    storagePath: string;
    createdAt: string;
  }>;
};

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function createChatSession(userId: string, title = "New Chat", context?: Record<string, unknown> | null) {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO chat_sessions (id, user_id, title, context, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, title, context ? JSON.stringify(context) : null, now, now);

  return getChatSessionById(id, userId);
}

export function getChatSessionById(sessionId: string, userId: string): ChatSession | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT s.id, s.user_id, s.title, s.context, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as message_count
       FROM chat_sessions s WHERE s.id = ? AND s.user_id = ?`
    )
    .get(sessionId, userId) as
    | {
        id: string;
        user_id: string;
        title: string;
        context: string | null;
        created_at: string;
        updated_at: string;
        message_count: number;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    context: safeParse<Record<string, unknown>>(row.context),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
  };
}

export function listChatSessions(userId: string): ChatSession[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT s.id, s.user_id, s.title, s.context, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as message_count
       FROM chat_sessions s
       WHERE s.user_id = ?
       ORDER BY s.updated_at DESC`
    )
    .all(userId) as Array<{
      id: string;
      user_id: string;
      title: string;
      context: string | null;
      created_at: string;
      updated_at: string;
      message_count: number;
    }>;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    context: safeParse<Record<string, unknown>>(row.context),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
  }));
}

export function updateChatSessionTitle(
  sessionId: string,
  userId: string,
  title: string
): ChatSession | null {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db
    .prepare("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(title, now, sessionId, userId);
  if (result.changes === 0) return null;
  return getChatSessionById(sessionId, userId);
}

export function deleteChatSession(sessionId: string, userId: string): boolean {
  const db = getDatabase();
  const result = db
    .prepare("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?")
    .run(sessionId, userId);
  return result.changes > 0;
}

export function listChatMessages(sessionId: string, userId: string): ChatMessage[] {
  const session = getChatSessionById(sessionId, userId);
  if (!session) return [];

  const db = getDatabase();
  const messages = db
    .prepare(
      `SELECT id, session_id, user_id, role, content, reasoning, context, citations, function_result, seq, created_at
       FROM chat_messages WHERE session_id = ? ORDER BY seq ASC`
    )
    .all(sessionId) as Array<{
      id: string;
      session_id: string;
      user_id: string;
      role: ChatRole;
      content: string;
      reasoning: string | null;
      context: string | null;
      citations: string | null;
      function_result: string | null;
      seq: number;
      created_at: string;
    }>;

  const attachments = db
    .prepare(
      `SELECT id, message_id, name, mime_type, size, storage_path, created_at
       FROM chat_attachments
       WHERE message_id IN (SELECT id FROM chat_messages WHERE session_id = ?)`
    )
    .all(sessionId) as Array<{
      id: string;
      message_id: string;
      name: string;
      mime_type: string;
      size: number;
      storage_path: string;
      created_at: string;
    }>;

  const byMessage = new Map<string, ChatMessage["attachments"]>();
  for (const attachment of attachments) {
    const list = byMessage.get(attachment.message_id) ?? [];
    list.push({
      id: attachment.id,
      messageId: attachment.message_id,
      name: attachment.name,
      mimeType: attachment.mime_type,
      size: attachment.size,
      storagePath: attachment.storage_path,
      createdAt: attachment.created_at,
    });
    byMessage.set(attachment.message_id, list);
  }

  return messages.map((message) => ({
    id: message.id,
    sessionId: message.session_id,
    userId: message.user_id,
    role: message.role,
    content: message.content,
    reasoning: message.reasoning,
    context: safeParse<Record<string, unknown>>(message.context),
    citations: safeParse<Array<{ url: string; title: string; cited_text: string }>>(message.citations),
    functionResult: safeParse<Record<string, unknown>>(message.function_result),
    seq: message.seq,
    createdAt: message.created_at,
    attachments: byMessage.get(message.id) ?? [],
  }));
}

export function addChatMessage(params: {
  sessionId: string;
  userId: string;
  role: ChatRole;
  content: string;
  reasoning?: string | null;
  context?: Record<string, unknown> | null;
  citations?: Array<{ url: string; title: string; cited_text: string }> | null;
  functionResult?: Record<string, unknown> | null;
}): ChatMessage | null {
  const db = getDatabase();
  const session = getChatSessionById(params.sessionId, params.userId);
  if (!session) return null;

  const nextSeq = db
    .prepare("SELECT COALESCE(MAX(seq), 0) + 1 as next_seq FROM chat_messages WHERE session_id = ?")
    .get(params.sessionId) as { next_seq: number };

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO chat_messages (
      id, session_id, user_id, role, content, reasoning, context, citations, function_result, seq, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.sessionId,
    params.userId,
    params.role,
    params.content,
    params.reasoning ?? null,
    params.context ? JSON.stringify(params.context) : null,
    params.citations ? JSON.stringify(params.citations) : null,
    params.functionResult ? JSON.stringify(params.functionResult) : null,
    nextSeq.next_seq,
    now
  );

  db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ? AND user_id = ?").run(now, params.sessionId, params.userId);

  return {
    id,
    sessionId: params.sessionId,
    userId: params.userId,
    role: params.role,
    content: params.content,
    reasoning: params.reasoning ?? null,
    context: params.context ?? null,
    citations: params.citations ?? null,
    functionResult: params.functionResult ?? null,
    seq: nextSeq.next_seq,
    createdAt: now,
    attachments: [],
  };
}

export function addChatAttachments(params: {
  messageId: string;
  items: Array<{ name: string; mimeType: string; size: number; storagePath: string }>;
}) {
  if (params.items.length === 0) return [];
  const db = getDatabase();
  const now = new Date().toISOString();

  const insert = db.prepare(
    `INSERT INTO chat_attachments (id, message_id, name, mime_type, size, storage_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  return params.items.map((item) => {
    const id = randomUUID();
    insert.run(id, params.messageId, item.name, item.mimeType, item.size, item.storagePath, now);
    return {
      id,
      messageId: params.messageId,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      storagePath: item.storagePath,
      createdAt: now,
    };
  });
}
