import { useCallback, useRef, useEffect, useState, memo } from "react";
import { useStore } from "../../store";
import { useShallow } from 'zustand/react/shallow';
import { MessageView } from "./MessageView";
import { PromptBar } from "./PromptBar";
import { TodoList } from "./TodoList";
import { Logo } from "./Logo";
import { TerminalTile } from "./TerminalTile";
import { ThreadPicker } from "./ThreadPicker";
import { executeCommand } from "../../commands";
import type { Message, ChatMessage, ChatMessageContentBlock, Project, ImageChunk, Thread } from "../../types";

function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  const chatMessages: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.author === "user" || msg.author === "agent") {
      const role = msg.author === "user" ? "user" as const : "assistant" as const;
      const hasImages = msg.chunks.some((c) => c.kind === "image");

      if (hasImages) {
        const blocks: ChatMessageContentBlock[] = [];
        for (const c of msg.chunks) {
          if (c.kind === "image") {
            blocks.push({
              type: "image_url",
              image_url: { url: `data:${c.mimeType};base64,${c.base64}` },
            });
          } else if (c.kind === "text") {
            blocks.push({ type: "text", text: c.text });
          } else if (c.kind === "code") {
            const lang = c.language || "";
            blocks.push({ type: "text", text: `\n\`\`\`${lang}\n${c.text}\n\`\`\`\n` });
          }
        }
        if (blocks.length > 0) {
          chatMessages.push({ role, content: blocks });
        }
      } else {
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
          chatMessages.push({ role, content: textContent });
        }
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
  const [pendingImages, setPendingImages] = useState<ImageChunk[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showThreadPicker, setShowThreadPicker] = useState(false);

  const tile = useStore(state => state.workspaces[workspaceIndex]?.tiles[tileId] ?? null);
  const session = useStore(state => {
    const t = state.workspaces[workspaceIndex]?.tiles[tileId];
    return t ? state.sessions[t.sessionId] ?? null : null;
  });
  const recentProjects = useStore(state => state.recentProjects);
  const tokenUsage = useStore(state => state.tokenUsage);
  const modelConfig = useStore(state => state.modelConfig);
  const actions = useStore(useShallow(state => ({
    loadRecentProjects: state.loadRecentProjects,
    setTileProject: state.setTileProject,
    createSession: state.createSession,
    clearSession: state.clearSession,
    addMessageToSession: state.addMessageToSession,
    startStreaming: state.startStreaming,
    finalizeStream: state.finalizeStream,
    setAutoApproveSession: state.setAutoApproveSession,
    setModelConfig: state.setModelConfig,
    setShowApiKeysScreen: state.setShowApiKeysScreen,
    resumeThread: state.resumeThread,
  })));
  const {
    loadRecentProjects,
    setTileProject,
    createSession,
    clearSession,
    addMessageToSession,
    startStreaming,
    finalizeStream,
    setAutoApproveSession,
    setModelConfig,
    setShowApiKeysScreen,
    resumeThread,
  } = actions;

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "image/png" || f.type === "image/jpeg"
    );

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        setPendingImages((prev) => [
          ...prev,
          { kind: "image", base64, mimeType: file.type, fileName: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleThreadSelect = useCallback(
    (thread: Thread) => {
      setShowThreadPicker(false);
      const sid = session?.id || createSession(tileId);
      resumeThread(sid, { messages: thread.messages, title: thread.title });
    },
    [session, createSession, tileId, resumeThread],
  );

  const dragProps = {
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!tile) return;

      if (query.startsWith("/")) {
        const commandExecuted = executeCommand(query, {
          sessionId: session?.id || null,
          createSession: () => createSession(tileId),
          clearSession,
          addSystemMessage: (sessionId, chunks) => addMessageToSession(sessionId, 'system', chunks),
          tokenUsage,
          modelConfig,
          setModelConfig,
          setShowApiKeysScreen,
          project: tile.project,
          resumeThread,
          showThreadPicker: () => setShowThreadPicker(true),
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

      const images = pendingImages;
      setPendingImages([]);

      const chunks = [
        ...images,
        { kind: "text" as const, text: query },
      ];

      const existingMessages = freshSession.messages;
      const chatHistory = messagesToChatMessages(existingMessages);

      if (images.length > 0) {
        const blocks: ChatMessageContentBlock[] = [
          ...images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
          { type: "text" as const, text: query },
        ];
        chatHistory.push({ role: "user", content: blocks });
      } else {
        chatHistory.push({ role: "user", content: query });
      }

      addMessageToSession(session.id, "user", chunks);
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
      pendingImages,
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

  const handleContainerClick = useCallback(() => {
    onFocus();
    const textarea = containerRef.current?.querySelector("textarea");
    if (textarea) textarea.focus();
  }, [onFocus]);

  if (!tile.project) {
    return (
      <div
        ref={containerRef}
        className="relative flex flex-col h-full bg-[#1a2332] text-gray-100"
        onClick={handleContainerClick}
        {...dragProps}
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
        className={`relative flex flex-col h-full bg-[#1a2332] text-gray-100 ${isDragOver ? "ring-2 ring-[#5a9bc7] ring-inset" : ""}`}
        onClick={handleContainerClick}
        {...dragProps}
      >
        {isFocused && !isDragOver && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
          />
        )}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 bg-[#5a9bc7]/10 border-2 border-dashed border-[#5a9bc7] z-30 flex items-center justify-center">
            <span className="text-[#5a9bc7] text-sm font-medium">Drop images here</span>
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl flex flex-col items-center gap-6">
            <Logo />
            <div className="w-full">
            <PromptBar
              onSubmit={handleSubmit}
              busy={session?.busy ?? false}
              projectPath={tile.project.path}
              gitBranch={tile.project.gitBranch}
              githubPR={tile.project.githubPR}
              sessionId={tile.sessionId}
              isFocused={isFocused}
              pendingImages={pendingImages}
              onRemoveImage={handleRemoveImage}
              dropUp={false}
            />
            </div>
          </div>
        </div>
        {showThreadPicker && tile.project && (
          <ThreadPicker
            projectId={tile.project.id}
            onSelect={handleThreadSelect}
            onClose={() => setShowThreadPicker(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col h-full bg-[#1a2332] text-gray-100 overflow-hidden ${isDragOver ? "ring-2 ring-[#5a9bc7] ring-inset" : ""}`}
      onClick={handleContainerClick}
      {...dragProps}
    >
      {isFocused && !isDragOver && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
        />
      )}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 bg-[#5a9bc7]/10 border-2 border-dashed border-[#5a9bc7] z-30 flex items-center justify-center">
          <span className="text-[#5a9bc7] text-sm font-medium">Drop images here</span>
        </div>
      )}
      <MessageView
        messages={session.messages}
        isStreaming={session.isStreaming}
        onApprove={handleApprove}
        onReject={handleReject}
        onAutoApprove={handleAutoApprove}
        showHeader
        project={tile.project}
      />
      <div className="px-4 shrink-0">
        <BinarySpinner isStreaming={session.isStreaming} />
      </div>
      {session.todos && session.todos.length > 0 && (
        <div className="px-4 shrink-0">
          <TodoList todos={session.todos} />
        </div>
      )}
      <div className="px-4 pb-4 shrink-0">
        <PromptBar
          onSubmit={handleSubmit}
          busy={session.busy}
          projectPath={tile.project.path}
          gitBranch={tile.project.gitBranch}
          githubPR={tile.project.githubPR}
          sessionId={tile.sessionId}
          isFocused={isFocused}
          pendingImages={pendingImages}
          onRemoveImage={handleRemoveImage}
        />
      </div>
      {showThreadPicker && tile.project && (
        <ThreadPicker
          projectId={tile.project.id}
          onSelect={handleThreadSelect}
          onClose={() => setShowThreadPicker(false)}
        />
      )}
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



const BINARY_FRAMES = [
  "010010", "001100", "100101", "111010", "111101",
  "010111", "101011", "111000", "110011", "110101",
];

const BUSY_TEXTS: { present: string; past: string }[] = [
  { present: "vibing...",               past: "Vibed" },
  { present: "noodling...",             past: "Noodled" },
  { present: "pondering...",            past: "Pondered" },
  { present: "thinking really hard...", past: "Thought really hard" },
  { present: "spinning up...",          past: "Spun up" },
  { present: "connecting the dots...", past: "Connected the dots" },
  { present: "brewing ideas...",        past: "Brewed ideas" },
  { present: "cooking...",              past: "Cooked" },
  { present: "crunching...",            past: "Crunched" },
  { present: "scheming...",             past: "Schemed" },
  { present: "processing...",           past: "Processed" },
];

function formatElapsed(ms: number): string {
  const secs = Math.round(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function BinarySpinner({ isStreaming }: { isStreaming: boolean }) {
  const [frame, setFrame] = useState(0);
  const [textIdx, setTextIdx] = useState(0);
  const [done, setDone] = useState<{ past: string; elapsed: string } | null>(null);
  const startTimeRef = useRef(0);
  const textIdxRef = useRef(textIdx);
  const wasStreamingRef = useRef(false);
  textIdxRef.current = textIdx;

  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      startTimeRef.current = Date.now();
      setTextIdx(Math.floor(Math.random() * BUSY_TEXTS.length));
      setDone(null);
    } else if (wasStreamingRef.current) {
      setDone({
        past: BUSY_TEXTS[textIdxRef.current].past,
        elapsed: formatElapsed(Date.now() - startTimeRef.current),
      });
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setFrame(f => (f + 1) % BINARY_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setTextIdx(i => (i + 1) % BUSY_TEXTS.length), 12000);
    return () => clearInterval(id);
  }, [isStreaming]);

  if (!isStreaming && !done) return null;

  if (done) {
    return (
      <div className="flex items-center gap-2 pb-2">
        <span className="font-mono text-xs text-gray-600 select-none">*</span>
        <span className="text-xs text-gray-600">{done.past} for {done.elapsed}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 pb-2">
      <span className="font-mono text-xs text-[#87CEEB] select-none">{BINARY_FRAMES[frame]}</span>
      <span className="shimmer-text text-xs">{BUSY_TEXTS[textIdx].present}</span>
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
