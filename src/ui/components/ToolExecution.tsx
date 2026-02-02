import { useState, useEffect, useRef } from 'react';
import type { ToolExecutionChunk } from '../../types';
import { DiffView } from './DiffView';

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
}

const MAX_OUTPUT_LINES = 10;

function formatElapsed(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getToolDisplayName(toolName: string, toolArgs: Record<string, unknown>): string {
  switch (toolName) {
    case 'execute':
      return `Bash(${(toolArgs?.command as string)?.slice(0, 50) || 'command'}${(toolArgs?.command as string)?.length > 50 ? '...' : ''})`;
    case 'task':
      return `${(toolArgs?.subagent_type as string) || 'Task'}(${(toolArgs?.description as string)?.slice(0, 40) || 'task'}${(toolArgs?.description as string)?.length > 40 ? '...' : ''})`;
    case 'write_file':
      return `Write(${(toolArgs?.filePath as string) || (toolArgs?.path as string) || 'file'})`;
    case 'edit_file':
      return `Edit(${(toolArgs?.filePath as string) || (toolArgs?.path as string) || 'file'})`;
    case 'read_file':
      return `Read(${(toolArgs?.path as string) || 'file'})`;
    case 'web_search':
      return `Search(${(toolArgs?.query as string)?.slice(0, 30) || 'query'}${(toolArgs?.query as string)?.length > 30 ? '...' : ''})`;
    case 'fetch_url':
      return `Fetch(${(toolArgs?.url as string)?.slice(0, 40) || 'url'})`;
    case 'write_todos':
      const todos = (toolArgs?.todos as Array<unknown>) || [];
      return `TodoWrite(${todos.length} items)`;
    default:
      return `${toolName}(${JSON.stringify(toolArgs).slice(0, 30)}...)`;
  }
}

function getToolSummary(toolName: string, toolArgs: Record<string, unknown>, output?: string, status?: string): string {
  if (status === 'running') return 'Running...';
  if (status === 'error') return output?.slice(0, 100) || 'Error';

  switch (toolName) {
    case 'execute': {
      const lines = output?.split('\n').length || 0;
      return lines > 0 ? `${lines} lines of output` : 'No output';
    }
    case 'task': {
      try {
        const parsed = JSON.parse(output || '{}');
        return parsed.output?.slice(0, 100) || 'Task completed';
      } catch {
        return output?.slice(0, 100) || 'Task completed';
      }
    }
    case 'read_file': {
      const lines = output?.split('\n').length || 0;
      return `Read ${lines} lines`;
    }
    case 'write_file':
    case 'edit_file': {
      return 'File updated';
    }
    case 'write_todos': {
      const todos = (toolArgs?.todos as Array<{ status: string }>) || [];
      const completed = todos.filter(t => t.status === 'completed').length;
      return `${completed}/${todos.length} completed`;
    }
    default:
      return output?.slice(0, 100) || 'Done';
  }
}

function KeyboardApproval({
  approvalRequestId,
  toolName,
  onApprove,
  onReject,
  onAutoApprove,
}: {
  approvalRequestId: string;
  toolName: string;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onAutoApprove?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'y' || e.key === 'Enter') {
        e.preventDefault();
        onApprove?.(approvalRequestId);
      } else if (e.key === 'n') {
        e.preventDefault();
        onReject?.(approvalRequestId);
      } else if (e.key === 'a') {
        e.preventDefault();
        onAutoApprove?.(approvalRequestId);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [approvalRequestId, onApprove, onReject, onAutoApprove]);

  const action = toolName === 'execute' ? 'Run command' : toolName === 'task' ? 'Delegate task' : 'Approve';

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none">
      <span className="text-yellow-400">{action}?</span>
      <span className="text-gray-500 ml-2">[y]es / [n]o / [a]lways</span>
    </div>
  );
}

function ToolOutput({ output, expanded, onToggle }: { output: string; expanded: boolean; onToggle: () => void }) {
  const lines = output.split('\n');
  const isLong = lines.length > MAX_OUTPUT_LINES;
  const displayedOutput = expanded ? output : lines.slice(0, MAX_OUTPUT_LINES).join('\n');
  const hiddenLines = lines.length - MAX_OUTPUT_LINES;

  return (
    <div className="mt-1">
      <pre className="font-mono text-xs text-gray-400 whitespace-pre-wrap break-all overflow-x-auto">
        {displayedOutput}
      </pre>
      {isLong && !expanded && (
        <button
          onClick={onToggle}
          className="mt-1 text-xs text-cyan-400 hover:text-cyan-300"
        >
          +{hiddenLines} more lines (ctrl+o)
        </button>
      )}
      {expanded && isLong && (
        <button
          onClick={onToggle}
          className="mt-1 text-xs text-cyan-400 hover:text-cyan-300"
        >
          Show less
        </button>
      )}
    </div>
  );
}

export function ToolExecution({ chunk, onApprove, onReject, onAutoApprove }: ToolExecutionProps) {
  const { toolName, toolArgs, status, output, elapsedMs, approvalRequestId, diffData } = chunk;
  const [expanded, setExpanded] = useState(false);

  const displayName = getToolDisplayName(toolName, toolArgs || {});

  const statusIcon = {
    'pending-approval': <span className="text-yellow-400 animate-pulse">●</span>,
    running: <span className="text-yellow-400 animate-pulse">●</span>,
    success: <span className="text-cyan-400">●</span>,
    error: <span className="text-red-400">●</span>,
  }[status];

  const isFileOp = toolName === 'write_file' || toolName === 'edit_file';
  const showDiff = isFileOp && diffData && status === 'pending-approval';
  const showOutput = output && status !== 'running' && status !== 'pending-approval' && !isFileOp;
  const summary = getToolSummary(toolName, toolArgs || {}, output, status);

  return (
    <div className="my-2 font-mono text-sm">
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="text-gray-200">{displayName}</span>
        {elapsedMs && status !== 'running' && (
          <span className="text-gray-600 text-xs">{formatElapsed(elapsedMs)}</span>
        )}
      </div>

      <div className="ml-3 border-l border-gray-700 pl-3 mt-1">
        {status === 'pending-approval' && approvalRequestId ? (
          <>
            {showDiff && <DiffView diffData={diffData} />}
            <KeyboardApproval
              approvalRequestId={approvalRequestId}
              toolName={toolName}
              onApprove={onApprove}
              onReject={onReject}
              onAutoApprove={onAutoApprove}
            />
          </>
        ) : status === 'running' ? (
          <span className="text-gray-500 text-xs">Running...</span>
        ) : (
          <>
            <span className="text-gray-500 text-xs">{summary}</span>
            {showOutput && (
              <ToolOutput output={output} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
