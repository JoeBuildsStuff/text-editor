import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// JSON / database row types (SQLite chat schema)
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ChatDatabase = {
  tech_stack_2026: {
    Tables: {
      chat_messages: {
        Row: {
          id: string;
          role: "user" | "assistant" | "system";
          content: string;
          created_at: string;
          reasoning: string | null;
          context: Json | null;
          function_result: Json | null;
          citations: Json | null;
        };
      };
      chat_attachments: {
        Row: {
          id: string;
          message_id: string;
          name: string;
          mime_type: string;
          size: number;
          storage_path: string;
        };
      };
      chat_tool_calls: {
        Row: {
          id: string;
          message_id: string;
          name: string;
          arguments: Json;
          result: Json | null;
          reasoning: string | null;
        };
      };
      chat_suggested_actions: {
        Row: {
          id: string;
          message_id: string;
          type: "filter" | "sort" | "navigate" | "create" | "function_call";
          label: string;
          payload: Json;
        };
      };
    };
  };
};

// ---------------------------------------------------------------------------
// Domain / UI types
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  reasoning?: string;
}

export interface ChatAction {
  type: "filter" | "sort" | "navigate" | "create" | "function_call";
  label: string;
  payload: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  reasoning?: string;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    url?: string;
    data?: string;
  }>;
  context?: {
    filters?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  suggestedActions?: ChatAction[];
  functionResult?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  toolCalls?: ToolCall[];
  citations?: Array<{
    url: string;
    title: string;
    cited_text: string;
  }>;
}

export interface PageContext {
  currentFilters: Record<string, unknown>;
  currentSort: Record<string, unknown>;
  visibleData: Record<string, unknown>[];
  totalCount: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  context?: PageContext;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatContextValue {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  messages: ChatMessage[];
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  currentContext: PageContext | null;
  createSession: (title?: string) => string;
  switchToSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  getSessions: () => ChatSessionSummary[];
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;
  setOpen: (open: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  setMaximized: (maximized: boolean) => void;
  toggleChat: () => void;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  updatePageContext: (context: PageContext) => void;
  getUnreadCount: () => number;
}

export interface ChatProviderProps {
  children: ReactNode;
}
