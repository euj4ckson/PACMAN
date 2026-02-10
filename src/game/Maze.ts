import * as THREE from "three";
import {
  DIRECTIONS,
  addDirection,
  cellKey,
  cellsEqual,
  cloneCell,
  type Direction,
  type GridPosition,
} from "./Utils";

type CellValue = 0 | 1 | 2 | 3 | 4 | 5;

type PelletKind = "pellet" | "power";

interface PelletEntry {
  kind: PelletKind;
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
}

const MAZE_LAYOUT = [
  "#####################",
  "#o........#........o#",
  "#.###.###.#.###.###.#",
  "#.....#...#...#.....#",
  "###.#.#.#####.#.#.###",
  "#...#.#...#...#.#...#",
  "#.###.###.#.###.###.#",
  "#.........P.........#",
  "#.###.#.#####.#.###.#",
  "#.....#...#...#.....#",
  "#####.##.GGG.##.#####",
  "#.....#...G...#.....#",
  "#.###.#.#####.#.###.#",
  "#...#.#...#...#.#...#",
  "###.#.###.#.###.#.###",
  "#.....#...#...#.....#",
  "#.###.###.#.###.###.#",
  "#o..#.....#.....#..o#",
  "#.##.#.#######.#.##.#",
  "#...................#",
  "#####################",
] as const;

function layoutSymbolToCell(symbol: string): CellValue {
  switch (symbol) {
    case "#":
      return 1;
    case ".":
      return 2;
    case "o":
      return 3;
    case "G":
      return 4;
    case "P":
      return 5;
    default:
      return 0;
  }
}

export class Maze {
  public readonly group = new THREE.Group();
  public readonly tileSize: number;
  public readonly wallHeight: number;

  private readonly wallGroup = new THREE.Group();
  private readonly pelletGroup = new THREE.Group();

  private readonly rows: number;
  private readonly cols: number;
  private readonly baseGrid: CellValue[][];
  private grid: CellValue[][];

  private readonly playerSpawn: GridPosition;
  private readonly ghostSpawns: GridPosition[];

  private readonly pelletGeometry: THREE.SphereGeometry;
  private readonly powerPelletGeometry: THREE.SphereGeometry;
  private readonly pelletMaterial: THREE.MeshStandardMaterial;
  private readonly powerPelletMaterial: THREE.MeshStandardMaterial;
  private readonly wallMaterial: THREE.MeshStandardMaterial;

  private readonly pellets = new Map<string, PelletEntry>();
  private pulseTime = 0;

  constructor(tileSize = 1) {
    this.tileSize = tileSize;
    this.wallHeight = 0.9 * tileSize;

    const parsed = this.parseLayout(MAZE_LAYOUT);
    this.baseGrid = parsed.grid;
    this.grid = this.cloneGrid(this.baseGrid);
    this.rows = this.baseGrid.length;
    this.cols = this.baseGrid[0].length;
    this.playerSpawn = parsed.playerSpawn;
    this.ghostSpawns = parsed.ghostSpawns;

    this.pelletGeometry = new THREE.SphereGeometry(this.tileSize * 0.1, 10, 10);
    this.powerPelletGeometry = new THREE.SphereGeometry(this.tileSize * 0.18, 14, 14);
    this.pelletMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe2a8,
      emissive: 0x4a3a11,
      emissiveIntensity: 0.55,
      roughness: 0.24,
      metalness: 0.08,
    });
    this.powerPelletMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa25f,
      emissive: 0xbd4313,
      emissiveIntensity: 0.82,
      roughness: 0.15,
      metalness: 0.18,
    });
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x3667de,
      emissive: 0x113678,
      emissiveIntensity: 0.6,
      roughness: 0.42,
      metalness: 0.2,
    });

    this.group.add(this.wallGroup);
    this.group.add(this.pelletGroup);

    this.buildWalls();
    this.rebuildPellets();
  }

  public getDimensions(): { width: number; depth: number } {
    return {
      width: this.cols * this.tileSize,
      depth: this.rows * this.tileSize,
    };
  }

  public getRows(): number {
    return this.rows;
  }

  public getCols(): number {
    return this.cols;
  }

  public getPlayerSpawn(): GridPosition {
    return cloneCell(this.playerSpawn);
  }

  public getGhostSpawns(): GridPosition[] {
    return this.ghostSpawns.map((cell) => cloneCell(cell));
  }

  public gridToWorld(cell: GridPosition, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    const x = (cell.col - this.cols / 2 + 0.5) * this.tileSize;
    const z = (cell.row - this.rows / 2 + 0.5) * this.tileSize;
    return out.set(x, y, z);
  }

  public worldToGrid(position: THREE.Vector3): GridPosition {
    const col = Math.round(position.x / this.tileSize + this.cols / 2 - 0.5);
    const row = Math.round(position.z / this.tileSize + this.rows / 2 - 0.5);
    return { row, col };
  }

  public isInside(cell: GridPosition): boolean {
    return cell.row >= 0 && cell.row < this.rows && cell.col >= 0 && cell.col < this.cols;
  }

  public isWall(cell: GridPosition): boolean {
    if (!this.isInside(cell)) {
      return true;
    }
    return this.baseGrid[cell.row][cell.col] === 1;
  }

  public isWalkable(cell: GridPosition): boolean {
    return this.isInside(cell) && !this.isWall(cell);
  }

  public canMove(cell: GridPosition, direction: Direction): boolean {
    const next = addDirection(cell, direction);
    return this.isWalkable(next);
  }

  public getAvailableDirections(cell: GridPosition): Direction[] {
    const options: Direction[] = [];
    for (const direction of DIRECTIONS) {
      if (this.canMove(cell, direction)) {
        options.push(direction);
      }
    }
    return options;
  }

  public getCellValue(cell: GridPosition): CellValue {
    if (!this.isInside(cell)) {
      return 1;
    }
    return this.grid[cell.row][cell.col];
  }

  public consumePelletAt(cell: GridPosition): PelletKind | null {
    if (!this.isInside(cell)) {
      return null;
    }

    const key = cellKey(cell);
    const pellet = this.pellets.get(key);
    if (!pellet) {
      return null;
    }

    this.pelletGroup.remove(pellet.mesh);
    this.pellets.delete(key);

    if (this.grid[cell.row][cell.col] === 2 || this.grid[cell.row][cell.col] === 3) {
      this.grid[cell.row][cell.col] = 0;
    }

    return pellet.kind;
  }

  public getRemainingPellets(): number {
    return this.pellets.size;
  }

  public resetPellets(): void {
    this.grid = this.cloneGrid(this.baseGrid);
    this.rebuildPellets();
  }

  public findDirectionBFS(
    start: GridPosition,
    target: GridPosition,
    forbiddenFirstDirection?: Direction,
  ): Direction | null {
    if (!this.isWalkable(start) || !this.isWalkable(target)) {
      return null;
    }

    if (cellsEqual(start, target)) {
      return null;
    }

    const visited = Array.from({ length: this.rows }, () => Array<boolean>(this.cols).fill(false));
    visited[start.row][start.col] = true;

    const queue: Array<{ cell: GridPosition; first: Direction }> = [];
    let head = 0;

    for (const direction of DIRECTIONS) {
      if (forbiddenFirstDirection && direction === forbiddenFirstDirection) {
        continue;
      }

      const next = addDirection(start, direction);
      if (!this.isWalkable(next) || visited[next.row][next.col]) {
        continue;
      }

      visited[next.row][next.col] = true;
      queue.push({ cell: next, first: direction });
    }

    while (head < queue.length) {
      const current = queue[head++];
      if (cellsEqual(current.cell, target)) {
        return current.first;
      }

      for (const direction of DIRECTIONS) {
        const next = addDirection(current.cell, direction);
        if (!this.isWalkable(next) || visited[next.row][next.col]) {
          continue;
        }

        visited[next.row][next.col] = true;
        queue.push({ cell: next, first: current.first });
      }
    }

    return null;
  }

  public dispose(): void {
    this.pelletGeometry.dispose();
    this.powerPelletGeometry.dispose();
    this.pelletMaterial.dispose();
    this.powerPelletMaterial.dispose();
    this.wallMaterial.dispose();
  }

  public update(deltaSeconds: number): void {
    this.pulseTime += deltaSeconds;

    this.wallMaterial.emissiveIntensity = 0.5 + Math.sin(this.pulseTime * 1.8) * 0.1;
    this.pelletMaterial.emissiveIntensity = 0.5 + Math.sin(this.pulseTime * 5.2) * 0.1;
    this.powerPelletMaterial.emissiveIntensity = 0.75 + Math.sin(this.pulseTime * 7.4) * 0.2;

    for (const pellet of this.pellets.values()) {
      const wave = Math.sin(this.pulseTime * 4.8 + pellet.phase);
      const bobHeight = pellet.kind === "power" ? 0.05 : 0.022;
      pellet.mesh.position.y = pellet.baseY + wave * bobHeight;

      if (pellet.kind === "power") {
        const scale = 1 + Math.sin(this.pulseTime * 7 + pellet.phase) * 0.16;
        pellet.mesh.scale.setScalar(scale);
      } else {
        pellet.mesh.scale.setScalar(1);
      }
    }
  }

  private parseLayout(layout: readonly string[]): {
    grid: CellValue[][];
    playerSpawn: GridPosition;
    ghostSpawns: GridPosition[];
  } {
    if (layout.length === 0) {
      throw new Error("Labirinto vazio.");
    }

    const width = layout[0].length;
    const grid: CellValue[][] = [];
    let playerSpawn: GridPosition | null = null;
    const ghostSpawns: GridPosition[] = [];

    for (let row = 0; row < layout.length; row += 1) {
      const line = layout[row];
      if (line.length !== width) {
        throw new Error(`Linha ${row} do layout possui largura inconsistente.`);
      }

      const rowCells: CellValue[] = [];
      for (let col = 0; col < line.length; col += 1) {
        const symbol = line[col];
        const cell = layoutSymbolToCell(symbol);
        rowCells.push(cell);

        if (cell === 5) {
          playerSpawn = { row, col };
        } else if (cell === 4) {
          ghostSpawns.push({ row, col });
        }
      }

      grid.push(rowCells);
    }

    if (!playerSpawn) {
      throw new Error("Layout nao possui spawn do jogador.");
    }

    if (ghostSpawns.length === 0) {
      throw new Error("Layout nao possui spawn de fantasmas.");
    }

    return {
      grid,
      playerSpawn,
      ghostSpawns,
    };
  }

  private buildWalls(): void {
    let wallCount = 0;
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        if (this.baseGrid[row][col] === 1) {
          wallCount += 1;
        }
      }
    }

    const wallGeometry = new THREE.BoxGeometry(this.tileSize, this.wallHeight, this.tileSize);
    const wallMesh = new THREE.InstancedMesh(wallGeometry, this.wallMaterial, wallCount);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        if (this.baseGrid[row][col] !== 1) {
          continue;
        }
        const center = this.gridToWorld({ row, col }, this.wallHeight * 0.5);
        matrix.makeTranslation(center.x, center.y, center.z);
        wallMesh.setMatrixAt(index, matrix);
        index += 1;
      }
    }

    wallMesh.instanceMatrix.needsUpdate = true;
    this.wallGroup.add(wallMesh);
  }

  private rebuildPellets(): void {
    for (const pellet of this.pellets.values()) {
      this.pelletGroup.remove(pellet.mesh);
    }
    this.pellets.clear();

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const cell = this.grid[row][col];
        if (cell !== 2 && cell !== 3) {
          continue;
        }

        const kind: PelletKind = cell === 2 ? "pellet" : "power";
        const mesh = new THREE.Mesh(
          kind === "pellet" ? this.pelletGeometry : this.powerPelletGeometry,
          kind === "pellet" ? this.pelletMaterial : this.powerPelletMaterial,
        );

        const baseY = kind === "pellet" ? 0.13 : 0.2;
        const center = this.gridToWorld({ row, col }, baseY);
        mesh.position.copy(center);
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        const key = cellKey({ row, col });
        this.pellets.set(key, { kind, mesh, baseY, phase: Math.random() * Math.PI * 2 });
        this.pelletGroup.add(mesh);
      }
    }
  }

  private cloneGrid(source: CellValue[][]): CellValue[][] {
    return source.map((row) => [...row]);
  }
}
