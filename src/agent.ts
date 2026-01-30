import { createDeepAgent } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ipcMain, BrowserWindow } from "electron";
import "dotenv/config";

const sessionControllers = new Map<string, AbortController>();

function createAgent() {
  const model = new ChatAnthropic({
    model: "claude-opus-4-5-20251101",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    streaming: true,
  });

  const systemPrompt = `You are baby-swe, a helpful software engineering assistant.
You help users with coding tasks, debugging, and software development questions.
Be concise and helpful.`;

  return createDeepAgent({
    model,
    systemPrompt,
  });
}

const agent = createAgent();

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

export function setupAgentIPC(mainWindow: BrowserWindow) {
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

  ipcMain.on("agent:stream", async (_event, sessionId: string, userMessage: string) => {
    const controller = new AbortController();
    sessionControllers.set(sessionId, controller);

    try {
      const streamAgent = createAgent();
      const stream = await streamAgent.streamEvents(
        { messages: [{ role: "user", content: userMessage }] },
        { version: "v2", signal: controller.signal }
      );

      for await (const event of stream) {
        if (controller.signal.aborted) break;

        if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
          const content = event.data.chunk.content;
          if (typeof content === 'string' && content) {
            mainWindow.webContents.send('agent:stream-event', {
              type: 'token',
              sessionId,
              token: content,
            });
          }
        }
      }

      if (!controller.signal.aborted) {
        mainWindow.webContents.send('agent:stream-event', {
          type: 'done',
          sessionId,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        mainWindow.webContents.send('agent:stream-event', {
          type: 'error',
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } finally {
      sessionControllers.delete(sessionId);
    }
  });

  ipcMain.on("agent:cancel", (_event, sessionId: string) => {
    const controller = sessionControllers.get(sessionId);
    if (controller) {
      controller.abort();
      sessionControllers.delete(sessionId);
    }
  });
}
