import { useStore } from '../../store';

export function WorkspaceBar() {
  const { workspaces, activeWorkspaceIndex, switchWorkspace } = useStore();

  return (
    <div className="flex items-center justify-center gap-1 py-1 bg-[#151b26] border-b border-gray-800">
      {workspaces.map((workspace, index) => {
        const isActive = index === activeWorkspaceIndex;
        const hasTiles = Object.keys(workspace.tiles).length > 0;

        return (
          <button
            key={workspace.id}
            onClick={() => switchWorkspace(index)}
            className={`
              w-6 h-1.5 rounded-full transition-all
              ${isActive
                ? 'bg-[#5a9bc7]'
                : hasTiles
                  ? 'bg-gray-600 hover:bg-gray-500'
                  : 'bg-gray-800 hover:bg-gray-700'
              }
            `}
            title={`Workspace ${index + 1} (⌘${index + 1})`}
          />
        );
      })}
    </div>
  );
}
