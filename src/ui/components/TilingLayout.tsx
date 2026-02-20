import { memo } from 'react';
import { useStore } from '../../store';
import { TileContainer } from './TileContainer';
import { SplitResizer } from './SplitResizer';
import type { LayoutNode } from '../../types';

interface TilingLayoutProps {
  node: LayoutNode;
  workspaceIndex: number;
}

export const TilingLayout = memo(function TilingLayout({ node, workspaceIndex }: TilingLayoutProps) {
  const isActiveWorkspace = useStore(state => workspaceIndex === state.activeWorkspaceIndex);
  const focusedTileId = useStore(state => state.workspaces[workspaceIndex]?.focusedTileId ?? null);
  const focusTile = useStore(state => state.focusTile);

  if (node.type === 'tile') {
    return (
      <TileContainer
        tileId={node.tileId}
        workspaceIndex={workspaceIndex}
        isFocused={isActiveWorkspace && focusedTileId === node.tileId}
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
        <TilingLayout node={first} workspaceIndex={workspaceIndex} />
      </div>
      <SplitResizer direction={direction} />
      <div
        style={{
          [isHorizontal ? 'width' : 'height']: `${(1 - ratio) * 100}%`,
          [isHorizontal ? 'height' : 'width']: '100%',
        }}
        className="min-w-0 min-h-0 overflow-hidden"
      >
        <TilingLayout node={second} workspaceIndex={workspaceIndex} />
      </div>
    </div>
  );
});
