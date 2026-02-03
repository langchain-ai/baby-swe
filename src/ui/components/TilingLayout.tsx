import { useStore } from '../../store';
import { TileContainer } from './TileContainer';
import { SplitResizer } from './SplitResizer';
import type { LayoutNode } from '../../types';

interface TilingLayoutProps {
  node: LayoutNode;
}

export function TilingLayout({ node }: TilingLayoutProps) {
  const { focusedTileId, focusTile } = useStore();

  if (node.type === 'tile') {
    return (
      <TileContainer
        tileId={node.tileId}
        isFocused={focusedTileId === node.tileId}
        onFocus={() => focusTile(node.tileId)}
      />
    );
  }

  const { direction, ratio, first, second } = node;
  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full w-full`}
    >
      <div
        style={{
          [isHorizontal ? 'width' : 'height']: `${ratio * 100}%`,
          [isHorizontal ? 'height' : 'width']: '100%',
        }}
        className="min-w-0 min-h-0 overflow-hidden"
      >
        <TilingLayout node={first} />
      </div>
      <SplitResizer direction={direction} />
      <div
        style={{
          [isHorizontal ? 'width' : 'height']: `${(1 - ratio) * 100}%`,
          [isHorizontal ? 'height' : 'width']: '100%',
        }}
        className="min-w-0 min-h-0 overflow-hidden"
      >
        <TilingLayout node={second} />
      </div>
    </div>
  );
}
