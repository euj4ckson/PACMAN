import * as THREE from "three";
import { Maze } from "./Maze";
import {
  addDirection,
  cloneCell,
  directionToYaw,
  type Direction,
  type GridPosition,
} from "./Utils";

export class Player {
  public readonly mesh = new THREE.Group();
  public readonly radius: number;

  private readonly maze: Maze;
  private readonly spawnCell: GridPosition;
  private readonly movementSpeedTilesPerSecond = 6;
  private readonly tempFrom = new THREE.Vector3();
  private readonly tempTo = new THREE.Vector3();
  private readonly upperJaw: THREE.Mesh;
  private readonly lowerJaw: THREE.Mesh;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly glowLight: THREE.PointLight;

  private currentCell: GridPosition;
  private fromCell: GridPosition;
  private toCell: GridPosition | null = null;
  private currentDirection: Direction | null = null;
  private bufferedDirection: Direction | null = null;
  private progressToNext = 0;
  private chompTimer = 0;

  constructor(maze: Maze) {
    this.maze = maze;
    this.spawnCell = maze.getPlayerSpawn();
    this.currentCell = cloneCell(this.spawnCell);
    this.fromCell = cloneCell(this.spawnCell);
    this.radius = this.maze.tileSize * 0.34;

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd13d,
      emissive: 0x8c5f00,
      emissiveIntensity: 0.34,
      roughness: 0.28,
      metalness: 0.1,
    });

    const upperJawGeometry = new THREE.SphereGeometry(
      this.radius,
      32,
      20,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2 + 0.03,
    );
    const lowerJawGeometry = new THREE.SphereGeometry(
      this.radius,
      32,
      20,
      0,
      Math.PI * 2,
      Math.PI / 2 - 0.03,
      Math.PI / 2 + 0.03,
    );

    this.upperJaw = new THREE.Mesh(upperJawGeometry, this.bodyMaterial);
    this.upperJaw.castShadow = true;
    this.upperJaw.receiveShadow = true;

    this.lowerJaw = new THREE.Mesh(lowerJawGeometry, this.bodyMaterial);
    this.lowerJaw.castShadow = true;
    this.lowerJaw.receiveShadow = true;

    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.75,
      metalness: 0.05,
    });

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 0.12, 10, 8), eyeMaterial);
    leftEye.position.set(this.radius * 0.18, this.radius * 0.72, this.radius * 0.31);

    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 0.12, 10, 8), eyeMaterial);
    rightEye.position.set(this.radius * 0.18, this.radius * 0.72, -this.radius * 0.31);

    this.mesh.add(this.upperJaw);
    this.mesh.add(this.lowerJaw);
    this.mesh.add(leftEye);
    this.mesh.add(rightEye);

    this.glowLight = new THREE.PointLight(0xffd766, 1, 3.8, 2.2);
    this.glowLight.position.set(0, this.radius * 0.1, 0);
    this.mesh.add(this.glowLight);

    this.syncMeshTransform();
  }

  public reset(): void {
    this.currentCell = cloneCell(this.spawnCell);
    this.fromCell = cloneCell(this.spawnCell);
    this.toCell = null;
    this.currentDirection = null;
    this.bufferedDirection = null;
    this.progressToNext = 0;
    this.chompTimer = 0;
    this.syncMeshTransform();
  }

  public queueDirection(direction: Direction): void {
    this.bufferedDirection = direction;
  }

  public getCell(): GridPosition {
    return cloneCell(this.currentCell);
  }

  public getWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.mesh.position);
  }

  public update(deltaSeconds: number): void {
    let remaining = deltaSeconds;

    while (remaining > 0) {
      if (!this.toCell) {
        const nextDirection = this.resolveNextDirection();
        if (!nextDirection) {
          break;
        }
        this.beginStep(nextDirection);
      }

      const stepDuration = (1 - this.progressToNext) / this.movementSpeedTilesPerSecond;
      if (remaining >= stepDuration) {
        remaining -= stepDuration;
        this.finishStep();
      } else {
        this.progressToNext += remaining * this.movementSpeedTilesPerSecond;
        remaining = 0;
      }
    }

    this.chompTimer += deltaSeconds * 11;
    this.syncMeshTransform();
  }

  private resolveNextDirection(): Direction | null {
    if (this.bufferedDirection && this.maze.canMove(this.currentCell, this.bufferedDirection)) {
      this.currentDirection = this.bufferedDirection;
      this.bufferedDirection = null;
    }

    if (this.currentDirection && !this.maze.canMove(this.currentCell, this.currentDirection)) {
      this.currentDirection = null;
    }

    return this.currentDirection;
  }

  private beginStep(direction: Direction): void {
    this.fromCell = cloneCell(this.currentCell);
    this.toCell = addDirection(this.currentCell, direction);
    this.progressToNext = 0;
    this.currentDirection = direction;
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

  private syncMeshTransform(): void {
    if (this.toCell) {
      this.maze.gridToWorld(this.fromCell, this.radius, this.tempFrom);
      this.maze.gridToWorld(this.toCell, this.radius, this.tempTo);
      this.mesh.position.lerpVectors(this.tempFrom, this.tempTo, this.progressToNext);
    } else {
      this.maze.gridToWorld(this.currentCell, this.radius, this.mesh.position);
    }

    if (this.currentDirection) {
      this.mesh.rotation.y = directionToYaw(this.currentDirection);
    }

    const isMoving = this.toCell !== null;
    const mouthAngle = isMoving
      ? 0.12 + Math.abs(Math.sin(this.chompTimer)) * 0.4
      : 0.08;

    this.upperJaw.rotation.z = mouthAngle;
    this.lowerJaw.rotation.z = -mouthAngle;

    const bobAmount = isMoving ? Math.abs(Math.sin(this.chompTimer * 1.25)) * 0.03 : 0;
    this.mesh.position.y += bobAmount;

    const glowPulse = 0.95 + Math.abs(Math.sin(this.chompTimer * 1.4)) * 0.45;
    this.glowLight.intensity = glowPulse;
    this.bodyMaterial.emissiveIntensity = 0.28 + glowPulse * 0.16;
  }
}
