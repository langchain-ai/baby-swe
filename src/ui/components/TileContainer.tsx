import { useCallback, useRef, useEffect } from "react";
import { useStore } from "../../store";
import { HeaderBar } from "./HeaderBar";
import { MessageView } from "./MessageView";
import { PromptBar } from "./PromptBar";
import { Logo } from "./Logo";
import { TerminalTile } from "./TerminalTile";
import { executeCommand } from "../../commands";
import type { Message, ChatMessage, Project } from "../../types";

function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  const chatMessages: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.author === "user" || msg.author === "agent") {
      const textContent = msg.chunks
        .map((c) => {
          if (c.kind === "text") return c.text;
          if (c.kind === "code") {
            const language = c.language ? c.language : "";
            return `\n\`\`\`${language}\n${c.text}\n\`\`\`\n`;
          }
          return "";
        })
        .join("");
      if (textContent) {
        chatMessages.push({
          role: msg.author === "user" ? "user" : "assistant",
          content: textContent,
        });
      }
    }
  }
  return chatMessages;
}

interface TileContainerProps {
  tileId: string;
  workspaceIndex: number;
  isFocused: boolean;
  onFocus: () => void;
}

export function TileContainer({
  tileId,
  workspaceIndex,
  isFocused,
  onFocus,
}: TileContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    workspaces,
    sessions,
    recentProjects,
    loadRecentProjects,
    setTileProject,
    createSession,
    clearSession,
    addMessageToSession,
    startStreaming,
    finalizeStream,
    setAutoApproveSession,
    tokenUsage,
    modelConfig,
    setModelConfig,
    setShowApiKeysScreen,
  } = useStore();

  const tiles = workspaces[workspaceIndex].tiles;
  const tile = tiles[tileId];
  const session = tile ? sessions[tile.sessionId] : null;

  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  useEffect(() => {
    if (session) {
      window.agent.setMode(session.id, session.mode);
    }
  }, [session?.id, session?.mode]);

  const handleOpenFolder = useCallback(async () => {
    const project = await window.tile.openProject(tileId);
    if (project) {
      setTileProject(tileId, project);
    }
  }, [tileId, setTileProject]);

  const handleSelectRecent = useCallback(
    async (path: string) => {
      const project = await window.tile.openProject(tileId, path);
      if (project) {
        setTileProject(tileId, project);
      }
    },
    [tileId, setTileProject],
  );

  const handleApprove = useCallback((approvalRequestId: string) => {
    window.agent.respondToApproval({
      requestId: approvalRequestId,
      decision: "approve",
    });
  }, []);

  const handleReject = useCallback((approvalRequestId: string) => {
    window.agent.respondToApproval({
      requestId: approvalRequestId,
      decision: "reject",
    });
  }, []);

  const handleAutoApprove = useCallback(
    (approvalRequestId: string) => {
      if (session) {
        setAutoApproveSession(session.id, true);
      }
      window.agent.respondToApproval({
        requestId: approvalRequestId,
        decision: "auto-approve",
      });
    },
    [session, setAutoApproveSession],
  );

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!tile) return;

      if (query.startsWith("/")) {
        const commandExecuted = executeCommand(query, {
          sessionId: session?.id || null,
          createSession: () => createSession(tileId),
          clearSession,
          addSystemMessage: addMessageToSession,
          tokenUsage,
          modelConfig,
          setModelConfig,
          setShowApiKeysScreen,
        });
        if (commandExecuted) return;
      }

      if (!session) return;

      if (session.isStreaming || session.busy) {
        window.agent.cancel(session.id);
        finalizeStream(session.id);
      }

      const freshSession = useStore.getState().sessions[session.id];
      if (!freshSession) return;

      const existingMessages = freshSession.messages;
      const chatHistory = messagesToChatMessages(existingMessages);
      chatHistory.push({ role: "user", content: query });
      addMessageToSession(session.id, "user", [{ kind: "text", text: query }]);
      startStreaming(session.id);
      window.agent.stream(
        session.id,
        tileId,
        chatHistory,
        modelConfig,
        freshSession.mode,
      );
    },
    [
      tile,
      session,
      tileId,
      addMessageToSession,
      startStreaming,
      finalizeStream,
      createSession,
      clearSession,
      tokenUsage,
      modelConfig,
      setModelConfig,
      setShowApiKeysScreen,
    ],
  );

  if (!tile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a2332] text-gray-500">
        Tile not found
      </div>
    );
  }

  if (tile.type === "terminal") {
    return (
      <TerminalTile
        tileId={tileId}
        cwd={tile.project?.path}
        isFocused={isFocused}
        onFocus={onFocus}
      />
    );
  }

  if (!tile.project) {
    return (
      <div
        ref={containerRef}
        className="relative flex flex-col h-full bg-[#1a2332] text-gray-100"
        onClick={onFocus}
      >
        {isFocused && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
          />
        )}
        <TileFolderSelect
          onOpenFolder={handleOpenFolder}
          onSelectRecent={handleSelectRecent}
          recentProjects={recentProjects}
        />
      </div>
    );
  }

  const hasMessages = session && session.messages.length > 0;

  if (!hasMessages) {
    return (
      <div
        ref={containerRef}
        className="relative flex flex-col h-full bg-[#1a2332] text-gray-100"
        onClick={onFocus}
      >
        {isFocused && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
          />
        )}
        <HeaderBar compact />
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <PromptBar
              onSubmit={handleSubmit}
              busy={session?.busy ?? false}
              projectPath={tile.project.path}
              sessionId={tile.sessionId}
              isFocused={isFocused}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full bg-[#1a2332] text-gray-100 overflow-hidden"
      onClick={onFocus}
    >
      {isFocused && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
        />
      )}
      <MessageView
        messages={session.messages}
        isStreaming={session.isStreaming}
        todos={session.todos}
        onApprove={handleApprove}
        onReject={handleReject}
        onAutoApprove={handleAutoApprove}
        showHeader
        project={tile.project}
      />
      <div className="px-4 pb-4 shrink-0">
        <PromptBar
          onSubmit={handleSubmit}
          busy={session.busy}
          projectPath={tile.project.path}
          sessionId={tile.sessionId}
          isFocused={isFocused}
        />
      </div>
    </div>
  );
}

interface TileFolderSelectProps {
  onOpenFolder: () => void;
  onSelectRecent: (path: string) => void;
  recentProjects: Project[];
}

function TileFolderSelect({
  onOpenFolder,
  onSelectRecent,
  recentProjects,
}: TileFolderSelectProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1">
      <div className="flex flex-col items-center gap-6">
        <Logo />
        <div className="text-center">
          <p className="text-gray-400 mb-4 text-sm">
            Open a folder to get started
          </p>
          <button
            onClick={onOpenFolder}
            className="flex items-center gap-2 px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] text-white rounded-lg transition-colors font-medium text-sm"
          >
            <FolderIcon />
            Open Folder
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div className="mt-2 w-full max-w-sm">
            <p className="text-gray-500 text-xs mb-2 text-center">Recent</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {recentProjects.slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  onClick={() => onSelectRecent(project.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 rounded transition-colors text-left"
                >
                  <FolderIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 text-sm truncate">
                      {project.name}
                    </p>
                    <p className="text-gray-500 text-xs truncate">
                      {project.path}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
