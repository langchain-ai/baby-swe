import { createDeepAgent } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ipcMain } from "electron";
import "dotenv/config";

const model = new ChatAnthropic({
  model: "claude-opus-4-5-20251101",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

const systemPrompt = `You are baby-swe, a helpful software engineering assistant.
You help users with coding tasks, debugging, and software development questions.
Be concise and helpful.`;

const agent = createDeepAgent({
  model,
  systemPrompt,
});

export interface AgentResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
}

export function setupAgentIPC() {
  ipcMain.handle("agent:invoke", async (_event, userMessage: string): Promise<AgentResponse> => {
    try {
      const result = await agent.invoke({
        messages: [{ role: "user", content: userMessage }],
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const content = typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      return { content };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Agent error: ${errorMessage}`);
    }
  });
}
