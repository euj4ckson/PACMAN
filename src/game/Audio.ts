type ToneShape = OscillatorType;

export class GameAudio {
  private context: AudioContext | null = null;
  private enabled = true;

  public unlock(): void {
    if (!this.enabled) {
      return;
    }

    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        this.enabled = false;
        return;
      }
    }

    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  public playPellet(): void {
    this.playTone(860, 0.05, "square", 0.02);
  }

  public playPowerPellet(): void {
    this.playTone(420, 0.09, "sawtooth", 0.03);
    this.playTone(640, 0.11, "sawtooth", 0.025, 0.07);
  }

  public playGhostEaten(): void {
    this.playTone(260, 0.07, "triangle", 0.04);
    this.playTone(180, 0.12, "triangle", 0.035, 0.08);
  }

  public playDeath(): void {
    this.playTone(280, 0.15, "square", 0.04);
    this.playTone(190, 0.17, "square", 0.03, 0.12);
    this.playTone(120, 0.24, "square", 0.025, 0.22);
  }

  public playWin(): void {
    this.playTone(520, 0.12, "triangle", 0.03);
    this.playTone(720, 0.12, "triangle", 0.03, 0.11);
    this.playTone(940, 0.16, "triangle", 0.03, 0.23);
  }

  private playTone(
    frequency: number,
    durationSeconds: number,
    shape: ToneShape,
    volume: number,
    offsetSeconds = 0,
  ): void {
    if (!this.context || this.context.state !== "running") {
      return;
    }

    const now = this.context.currentTime + offsetSeconds;
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, now);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.start(now);
    oscillator.stop(now + durationSeconds);
  }
}
