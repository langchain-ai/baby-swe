import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { AgentStatus } from '../../types';

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  idle: 0,
  finished: 1,
  interrupted: 2,
  running: 3,
  error: 4,
};

const STATUS_COLORS: Partial<Record<AgentStatus, string>> = {
  running: 'text-green-400',
  finished: 'text-[#5a9bc7]',
  interrupted: 'text-yellow-400',
  error: 'text-red-400',
};

const NUM_WORKSPACES = 5;

function useAllWorkspaceStatuses(): AgentStatus[] {
  return useStore(
    useShallow((state) =>
      state.workspaces.map((workspace) => {
        let highest: AgentStatus = 'idle';
        for (const tile of Object.values(workspace.tiles)) {
          if (tile.type !== 'agent') continue;
          const session = state.sessions[tile.sessionId];
          if (!session) continue;
          if (STATUS_PRIORITY[session.agentStatus] > STATUS_PRIORITY[highest]) {
            highest = session.agentStatus;
          }
        }
        return highest;
      })
    )
  );
}

export function WorkspaceBar() {
  const { workspaces, activeWorkspaceIndex, switchWorkspace } = useStore();
  const allStatuses = useAllWorkspaceStatuses();

  // Track the last-seen status per workspace. When a workspace is active we
  // record its current status so that switching away doesn't immediately show
  // an indicator for activity we already observed.
  const lastSeenRef = useRef<AgentStatus[]>(
    Array(NUM_WORKSPACES).fill('idle') as AgentStatus[]
  );

  // Whenever the active workspace or its status changes, update lastSeen.
  const activeStatus = allStatuses[activeWorkspaceIndex];
  useEffect(() => {
    lastSeenRef.current[activeWorkspaceIndex] = activeStatus;
  }, [activeWorkspaceIndex, activeStatus]);

  return (
    <div className="h-10 relative flex items-center bg-[#151b26] border-b border-gray-800" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-1.5 pl-[78px] pr-3 z-10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {workspaces.map((workspace, index) => {
          const status = allStatuses[index];
          const isActive = index === activeWorkspaceIndex;
          // Show indicator only when inactive AND status changed since last visit.
          const showIndicator = !isActive &&
            STATUS_PRIORITY[status] > STATUS_PRIORITY[lastSeenRef.current[index]];

          return (
            <WorkspaceButton
              key={workspace.id}
              index={index}
              isActive={isActive}
              hasTiles={Object.keys(workspace.tiles).length > 0}
              status={status}
              showIndicator={showIndicator}
              onClick={() => switchWorkspace(index)}
            />
          );
        })}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <img
          src="./assets/light-blue/LangChain_Symbol_LightBlue.png"
          alt="LangChain"
          className="h-5 w-auto opacity-80"
        />
      </div>
    </div>
  );
}

function WorkspaceButton({ index, isActive, hasTiles, status, showIndicator, onClick }: {
  index: number;
  isActive: boolean;
  hasTiles: boolean;
  status: AgentStatus;
  showIndicator: boolean;
  onClick: () => void;
}) {
  const indicatorColor = STATUS_COLORS[status];

  return (
    <button
      onClick={onClick}
      className={`
        relative w-6 h-6 rounded-md transition-all text-xs font-medium
        ${isActive
          ? 'bg-[#5a9bc7] text-white'
          : hasTiles
            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-400'
        }
      `}
      title={`Workspace ${index + 1} (⌘${index + 1})`}
    >
      {index + 1}
      {showIndicator && indicatorColor && (
        status === 'running' ? (
          <span className={`absolute -top-1 -right-1 ${indicatorColor}`}>
            <SpinnerIcon />
          </span>
        ) : (
          <span
            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-current ${indicatorColor}`}
          />
        )
      )}
    </button>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
