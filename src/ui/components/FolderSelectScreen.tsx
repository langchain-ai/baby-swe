import { Logo } from './Logo';
import type { Project } from '../../types';

interface FolderSelectScreenProps {
  onOpenFolder: () => void;
  onSelectRecent: (path: string) => void;
  recentProjects: Project[];
}

export function FolderSelectScreen({ onOpenFolder, onSelectRecent, recentProjects }: FolderSelectScreenProps) {
  const displayedProjects = recentProjects.slice(0, 5);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1a2332] text-gray-100">
      <div className="flex flex-col items-center w-full max-w-md px-6">
        <Logo />

        <div className="flex gap-3 mt-8 w-full">
          <button
            onClick={onOpenFolder}
            className="flex-1 flex flex-col gap-4 px-4 py-3.5 bg-[#1e2a3a] hover:bg-[#243244] border border-[#2a3a4e] rounded-lg transition-colors text-left"
          >
            <FolderIcon />
            <span className="text-gray-300 text-sm font-medium">Open project</span>
          </button>
          <button
            onClick={onOpenFolder}
            className="flex-1 flex flex-col gap-4 px-4 py-3.5 bg-[#1e2a3a] hover:bg-[#243244] border border-[#2a3a4e] rounded-lg transition-colors text-left"
          >
            <CloneIcon />
            <span className="text-gray-300 text-sm font-medium">Clone repo</span>
          </button>
        </div>

        {displayedProjects.length > 0 && (
          <div className="mt-8 w-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-xs">Recent projects</p>
            </div>
            <div className="space-y-0.5">
              {displayedProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => onSelectRecent(project.path)}
                  className="w-full flex items-center justify-between px-2 py-2 hover:bg-[#1e2a3a] rounded transition-colors text-left group"
                >
                  <span className="text-gray-300 text-sm truncate">{project.name}</span>
                  <span className="text-gray-600 text-xs truncate ml-4 shrink-0">{shortenPath(project.path)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <img
          src="./assets/light-blue/LangChain_Wordmark_LightBlue.png"
          alt="LangChain"
          className="h-4 w-auto opacity-40 mt-10"
        />
      </div>
    </div>
  );
}

function shortenPath(fullPath: string): string {
  const home = fullPath.indexOf('/Users/');
  if (home !== -1) {
    const parts = fullPath.substring(home).split('/');
    if (parts.length >= 3) {
      return '~/' + parts.slice(3).join('/');
    }
  }
  return fullPath;
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M12 8v6" />
      <path d="M9 11l3 3 3-3" />
    </svg>
  );
}
