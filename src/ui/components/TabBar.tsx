import type { Session } from '../../types';

interface TabBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: (id: string) => void;
}

export function TabBar({ sessions, activeSessionId, onSelect, onCreate, onClose }: TabBarProps) {
  return (
    <div className="flex items-center bg-[#1e2a3a] border-b border-[#2a3142] h-10 shrink-0">
      <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
        {sessions.map((session) => (
          <Tab
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={() => onSelect(session.id)}
            onClose={() => onClose(session.id)}
            showClose={sessions.length > 1}
          />
        ))}
      </div>
      <button
        onClick={onCreate}
        className="px-3 h-full text-gray-500 hover:text-gray-300 hover:bg-[#1a1f2e] transition-colors"
        title="New Chat"
      >
        <PlusIcon />
      </button>
    </div>
  );
}

interface TabProps {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  showClose: boolean;
}

function Tab({ session, isActive, onSelect, onClose, showClose }: TabProps) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2 px-3 h-full border-r border-[#2a3142] cursor-pointer min-w-0 max-w-[180px] ${
        isActive
          ? 'bg-[#1a2332] text-gray-200'
          : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1f2e]'
      }`}
    >
      {session.isStreaming && (
        <span className="shrink-0 text-yellow-500 animate-spin">
          <SpinnerIcon />
        </span>
      )}
      <span className="truncate text-sm">{session.title}</span>
      {showClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 transition-opacity"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
