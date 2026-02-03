import type { LayoutNode, SplitDirection, SplitNode, TileNode } from './types';

export function createInitialLayout(tileId: string): TileNode {
  return { type: 'tile', tileId };
}

export function splitTile(
  layout: LayoutNode,
  targetTileId: string,
  newTileId: string,
  direction: SplitDirection
): LayoutNode {
  if (layout.type === 'tile') {
    if (layout.tileId === targetTileId) {
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        first: { type: 'tile', tileId: targetTileId },
        second: { type: 'tile', tileId: newTileId },
      };
    }
    return layout;
  }

  return {
    ...layout,
    first: splitTile(layout.first, targetTileId, newTileId, direction),
    second: splitTile(layout.second, targetTileId, newTileId, direction),
  };
}

export function removeTile(layout: LayoutNode, tileId: string): LayoutNode | null {
  if (layout.type === 'tile') {
    return layout.tileId === tileId ? null : layout;
  }

  const firstResult = removeTile(layout.first, tileId);
  const secondResult = removeTile(layout.second, tileId);

  if (firstResult === null) return secondResult;
  if (secondResult === null) return firstResult;

  return {
    ...layout,
    first: firstResult,
    second: secondResult,
  };
}

export function getTileIds(layout: LayoutNode): string[] {
  if (layout.type === 'tile') {
    return [layout.tileId];
  }
  return [...getTileIds(layout.first), ...getTileIds(layout.second)];
}

export function getSmartDirection(width: number, height: number): SplitDirection {
  return width >= height ? 'horizontal' : 'vertical';
}

export function getTileDimensions(
  layout: LayoutNode,
  tileId: string,
  containerWidth: number,
  containerHeight: number
): { width: number; height: number } | null {
  const positions = computeTilePositions(layout, 0, 0, containerWidth, containerHeight);
  const tile = positions.find((p) => p.tileId === tileId);
  if (!tile) return null;
  return { width: tile.width, height: tile.height };
}

interface TilePosition {
  tileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeTilePositions(
  layout: LayoutNode,
  x: number,
  y: number,
  width: number,
  height: number
): TilePosition[] {
  if (layout.type === 'tile') {
    return [{ tileId: layout.tileId, x, y, width, height }];
  }

  const { direction, ratio, first, second } = layout;

  if (direction === 'horizontal') {
    const firstWidth = width * ratio;
    const secondWidth = width * (1 - ratio);
    return [
      ...computeTilePositions(first, x, y, firstWidth, height),
      ...computeTilePositions(second, x + firstWidth, y, secondWidth, height),
    ];
  } else {
    const firstHeight = height * ratio;
    const secondHeight = height * (1 - ratio);
    return [
      ...computeTilePositions(first, x, y, width, firstHeight),
      ...computeTilePositions(second, x, y + firstHeight, width, secondHeight),
    ];
  }
}

export function findAdjacentTile(
  layout: LayoutNode,
  currentTileId: string,
  direction: 'left' | 'right' | 'up' | 'down',
  containerWidth = 1000,
  containerHeight = 1000
): string | null {
  const positions = computeTilePositions(layout, 0, 0, containerWidth, containerHeight);
  const current = positions.find((p) => p.tileId === currentTileId);
  if (!current) return null;

  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;

  let candidates: TilePosition[] = [];

  switch (direction) {
    case 'left':
      candidates = positions.filter((p) => p.x + p.width <= current.x + 1);
      break;
    case 'right':
      candidates = positions.filter((p) => p.x >= current.x + current.width - 1);
      break;
    case 'up':
      candidates = positions.filter((p) => p.y + p.height <= current.y + 1);
      break;
    case 'down':
      candidates = positions.filter((p) => p.y >= current.y + current.height - 1);
      break;
  }

  if (candidates.length === 0) return null;

  let best: TilePosition | null = null;
  let bestScore = Infinity;

  for (const c of candidates) {
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const dist = Math.abs(cx - centerX) + Math.abs(cy - centerY);

    let alignmentScore = 0;
    if (direction === 'left' || direction === 'right') {
      alignmentScore = Math.abs(cy - centerY);
    } else {
      alignmentScore = Math.abs(cx - centerX);
    }

    const score = alignmentScore * 2 + dist;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best?.tileId || null;
}

export function updateSplitRatio(
  layout: LayoutNode,
  path: number[],
  newRatio: number
): LayoutNode {
  if (path.length === 0 || layout.type === 'tile') {
    return layout;
  }

  if (path.length === 1) {
    return { ...layout, ratio: Math.max(0.1, Math.min(0.9, newRatio)) } as SplitNode;
  }

  const [head, ...rest] = path;
  if (head === 0) {
    return { ...layout, first: updateSplitRatio(layout.first, rest, newRatio) } as SplitNode;
  } else {
    return { ...layout, second: updateSplitRatio(layout.second, rest, newRatio) } as SplitNode;
  }
}

export function findSplitPath(layout: LayoutNode, tileId: string, path: number[] = []): number[] | null {
  if (layout.type === 'tile') {
    return layout.tileId === tileId ? path : null;
  }

  const firstResult = findSplitPath(layout.first, tileId, [...path, 0]);
  if (firstResult) return firstResult;

  return findSplitPath(layout.second, tileId, [...path, 1]);
}
