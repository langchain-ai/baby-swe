import { useRef, useEffect } from 'react';
import type { ToolExecutionChunk } from '../../types';
import { ToolExecution } from './ToolExecution';

interface ToolGroupProps {
  groupType: 'read' | 'search' | 'write' | 'execute' | 'explore' | 'other';
  tools: ToolExecutionChunk[];
  projectPath?: string;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
}

const MAX_VISIBLE_TOOLS = 5;

export function ToolGroup({ groupType, tools, projectPath, onApprove, onReject, onAutoApprove }: ToolGroupProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasRunning = tools.some(t => t.status === 'running');
  const needsScroll = tools.length > MAX_VISIBLE_TOOLS;

  useEffect(() => {
    if (scrollRef.current && hasRunning) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [tools, hasRunning]);

  if (tools.length === 1) {
    return (
      <ToolExecution
        chunk={tools[0]}
        projectPath={projectPath}
        onApprove={onApprove}
        onReject={onReject}
        onAutoApprove={onAutoApprove}
      />
    );
  }

  return (
    <div
      ref={needsScroll ? scrollRef : undefined}
      className={needsScroll ? 'max-h-48 overflow-y-auto' : ''}
    >
      <div className="space-y-0.5">
        {tools.map((tool) => (
          <ToolExecution
            key={tool.toolCallId}
            chunk={tool}
            projectPath={projectPath}
            onApprove={onApprove}
            onReject={onReject}
            onAutoApprove={onAutoApprove}
          />
        ))}
      </div>
    </div>
  );
}
