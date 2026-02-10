export type Direction = "up" | "down" | "left" | "right";

export type GameState = "ready" | "countdown" | "playing" | "gameover" | "win";

export type GhostMode = "chase" | "scatter";

export interface GridPosition {
  row: number;
  col: number;
}

export const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

export const DIRECTION_DELTAS: Record<Direction, GridPosition> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

export function addDirection(position: GridPosition, direction: Direction): GridPosition {
  const delta = DIRECTION_DELTAS[direction];
  return {
    row: position.row + delta.row,
    col: position.col + delta.col,
  };
}

export function oppositeDirection(direction: Direction): Direction {
  switch (direction) {
    case "up":
      return "down";
    case "down":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
    default:
      return direction;
  }
}

export function directionToYaw(direction: Direction): number {
  switch (direction) {
    case "right":
      return 0;
    case "left":
      return Math.PI;
    case "up":
      return Math.PI / 2;
    case "down":
      return -Math.PI / 2;
    default:
      return 0;
  }
}

export function cellsEqual(a: GridPosition, b: GridPosition): boolean {
  return a.row === b.row && a.col === b.col;
}

export function cellKey(cell: GridPosition): string {
  return `${cell.row},${cell.col}`;
}

export function cloneCell(cell: GridPosition): GridPosition {
  return { row: cell.row, col: cell.col };
}

export function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function dampLerpFactor(lambda: number, deltaSeconds: number): number {
  return 1 - Math.exp(-lambda * deltaSeconds);
}

export function randomItem<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}
