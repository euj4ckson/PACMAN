import * as THREE from "three";
import { GameAudio } from "./Audio";
import { Ghost } from "./Ghost";
import { HUD } from "./HUD";
import { Input } from "./Input";
import { Maze } from "./Maze";
import { Player } from "./Player";
import {
  dampLerpFactor,
  type GameState,
  type GhostMode,
  type GridPosition,
  type MobileControlScheme,
} from "./Utils";
import { World } from "./World";

const STARTING_LIVES = 3;
const START_COUNTDOWN_DURATION = 3;
const FRIGHTENED_DURATION = 8;
const COLLISION_DISTANCE = 0.52;

const MODE_SCHEDULE: Array<{ mode: GhostMode; duration: number }> = [
  { mode: "scatter", duration: 7 },
  { mode: "chase", duration: 20 },
  { mode: "scatter", duration: 7 },
  { mode: "chase", duration: 20 },
  { mode: "scatter", duration: 5 },
  { mode: "chase", duration: Number.POSITIVE_INFINITY },
];

export class Game {
  private readonly world: World;
  private readonly maze: Maze;
  private readonly player: Player;
  private readonly ghosts: Ghost[];
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly audio: GameAudio;
  private readonly clock = new THREE.Clock();
  private readonly tempPlayerPosition = new THREE.Vector3();
  private readonly tempGhostPosition = new THREE.Vector3();
  private readonly tempCameraPosition = new THREE.Vector3();
  private readonly tempCameraOffset = new THREE.Vector3();

  private animationId: number | null = null;

  private state: GameState = "ready";
  private score = 0;
  private lives = STARTING_LIVES;
  private readyMessage = "Pressione Enter para iniciar a rodada.";
  private countdownRemaining = 0;
  private mobileControlScheme: MobileControlScheme = "joystick";

  private cameraModeIndex = 0;
  private readonly cameraOffsets = [new THREE.Vector3(0, 12, 10), new THREE.Vector3(0, 8, 6)];

  private scheduleIndex = 0;
  private scheduleElapsed = 0;
  private ghostMode: GhostMode = MODE_SCHEDULE[0].mode;

  constructor(container: HTMLElement) {
    this.world = new World(container);
    this.maze = new Maze(1);
    this.player = new Player(this.maze);
    this.input = new Input(container, window, this.mobileControlScheme);
    this.hud = new HUD(container, {
      initialMobileControlScheme: this.mobileControlScheme,
      onMobileControlSchemeChange: (scheme) => {
        this.mobileControlScheme = scheme;
        this.input.setMobileControlScheme(scheme);
      },
    });
    this.audio = new GameAudio();

    this.world.scene.add(this.maze.group);
    this.world.scene.add(this.player.mesh);

    const dimensions = this.maze.getDimensions();
    this.world.setGround(dimensions.width, dimensions.depth);

    const ghostSpawns = this.maze.getGhostSpawns();
    const homeCell = ghostSpawns[Math.floor(ghostSpawns.length / 2)];
    const cornerTargets: GridPosition[] = [
      { row: 1, col: 1 },
      { row: 1, col: this.maze.getCols() - 2 },
      { row: this.maze.getRows() - 2, col: 1 },
      { row: this.maze.getRows() - 2, col: this.maze.getCols() - 2 },
    ];
    const colors = [0xff4f5d, 0x56b7f5, 0xffb347, 0xf27cff];

    this.ghosts = colors.map((color, index) => {
      const ghost = new Ghost({
        name: `Ghost-${index + 1}`,
        color,
        maze: this.maze,
        spawnCell: ghostSpawns[index % ghostSpawns.length],
        homeCell,
        scatterTarget: cornerTargets[index % cornerTargets.length],
      });
      this.world.scene.add(ghost.mesh);
      return ghost;
    });

    this.resetMatch();
    this.clock.start();
    this.loop();
  }

  public dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.input.dispose();
    this.hud.dispose();
    this.maze.dispose();
    this.world.dispose();
  }

  private loop = (): void => {
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.05);
    this.handleInput();
    this.maze.update(deltaSeconds);
    this.world.update(deltaSeconds);

    if (this.state === "countdown") {
      this.updateCountdown(deltaSeconds);
    } else if (this.state === "playing") {
      this.updateModeSchedule(deltaSeconds);
      this.updateSimulation(deltaSeconds);
    }

    this.updateCamera(deltaSeconds);
    this.updateHUD();
    this.world.render();

    this.animationId = requestAnimationFrame(this.loop);
  };

  private handleInput(): void {
    if (this.input.consumeCameraTogglePress()) {
      this.cameraModeIndex = (this.cameraModeIndex + 1) % this.cameraOffsets.length;
    }

    if (this.input.consumeStartPress()) {
      this.audio.unlock();
      if (this.state === "ready") {
        this.startCountdown();
      } else if (this.state === "gameover" || this.state === "win") {
        this.resetMatch();
        this.startCountdown();
      }
    }

    const direction = this.input.consumeDirectionPress();
    if (direction) {
      this.player.queueDirection(direction);
    }
  }

  private updateSimulation(deltaSeconds: number): void {
    this.player.update(deltaSeconds);

    const collected = this.maze.consumePelletAt(this.player.getCell());
    if (collected === "pellet") {
      this.score += 10;
      this.audio.playPellet();
    } else if (collected === "power") {
      this.score += 50;
      this.audio.playPowerPellet();
      for (const ghost of this.ghosts) {
        ghost.setFrightened(FRIGHTENED_DURATION);
      }
    }

    if (this.maze.getRemainingPellets() === 0) {
      this.state = "win";
      this.readyMessage = "Voce venceu! Pressione Enter para reiniciar.";
      this.audio.playWin();
      return;
    }

    const playerCell = this.player.getCell();
    for (const ghost of this.ghosts) {
      ghost.update(deltaSeconds, playerCell);
    }

    this.resolveCollisions();
  }

  private resolveCollisions(): void {
    this.player.getWorldPosition(this.tempPlayerPosition);

    for (const ghost of this.ghosts) {
      ghost.getWorldPosition(this.tempGhostPosition);
      const distance = this.tempPlayerPosition.distanceTo(this.tempGhostPosition);

      if (distance > COLLISION_DISTANCE) {
        continue;
      }

      const ghostState = ghost.getState();
      if (ghostState === "frightened") {
        ghost.onEaten();
        this.score += 200;
        this.audio.playGhostEaten();
        continue;
      }

      if (ghostState !== "respawn") {
        this.handlePlayerHit();
        return;
      }
    }
  }

  private handlePlayerHit(): void {
    this.lives -= 1;
    this.audio.playDeath();

    if (this.lives <= 0) {
      this.state = "gameover";
      this.readyMessage = "Game Over! Pressione Enter para reiniciar.";
      return;
    }

    this.state = "ready";
    this.readyMessage = "Vida perdida. Pressione Enter para voltar.";
    this.resetRoundPositions();
    this.resetModeSchedule();
  }

  private updateModeSchedule(deltaSeconds: number): void {
    this.scheduleElapsed += deltaSeconds;

    while (this.scheduleElapsed >= MODE_SCHEDULE[this.scheduleIndex].duration) {
      this.scheduleElapsed -= MODE_SCHEDULE[this.scheduleIndex].duration;

      if (this.scheduleIndex >= MODE_SCHEDULE.length - 1) {
        break;
      }

      this.scheduleIndex += 1;
      this.ghostMode = MODE_SCHEDULE[this.scheduleIndex].mode;
      for (const ghost of this.ghosts) {
        ghost.setMode(this.ghostMode);
      }
    }
  }

  private updateCountdown(deltaSeconds: number): void {
    this.countdownRemaining = Math.max(0, this.countdownRemaining - deltaSeconds);
    if (this.countdownRemaining <= 0) {
      this.state = "playing";
      this.countdownRemaining = 0;
    }
  }

  private updateCamera(deltaSeconds: number): void {
    this.player.getWorldPosition(this.tempCameraPosition);
    const offset = this.getAdaptiveCameraOffset(this.tempCameraOffset);
    this.tempCameraPosition.add(offset);

    const factor = dampLerpFactor(9, deltaSeconds);
    this.world.camera.position.lerp(this.tempCameraPosition, factor);

    const target = this.player.getWorldPosition();
    this.world.camera.lookAt(target.x, target.y * 0.6, target.z);
  }

  private updateHUD(): void {
    this.hud.update({
      score: this.score,
      lives: this.lives,
      pelletsRemaining: this.maze.getRemainingPellets(),
      state: this.state,
      ghostMode: this.getGhostModeLabel(),
      cameraMode: this.cameraModeIndex === 0 ? "Longe" : "Perto",
      message: this.getStateMessage(),
      countdownRemaining: this.countdownRemaining,
      mobileControlScheme: this.mobileControlScheme,
    });
  }

  private getStateMessage(): string {
    if (this.state === "countdown") {
      return `Comecando em ${Math.max(1, Math.ceil(this.countdownRemaining))}...`;
    }

    if (this.state === "playing") {
      return "Colete os pellets. Power pellet deixa fantasmas vulneraveis.";
    }
    return this.readyMessage;
  }

  private resetMatch(): void {
    this.score = 0;
    this.lives = STARTING_LIVES;
    this.readyMessage = "Pressione Enter para iniciar a rodada.";
    this.maze.resetPellets();
    this.resetModeSchedule();
    this.resetRoundPositions();
    this.countdownRemaining = 0;
    this.state = "ready";
  }

  private getGhostModeLabel(): string {
    const hasFrightened = this.ghosts.some((ghost) => ghost.getState() === "frightened");
    if (hasFrightened) {
      return "FRIGHTENED";
    }

    const hasRespawn = this.ghosts.some((ghost) => ghost.getState() === "respawn");
    if (hasRespawn) {
      return "RESPAWN";
    }

    return this.ghostMode.toUpperCase();
  }

  private resetRoundPositions(): void {
    this.player.reset();
    for (const ghost of this.ghosts) {
      ghost.reset(this.ghostMode);
    }
  }

  private resetModeSchedule(): void {
    this.scheduleIndex = 0;
    this.scheduleElapsed = 0;
    this.ghostMode = MODE_SCHEDULE[0].mode;
    for (const ghost of this.ghosts) {
      ghost.setMode(this.ghostMode);
    }
  }

  private startCountdown(): void {
    this.state = "countdown";
    this.countdownRemaining = START_COUNTDOWN_DURATION;
    this.readyMessage = "Prepare-se para iniciar.";
  }

  private getAdaptiveCameraOffset(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.cameraOffsets[this.cameraModeIndex]);
    const aspect = this.world.camera.aspect;

    if (aspect < 1) {
      const portrait = 1 - aspect;
      out.y *= 1 + portrait * 0.55;
      out.z *= 1 + portrait * 0.32;
    } else if (aspect > 1.8) {
      const wide = Math.min(1, aspect - 1.8);
      out.y *= 0.96;
      out.z *= 1 + wide * 0.18;
    }

    return out;
  }
}
