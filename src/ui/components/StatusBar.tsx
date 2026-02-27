import { useEffect, useState } from 'react';

export function StatusBar() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    window.versions.app().then((v: string) => setVersion(`v${v}`));
  }, []);

  return (
    <div className="h-6 flex items-center bg-[#151b26] border-t border-gray-800 text-[11px] font-sans select-none shrink-0 text-gray-600 px-3 relative">
      <span className="absolute left-1/2 -translate-x-1/2">baby-swe</span>
      <span className="ml-auto">{version}</span>
    </div>
  );
}
