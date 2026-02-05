import { useStore } from '../../store';
import { BranchSelector } from './BranchSelector';
import type { Project } from '../../types';

interface WorkspaceBarProps {
  project?: Project | null;
}

export function WorkspaceBar({ project }: WorkspaceBarProps) {
  const { workspaces, activeWorkspaceIndex, switchWorkspace } = useStore();

  return (
    <div className="h-10 relative flex items-center bg-[#151b26] border-b border-gray-800" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-1.5 pl-[78px] pr-3 z-10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {workspaces.map((workspace, index) => {
          const isActive = index === activeWorkspaceIndex;
          const hasTiles = Object.keys(workspace.tiles).length > 0;

          return (
            <button
              key={workspace.id}
              onClick={() => switchWorkspace(index)}
              className={`
                w-6 h-6 rounded-md transition-all text-xs font-medium
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
            </button>
          );
        })}
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {project ? (
            <div className="flex items-center gap-2 text-sm px-2">
              <span className="text-gray-400 truncate" title={project.path}>
                {project.name}
              </span>
              {project.gitBranch && (
                <>
                  <span className="text-gray-600 shrink-0">•</span>
                  <div className="truncate" title={project.gitBranch}>
                    <BranchSelector projectPath={project.path} currentBranch={project.gitBranch} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="text-gray-500 text-sm">No project selected</span>
          )}
        </div>
      </div>
    </div>
  );
}
