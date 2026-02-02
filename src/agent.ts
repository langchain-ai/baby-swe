import { createDeepAgent } from "deepagents";
import { LocalSandboxBackend } from "./backends/local-sandbox";
import { ChatAnthropic } from "@langchain/anthropic";
import { ipcMain, BrowserWindow } from "electron";
import "dotenv/config";

const sessionControllers = new Map<string, AbortController>();

function createAgent(rootDir?: string) {
  const model = new ChatAnthropic({
    model: "claude-opus-4-5-20251101",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    streaming: true,
  });

  const systemPrompt = rootDir
    ? `You are baby-swe, a helpful software engineering assistant.
You help users with coding tasks, debugging, and software development questions.
Be concise and helpful.

Your current working directory is: ${rootDir}
You have full access to the filesystem within this directory. Use the available tools to explore and modify the codebase:
- File tools: ls, read_file, write_file, edit_file, glob, grep
- Shell execution: execute (run shell commands in the project directory)

When the user asks about code or files, start by exploring the directory structure to understand the project.
When running commands with execute, prefer non-interactive commands and handle errors gracefully.`
    : `You are baby-swe, a helpful software engineering assistant.
You help users with coding tasks, debugging, and software development questions.
Be concise and helpful.

No working directory has been selected. Ask the user to open a folder to enable filesystem access.`;

  const config: Parameters<typeof createDeepAgent>[0] = {
    model,
    systemPrompt,
  };

  if (rootDir) {
    config.backend = () => new LocalSandboxBackend({ rootDir });
  }

  return createDeepAgent(config);
}

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

export function setupAgentIPC(mainWindow: BrowserWindow, getFolder: () => string | null) {
  ipcMain.handle("agent:invoke", async (_event, userMessage: string): Promise<AgentResponse> => {
    try {
      const folder = getFolder();
      const agent = createAgent(folder || undefined);
      const result = await agent.invoke(
        { messages: [{ role: "user", content: userMessage }] },
        { recursionLimit: 100 }
      );

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

    const toolTimers = new Map<string, number>();

    try {
      const folder = getFolder();
      const streamAgent = createAgent(folder || undefined);

      console.log(`[agent:stream] Starting stream for session ${sessionId}, folder: ${folder}`);

      const stream = await streamAgent.streamEvents(
        { messages: [{ role: "user", content: userMessage }] },
        { version: "v2", signal: controller.signal, recursionLimit: 100 }
      );

      for await (const event of stream) {
        if (controller.signal.aborted) break;

        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;
          if (chunk?.content) {
            let token = '';
            if (typeof chunk.content === 'string') {
              token = chunk.content;
            } else if (Array.isArray(chunk.content)) {
              for (const block of chunk.content) {
                if (block.type === 'text' && block.text) {
                  token += block.text;
                }
              }
            }

            if (token) {
              mainWindow.webContents.send('agent:stream-event', {
                type: 'token',
                sessionId,
                token,
              });
            }
          }
        }

        if (event.event === "on_tool_start") {
          const toolCallId = event.run_id;
          const toolName = event.name;
          let toolArgs = event.data?.input || {};

          // Parse JSON-stringified input if needed
          if (toolArgs.input && typeof toolArgs.input === 'string') {
            try {
              toolArgs = JSON.parse(toolArgs.input);
            } catch {
              // Keep original if parsing fails
            }
          }

          toolTimers.set(toolCallId, Date.now());

          mainWindow.webContents.send('agent:stream-event', {
            type: 'tool-start',
            sessionId,
            toolCallId,
            toolName,
            toolArgs,
          });
        }

        if (event.event === "on_tool_end") {
          const toolCallId = event.run_id;
          const startTime = toolTimers.get(toolCallId) || Date.now();
          const elapsedMs = Date.now() - startTime;
          toolTimers.delete(toolCallId);

          const output = event.data?.output;
          let outputStr = '';
          let errorStr: string | undefined;

          if (typeof output === 'string') {
            outputStr = output;
          } else if (output && typeof output === 'object') {
            // Handle LangChain ToolMessage object
            if (output.kwargs?.content) {
              outputStr = String(output.kwargs.content);
            } else if (output.content) {
              outputStr = String(output.content);
            } else if ('output' in output) {
              outputStr = String(output.output);
            } else if ('error' in output) {
              errorStr = String(output.error);
              outputStr = errorStr;
            } else {
              outputStr = JSON.stringify(output, null, 2);
            }
          }

          mainWindow.webContents.send('agent:stream-event', {
            type: 'tool-end',
            sessionId,
            toolCallId,
            output: outputStr,
            error: errorStr,
            elapsedMs,
          });
        }
      }

      if (!controller.signal.aborted) {
        console.log(`[agent:stream] Stream completed for session ${sessionId}`);
        mainWindow.webContents.send('agent:stream-event', {
          type: 'done',
          sessionId,
        });
      }
    } catch (error) {
      console.error(`[agent:stream] Error for session ${sessionId}:`, error);
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
