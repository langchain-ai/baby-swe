import { useStore } from '../../store';
import { Logo } from './Logo';

export function HeaderBar() {
  const { modelConfig, mode } = useStore();

  return (
    <div className="border border-gray-700 rounded-lg p-3 mb-2">
      <div className="flex items-start justify-between">
        <Logo />
        <div className="text-right text-sm">
          <div>
            <span className="text-cyan-400 font-bold">model:</span>{' '}
            <span className="text-gray-300">{modelConfig.name}</span>{' '}
            <span className="text-gray-500 text-xs">({modelConfig.effort})</span>
            <span className="text-gray-600 text-xs ml-2">/model to change</span>
          </div>
          <div className="mt-1">
            <span className="text-cyan-400 font-bold">mode:</span>{' '}
            <span className="text-gray-300">{mode}</span>
            <span className="text-gray-600 text-xs ml-2">tab to switch</span>
          </div>
          <div className="mt-1">
            <span className="text-cyan-400 font-bold">cwd:</span>{' '}
            <span className="text-gray-300">~/Documents/Dev/baby-swe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
