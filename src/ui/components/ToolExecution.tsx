import type { ToolExecutionChunk } from '../../types';

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
}

export function ToolExecution({ chunk }: ToolExecutionProps) {
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
        <div className="mt-2 ml-5 text-gray-400 text-sm border-l-2 border-[#2a3142] pl-3">
          {output}
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
