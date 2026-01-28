export function HeaderBar() {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-gray-200 font-medium bg-[#1a1f2e] px-3 py-1 rounded-md text-sm">
          New Chat
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#1a1f2e] transition-colors">
          <PlusIcon />
        </button>
        <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#1a1f2e] transition-colors">
          <ClockIcon />
        </button>
        <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#1a1f2e] transition-colors">
          <MoreIcon />
        </button>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}
