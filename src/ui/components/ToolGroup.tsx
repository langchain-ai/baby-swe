import { useState } from 'react';
import type { ToolExecutionChunk } from '../../types';
import { ToolExecution } from './ToolExecution';

interface ToolGroupProps {
  groupType: 'exploring' | 'writing' | 'executing' | 'other';
  tools: ToolExecutionChunk[];
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
}

function getGroupLabel(groupType: string, count: number): string {
  switch (groupType) {
    case 'exploring': return `Explored ${count} files`;
    case 'writing': return `Wrote ${count} files`;
    case 'executing': return `Ran ${count} commands`;
    case 'other': return `${count} tool calls`;
    default: return `${count} tools`;
  }
}

function getRunningLabel(groupType: string): string {
  switch (groupType) {
    case 'exploring': return 'Exploring...';
    case 'writing': return 'Writing...';
    case 'executing': return 'Running...';
    case 'other': return 'Working...';
    default: return 'Working...';
  }
}

export function ToolGroup({ groupType, tools, onApprove, onReject, onAutoApprove }: ToolGroupProps) {
  const hasPendingApproval = tools.some(t => t.status === 'pending-approval');
  const hasRunning = tools.some(t => t.status === 'running');
  const hasError = tools.some(t => t.status === 'error');
  const [expanded, setExpanded] = useState(false);

  const needsAttention = hasPendingApproval;
  if (needsAttention && !expanded) {
    const pendingTool = tools.find(t => t.status === 'pending-approval');
    if (pendingTool) {
      return (
        <ToolExecution
          chunk={pendingTool}
          onApprove={onApprove}
          onReject={onReject}
          onAutoApprove={onAutoApprove}
        />
      );
    }
  }

  const label = hasRunning ? getRunningLabel(groupType) : getGroupLabel(groupType, tools.length);

  const statusIcon = hasRunning
    ? <span className="text-yellow-400 animate-pulse">●</span>
    : hasError
    ? <span className="text-red-400">●</span>
    : <span className="text-cyan-400">●</span>;

  return (
    <div className="my-0.5 font-mono text-xs">
      <div
        className="flex items-center gap-2 cursor-pointer select-none text-gray-500 hover:text-gray-400"
        onClick={() => setExpanded(!expanded)}
      >
        {statusIcon}
        <span>{label}</span>
        <span className="text-gray-700">(ctrl+o to expand)</span>
      </div>

      {expanded && (
        <div className="ml-3 border-l border-gray-800 pl-3 mt-0.5 space-y-0.5">
          {tools.map((tool) => (
            <ToolExecution
              key={tool.toolCallId}
              chunk={tool}
              onApprove={onApprove}
              onReject={onReject}
              onAutoApprove={onAutoApprove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
