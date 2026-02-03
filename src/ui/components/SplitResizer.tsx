import type { SplitDirection } from '../../types';

interface SplitResizerProps {
  direction: SplitDirection;
}

export function SplitResizer({ direction }: SplitResizerProps) {
  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`
        ${isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
        bg-gray-700 hover:bg-[#5a9bc7] transition-colors shrink-0
      `}
    />
  );
}
