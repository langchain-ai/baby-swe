import { Logo } from './Logo';
import type { Project } from '../../types';

interface FolderSelectScreenProps {
  onOpenFolder: () => void;
  onSelectRecent: (path: string) => void;
  recentProjects: Project[];
}

export function FolderSelectScreen({ onOpenFolder, onSelectRecent, recentProjects }: FolderSelectScreenProps) {
  const displayedProjects = recentProjects.slice(0, 4);

  return (
    <div className="relative flex flex-col items-center justify-center h-full bg-[#1a2332] text-gray-100">
      <div className="flex flex-col items-center gap-8">
        <Logo />
        <div className="flex flex-col items-center">
          <p className="text-gray-400 mb-6">Open a folder to get started</p>
          <button
            onClick={onOpenFolder}
            className="flex items-center gap-2 px-6 py-3 bg-[#5a9bc7] hover:bg-[#6daad3] text-white rounded-lg transition-colors font-medium"
          >
            <FolderIcon />
            Open Folder
          </button>
        </div>

        {displayedProjects.length > 0 && (
          <div className="mt-4 w-full max-w-md">
            <p className="text-gray-500 text-sm mb-3 text-center">Recent</p>
            <div className="space-y-2">
              {displayedProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => onSelectRecent(project.path)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg transition-colors text-left"
                >
                  <FolderIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 truncate">{project.name}</p>
                    <p className="text-gray-500 text-xs truncate">{project.path}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="absolute bottom-8 flex flex-col items-center">
        <img
          src="./assets/Light Blue/LangChain_Lockup_LightBlue.png"
          alt="LangChain"
          className="h-6 opacity-90"
        />
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
