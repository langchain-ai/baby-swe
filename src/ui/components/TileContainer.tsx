import { useCallback, useRef, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useStore } from "../../store";
import { useShallow } from 'zustand/react/shallow';
import { MessageView, summarizeChangedFiles } from "./MessageView";
import { PromptBar } from "./PromptBar";
import { TodoList } from "./TodoList";
import { Logo } from "./Logo";
import { TerminalTile } from "./TerminalTile";
import { FileViewerTile } from "./FileViewerTile";
import { SourceControlTile } from "./SourceControlTile";
import { ThreadPicker } from "./ThreadPicker";
import { CompactingIndicator } from "./CompactingIndicator";
import { executeCommand } from "../../commands";
import type { Message, ChatMessage, ChatMessageContentBlock, Project, ImageChunk, Thread, ToolExecutionChunk } from "../../types";

const PROMPT_CONTENT_WIDTH = "max-w-[44rem]";
const STACKED_STATUS_WIDTH = "w-[calc(100%-0.75rem)] max-w-[43rem]";
const MESSAGE_CONTENT_WIDTH = "max-w-[42rem]";

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

function findLatestPendingApproval(messages: Message[]): ToolExecutionChunk | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];

    for (let chunkIndex = message.chunks.length - 1; chunkIndex >= 0; chunkIndex -= 1) {
      const chunk = message.chunks[chunkIndex];
      if (chunk.kind !== "tool-execution") continue;
      if (chunk.status !== "pending-approval") continue;
      if (!chunk.approvalRequestId) continue;
      return chunk;
    }
  }

  return null;
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
  const [queuedSubmissions, setQueuedSubmissions] = useState<Array<{ query: string; images: ImageChunk[] }>>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showThreadPicker, setShowThreadPicker] = useState(false);

  const tile = useStore(state => state.workspaces[workspaceIndex]?.tiles[tileId] ?? null);
  const session = useStore(state => {
    const t = state.workspaces[workspaceIndex]?.tiles[tileId];
    return t ? state.sessions[t.sessionId] ?? null : null;
  });
  const recentProjects = useStore(state => state.recentProjects);
  const modelConfig = useStore(state => state.modelConfig);
  const actions = useStore(useShallow(state => ({
    loadRecentProjects: state.loadRecentProjects,
    setTileProject: state.setTileProject,
    createSession: state.createSession,
    clearSession: state.clearSession,
    addMessageToSession: state.addMessageToSession,
    startStreaming: state.startStreaming,
    setAutoApproveSession: state.setAutoApproveSession,
    setModelConfig: state.setModelConfig,
    setShowApiKeysScreen: state.setShowApiKeysScreen,
    resumeThread: state.resumeThread,
    openFileViewer: state.openFileViewer,
  })));
  const {
    loadRecentProjects,
    setTileProject,
    createSession,
    clearSession,
    addMessageToSession,
    startStreaming,
    setAutoApproveSession,
    setModelConfig,
    setShowApiKeysScreen,
    resumeThread,
    openFileViewer,
  } = actions;

  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  useEffect(() => {
    if (session) {
      window.agent.setMode(session.id, session.mode);
    }
  }, [session?.id, session?.mode]);

  useEffect(() => {
    setQueuedSubmissions([]);
  }, [session?.id]);

  const handleOpenFolder = useCallback(async () => {
    const project = await window.tile.openProject(tileId);
    if (project) {
      setTileProject(tileId, project);
      if (tile?.sessionId) {
        clearSession(tile.sessionId);
      }
    }
  }, [tileId, setTileProject, clearSession, tile?.sessionId]);

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

  const handleOpenDiff = useCallback(
    async (diffData: { filePath: string; originalContent: string; modifiedContent: string }) => {
      const language = diffData.filePath.split(".").pop() ?? "plaintext";
      const projectPath = tile?.project?.worktreePath || tile?.project?.path;

      if (projectPath) {
        try {
          const workingTreeDiff = await window.git.diffFile(projectPath, diffData.filePath, false);
          if (workingTreeDiff) {
            openFileViewer({
              filePath: diffData.filePath,
              originalContent: workingTreeDiff.original,
              modifiedContent: workingTreeDiff.modified,
              language,
            });
            return;
          }
        } catch {
          // Fall through to tool-provided diff data
        }
      }

      openFileViewer({
        filePath: diffData.filePath,
        originalContent: diffData.originalContent,
        modifiedContent: diffData.modifiedContent,
        language,
      });
    },
    [openFileViewer, tile?.project?.path, tile?.project?.worktreePath],
  );

  const handleContainerClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    onFocus();

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true']")) {
      return;
    }

    const textarea = containerRef.current?.querySelector("textarea");
    if (textarea) textarea.focus();
  }, [onFocus]);

  const dragProps = {
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  const startAgentRun = useCallback((sessionId: string, query: string, images: ImageChunk[]) => {
    const freshSession = useStore.getState().sessions[sessionId];
    if (!freshSession) return;

    const chunks = [
      ...images,
      { kind: "text" as const, text: query },
    ];

    const chatHistory = messagesToChatMessages(freshSession.messages);

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

    addMessageToSession(sessionId, "user", chunks);
    startStreaming(sessionId);
    window.agent.stream(
      sessionId,
      tileId,
      chatHistory,
      modelConfig,
      freshSession.mode,
    );
  }, [addMessageToSession, startStreaming, tileId, modelConfig]);

  useEffect(() => {
    if (!session) return;
    if (session.isCompacting || session.isStreaming || session.busy) return;
    if (queuedSubmissions.length === 0) return;

    const next = queuedSubmissions[0];
    setQueuedSubmissions((prev) => prev.slice(1));
    startAgentRun(session.id, next.query, next.images);
  }, [session, queuedSubmissions, startAgentRun]);

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!tile) return;

      if (query.startsWith("/")) {
        const commandExecuted = executeCommand(query, {
          sessionId: session?.id || null,
          createSession: () => createSession(tileId),
          clearSession,
          addSystemMessage: (sessionId, chunks) => addMessageToSession(sessionId, 'system', chunks),
          tokenUsage: session?.tokenUsage || {
            lastCall: { input: 0, output: 0, total: 0 },
            cumulative: { input: 0, output: 0, total: 0 },
          },
          modelConfig,
          setModelConfig,
          setShowApiKeysScreen,
          project: tile.project,
          resumeThread,
          showThreadPicker: () => setShowThreadPicker(true),
          compact: (sessionId) => {
            const s = useStore.getState().sessions[sessionId];
            if (!s) return;
            const chatMessages = messagesToChatMessages(s.messages);
            window.agent.compact(sessionId, chatMessages, modelConfig);
          },
        });
        if (commandExecuted) return;
      }

      if (!session) return;

      if (session.isCompacting) return;

      const images = pendingImages;
      setPendingImages([]);

      if (session.isStreaming || session.busy) {
        setQueuedSubmissions((prev) => [...prev, { query, images }]);
        window.agent.cancel(session.id);
        return;
      }

      startAgentRun(session.id, query, images);
    },
    [
      tile,
      session,
      tileId,
      pendingImages,
      createSession,
      clearSession,
      modelConfig,
      setModelConfig,
      setShowApiKeysScreen,
      startAgentRun,
      resumeThread,
    ],
  );

  if (!tile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a2332] text-gray-500">
        Tile not found
      </div>
    );
  }

  if (tile.type === "source-control") {
    return (
      <SourceControlTile
        tileId={tileId}
        projectPath={tile.project?.worktreePath || tile.project?.path}
        mainProjectPath={tile.project?.path}
        isFocused={isFocused}
        onFocus={onFocus}
      />
    );
  }

  if (tile.type === "terminal") {
    return (
      <TerminalTile
        tileId={tileId}
        cwd={tile.project?.worktreePath || tile.project?.path}
        isFocused={isFocused}
        onFocus={onFocus}
      />
    );
  }

  if (tile.type === "file-viewer" && tile.fileViewerData) {
    return (
      <FileViewerTile
        tileId={tileId}
        fileViewerData={tile.fileViewerData}
        tabs={tile.fileViewerTabs}
        activeTabIndex={tile.activeFileViewerTab}
        projectPath={tile.project?.path}
        isFocused={isFocused}
        onFocus={onFocus}
      />
    );
  }

  if (!tile.project) return null;

  const hasMessages = session && session.messages.length > 0;
  const streamingMessageId = session?.streamingMessageId ?? null;
  const streamingMessage = streamingMessageId
    ? session?.messages.find((message) => message.id === streamingMessageId) ?? null
    : null;
  const streamingChangedFiles = streamingMessage ? summarizeChangedFiles(streamingMessage.chunks) : [];
  let streamingAdditions = 0;
  let streamingDeletions = 0;
  for (const file of streamingChangedFiles) {
    streamingAdditions += file.additions;
    streamingDeletions += file.deletions;
  }
  const streamingChangedTotals = { additions: streamingAdditions, deletions: streamingDeletions };
  const todos = session.todos ?? [];
  const hasTodos = todos.length > 0;
  const hasStreamingChangedFiles = session.isStreaming && streamingChangedFiles.length > 0;
  const hasConnectedStack = hasTodos || hasStreamingChangedFiles;
  const runActive = session.isStreaming || session.busy;
  const pendingApproval = session ? findLatestPendingApproval(session.messages) : null;

  if (!hasMessages) {
    return (
      <div
        ref={containerRef}
        className={`relative flex flex-col h-full bg-[var(--ui-bg)] text-[color:var(--ui-text)] ${isDragOver ? "ring-2 ring-[var(--ui-accent)] ring-inset" : ""}`}
        onClick={handleContainerClick}
        {...dragProps}
      >
        {isFocused && !isDragOver && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 ring-2 ring-[var(--ui-accent)] ring-inset z-20"
          />
        )}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 bg-[var(--ui-accent)]/10 border-2 border-dashed border-[var(--ui-accent)] z-30 flex items-center justify-center">
            <span className="text-[color:var(--ui-accent)] text-sm font-medium">Drop images here</span>
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className={`w-full ${PROMPT_CONTENT_WIDTH} flex flex-col items-center gap-6 min-w-0`}>
            <Logo />
            <div className={`w-full ${PROMPT_CONTENT_WIDTH} min-w-0`}>
            <PromptBar
              onSubmit={handleSubmit}
              busy={session?.busy ?? false}
              projectPath={tile.project.worktreePath || tile.project.path}
              mainProjectPath={tile.project.path}
              gitBranch={tile.project.gitBranch}
              githubPR={tile.project.githubPR}
              sessionId={tile.sessionId}
              tileId={tileId}
              isFocused={isFocused}
              pendingImages={pendingImages}
              onRemoveImage={handleRemoveImage}
              onChangeDirectory={handleOpenFolder}
              dropUp={false}
              worktreeType={tile.project.worktreeType}
              worktreePath={tile.project.worktreePath}
              pendingApproval={pendingApproval ? {
                requestId: pendingApproval.approvalRequestId!,
                toolName: pendingApproval.toolName,
                toolArgs: pendingApproval.toolArgs ?? {},
                diffData: pendingApproval.diffData,
              } : null}
              onApproveApproval={handleApprove}
              onRejectApproval={handleReject}
              onAutoApproveApproval={handleAutoApprove}
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
      className={`relative flex flex-col h-full bg-[var(--ui-bg)] text-[color:var(--ui-text)] overflow-hidden ${isDragOver ? "ring-2 ring-[var(--ui-accent)] ring-inset" : ""}`}
      onClick={handleContainerClick}
      {...dragProps}
    >
      {isFocused && !isDragOver && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-2 ring-[var(--ui-accent)] ring-inset z-20"
        />
      )}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 bg-[var(--ui-accent)]/10 border-2 border-dashed border-[var(--ui-accent)] z-30 flex items-center justify-center">
          <span className="text-[color:var(--ui-accent)] text-sm font-medium">Drop images here</span>
        </div>
      )}
      <MessageView
        messages={session.messages}
        isStreaming={session.isStreaming}
        contentWidthClass={MESSAGE_CONTENT_WIDTH}
        onApprove={handleApprove}
        onReject={handleReject}
        onAutoApprove={handleAutoApprove}
        onOpenDiff={handleOpenDiff}
        showHeader
        project={tile.project}
      />
      {session.isCompacting ? (
        <div className="px-4 py-4 shrink-0">
          <CompactingIndicator />
        </div>
      ) : (
        <>
          {hasConnectedStack && (
            <div className="px-4 shrink-0">
              <div className={`w-full ${STACKED_STATUS_WIDTH} mx-auto min-w-0`}>
                {hasTodos && (
                  <TodoList
                    todos={todos}
                    runActive={runActive}
                    className="rounded-t-xl rounded-b-none"
                  />
                )}
                {hasStreamingChangedFiles && (
                  <div
                    className={`border border-[var(--ui-border)] bg-[var(--ui-accent-bubble)] px-3 py-2 flex items-center justify-between gap-3 text-xs rounded-b-none ${hasTodos ? "rounded-t-none border-t-0" : "rounded-t-xl"}`}
                  >
                    <span className="text-[color:var(--ui-text-muted)] truncate">
                      {streamingChangedFiles.length} file{streamingChangedFiles.length === 1 ? "" : "s"} changed
                      <span className="ml-2 text-green-400">+{streamingChangedTotals.additions}</span>
                      <span className="ml-1 text-red-400">-{streamingChangedTotals.deletions}</span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[color:var(--ui-accent)] hover:opacity-80 transition-opacity"
                      onClick={() => {
                        const file = streamingChangedFiles[streamingChangedFiles.length - 1];
                        if (!file) return;
                        handleOpenDiff({
                          filePath: file.filePath,
                          originalContent: file.originalContent,
                          modifiedContent: file.modifiedContent,
                        });
                      }}
                    >
                      Review changes ↗
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="px-4 pb-4 shrink-0">
            <div className={`w-full ${PROMPT_CONTENT_WIDTH} mx-auto min-w-0`}>
              <PromptBar
                onSubmit={handleSubmit}
                busy={session.busy}
                projectPath={tile.project.worktreePath || tile.project.path}
                mainProjectPath={tile.project.path}
                gitBranch={tile.project.gitBranch}
                githubPR={tile.project.githubPR}
                sessionId={tile.sessionId}
                tileId={tileId}
                isFocused={isFocused}
                pendingImages={pendingImages}
                onRemoveImage={handleRemoveImage}
                onChangeDirectory={handleOpenFolder}
                worktreeType={tile.project.worktreeType}
                worktreePath={tile.project.worktreePath}
                connectedTop={hasConnectedStack}
                pendingApproval={pendingApproval ? {
                  requestId: pendingApproval.approvalRequestId!,
                  toolName: pendingApproval.toolName,
                  toolArgs: pendingApproval.toolArgs ?? {},
                  diffData: pendingApproval.diffData,
                } : null}
                onApproveApproval={handleApprove}
                onRejectApproval={handleReject}
                onAutoApproveApproval={handleAutoApprove}
              />
            </div>
          </div>
        </>
      )}
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
