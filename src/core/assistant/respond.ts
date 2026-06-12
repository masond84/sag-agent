import type { ChatMessage } from "../llm.js";
import { isLlmConfigured, runAssistantTurn } from "../llm.js";
import type { InteractiveSkillContext } from "../../types.js";
import { assistantTools, executeAssistantTool } from "./tools.js";

const SYSTEM_PROMPT = `You are SAG, a personal home assistant running on the user's machine.

You help with:
- Utility bills (Conservice / La Union)
- Agent status and health
- What SAG has seen and stored recently

Be concise, friendly, and practical. Use tools when you need facts instead of guessing.
If a tool says data is missing, say so clearly and suggest what the user can do next.
Do not claim you control devices, lights, or email unless a tool confirms it.`;

function fallbackReply(): string {
  return [
    "I can respond to natural language once OPENAI_API_KEY is set in .env.",
    "",
    "Until then, use:",
    "/status — health audit",
    "/skills — list skills",
    "/ping — check if SAG is online",
    "/help — command list",
  ].join("\n");
}

export async function respondToAssistantMessage(
  userText: string,
  context: InteractiveSkillContext,
): Promise<string> {
  if (!isLlmConfigured()) {
    return fallbackReply();
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userText },
  ];

  for (let step = 0; step < 3; step += 1) {
    const turn = await runAssistantTurn(messages, assistantTools);

    if (turn.toolCalls.length === 0) {
      return (turn.message.content ?? "").trim() || "I don't have an answer for that yet.";
    }

    messages.push(turn.message);

    for (const toolCall of turn.toolCalls) {
      const result = await executeAssistantTool(toolCall.name, toolCall.arguments, context);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: result,
      });
    }
  }

  const finalTurn = await runAssistantTurn(messages, assistantTools);
  return (finalTurn.message.content ?? "").trim() || "I couldn't finish that request.";
}
