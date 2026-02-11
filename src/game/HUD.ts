import type { GameState, MobileControlScheme } from "./Utils";

interface HUDSnapshot {
  score: number;
  lives: number;
  pelletsRemaining: number;
  state: GameState;
  ghostMode: string;
  cameraMode: string;
  message: string;
  countdownRemaining: number;
  mobileControlScheme: MobileControlScheme;
}

interface HUDOptions {
  initialMobileControlScheme?: MobileControlScheme;
  onMobileControlSchemeChange?: (scheme: MobileControlScheme) => void;
}

function formatStateLabel(state: GameState): string {
  switch (state) {
    case "ready":
    case "countdown":
      return "READY";
    case "playing":
      return "PLAYING";
    case "gameover":
      return "GAME OVER";
    case "win":
      return "WIN";
    default:
      return state;
  }
}

export class HUD {
  private readonly root: HTMLDivElement;
  private readonly hudPanel: HTMLElement;
  private readonly hudToggleButton: HTMLButtonElement;
  private readonly scoreValue: HTMLSpanElement;
  private readonly livesValue: HTMLSpanElement;
  private readonly pelletsValue: HTMLSpanElement;
  private readonly stateValue: HTMLSpanElement;
  private readonly ghostModeValue: HTMLSpanElement;
  private readonly cameraValue: HTMLSpanElement;
  private readonly messageValue: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly overlayCard: HTMLDivElement;
  private readonly overlayBadge: HTMLSpanElement;
  private readonly overlayTitle: HTMLHeadingElement;
  private readonly overlayText: HTMLParagraphElement;
  private readonly overlayHint: HTMLParagraphElement;
  private readonly controlConfig: HTMLDivElement;
  private readonly controlButtons: Record<MobileControlScheme, HTMLButtonElement>;
  private readonly onMobileControlSchemeChange?: (scheme: MobileControlScheme) => void;
  private mobileHudHidden = false;
  private mobileControlScheme: MobileControlScheme;
  private readonly onToggleHudBound: () => void;
  private readonly onControlJoystickBound: () => void;
  private readonly onControlDpadBound: () => void;

  constructor(container: HTMLElement, options: HUDOptions = {}) {
    this.root = document.createElement("div");
    this.root.className = "hud-shell";
    this.root.innerHTML = `
      <section class="hud" data-role="hud-panel">
        <header class="hud-header">
          <p class="hud-kicker">Arcade Session</p>
          <h1 class="hud-title">PAC-MAN 3D</h1>
        </header>
        <div class="hud-grid">
          <div class="hud-card">
            <span class="hud-label">Score</span>
            <span class="hud-value hud-value-lg" data-role="score">0</span>
          </div>
          <div class="hud-card">
            <span class="hud-label">Vidas</span>
            <span class="hud-value" data-role="lives">3</span>
          </div>
          <div class="hud-card">
            <span class="hud-label">Pellets</span>
            <span class="hud-value" data-role="pellets">0</span>
          </div>
          <div class="hud-card">
            <span class="hud-label">Estado</span>
            <span class="hud-value" data-role="state">READY</span>
          </div>
          <div class="hud-card">
            <span class="hud-label">Fantasmas</span>
            <span class="hud-value" data-role="ghost-mode">SCATTER</span>
          </div>
          <div class="hud-card">
            <span class="hud-label">Camera</span>
            <span class="hud-value" data-role="camera">Longe</span>
          </div>
        </div>
        <div class="hud-message" data-role="message">Pressione Enter para comecar.</div>
      </section>
      <button type="button" class="hud-visibility-toggle" data-role="hud-toggle">
        Ocultar HUD
      </button>
      <section class="intro-overlay" data-role="overlay">
        <div class="intro-card intro-ready" data-role="overlay-card">
          <span class="intro-badge" data-role="overlay-badge">READY</span>
          <h2 class="intro-title" data-role="overlay-title">PAC-MAN 3D</h2>
          <p class="intro-text" data-role="overlay-text">Limpe o labirinto e fuja dos fantasmas.</p>
          <div class="intro-help">
            <span>Movimento: WASD ou Setas</span>
            <span>Camera: C</span>
          </div>
          <div class="control-config" data-role="control-config">
            <p class="control-config-label">Controle no celular</p>
            <div class="control-options">
              <button type="button" class="control-option" data-role="control-joystick">Joystick</button>
              <button type="button" class="control-option" data-role="control-dpad">Setas</button>
            </div>
          </div>
          <p class="intro-hint" data-role="overlay-hint">Pressione Enter para jogar</p>
        </div>
      </section>
    `;

    const scoreValue = this.root.querySelector<HTMLSpanElement>('[data-role="score"]');
    const livesValue = this.root.querySelector<HTMLSpanElement>('[data-role="lives"]');
    const pelletsValue = this.root.querySelector<HTMLSpanElement>('[data-role="pellets"]');
    const stateValue = this.root.querySelector<HTMLSpanElement>('[data-role="state"]');
    const ghostModeValue = this.root.querySelector<HTMLSpanElement>('[data-role="ghost-mode"]');
    const cameraValue = this.root.querySelector<HTMLSpanElement>('[data-role="camera"]');
    const messageValue = this.root.querySelector<HTMLDivElement>('[data-role="message"]');
    const hudPanel = this.root.querySelector<HTMLElement>('[data-role="hud-panel"]');
    const hudToggleButton = this.root.querySelector<HTMLButtonElement>('[data-role="hud-toggle"]');
    const overlay = this.root.querySelector<HTMLDivElement>('[data-role="overlay"]');
    const overlayCard = this.root.querySelector<HTMLDivElement>('[data-role="overlay-card"]');
    const overlayBadge = this.root.querySelector<HTMLSpanElement>('[data-role="overlay-badge"]');
    const overlayTitle = this.root.querySelector<HTMLHeadingElement>('[data-role="overlay-title"]');
    const overlayText = this.root.querySelector<HTMLParagraphElement>('[data-role="overlay-text"]');
    const overlayHint = this.root.querySelector<HTMLParagraphElement>('[data-role="overlay-hint"]');
    const controlConfig = this.root.querySelector<HTMLDivElement>('[data-role="control-config"]');
    const controlJoystickButton = this.root.querySelector<HTMLButtonElement>('[data-role="control-joystick"]');
    const controlDpadButton = this.root.querySelector<HTMLButtonElement>('[data-role="control-dpad"]');

    if (
      !scoreValue ||
      !livesValue ||
      !pelletsValue ||
      !stateValue ||
      !ghostModeValue ||
      !cameraValue ||
      !messageValue ||
      !hudPanel ||
      !hudToggleButton ||
      !overlay ||
      !overlayCard ||
      !overlayBadge ||
      !overlayTitle ||
      !overlayText ||
      !overlayHint ||
      !controlConfig ||
      !controlJoystickButton ||
      !controlDpadButton
    ) {
      throw new Error("Falha ao construir HUD.");
    }

    this.scoreValue = scoreValue;
    this.livesValue = livesValue;
    this.pelletsValue = pelletsValue;
    this.stateValue = stateValue;
    this.ghostModeValue = ghostModeValue;
    this.cameraValue = cameraValue;
    this.messageValue = messageValue;
    this.hudPanel = hudPanel;
    this.hudToggleButton = hudToggleButton;
    this.overlay = overlay;
    this.overlayCard = overlayCard;
    this.overlayBadge = overlayBadge;
    this.overlayTitle = overlayTitle;
    this.overlayText = overlayText;
    this.overlayHint = overlayHint;
    this.controlConfig = controlConfig;
    this.controlButtons = {
      joystick: controlJoystickButton,
      dpad: controlDpadButton,
    };
    this.onMobileControlSchemeChange = options.onMobileControlSchemeChange;
    this.mobileControlScheme = options.initialMobileControlScheme ?? "joystick";

    this.onToggleHudBound = () => this.toggleMobileHud();
    this.onControlJoystickBound = () => this.setMobileControlScheme("joystick", true);
    this.onControlDpadBound = () => this.setMobileControlScheme("dpad", true);

    this.hudToggleButton.addEventListener("click", this.onToggleHudBound);
    controlJoystickButton.addEventListener("click", this.onControlJoystickBound);
    controlDpadButton.addEventListener("click", this.onControlDpadBound);

    this.applyHudVisibilityState();
    this.refreshControlButtons();
    container.appendChild(this.root);
  }

  public update(snapshot: HUDSnapshot): void {
    this.scoreValue.textContent = snapshot.score.toString();
    this.livesValue.textContent = this.formatLives(snapshot.lives);
    this.pelletsValue.textContent = snapshot.pelletsRemaining.toString();
    this.stateValue.textContent = formatStateLabel(snapshot.state);
    this.ghostModeValue.textContent = snapshot.ghostMode;
    this.cameraValue.textContent = snapshot.cameraMode;
    this.messageValue.textContent = snapshot.message;

    if (snapshot.mobileControlScheme !== this.mobileControlScheme) {
      this.setMobileControlScheme(snapshot.mobileControlScheme, false);
    }

    this.updateOverlay(snapshot);
  }

  public dispose(): void {
    this.hudToggleButton.removeEventListener("click", this.onToggleHudBound);
    this.controlButtons.joystick.removeEventListener("click", this.onControlJoystickBound);
    this.controlButtons.dpad.removeEventListener("click", this.onControlDpadBound);
    this.root.remove();
  }

  private formatLives(lives: number): string {
    const livesSafe = Math.max(0, lives);
    const pips = "o".repeat(livesSafe);
    return pips ? `${livesSafe} (${pips})` : "0";
  }

  private updateOverlay(snapshot: HUDSnapshot): void {
    if (snapshot.state === "playing") {
      this.overlay.classList.add("is-hidden");
      this.overlayCard.classList.remove("intro-ready", "intro-danger", "intro-win", "intro-countdown");
      return;
    }

    this.overlay.classList.remove("is-hidden");
    this.overlayCard.classList.remove("intro-ready", "intro-danger", "intro-win", "intro-countdown");

    const canEditControl = true;
    this.controlConfig.classList.toggle("is-disabled", !canEditControl);
    this.controlButtons.joystick.disabled = !canEditControl;
    this.controlButtons.dpad.disabled = !canEditControl;

    if (snapshot.state === "countdown") {
      const countdown = Math.max(1, Math.ceil(snapshot.countdownRemaining));
      this.overlayCard.classList.add("intro-countdown");
      this.overlayBadge.textContent = "START";
      this.overlayTitle.textContent = countdown.toString();
      this.overlayText.textContent = "Observe o labirinto e ajuste o HUD antes do inicio.";
      this.overlayHint.textContent = "A rodada inicia automaticamente";
      return;
    }

    if (snapshot.state === "win") {
      this.overlayCard.classList.add("intro-win");
      this.overlayBadge.textContent = "WIN";
      this.overlayTitle.textContent = "Vitoria Total";
      this.overlayText.textContent = "Voce limpou o labirinto inteiro.";
      this.overlayHint.textContent = "Pressione Enter para jogar novamente";
      return;
    }

    if (snapshot.state === "gameover") {
      this.overlayCard.classList.add("intro-danger");
      this.overlayBadge.textContent = "GAME OVER";
      this.overlayTitle.textContent = "Fim de Jogo";
      this.overlayText.textContent = "Os fantasmas dominaram a arena.";
      this.overlayHint.textContent = "Pressione Enter para reiniciar";
      return;
    }

    this.overlayCard.classList.add("intro-ready");
    this.overlayBadge.textContent = "READY";
    this.overlayTitle.textContent = "PAC-MAN 3D";
    this.overlayText.textContent = snapshot.message;
    this.overlayHint.textContent = "Pressione Enter para iniciar";
  }

  private setMobileControlScheme(scheme: MobileControlScheme, notify: boolean): void {
    this.mobileControlScheme = scheme;
    this.refreshControlButtons();
    if (notify && this.onMobileControlSchemeChange) {
      this.onMobileControlSchemeChange(scheme);
    }
  }

  private refreshControlButtons(): void {
    for (const [scheme, button] of Object.entries(this.controlButtons) as Array<
      [MobileControlScheme, HTMLButtonElement]
    >) {
      const active = scheme === this.mobileControlScheme;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  private toggleMobileHud(): void {
    this.mobileHudHidden = !this.mobileHudHidden;
    this.applyHudVisibilityState();
  }

  private applyHudVisibilityState(): void {
    this.root.classList.toggle("hud-hidden-mobile", this.mobileHudHidden);
    this.hudPanel.setAttribute("aria-hidden", this.mobileHudHidden ? "true" : "false");
    this.hudToggleButton.textContent = this.mobileHudHidden ? "Mostrar HUD" : "Ocultar HUD";
    this.hudToggleButton.setAttribute(
      "aria-label",
      this.mobileHudHidden ? "Mostrar barra de progresso" : "Ocultar barra de progresso",
    );
  }
}
