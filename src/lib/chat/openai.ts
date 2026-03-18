type ChatHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type BuildReplyParams = {
  message: string;
  history: ChatHistoryMessage[];
  model?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  context: {
    documentTitle?: string;
    documentContent?: string;
    threadSummary?: string;
  };
};

function buildSystemPrompt({ documentTitle, documentContent, threadSummary }: BuildReplyParams["context"]) {
  const parts = [
    "You are an assistant inside a markdown editor application.",
    "Be concise and practical.",
    "When asked to help with writing, editing, or organization, provide actionable guidance.",
    "If document context is provided, ground your response in it.",
  ];

  if (documentTitle) parts.push(`Current document title: ${documentTitle}`);
  if (threadSummary) parts.push(`Current comments summary: ${threadSummary}`);
  if (documentContent) parts.push(`Current document content:\n${documentContent.slice(0, 12000)}`);

  return parts.join("\n\n");
}

function isAnthropicModel(model: string) {
  return model.startsWith("claude-");
}

function isCerebrasModel(model: string) {
  return model.startsWith("gpt-oss-120b");
}

async function getAnthropicResponse({
  apiKey,
  model,
  system,
  history,
  message,
}: {
  apiKey: string;
  model: string;
  system: string;
  history: ChatHistoryMessage[];
  message: string;
}): Promise<{ message: string }> {
  const messages = [...history.slice(-10), { role: "user" as const, content: message }]
    .filter((entry) => entry.role !== "system")
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: entry.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Anthropic error (${response.status}): ${errorText || "request failed"}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const content = payload.content
    ?.filter((item) => item.type === "text" && item.text)
    .map((item) => item.text?.trim() || "")
    .join("\n\n")
    .trim();

  return { message: content || "I couldn't generate a response right now." };
}

async function getOpenAICompatibleResponse({
  apiKey,
  baseUrl,
  model,
  system,
  history,
  message,
  reasoningEffort,
  providerName,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  history: ChatHistoryMessage[];
  message: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  providerName: string;
}): Promise<{ message: string; reasoning?: string }> {
  const messages = [
    { role: "system", content: system },
    ...history.slice(-10),
    { role: "user", content: message },
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
  };

  if (isCerebrasModel(model)) {
    body.reasoning_effort = reasoningEffort || "low";
  } else {
    body.temperature = 0.3;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`${providerName} error (${response.status}): ${errorText || "request failed"}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();

  return { message: content || "I couldn't generate a response right now." };
}

export async function getAssistantResponse(params: BuildReplyParams): Promise<{ message: string; reasoning?: string }> {
  const model = params.model || process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
  const system = buildSystemPrompt(params.context);
  if (isAnthropicModel(model)) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        message: "ANTHROPIC_API_KEY is not configured. Add it to your environment to enable Claude chat responses.",
      };
    }

    return getAnthropicResponse({
      apiKey,
      model,
      system,
      history: params.history,
      message: params.message,
    });
  }

  if (isCerebrasModel(model)) {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      return {
        message: "CEREBRAS_API_KEY is not configured. Add it to your environment to enable Cerebras chat responses.",
      };
    }

    return getOpenAICompatibleResponse({
      apiKey,
      baseUrl: "https://api.cerebras.ai/v1",
      model,
      system,
      history: params.history,
      message: params.message,
      ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
      providerName: "Cerebras",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      message: "OPENAI_API_KEY is not configured. Add it to your environment to enable GPT chat responses.",
    };
  }

  return getOpenAICompatibleResponse({
    apiKey,
    baseUrl: "https://api.openai.com/v1",
    model,
    system,
    history: params.history,
    message: params.message,
    providerName: "OpenAI",
  });
}
