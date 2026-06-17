export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getModel(): string {
  return process.env.ASSISTANT_MODEL?.trim() || "gpt-4o-mini";
}

function getBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
}

function getMaxTokens(): number {
  return Number(process.env.ASSISTANT_MAX_TOKENS ?? 400);
}

function getDevMaxTokens(): number {
  return Number(process.env.DEV_MAX_TOKENS ?? 2000);
}

function getDevModel(): string {
  return process.env.DEV_MODEL?.trim() || getModel();
}

async function runChatCompletion(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  options?: { maxTokens?: number; model?: string; toolChoice?: "auto" | "required" | "none" },
): Promise<{ message: ChatMessage; toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const body: Record<string, unknown> = {
    model: options?.model ?? getModel(),
    max_tokens: options?.maxTokens ?? getMaxTokens(),
    messages,
  };

  if (tools.length > 0 && options?.toolChoice !== "none") {
    body.tools = tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
    body.tool_choice = options?.toolChoice ?? "auto";
  }

  const response = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`LLM request failed (${response.status}): ${await response.text()}`);

  const choice = ((await response.json()) as { choices: Array<{ message: ChatMessage & { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> }).choices[0]?.message;
  if (!choice) throw new Error("LLM returned no message");

  return {
    message: {
      role: "assistant",
      content: choice.content,
      tool_calls: choice.tool_calls?.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.function.name, arguments: call.function.arguments },
      })),
    },
    toolCalls: choice.tool_calls?.map((call) => ({ id: call.id, name: call.function.name, arguments: call.function.arguments })) ?? [],
  };
}

export async function runAssistantTurn(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  options?: { toolChoice?: "auto" | "required" | "none" },
) {
  return runChatCompletion(messages, tools, { toolChoice: options?.toolChoice });
}

export async function runDevTurn(messages: ChatMessage[], tools: ToolDefinition[]) {
  return runChatCompletion(messages, tools, { maxTokens: getDevMaxTokens(), model: getDevModel() });
}
