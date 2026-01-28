import type { ToolExecutionChunk } from '../../types';

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
}

export function ToolExecution({ chunk }: ToolExecutionProps) {
  const { toolName, status, output, elapsedMs } = chunk;

  const statusIcon = {
    running: <span className="animate-spin inline-block">⟳</span>,
    success: <span className="text-green-400">✔</span>,
    error: <span className="text-red-400">✖</span>,
  }[status];

  const statusColor = {
    running: 'text-yellow-400',
    success: 'text-green-400',
    error: 'text-red-400',
  }[status];

  const formatElapsed = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="my-1">
      <div className={`flex items-center gap-2 ${statusColor}`}>
        {statusIcon}
        <span className="text-gray-300">{toolName}</span>
        {elapsedMs && (
          <span className="text-gray-500 text-xs">{formatElapsed(elapsedMs)}</span>
        )}
      </div>
      {output && status === 'success' && (
        <div className="mt-1 ml-5 text-gray-400 text-sm border-l-2 border-gray-700 pl-2">
          {output}
        </div>
      )}
      {output && status === 'error' && (
        <div className="mt-1 ml-5 text-red-400 text-sm border border-red-900 rounded p-2 bg-red-950">
          {output}
        </div>
      )}
    </div>
  );
}
