import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { WorktreeInfo, WorktreeType } from '../../types';

type SelectorTab = 'local' | 'worktree' | 'cloud';

interface WorktreeSelectorProps {
  projectPath: string;
  gitBranch: string;
  worktreeType?: WorktreeType;
  worktreePath?: string;
  tileId: string;
  dropUp?: boolean;
  onWorktreeChanged?: () => void;
}

export function WorktreeSelector({
  projectPath,
  gitBranch,
  worktreeType,
  worktreePath,
  tileId,
  dropUp = true,
  onWorktreeChanged,
}: WorktreeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SelectorTab>(worktreeType === 'worktree' ? 'worktree' : 'local');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = useCallback(() => {
    if (!isOpen) {
      setActiveTab(worktreeType === 'worktree' ? 'worktree' : 'local');
    }
    setIsOpen(o => !o);
  }, [isOpen, worktreeType]);

  const displayLabel = worktreeType === 'worktree' ? `wt:${gitBranch}` : gitBranch;
  const labelColor = worktreeType === 'worktree' ? 'text-orange-400' : 'text-gray-500';

  return (
    <div ref={dropdownRef} className="relative min-w-0 flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleToggle}
        className={`cursor-pointer ${labelColor} hover:opacity-80 transition-opacity truncate block min-w-0 max-w-[150px]`}
      >
        {displayLabel}
      </button>
      {isOpen && (
        <div className={`absolute ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-72 overflow-hidden`}>
          {/* Tab bar */}
          <div className="flex border-b border-gray-700">
            <TabButton
              label="Local"
              active={activeTab === 'local'}
              onClick={() => setActiveTab('local')}
              activeIndicator={!worktreeType || worktreeType === 'local'}
            />
            <TabButton
              label="Worktree"
              active={activeTab === 'worktree'}
              onClick={() => setActiveTab('worktree')}
              activeIndicator={worktreeType === 'worktree'}
            />
            <TabButton
              label="Cloud"
              active={activeTab === 'cloud'}
              onClick={() => setActiveTab('cloud')}
              disabled
            />
          </div>

          {/* Tab content */}
          {activeTab === 'local' && (
            <LocalTab
              projectPath={projectPath}
              currentBranch={gitBranch}
              isLocalMode={!worktreeType || worktreeType === 'local'}
              tileId={tileId}
              onClose={() => setIsOpen(false)}
              onWorktreeChanged={onWorktreeChanged}
            />
          )}
          {activeTab === 'worktree' && (
            <WorktreeTab
              projectPath={projectPath}
              currentWorktreePath={worktreePath}
              currentBranch={gitBranch}
              tileId={tileId}
              onClose={() => setIsOpen(false)}
              onWorktreeChanged={onWorktreeChanged}
            />
          )}
          {activeTab === 'cloud' && (
            <CloudTab />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab button ──────────────────────────────────────────────────────────────

function TabButton({ label, active, onClick, disabled, activeIndicator }: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  activeIndicator?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`flex-1 px-3 py-1.5 text-xs transition-colors relative ${
        disabled
          ? 'text-gray-600 cursor-not-allowed'
          : active
            ? 'text-gray-200 bg-gray-700/50'
            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
      }`}
    >
      <span className="flex items-center justify-center gap-1.5">
        {label}
        {activeIndicator && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
        )}
      </span>
    </button>
  );
}

// ─── Local tab: switch branches on main checkout ─────────────────────────────

function LocalTab({ projectPath, currentBranch, isLocalMode, tileId, onClose, onWorktreeChanged }: {
  projectPath: string;
  currentBranch: string;
  isLocalMode: boolean;
  tileId: string;
  onClose: () => void;
  onWorktreeChanged?: () => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'create' | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    window.git.listBranches(projectPath).then(result => {
      setBranches(result.branches);
      setLoading(false);
    });
  }, [projectPath]);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? branches.filter(b => b.toLowerCase().includes(q)) : branches;
  }, [branches, search]);

  const handleSwitchBranch = useCallback(async (branch: string) => {
    if (!isLocalMode) {
      // Currently in worktree mode — switch back to local
      const project = await window.tile.openProject(tileId, projectPath);
      if (project && branch !== project.gitBranch) {
        await window.git.switchBranch(projectPath, branch);
      }
      onWorktreeChanged?.();
      onClose();
      return;
    }
    if (branch === currentBranch) {
      onClose();
      return;
    }
    setError(null);
    const result = await window.git.switchBranch(projectPath, branch);
    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Failed to switch branch');
    }
  }, [projectPath, currentBranch, isLocalMode, tileId, onClose, onWorktreeChanged]);

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setError(null);
    if (!isLocalMode) {
      // Switch back to local first
      await window.tile.openProject(tileId, projectPath);
    }
    const result = await window.git.createBranch(projectPath, name);
    if (result.success) {
      onWorktreeChanged?.();
      onClose();
    } else {
      setError(result.error || 'Failed to create branch');
    }
  }, [projectPath, newBranchName, isLocalMode, tileId, onClose, onWorktreeChanged]);

  if (action === 'create') {
    return (
      <div className="p-3 flex flex-col gap-1.5">
        <span className="text-gray-400 text-xs">Create new branch (local)</span>
        <input
          autoFocus
          type="text"
          value={newBranchName}
          onChange={e => { setNewBranchName(e.target.value); setError(null); }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setAction(null); setNewBranchName(''); setError(null); }
            if (e.key === 'Enter') handleCreateBranch();
          }}
          className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-200 outline-none focus:border-gray-400 text-xs w-full"
          placeholder="branch-name"
        />
        {error && <span className="text-red-400 text-xs">{error}</span>}
        <div className="flex gap-1.5">
          <button type="button" onClick={handleCreateBranch} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1 text-xs transition-colors">Create</button>
          <button type="button" onClick={() => { setAction(null); setNewBranchName(''); setError(null); }} className="flex-1 hover:bg-gray-700 text-gray-400 rounded px-2 py-1 text-xs transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!isLocalMode && (
        <div className="px-3 py-1.5 text-[11px] text-orange-400/80 bg-orange-400/5 border-b border-gray-700">
          Currently in worktree. Switching here will move this tile to the local checkout.
        </div>
      )}
      <button
        type="button"
        onClick={() => setAction('create')}
        className="block w-full text-left px-3 py-1.5 text-gray-400 hover:bg-gray-700 transition-colors whitespace-nowrap text-xs"
      >
        + Create new branch...
      </button>
      {error && (
        <div className="px-3 py-1 text-red-400 text-xs">{error}</div>
      )}
      {branches.length > 0 && (
        <>
          <div className="border-t border-gray-700 my-0.5" />
          <div className="px-2 py-1">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300 outline-none focus:border-gray-500 text-xs placeholder-gray-600"
              placeholder="Search branches..."
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-1.5 text-xs text-gray-500">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-gray-600">No branches match</div>
            ) : (
              filtered.slice(0, 20).map(branch => (
                <button
                  key={branch}
                  type="button"
                  onClick={() => handleSwitchBranch(branch)}
                  className={`block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors whitespace-nowrap text-xs flex items-center gap-2 ${
                    isLocalMode && branch === currentBranch ? 'text-gray-200' : 'text-gray-400'
                  }`}
                >
                  <BranchIcon />
                  <span className="font-mono truncate">{branch}</span>
                  {isLocalMode && branch === currentBranch && <span className="ml-auto pl-3 text-gray-500">current</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Worktree tab: manage worktrees ──────────────────────────────────────────

function WorktreeTab({ projectPath, currentWorktreePath, currentBranch, tileId, onClose, onWorktreeChanged }: {
  projectPath: string;
  currentWorktreePath?: string;
  currentBranch: string;
  tileId: string;
  onClose: () => void;
  onWorktreeChanged?: () => void;
}) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'new-branch' | 'existing-branch' | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchSearch, setBranchSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [wts, branchResult] = await Promise.all([
      window.git.listWorktrees(projectPath),
      window.git.listBranches(projectPath),
    ]);
    setWorktrees(wts);
    // Filter out branches that already have a worktree
    const wtBranches = new Set(wts.map(w => w.branch));
    setBranches(branchResult.branches.filter(b => !wtBranches.has(b)));
    setLoading(false);
  }, [projectPath]);

  useEffect(() => { loadData(); }, [loadData]);

  const nonMainWorktrees = useMemo(() => worktrees.filter(w => !w.isMain && !w.isBare), [worktrees]);

  const handleSwitchToWorktree = useCallback(async (wt: WorktreeInfo) => {
    if (wt.path === currentWorktreePath) {
      onClose();
      return;
    }
    await window.tile.openWorktree(tileId, projectPath, wt.path);
    onWorktreeChanged?.();
    onClose();
  }, [tileId, projectPath, currentWorktreePath, onClose, onWorktreeChanged]);

  const handleCreateWorktreeNewBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setError(null);
    const result = await window.git.addWorktree(projectPath, name, true);
    if (result.success && result.worktreePath) {
      await window.tile.openWorktree(tileId, projectPath, result.worktreePath);
      onWorktreeChanged?.();
      onClose();
    } else {
      setError(result.error || 'Failed to create worktree');
    }
  }, [projectPath, newBranchName, tileId, onClose, onWorktreeChanged]);

  const handleCreateWorktreeExistingBranch = useCallback(async (branch: string) => {
    setError(null);
    const result = await window.git.addWorktree(projectPath, branch, false);
    if (result.success && result.worktreePath) {
      await window.tile.openWorktree(tileId, projectPath, result.worktreePath);
      onWorktreeChanged?.();
      onClose();
    } else {
      setError(result.error || 'Failed to create worktree');
    }
  }, [projectPath, tileId, onClose, onWorktreeChanged]);

  const handleRemoveWorktree = useCallback(async (wt: WorktreeInfo) => {
    setError(null);
    const result = await window.git.removeWorktree(projectPath, wt.path);
    if (result.success) {
      // If we removed the current worktree, switch back to local
      if (wt.path === currentWorktreePath) {
        await window.tile.openProject(tileId, projectPath);
        onWorktreeChanged?.();
      }
      loadData();
    } else {
      setError(result.error || 'Failed to remove worktree');
    }
  }, [projectPath, currentWorktreePath, tileId, loadData, onWorktreeChanged]);

  const filteredBranches = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    return q ? branches.filter(b => b.toLowerCase().includes(q)) : branches;
  }, [branches, branchSearch]);

  if (action === 'new-branch') {
    return (
      <div className="p-3 flex flex-col gap-1.5">
        <span className="text-gray-400 text-xs">New worktree + branch</span>
        <input
          autoFocus
          type="text"
          value={newBranchName}
          onChange={e => { setNewBranchName(e.target.value); setError(null); }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setAction(null); setNewBranchName(''); setError(null); }
            if (e.key === 'Enter') handleCreateWorktreeNewBranch();
          }}
          className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-200 outline-none focus:border-gray-400 text-xs w-full"
          placeholder="new-branch-name"
        />
        {error && <span className="text-red-400 text-xs">{error}</span>}
        <div className="flex gap-1.5">
          <button type="button" onClick={handleCreateWorktreeNewBranch} className="flex-1 bg-orange-600 hover:bg-orange-500 text-white rounded px-2 py-1 text-xs transition-colors">Create</button>
          <button type="button" onClick={() => { setAction(null); setNewBranchName(''); setError(null); }} className="flex-1 hover:bg-gray-700 text-gray-400 rounded px-2 py-1 text-xs transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  if (action === 'existing-branch') {
    return (
      <div className="flex flex-col">
        <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700">
          Create worktree from existing branch
        </div>
        <div className="px-2 py-1">
          <input
            autoFocus
            type="text"
            value={branchSearch}
            onChange={e => setBranchSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setAction(null); setBranchSearch(''); } }}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300 outline-none focus:border-gray-500 text-xs placeholder-gray-600"
            placeholder="Search branches..."
          />
        </div>
        {error && <div className="px-3 py-1 text-red-400 text-xs">{error}</div>}
        <div className="max-h-48 overflow-y-auto">
          {filteredBranches.length === 0 ? (
            <div className="px-3 py-1.5 text-xs text-gray-600">
              {branches.length === 0 ? 'All branches already have worktrees' : 'No branches match'}
            </div>
          ) : (
            filteredBranches.slice(0, 20).map(branch => (
              <button
                key={branch}
                type="button"
                onClick={() => handleCreateWorktreeExistingBranch(branch)}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors whitespace-nowrap text-xs text-gray-400 flex items-center gap-2"
              >
                <BranchIcon />
                <span className="font-mono truncate">{branch}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-gray-700 p-2">
          <button type="button" onClick={() => { setAction(null); setBranchSearch(''); setError(null); }} className="w-full hover:bg-gray-700 text-gray-400 rounded px-2 py-1 text-xs transition-colors">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAction('new-branch')}
        className="block w-full text-left px-3 py-1.5 text-gray-400 hover:bg-gray-700 transition-colors whitespace-nowrap text-xs"
      >
        + New worktree + branch...
      </button>
      <button
        type="button"
        onClick={() => setAction('existing-branch')}
        className="block w-full text-left px-3 py-1.5 text-gray-400 hover:bg-gray-700 transition-colors whitespace-nowrap text-xs"
      >
        + Worktree from existing branch...
      </button>
      {error && (
        <div className="px-3 py-1 text-red-400 text-xs">{error}</div>
      )}
      {loading ? (
        <div className="px-3 py-1.5 text-xs text-gray-500">Loading...</div>
      ) : nonMainWorktrees.length > 0 ? (
        <>
          <div className="border-t border-gray-700 my-0.5" />
          <div className="px-3 py-1 text-[11px] text-gray-500 uppercase tracking-wide">Active worktrees</div>
          <div className="max-h-48 overflow-y-auto">
            {nonMainWorktrees.map(wt => (
              <div
                key={wt.path}
                className={`group flex items-center px-3 py-1.5 hover:bg-gray-700 transition-colors text-xs cursor-pointer ${
                  wt.path === currentWorktreePath ? 'text-orange-400' : 'text-gray-400'
                }`}
                onClick={() => handleSwitchToWorktree(wt)}
              >
                <WorktreeIcon />
                <span className="font-mono ml-2 truncate">{wt.branch}</span>
                {wt.path === currentWorktreePath && (
                  <span className="ml-2 text-gray-500 text-[11px]">current</span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemoveWorktree(wt); }}
                  className="ml-auto opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-0.5"
                  title="Remove worktree"
                >
                  <XIcon />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="border-t border-gray-700 my-0.5" />
          <div className="px-3 py-2 text-xs text-gray-600">
            No worktrees. Create one to work on multiple branches simultaneously.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Cloud tab (disabled) ────────────────────────────────────────────────────

function CloudTab() {
  return (
    <div className="px-4 py-6 flex flex-col items-center gap-2">
      <CloudIcon />
      <span className="text-xs text-gray-400">Cloud Environments</span>
      <span className="text-[11px] text-gray-600">Coming Soon</span>
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function WorktreeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M17 10H3" />
      <path d="M21 6H3" />
      <path d="M21 14H3" />
      <path d="M17 18H3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}
