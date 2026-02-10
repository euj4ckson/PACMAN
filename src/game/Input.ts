import type { Direction } from "./Utils";

function keyToDirection(code: string): Direction | null {
  switch (code) {
    case "ArrowUp":
    case "KeyW":
      return "up";
    case "ArrowDown":
    case "KeyS":
      return "down";
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
    default:
      return null;
  }
}

export class Input {
  private readonly target: Window;
  private readonly container: HTMLElement;
  private readonly coarsePointer: boolean;
  private bufferedDirection: Direction | null = null;
  private startRequested = false;
  private cameraToggleRequested = false;
  private readonly cleanups: Array<() => void> = [];
  private touchControlsRoot: HTMLDivElement | null = null;
  private swipeStart:
    | {
        pointerId: number;
        x: number;
        y: number;
      }
    | null = null;
  private swipeLastDirection: Direction | null = null;
  private readonly swipeThreshold = 18;

  private readonly onKeyDownBound: (event: KeyboardEvent) => void;

  constructor(container: HTMLElement, target: Window = window) {
    this.container = container;
    this.target = target;
    this.coarsePointer = this.target.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    this.onKeyDownBound = (event) => this.onKeyDown(event);
    this.listen(this.target, "keydown", this.onKeyDownBound);
    this.createTouchControls();
    this.createSwipeInput();
  }

  public consumeDirectionPress(): Direction | null {
    const direction = this.bufferedDirection;
    this.bufferedDirection = null;
    return direction;
  }

  public consumeStartPress(): boolean {
    if (!this.startRequested) {
      return false;
    }
    this.startRequested = false;
    return true;
  }

  public consumeCameraTogglePress(): boolean {
    if (!this.cameraToggleRequested) {
      return false;
    }
    this.cameraToggleRequested = false;
    return true;
  }

  public dispose(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups.length = 0;

    if (this.touchControlsRoot) {
      this.touchControlsRoot.remove();
      this.touchControlsRoot = null;
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    const direction = keyToDirection(event.code);
    if (direction) {
      event.preventDefault();
      this.bufferedDirection = direction;
      return;
    }

    if (event.code === "Enter") {
      event.preventDefault();
      this.startRequested = true;
      return;
    }

    if (event.code === "KeyC" && !event.repeat) {
      event.preventDefault();
      this.cameraToggleRequested = true;
    }
  }

  private createTouchControls(): void {
    const root = document.createElement("div");
    root.className = "touch-controls";
    root.innerHTML = `
      <div class="touch-panel touch-dpad">
        <div class="touch-dpad-grid">
          <span></span>
          <button type="button" data-dir="up" aria-label="Mover para cima">&#9650;</button>
          <span></span>
          <button type="button" data-dir="left" aria-label="Mover para esquerda">&#9664;</button>
          <span class="touch-center">o</span>
          <button type="button" data-dir="right" aria-label="Mover para direita">&#9654;</button>
          <span></span>
          <button type="button" data-dir="down" aria-label="Mover para baixo">&#9660;</button>
          <span></span>
        </div>
      </div>
      <div class="touch-panel touch-actions">
        <button type="button" data-action="start" aria-label="Iniciar ou reiniciar">START</button>
        <button type="button" data-action="camera" aria-label="Alternar camera">CAM</button>
      </div>
    `;

    this.touchControlsRoot = root;
    this.container.appendChild(root);

    this.listen(root, "contextmenu", (event: Event) => {
      event.preventDefault();
    });

    const directionButtons = root.querySelectorAll<HTMLButtonElement>("[data-dir]");
    for (const button of directionButtons) {
      const dir = button.dataset.dir as Direction | undefined;
      if (dir) {
        this.bindDirectionButton(button, dir);
      }
    }

    const actionButtons = root.querySelectorAll<HTMLButtonElement>("[data-action]");
    for (const button of actionButtons) {
      const action = button.dataset.action;
      if (action === "start") {
        this.bindActionButton(button, () => {
          this.startRequested = true;
        });
      } else if (action === "camera") {
        this.bindActionButton(button, () => {
          this.cameraToggleRequested = true;
        });
      }
    }
  }

  private bindDirectionButton(button: HTMLButtonElement, direction: Direction): void {
    let holdIntervalId: number | null = null;

    const queueDirection = () => {
      this.bufferedDirection = direction;
    };

    const stopHolding = () => {
      if (holdIntervalId !== null) {
        window.clearInterval(holdIntervalId);
        holdIntervalId = null;
      }
      button.classList.remove("is-active");
    };

    this.listen(button, "pointerdown", (event: PointerEvent) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      queueDirection();
      this.vibrate(8);
      stopHolding();
      holdIntervalId = window.setInterval(queueDirection, 90);
      button.classList.add("is-active");
    });

    this.listen(button, "pointerup", (event: PointerEvent) => {
      event.preventDefault();
      stopHolding();
    });
    this.listen(button, "pointercancel", stopHolding);
    this.listen(button, "pointerleave", stopHolding);
  }

  private bindActionButton(button: HTMLButtonElement, action: () => void): void {
    const press = (event: PointerEvent) => {
      event.preventDefault();
      button.classList.add("is-active");
      this.vibrate(12);
      action();
      window.setTimeout(() => button.classList.remove("is-active"), 120);
    };

    this.listen(button, "pointerdown", press);
  }

  private createSwipeInput(): void {
    if (!this.coarsePointer) {
      return;
    }

    this.listen(this.container, "pointerdown", (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      if (this.isInsideUiElement(event.target)) {
        return;
      }

      this.swipeStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      this.swipeLastDirection = null;
    });

    this.listen(this.container, "pointermove", (event: PointerEvent) => {
      if (!this.swipeStart || event.pointerId !== this.swipeStart.pointerId) {
        return;
      }

      const deltaX = event.clientX - this.swipeStart.x;
      const deltaY = event.clientY - this.swipeStart.y;
      const direction = this.resolveSwipeDirection(deltaX, deltaY);
      if (!direction) {
        return;
      }

      if (direction !== this.swipeLastDirection) {
        this.bufferedDirection = direction;
        this.swipeLastDirection = direction;
        this.vibrate(8);
      }

      // Permite encadear mudancas de direcao no mesmo gesto.
      this.swipeStart.x = event.clientX;
      this.swipeStart.y = event.clientY;
    });

    this.listen(this.container, "pointerup", (event: PointerEvent) => {
      if (!this.swipeStart || event.pointerId !== this.swipeStart.pointerId) {
        return;
      }

      const deltaX = event.clientX - this.swipeStart.x;
      const deltaY = event.clientY - this.swipeStart.y;
      this.swipeStart = null;
      this.swipeLastDirection = null;

      const direction = this.resolveSwipeDirection(deltaX, deltaY);
      if (direction) {
        this.bufferedDirection = direction;
        this.vibrate(10);
      }
    });

    this.listen(this.container, "pointercancel", () => {
      this.swipeStart = null;
      this.swipeLastDirection = null;
    });
  }

  private isInsideUiElement(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.closest(".touch-controls, .hud, .hud-visibility-toggle, .intro-overlay") !== null;
  }

  private vibrate(durationMs: number): void {
    if (!this.coarsePointer) {
      return;
    }

    if ("vibrate" in navigator) {
      navigator.vibrate(durationMs);
    }
  }

  private resolveSwipeDirection(deltaX: number, deltaY: number): Direction | null {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (Math.max(absX, absY) < this.swipeThreshold) {
      return null;
    }

    if (absX > absY) {
      return deltaX > 0 ? "right" : "left";
    }
    return deltaY > 0 ? "down" : "up";
  }

  private listen<K extends keyof WindowEventMap>(
    target: Window,
    eventName: K,
    callback: (event: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    eventName: K,
    callback: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  private listen(
    target: Window | HTMLElement,
    eventName: string,
    callback: (event: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(eventName, callback as EventListener, options);
    this.cleanups.push(() => target.removeEventListener(eventName, callback as EventListener, options));
  }
}
