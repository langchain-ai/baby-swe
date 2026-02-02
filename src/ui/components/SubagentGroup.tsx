import { useState, useEffect } from 'react';
import type { ToolExecutionChunk } from '../../types';

interface SubagentGroupProps {
  tasks: ToolExecutionChunk[];
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
}

function formatElapsed(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function SubagentItem({
  task,
  onApprove,
  onReject,
  isActive,
}: {
  task: ToolExecutionChunk;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  isActive?: boolean;
}) {
  const description = (task.toolArgs?.description as string) || '';
  const subagentType = (task.toolArgs?.subagent_type as string) || 'general-purpose';
  const truncatedDesc = description.length > 50 ? description.slice(0, 50) + '...' : description;

  useEffect(() => {
    if (!isActive || task.status !== 'pending-approval' || !task.approvalRequestId) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'y' || e.key === 'Enter') {
        e.preventDefault();
        onApprove?.(task.approvalRequestId!);
      } else if (e.key === 'n') {
        e.preventDefault();
        onReject?.(task.approvalRequestId!);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, task.status, task.approvalRequestId, onApprove, onReject]);

  const statusIcon = {
    'pending-approval': <span className="text-yellow-400 animate-pulse">●</span>,
    running: <span className="text-yellow-400 animate-pulse">●</span>,
    success: <span className="text-cyan-400">●</span>,
    error: <span className="text-red-400">●</span>,
  }[task.status];

  return (
    <div className="my-1 font-mono text-sm">
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="text-cyan-400">{subagentType}</span>
        <span className="text-gray-400">({truncatedDesc})</span>
        {task.elapsedMs && task.status !== 'running' && (
          <span className="text-gray-600 text-xs">{formatElapsed(task.elapsedMs)}</span>
        )}
      </div>

      {task.status === 'pending-approval' && task.approvalRequestId && (
        <div className="ml-3 border-l border-gray-700 pl-3 mt-1">
          <span className="text-yellow-400">Delegate?</span>
          <span className="text-gray-500 ml-2">[y]es / [n]o</span>
        </div>
      )}

      {task.status === 'running' && (
        <div className="ml-3 border-l border-gray-700 pl-3 mt-1">
          <span className="text-gray-500 text-xs">Running...</span>
        </div>
      )}

      {task.status === 'success' && task.output && (
        <div className="ml-3 border-l border-gray-700 pl-3 mt-1">
          <span className="text-gray-500 text-xs">
            {(() => {
              try {
                const parsed = JSON.parse(task.output);
                const output = parsed.output || parsed.error || task.output;
                return output.split('\n')[0].slice(0, 60) + (output.length > 60 ? '...' : '');
              } catch {
                return task.output.split('\n')[0].slice(0, 60);
              }
            })()}
          </span>
        </div>
      )}
    </div>
  );
}

export function SubagentGroup({ tasks, onApprove, onReject }: SubagentGroupProps) {
  const [expanded, setExpanded] = useState(true);

  const pendingTasks = tasks.filter(t => t.status === 'pending-approval' && t.approvalRequestId);
  const firstPendingIndex = tasks.findIndex(t => t.status === 'pending-approval' && t.approvalRequestId);

  const runningCount = tasks.filter(t => t.status === 'running').length;
  const pendingCount = pendingTasks.length;
  const completedCount = tasks.filter(t => t.status === 'success').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  const statusParts: string[] = [];
  if (runningCount > 0) statusParts.push(`${runningCount} running`);
  if (pendingCount > 0) statusParts.push(`${pendingCount} pending`);
  if (completedCount > 0) statusParts.push(`${completedCount} done`);
  if (errorCount > 0) statusParts.push(`${errorCount} failed`);

  return (
    <div className="my-2 font-mono text-sm">
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-gray-500">{expanded ? '▼' : '▶'}</span>
        <span className="text-gray-400">Subagents</span>
        <span className="text-gray-600 text-xs">({statusParts.join(' · ')})</span>
      </div>

      {expanded && (
        <div className="ml-3 border-l border-gray-700 pl-3 mt-1 space-y-1">
          {tasks.map((task, index) => (
            <SubagentItem
              key={task.toolCallId}
              task={task}
              onApprove={onApprove}
              onReject={onReject}
              isActive={index === firstPendingIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
}
