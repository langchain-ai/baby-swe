import { Logo } from './Logo';

interface FolderSelectScreenProps {
  onOpenFolder: () => void;
}

export function FolderSelectScreen({ onOpenFolder }: FolderSelectScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0f1a] text-gray-100">
      <div className="flex flex-col items-center gap-8">
        <Logo />
        <div className="text-center">
          <p className="text-gray-400 mb-6">Open a folder to get started</p>
          <button
            onClick={onOpenFolder}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
          >
            <FolderIcon />
            Open Folder
          </button>
        </div>
        <p className="text-gray-600 text-sm mt-4">
          Or use File {'>'} Open Folder from the menu bar
        </p>
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
