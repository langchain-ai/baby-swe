import { FormEvent, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import type { Project } from '../../types';

interface CloneRepoResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

interface FolderSelectScreenProps {
  onOpenFolder: () => void;
  onCloneRepo: (repoUrl: string) => Promise<CloneRepoResult>;
  onSelectRecent: (path: string) => void;
  recentProjects: Project[];
}

export function FolderSelectScreen({ onOpenFolder, onCloneRepo, onSelectRecent, recentProjects }: FolderSelectScreenProps) {
  const displayedProjects = recentProjects.slice(0, 5);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const repoUrlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showCloneModal) return;
    repoUrlInputRef.current?.focus();
  }, [showCloneModal]);

  const openCloneModal = async () => {
    setCloneError(null);
    setShowCloneModal(true);

    if (repoUrl.trim().length > 0) return;

    try {
      const clipboardText = await navigator.clipboard.readText();
      if (isLikelyRepositoryUrl(clipboardText)) {
        setRepoUrl(clipboardText.trim());
      }
    } catch {
      // Clipboard access can fail if permission is unavailable.
    }
  };

  const closeCloneModal = () => {
    if (isCloning) return;
    setShowCloneModal(false);
    setCloneError(null);
  };

  const handleCloneSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedRepoUrl = repoUrl.trim();

    if (!trimmedRepoUrl) {
      setCloneError('Repository URL is required');
      return;
    }

    setCloneError(null);
    setIsCloning(true);

    try {
      const result = await onCloneRepo(trimmedRepoUrl);
      if (result.success) {
        setShowCloneModal(false);
        setCloneError(null);
        setRepoUrl('');
        return;
      }

      if (!result.cancelled) {
        setCloneError(result.error ?? 'Failed to clone repository');
      }
    } finally {
      setIsCloning(false);
    }
  };

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
            onClick={openCloneModal}
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
          className="h-6 w-auto mt-10 opacity-80"
        />
      </div>

      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45" onClick={closeCloneModal}>
          <form
            onSubmit={handleCloneSubmit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl mx-6 rounded-lg border border-[#2a3a4e] bg-[#1e2a3a] p-4 shadow-xl"
          >
            <h2 className="text-sm font-medium text-gray-200">Clone repository</h2>
            <p className="mt-2 text-xs text-gray-400">Paste a GitHub URL, then choose a destination folder.</p>

            <input
              ref={repoUrlInputRef}
              type="text"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
              className="mt-3 w-full rounded-md border border-[#2a3a4e] bg-[#111827] px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#3f6b94]"
              autoComplete="off"
            />

            {cloneError && <p className="mt-2 text-xs text-red-400">{cloneError}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCloneModal}
                disabled={isCloning}
                className="rounded-md border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#243244] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCloning}
                className="rounded-md border border-[#3f6b94] bg-[#243244] px-3 py-1.5 text-xs text-gray-100 hover:bg-[#2a3a50] disabled:opacity-60"
              >
                {isCloning ? 'Cloning…' : 'Clone'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function isLikelyRepositoryUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(trimmed);
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
