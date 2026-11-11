export type SoundKey =
  | 'gameStart'
  | 'countdown'
  | 'validWord'
  | 'invalidWord'
  | 'highScore'
  | 'giftReceived'
  | 'newFollower'
  | 'milestone'
  | 'roundEnd'
  | 'victory';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterVolume = 0.7;
  private muted = false;
  private enabledSounds: Record<string, boolean> = {
    gameStart: true,
    countdown: true,
    validWord: true,
    invalidWord: true,
    highScore: true,
    giftReceived: true,
    newFollower: true,
    milestone: true,
    roundEnd: true,
    victory: true,
  };

  public configure(audioConfig?: {
    masterVolume?: number;
    muted?: boolean;
    sounds?: Record<string, boolean>;
  }): void {
    if (!audioConfig) return;
    if (typeof audioConfig.masterVolume === 'number') {
      this.masterVolume = Math.max(0, Math.min(1, audioConfig.masterVolume));
    }
    if (typeof audioConfig.muted === 'boolean') {
      this.muted = audioConfig.muted;
    }
    if (audioConfig.sounds) {
      this.enabledSounds = { ...this.enabledSounds, ...audioConfig.sounds };
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    delaySec = 0,
    gainScale = 0.25
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const peakGain = Math.max(0.001, this.masterVolume * gainScale);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public play(key: SoundKey, extraPitchShift = 0): void {
    if (this.muted || this.masterVolume <= 0.01) return;
    if (this.enabledSounds[key] === false) return;

    try {
      switch (key) {
        case 'gameStart':
          this.playTone(440, 0.12, 'triangle', 0, 0.22);
          this.playTone(554.37, 0.12, 'triangle', 0.08, 0.22);
          this.playTone(659.25, 0.22, 'triangle', 0.16, 0.25);
          break;
        case 'countdown':
          this.playTone(extraPitchShift > 0 ? 880 : 660, 0.09, 'sine', 0, 0.18);
          break;
        case 'validWord': {
          const base = 523.25 + Math.min(200, extraPitchShift * 30);
          this.playTone(base, 0.11, 'triangle', 0, 0.24);
          this.playTone(base * 1.25, 0.14, 'triangle', 0.06, 0.24);
          this.playTone(base * 1.5, 0.2, 'sine', 0.12, 0.26);
          break;
        }
        case 'invalidWord':
          this.playTone(190, 0.14, 'sawtooth', 0, 0.15);
          this.playTone(155, 0.18, 'sawtooth', 0.08, 0.15);
          break;
        case 'highScore':
          this.playTone(587.33, 0.1, 'triangle', 0, 0.25);
          this.playTone(739.99, 0.1, 'triangle', 0.08, 0.25);
          this.playTone(880, 0.12, 'triangle', 0.16, 0.25);
          this.playTone(1174.66, 0.28, 'sine', 0.24, 0.28);
          break;
        case 'giftReceived':
          this.playTone(523.25, 0.1, 'sine', 0, 0.25);
          this.playTone(659.25, 0.1, 'sine', 0.06, 0.25);
          this.playTone(783.99, 0.12, 'sine', 0.12, 0.26);
          this.playTone(1046.5, 0.3, 'triangle', 0.18, 0.3);
          break;
        case 'newFollower':
          this.playTone(587.33, 0.12, 'sine', 0, 0.2);
          this.playTone(880, 0.22, 'triangle', 0.09, 0.22);
          break;
        case 'milestone':
          this.playTone(440, 0.12, 'triangle', 0, 0.25);
          this.playTone(659.25, 0.12, 'triangle', 0.09, 0.25);
          this.playTone(880, 0.28, 'triangle', 0.18, 0.28);
          break;
        case 'roundEnd':
          this.playTone(659.25, 0.15, 'sine', 0, 0.22);
          this.playTone(523.25, 0.15, 'sine', 0.12, 0.22);
          this.playTone(392.0, 0.3, 'triangle', 0.24, 0.25);
          break;
        case 'victory':
          this.playTone(523.25, 0.12, 'triangle', 0, 0.26);
          this.playTone(659.25, 0.12, 'triangle', 0.1, 0.26);
          this.playTone(783.99, 0.12, 'triangle', 0.2, 0.26);
          this.playTone(1046.5, 0.35, 'triangle', 0.3, 0.3);
          break;
      }
    } catch {
      // Ignore browser autoplay restrictions prior to first gesture
    }
  }
}

export const soundEngine = new SoundEngine();
