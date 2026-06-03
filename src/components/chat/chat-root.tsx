"use client";

import { ChatBubble } from "./chat-bubble";
import { ChatPanel } from "./chat-panel";

export function ChatRoot() {
  return (
    <>
      <ChatBubble />
      <ChatPanel />
    </>
  );
}
