import { useStore } from '../../store';
import type { AgentStatus } from '../../types';

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  idle: 0,
  finished: 1,
  interrupted: 2,
  running: 3,
  error: 4,
};

const STATUS_COLORS: Partial<Record<AgentStatus, string>> = {
  running: 'bg-green-400',
  finished: 'bg-[#5a9bc7]',
  interrupted: 'bg-yellow-400',
  error: 'bg-red-400',
};

function useWorkspaceStatus(workspaceIndex: number): AgentStatus {
  return useStore((state) => {
    const workspace = state.workspaces[workspaceIndex];
    if (!workspace) return 'idle';

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
  });
}

export function WorkspaceBar() {
  const { workspaces, activeWorkspaceIndex, switchWorkspace } = useStore();

  return (
    <div className="h-10 relative flex items-center bg-[#151b26] border-b border-gray-800" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-1.5 pl-[78px] pr-3 z-10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {workspaces.map((workspace, index) => (
          <WorkspaceButton
            key={workspace.id}
            index={index}
            isActive={index === activeWorkspaceIndex}
            hasTiles={Object.keys(workspace.tiles).length > 0}
            onClick={() => switchWorkspace(index)}
          />
        ))}
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

function WorkspaceButton({ index, isActive, hasTiles, onClick }: {
  index: number;
  isActive: boolean;
  hasTiles: boolean;
  onClick: () => void;
}) {
  const status = useWorkspaceStatus(index);
  const dotColor = !isActive ? STATUS_COLORS[status] : undefined;

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
      {dotColor && (
        <span
          className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${dotColor} ${status === 'running' ? 'animate-pulse' : ''}`}
        />
      )}
    </button>
  );
}
