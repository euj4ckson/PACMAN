import * as THREE from "three";
import { Maze } from "./Maze";
import {
  addDirection,
  cellsEqual,
  cloneCell,
  directionToYaw,
  manhattanDistance,
  oppositeDirection,
  randomItem,
  type Direction,
  type GhostMode,
  type GridPosition,
} from "./Utils";

export type GhostState = "chase" | "scatter" | "frightened" | "respawn";

interface GhostOptions {
  name: string;
  color: number;
  maze: Maze;
  spawnCell: GridPosition;
  homeCell: GridPosition;
  scatterTarget: GridPosition;
}

export class Ghost {
  public readonly mesh = new THREE.Group();

  private readonly maze: Maze;
  private readonly spawnCell: GridPosition;
  private readonly homeCell: GridPosition;
  private readonly scatterTarget: GridPosition;
  private readonly baseColor: THREE.Color;
  private readonly skinMaterials: THREE.MeshStandardMaterial[];
  private readonly tempFrom = new THREE.Vector3();
  private readonly tempTo = new THREE.Vector3();

  private currentCell: GridPosition;
  private fromCell: GridPosition;
  private toCell: GridPosition | null = null;
  private currentDirection: Direction | null = null;
  private progressToNext = 0;

  private desiredMode: GhostMode = "scatter";
  private state: GhostState = "scatter";
  private frightenedTimer = 0;
  private respawnDelay = 0;
  private bobTimer = Math.random() * Math.PI * 2;

  private readonly moveSpeed = 4.8;
  private readonly frightenedSpeed = 3;
  private readonly respawnSpeed = 6.8;

  constructor(options: GhostOptions) {
    this.maze = options.maze;
    this.spawnCell = cloneCell(options.spawnCell);
    this.homeCell = cloneCell(options.homeCell);
    this.scatterTarget = cloneCell(options.scatterTarget);
    this.baseColor = new THREE.Color(options.color);
    this.currentCell = cloneCell(options.spawnCell);
    this.fromCell = cloneCell(options.spawnCell);

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: options.color,
      roughness: 0.34,
      metalness: 0.1,
    });
    const bodyTop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 22, 16), skinMaterial);
    bodyTop.position.y = 0.42;
    bodyTop.castShadow = true;
    bodyTop.receiveShadow = true;

    const bodyBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 18), skinMaterial);
    bodyBottom.position.y = 0.2;
    bodyBottom.castShadow = true;
    bodyBottom.receiveShadow = true;

    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2661 });

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMaterial);
    leftEye.position.set(-0.1, 0.42, 0.25);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMaterial);
    rightEye.position.set(0.1, 0.42, 0.25);

    const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), pupilMaterial);
    leftPupil.position.set(-0.1, 0.42, 0.3);
    const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), pupilMaterial);
    rightPupil.position.set(0.1, 0.42, 0.3);

    this.mesh.name = options.name;
    this.mesh.add(bodyTop);
    this.mesh.add(bodyBottom);
    this.mesh.add(leftEye);
    this.mesh.add(rightEye);
    this.mesh.add(leftPupil);
    this.mesh.add(rightPupil);

    this.skinMaterials = [skinMaterial];

    this.syncMeshPosition(0);
  }

  public reset(mode: GhostMode): void {
    this.desiredMode = mode;
    this.state = mode;
    this.frightenedTimer = 0;
    this.respawnDelay = 0;
    this.currentCell = cloneCell(this.spawnCell);
    this.fromCell = cloneCell(this.spawnCell);
    this.toCell = null;
    this.currentDirection = null;
    this.progressToNext = 0;
    this.applyColor();
    this.syncMeshPosition(0);
  }

  public setMode(mode: GhostMode): void {
    this.desiredMode = mode;
    if (this.state === "chase" || this.state === "scatter") {
      this.state = mode;
      this.applyColor();
    }
  }

  public setFrightened(durationSeconds: number): void {
    if (this.state === "respawn") {
      return;
    }
    this.state = "frightened";
    this.frightenedTimer = Math.max(this.frightenedTimer, durationSeconds);
    this.applyColor();
  }

  public onEaten(): void {
    this.state = "respawn";
    this.frightenedTimer = 0;
    this.respawnDelay = 0.7;
    this.currentDirection = null;
    this.toCell = null;
    this.progressToNext = 0;
    this.fromCell = cloneCell(this.currentCell);
    this.applyColor();
    this.syncMeshPosition(0);
  }

  public getState(): GhostState {
    return this.state;
  }

  public getCell(): GridPosition {
    return cloneCell(this.currentCell);
  }

  public getWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.mesh.position);
  }

  public update(deltaSeconds: number, playerCell: GridPosition): void {
    if (this.state === "frightened") {
      this.frightenedTimer -= deltaSeconds;
      if (this.frightenedTimer <= 0) {
        this.state = this.desiredMode;
        this.applyColor();
      }
    }

    if (this.state === "respawn" && this.respawnDelay > 0) {
      this.respawnDelay = Math.max(0, this.respawnDelay - deltaSeconds);
      this.syncMeshPosition(deltaSeconds);
      return;
    }

    let remaining = deltaSeconds;
    while (remaining > 0) {
      if (!this.toCell) {
        if (this.state === "respawn" && cellsEqual(this.currentCell, this.homeCell)) {
          this.state = this.desiredMode;
          this.applyColor();
        }

        const direction = this.chooseDirection(playerCell);
        if (!direction) {
          break;
        }
        this.beginStep(direction);
      }

      const speed = this.getSpeed();
      const stepDuration = (1 - this.progressToNext) / speed;
      if (remaining >= stepDuration) {
        remaining -= stepDuration;
        this.finishStep();
      } else {
        this.progressToNext += remaining * speed;
        remaining = 0;
      }
    }

    this.syncMeshPosition(deltaSeconds);
  }

  private getSpeed(): number {
    switch (this.state) {
      case "frightened":
        return this.frightenedSpeed;
      case "respawn":
        return this.respawnSpeed;
      default:
        return this.moveSpeed;
    }
  }

  private chooseDirection(playerCell: GridPosition): Direction | null {
    const options = this.maze.getAvailableDirections(this.currentCell);
    if (options.length === 0) {
      return null;
    }

    if (this.state === "frightened") {
      return randomItem(options);
    }

    const reverse = this.currentDirection ? oppositeDirection(this.currentDirection) : null;
    const forbidden = reverse && options.length > 1 ? reverse : undefined;
    const target = this.resolveTarget(playerCell);

    const bfsDirection = this.maze.findDirectionBFS(this.currentCell, target, forbidden);
    if (bfsDirection) {
      return bfsDirection;
    }

    const fallbackOptions = forbidden ? options.filter((dir) => dir !== forbidden) : options;
    const usableOptions = fallbackOptions.length > 0 ? fallbackOptions : options;

    let bestDirection = usableOptions[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const direction of usableOptions) {
      const nextCell = addDirection(this.currentCell, direction);
      const distance = manhattanDistance(nextCell, target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestDirection = direction;
      }
    }

    return bestDirection;
  }

  private resolveTarget(playerCell: GridPosition): GridPosition {
    switch (this.state) {
      case "respawn":
        return this.homeCell;
      case "chase":
        return playerCell;
      case "scatter":
      default:
        return this.scatterTarget;
    }
  }

  private beginStep(direction: Direction): void {
    this.fromCell = cloneCell(this.currentCell);
    this.toCell = addDirection(this.currentCell, direction);
    this.currentDirection = direction;
    this.progressToNext = 0;
  }

  private finishStep(): void {
    if (!this.toCell) {
      return;
    }
    this.currentCell = cloneCell(this.toCell);
    this.fromCell = cloneCell(this.currentCell);
    this.toCell = null;
    this.progressToNext = 0;
  }

  private applyColor(): void {
    let color = this.baseColor;
    if (this.state === "frightened") {
      color = new THREE.Color(0x1c46d0);
    } else if (this.state === "respawn") {
      color = new THREE.Color(0xd0d4e2);
    }

    for (const material of this.skinMaterials) {
      material.color.copy(color);
      material.emissive.setHex(this.state === "frightened" ? 0x0f1f6a : 0x000000);
    }
  }

  private syncMeshPosition(deltaSeconds: number): void {
    if (this.toCell) {
      this.maze.gridToWorld(this.fromCell, 0.35, this.tempFrom);
      this.maze.gridToWorld(this.toCell, 0.35, this.tempTo);
      this.mesh.position.lerpVectors(this.tempFrom, this.tempTo, this.progressToNext);
    } else {
      this.maze.gridToWorld(this.currentCell, 0.35, this.mesh.position);
    }

    if (this.currentDirection) {
      this.mesh.rotation.y = directionToYaw(this.currentDirection);
    }

    this.bobTimer += deltaSeconds * 8;
    this.mesh.position.y += Math.sin(this.bobTimer) * 0.025;
  }
}
