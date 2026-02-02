import { useState } from 'react';
import type { ToolExecutionChunk } from '../../types';
import { DiffView } from './DiffView';

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
}

const MAX_OUTPUT_LINES = 10;

function extractCommandName(command: string): string {
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord || 'command';
}

function ShellExecution({ chunk, onApprove, onReject, onAutoApprove }: ToolExecutionProps) {
  const { toolArgs, status, output, elapsedMs, approvalRequestId } = chunk;
  const command = (toolArgs?.command as string) || '';
  const [expanded, setExpanded] = useState(false);

  const lines = output?.split('\n') || [];
  const isLong = lines.length > MAX_OUTPUT_LINES;
  const displayedOutput = expanded ? output : lines.slice(0, MAX_OUTPUT_LINES).join('\n');
  const hiddenLines = lines.length - MAX_OUTPUT_LINES;

  const formatElapsed = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (status === 'pending-approval' && approvalRequestId) {
    return (
      <div className="my-3 bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
          <span className="text-gray-400 text-sm font-medium">Run command: execute</span>
        </div>
        <div className="px-3 py-2">
          <div className="flex items-start gap-2 font-mono text-sm">
            <span className="text-purple-400 select-none">$</span>
            <span className="text-cyan-400 break-all">{command}</span>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-[#30363d]">
          <span className="text-gray-500 text-xs">Run in Sandbox</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onReject?.(approvalRequestId)}
              className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200"
            >
              Skip
            </button>
            <button
              onClick={() => onAutoApprove?.(approvalRequestId)}
              className="px-3 py-1.5 text-sm text-gray-200 bg-[#21262d] hover:bg-[#30363d] rounded-md border border-[#30363d]"
            >
              Allowlist &apos;{extractCommandName(command)}&apos;
            </button>
            <button
              onClick={() => onApprove?.(approvalRequestId)}
              className="px-3 py-1.5 text-sm text-white bg-[#238636] hover:bg-[#2ea043] rounded-md"
            >
              Run
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusDot = {
    'pending-approval': 'bg-yellow-400 animate-pulse',
    running: 'bg-yellow-400 animate-pulse',
    success: 'bg-green-400',
    error: 'bg-red-400',
  }[status];

  return (
    <div className="my-3 bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
        <span className={`w-2 h-2 rounded-full ${statusDot}`} />
        <span className="text-gray-400 text-sm font-medium">Shell</span>
        {elapsedMs && (
          <span className="text-gray-500 text-xs">{formatElapsed(elapsedMs)}</span>
        )}
        {status === 'success' && (
          <span className="ml-auto text-green-400 text-xs flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Success
          </span>
        )}
        {status === 'error' && (
          <span className="ml-auto text-red-400 text-xs flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Error
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="flex items-start gap-2 font-mono text-sm">
          <span className="text-purple-400 select-none">$</span>
          <span className="text-gray-200 break-all">{command}</span>
        </div>
        {output && status !== 'running' && status !== 'pending-approval' && (
          <div className="mt-2 pt-2 border-t border-[#30363d]">
            <pre className="font-mono text-xs text-gray-400 whitespace-pre-wrap break-all overflow-x-auto">
              {displayedOutput}
            </pre>
            {isLong && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>+{hiddenLines} more lines</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {expanded && isLong && (
              <button
                onClick={() => setExpanded(false)}
                className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>Show less</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        )}
        {status === 'running' && (
          <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
            <span className="animate-spin">⟳</span>
            Running...
          </div>
        )}
      </div>
    </div>
  );
}

function getToolDisplayInfo(toolName: string, toolArgs: Record<string, unknown>): { title: string; detail: string } {
  switch (toolName) {
    case 'write_file':
      return { title: 'Write file', detail: (toolArgs?.filePath as string) || (toolArgs?.path as string) || '' };
    case 'edit_file':
      return { title: 'Edit file', detail: (toolArgs?.filePath as string) || (toolArgs?.path as string) || '' };
    case 'web_search':
      return { title: 'Web search', detail: (toolArgs?.query as string) || '' };
    case 'fetch_url':
      return { title: 'Fetch URL', detail: (toolArgs?.url as string) || '' };
    case 'http_request':
      return { title: 'HTTP request', detail: `${(toolArgs?.method as string)?.toUpperCase() || 'GET'} ${(toolArgs?.url as string) || ''}` };
    default:
      return { title: toolName, detail: JSON.stringify(toolArgs) };
  }
}

function GenericToolExecution({ chunk, onApprove, onReject, onAutoApprove }: ToolExecutionProps) {
  const { toolName, toolArgs, status, output, elapsedMs, approvalRequestId, diffData } = chunk;

  if (status === 'pending-approval' && approvalRequestId) {
    const isFileOperation = toolName === 'write_file' || toolName === 'edit_file';
    const { title, detail } = getToolDisplayInfo(toolName, toolArgs || {});

    return (
      <div className="my-3 bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
          <span className="text-gray-400 text-sm font-medium">{title}</span>
        </div>
        <div className="px-3 py-2">
          <div className="text-sm text-gray-300 font-mono break-all">{detail}</div>
          {isFileOperation && diffData && (
            <DiffView diffData={diffData} />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-[#30363d]">
          <button
            onClick={() => onReject?.(approvalRequestId)}
            className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200"
          >
            Skip
          </button>
          <button
            onClick={() => onAutoApprove?.(approvalRequestId)}
            className="px-3 py-1.5 text-sm text-gray-200 bg-[#21262d] hover:bg-[#30363d] rounded-md border border-[#30363d]"
          >
            Auto-approve
          </button>
          <button
            onClick={() => onApprove?.(approvalRequestId)}
            className="px-3 py-1.5 text-sm text-white bg-[#238636] hover:bg-[#2ea043] rounded-md"
          >
            Approve
          </button>
        </div>
      </div>
    );
  }

  const statusIcon = {
    'pending-approval': <span className="animate-spin inline-block">⟳</span>,
    running: <span className="animate-spin inline-block">⟳</span>,
    success: <span className="text-cyan-400">✔</span>,
    error: <span className="text-red-400">✖</span>,
  }[status];

  const statusColor = {
    'pending-approval': 'text-yellow-400',
    running: 'text-yellow-400',
    success: 'text-cyan-400',
    error: 'text-red-400',
  }[status];

  const formatElapsed = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="my-2">
      <div className={`flex items-center gap-2 ${statusColor}`}>
        {statusIcon}
        <span className="text-gray-300">{toolName}</span>
        {elapsedMs && (
          <span className="text-gray-500 text-xs">{formatElapsed(elapsedMs)}</span>
        )}
      </div>
      {output && status === 'success' && (
        <div className="mt-2 ml-5 text-gray-400 text-sm border-l-2 border-[#2a3142] pl-3 max-h-40 overflow-y-auto">
          <pre className="whitespace-pre-wrap break-all">{output}</pre>
        </div>
      )}
      {output && status === 'error' && (
        <div className="mt-2 ml-5 text-red-400 text-sm border border-red-900/50 rounded-lg p-3 bg-red-950/30">
          {output}
        </div>
      )}
    </div>
  );
}

export function ToolExecution({ chunk, onApprove, onReject, onAutoApprove }: ToolExecutionProps) {
  if (chunk.toolName === 'execute') {
    return <ShellExecution chunk={chunk} onApprove={onApprove} onReject={onReject} onAutoApprove={onAutoApprove} />;
  }
  return <GenericToolExecution chunk={chunk} onApprove={onApprove} onReject={onReject} onAutoApprove={onAutoApprove} />;
}
