import { memo } from 'react';
import type { ToolExecutionChunk } from '../../types';
import { ToolExecution } from './ToolExecution';

type ToolGroupType = 'read' | 'search' | 'write' | 'execute' | 'tasks' | 'other';

interface ToolGroupProps {
  groupType: ToolGroupType;
  tools: ToolExecutionChunk[];
  projectPath?: string;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
  onOpenDiff?: (diffData: { filePath: string; originalContent: string; modifiedContent: string }) => void;
}

const MAX_ITEMS = 8;

function stripProjectPath(path: string, projectPath?: string): string {
  if (!projectPath || !path.startsWith(projectPath)) return path;
  const relative = path.slice(projectPath.length);
  return relative.startsWith('/') ? '.' + relative : './' + relative;
}

function getGroupSummary(groupType: ToolGroupType, count: number, isRunning: boolean): string {
  switch (groupType) {
    case 'read':
      return isRunning
        ? `Reading ${count} file${count !== 1 ? 's' : ''}...`
        : `Read ${count} file${count !== 1 ? 's' : ''}`;
    case 'search':
      return isRunning ? 'Exploring...' : `Explored ${count} path${count !== 1 ? 's' : ''}`;
    case 'write':
      return isRunning
        ? `Updating ${count} file${count !== 1 ? 's' : ''}...`
        : `Updated ${count} file${count !== 1 ? 's' : ''}`;
    case 'execute':
      return isRunning
        ? `Running ${count > 1 ? count + ' ' : ''}command${count !== 1 ? 's' : ''}...`
        : `Ran ${count > 1 ? count + ' ' : ''}command${count !== 1 ? 's' : ''}`;
    case 'tasks':
      return isRunning ? 'Tracking tasks...' : 'Updated task list';
    default:
      return isRunning ? 'Running...' : 'Finished';
  }
}

function getItemLabel(tool: ToolExecutionChunk, projectPath?: string): string {
  const args = tool.toolArgs || {};
  switch (tool.toolName) {
    case 'read_file':
      return stripProjectPath((args.path as string) || (args.file_path as string) || 'file', projectPath);
    case 'write_file':
    case 'edit_file':
      return stripProjectPath((args.filePath as string) || (args.path as string) || 'file', projectPath);
    case 'glob':
    case 'search':
      return (args.pattern as string) || 'pattern';
    case 'grep': {
      const pattern = (args.pattern as string) || '';
      return pattern.length > 50 ? pattern.slice(0, 50) + '...' : pattern;
    }
    case 'list_dir':
    case 'ls':
      return stripProjectPath((args.path as string) || (args.directory as string) || '.', projectPath);
    case 'execute': {
      const cmd = (args.command as string) || '';
      return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
    }
    case 'write_todos': {
      const todos = (args.todos as Array<unknown>) || [];
      return `${todos.length} item${todos.length !== 1 ? 's' : ''}`;
    }
    default:
      return tool.toolName;
  }
}

export const ToolGroup = memo(function ToolGroup({ groupType, tools, projectPath, onApprove, onReject, onAutoApprove, onOpenDiff }: ToolGroupProps) {
  const hasPendingApproval = tools.some(t => t.status === 'pending-approval');
  const hasDiff = tools.some(t => t.diffData);

  if (hasPendingApproval || hasDiff) {
    return (
      <div className="space-y-0.5">
        {tools.map(tool => (
          <ToolExecution
            key={tool.toolCallId}
            chunk={tool}
            projectPath={projectPath}
            onApprove={onApprove}
            onReject={onReject}
            onAutoApprove={onAutoApprove}
            onOpenDiff={onOpenDiff}
          />
        ))}
      </div>
    );
  }

  const isRunning = tools.some(t => t.status === 'running');
  const hasError = tools.some(t => t.status === 'error');

  const statusIcon = hasError
    ? <span className="text-red-400 leading-none">•</span>
    : isRunning
      ? <span className="text-yellow-400 animate-pulse leading-none">•</span>
      : <span className="text-gray-500 leading-none">•</span>;

  const summary = getGroupSummary(groupType, tools.length, isRunning);
  const visibleTools = tools.slice(0, MAX_ITEMS);
  const hiddenCount = tools.length - visibleTools.length;

  return (
    <div className="my-1 text-[12px] leading-5">
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="text-gray-500">{summary}</span>
      </div>
      {visibleTools.map(tool => (
        <div key={tool.toolCallId} className="flex items-center gap-2 pl-4">
          <span className="text-gray-700 select-none leading-none">•</span>
          <span className={tool.status === 'error' ? 'text-red-400' : 'text-gray-600'}>
            {getItemLabel(tool, projectPath)}
          </span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2 pl-4">
          <span className="text-gray-700 select-none leading-none">•</span>
          <span className="text-gray-600">+{hiddenCount} more</span>
        </div>
      )}
    </div>
  );
});
