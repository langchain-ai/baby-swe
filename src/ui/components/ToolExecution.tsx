import { useState } from 'react';
import type { ToolExecutionChunk } from '../../types';

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
}

const MAX_OUTPUT_LINES = 10;

function ShellExecution({ chunk }: ToolExecutionProps) {
  const { toolArgs, status, output, elapsedMs } = chunk;
  const command = (toolArgs?.command as string) || '';
  const [expanded, setExpanded] = useState(false);

  const lines = output?.split('\n') || [];
  const isLong = lines.length > MAX_OUTPUT_LINES;
  const displayedOutput = expanded ? output : lines.slice(0, MAX_OUTPUT_LINES).join('\n');
  const hiddenLines = lines.length - MAX_OUTPUT_LINES;

  const statusDot = {
    running: 'bg-yellow-400 animate-pulse',
    success: 'bg-green-400',
    error: 'bg-red-400',
  }[status];

  const formatElapsed = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

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
        {output && status !== 'running' && (
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

function GenericToolExecution({ chunk }: ToolExecutionProps) {
  const { toolName, status, output, elapsedMs } = chunk;

  const statusIcon = {
    running: <span className="animate-spin inline-block">⟳</span>,
    success: <span className="text-cyan-400">✔</span>,
    error: <span className="text-red-400">✖</span>,
  }[status];

  const statusColor = {
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

export function ToolExecution({ chunk }: ToolExecutionProps) {
  if (chunk.toolName === 'execute') {
    return <ShellExecution chunk={chunk} />;
  }
  return <GenericToolExecution chunk={chunk} />;
}
