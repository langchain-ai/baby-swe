import { useState } from 'react';
import type { ToolExecutionChunk } from '../../types';

interface SubagentGroupProps {
  tasks: ToolExecutionChunk[];
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
}

function SubagentItem({
  task,
  onApprove,
  onReject,
}: {
  task: ToolExecutionChunk;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const description = (task.toolArgs?.description as string) || '';
  const subagentType = (task.toolArgs?.subagent_type as string) || 'general-purpose';
  const truncatedDesc = description.length > 60 ? description.slice(0, 60) + '...' : description;

  const statusIndicator = {
    'pending-approval': <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />,
    running: <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />,
    success: <span className="w-2 h-2 rounded-full bg-green-400" />,
    error: <span className="w-2 h-2 rounded-full bg-red-400" />,
  }[task.status];

  const formatElapsed = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="py-2 px-3 border-b border-[#30363d] last:border-b-0">
      <div className="flex items-center gap-2">
        {statusIndicator}
        <span className="text-xs text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">{subagentType}</span>
        <span className="text-gray-300 text-sm flex-1 truncate">{truncatedDesc}</span>
        {task.elapsedMs && (
          <span className="text-gray-500 text-xs">{formatElapsed(task.elapsedMs)}</span>
        )}
      </div>

      {task.status === 'pending-approval' && task.approvalRequestId && (
        <div className="flex items-center gap-2 mt-2 ml-4">
          <button
            onClick={() => onReject?.(task.approvalRequestId!)}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
          >
            Skip
          </button>
          <button
            onClick={() => onApprove?.(task.approvalRequestId!)}
            className="px-2 py-1 text-xs text-white bg-[#238636] hover:bg-[#2ea043] rounded"
          >
            Approve
          </button>
        </div>
      )}

      {task.status === 'success' && task.output && (
        <div className="mt-1 ml-4 text-xs text-gray-500 truncate">
          {(() => {
            try {
              const parsed = JSON.parse(task.output);
              const output = parsed.output || parsed.error || task.output;
              return output.split('\n')[0].slice(0, 80);
            } catch {
              return task.output.split('\n')[0].slice(0, 80);
            }
          })()}
        </div>
      )}
    </div>
  );
}

export function SubagentGroup({ tasks, onApprove, onReject }: SubagentGroupProps) {
  const [expanded, setExpanded] = useState(true);

  const runningCount = tasks.filter(t => t.status === 'running').length;
  const pendingCount = tasks.filter(t => t.status === 'pending-approval').length;
  const completedCount = tasks.filter(t => t.status === 'success').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  const pendingTasks = tasks.filter(t => t.status === 'pending-approval' && t.approvalRequestId);

  const handleApproveAll = () => {
    pendingTasks.forEach(t => onApprove?.(t.approvalRequestId!));
  };

  const handleRejectAll = () => {
    pendingTasks.forEach(t => onReject?.(t.approvalRequestId!));
  };

  return (
    <div className="my-3 bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#161b22] select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {runningCount > 0 && (
          <span className="text-yellow-400 text-sm">Running {runningCount}</span>
        )}
        {pendingCount > 0 && (
          <span className="text-blue-400 text-sm">{pendingCount} pending</span>
        )}
        {completedCount > 0 && (
          <span className="text-green-400 text-sm">{completedCount} done</span>
        )}
        {errorCount > 0 && (
          <span className="text-red-400 text-sm">{errorCount} failed</span>
        )}

        <span className="text-gray-400 text-sm">Subagents</span>
      </div>

      {pendingCount > 1 && !expanded && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#30363d] bg-[#161b22]">
          <button
            onClick={(e) => { e.stopPropagation(); handleRejectAll(); }}
            className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200"
          >
            Skip All
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleApproveAll(); }}
            className="px-3 py-1.5 text-sm text-white bg-[#238636] hover:bg-[#2ea043] rounded-md"
          >
            Approve All ({pendingCount})
          </button>
        </div>
      )}

      {expanded && (
        <div className="border-t border-[#30363d]">
          {tasks.map(task => (
            <SubagentItem
              key={task.toolCallId}
              task={task}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
