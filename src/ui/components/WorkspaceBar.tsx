import { useStore } from '../../store';
import { BranchSelector } from './BranchSelector';
import type { Project } from '../../types';

interface WorkspaceBarProps {
  project?: Project | null;
}

export function WorkspaceBar({ project }: WorkspaceBarProps) {
  const { workspaces, activeWorkspaceIndex, switchWorkspace } = useStore();

  return (
    <div className="h-10 flex items-center bg-[#151b26] border-b border-gray-800">
      <div className="w-40 flex items-center gap-1.5 px-3">
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

      <div className="flex-1 flex items-center justify-center">
        {project ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400">{project.path}</span>
            {project.gitBranch && (
              <>
                <span className="text-gray-600">•</span>
                <BranchSelector projectPath={project.path} currentBranch={project.gitBranch} />
              </>
            )}
          </div>
        ) : (
          <span className="text-gray-500 text-sm">No project selected</span>
        )}
      </div>

      <div className="w-40" />
    </div>
  );
}
