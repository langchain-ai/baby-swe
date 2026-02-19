import type { Project } from '../../types';
import { useEffect, useState } from 'react';

interface StatusBarProps {
  project?: Project | null;
}

function GitBranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function PullRequestIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
    </svg>
  );
}

export function StatusBar({ project }: StatusBarProps) {
  const [pr, setPr] = useState(project?.githubPR ?? null);

  useEffect(() => {
    setPr(project?.githubPR ?? null);
  }, [project?.githubPR]);

  const refreshPR = async () => {
    if (!project?.path) return;
    const result = await window.git.getPR(project.path);
    setPr(result);
  };

  return (
    <div className="h-6 flex items-center gap-0 bg-[#151b26] border-t border-gray-800 text-[11px] font-mono select-none shrink-0">
      {project ? (
        <>
          {project.gitBranch && (
            <div className="flex items-center gap-1.5 px-3 h-full text-gray-400 hover:bg-white/5 transition-colors cursor-default">
              <GitBranchIcon />
              <span>{project.gitBranch}</span>
            </div>
          )}
          {pr ? (
            <button
              type="button"
              title={`PR #${pr.number}: ${pr.title}\n${pr.url}`}
              onClick={() => window.open(pr.url, '_blank')}
              className="flex items-center gap-1.5 px-3 h-full text-blue-400 hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent"
            >
              <PullRequestIcon />
              <span>#{pr.number}</span>
            </button>
          ) : project.path && (
            <button
              type="button"
              title="No PR for this branch. Click to check."
              onClick={refreshPR}
              className="flex items-center gap-1.5 px-3 h-full text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent"
            >
              <PullRequestIcon />
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 h-full text-gray-500 hover:bg-white/5 transition-colors cursor-default">
            <FolderIcon />
            <span className="truncate max-w-xs" title={project.path}>{project.path}</span>
          </div>
        </>
      ) : (
        <div className="px-3 h-full flex items-center text-gray-600">
          No project
        </div>
      )}
    </div>
  );
}
