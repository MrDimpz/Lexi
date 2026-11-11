import { EventManager } from './eventManager.ts';

export type RoundStatus = 'IDLE' | 'COUNTDOWN' | 'ACTIVE' | 'PAUSED' | 'ROUND_END' | 'INTERMISSION';

export interface RoundConfig {
  roundDuration: number;
  prepDuration: number;
  intermissionDuration: number;
  autoNextRound: boolean;
}

export class RoundManager {
  private status: RoundStatus = 'IDLE';
  private roundNumber = 1;
  private nextRoundResetsToLevelOne = false;
  private remainingSeconds = 120;
  private countdownSeconds = 0;
  private intermissionSeconds = 0;
  private timerInterval: NodeJS.Timeout | null = null;
  private eventManager: EventManager;
  private onRoundStartCallback: (() => void) | null = null;
  private onRoundEndCallback: ((reason: string) => void) | null = null;
  private onPrepareNextRoundCallback: (() => void) | null = null;

  constructor(eventManager: EventManager) {
    this.eventManager = eventManager;
  }

  public registerCallbacks(callbacks: {
    onRoundStart: () => void;
    onRoundEnd: (reason: string) => void;
    onPrepareNextRound: () => void;
  }): void {
    this.onRoundStartCallback = callbacks.onRoundStart;
    this.onRoundEndCallback = callbacks.onRoundEnd;
    this.onPrepareNextRoundCallback = callbacks.onPrepareNextRound;
  }

  public getStatus(): RoundStatus {
    return this.status;
  }

  public getRoundNumber(): number {
    return this.roundNumber;
  }

  public setRoundNumber(num: number): void {
    this.roundNumber = Math.max(1, num);
  }

  public setNextRoundResetsToLevelOne(reset: boolean): void {
    this.nextRoundResetsToLevelOne = reset;
  }

  public getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  public getCountdownSeconds(): number {
    return this.countdownSeconds;
  }

  public getIntermissionSeconds(): number {
    return this.intermissionSeconds;
  }

  public clearTimers(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  public startCountdownAndRound(config: RoundConfig, incrementRound = false): void {
    this.clearTimers();
    if (this.nextRoundResetsToLevelOne) {
      this.roundNumber = 1;
      this.nextRoundResetsToLevelOne = false;
    } else if (incrementRound) {
      this.roundNumber += 1;
    }

    const prep = Math.max(0, config.prepDuration ?? 3);
    this.remainingSeconds = Math.max(15, config.roundDuration || 120);

    if (prep <= 0) {
      this.beginActiveRound(config);
      return;
    }

    this.status = 'COUNTDOWN';
    this.countdownSeconds = prep;

    if (this.onPrepareNextRoundCallback) {
      this.onPrepareNextRoundCallback();
    }

    this.eventManager.emitGameEvent('round:countdown', {
      roundNumber: this.roundNumber,
      countdownSeconds: this.countdownSeconds,
      status: this.status,
    });

    this.timerInterval = setInterval(() => {
      if (this.status !== 'COUNTDOWN') return;
      this.countdownSeconds -= 1;
      if (this.countdownSeconds <= 0) {
        this.clearTimers();
        this.beginActiveRound(config);
      } else {
        this.eventManager.emitGameEvent('round:countdown', {
          roundNumber: this.roundNumber,
          countdownSeconds: this.countdownSeconds,
          status: this.status,
        });
      }
    }, 1000);
  }

  private beginActiveRound(config: RoundConfig): void {
    this.clearTimers();
    this.status = 'ACTIVE';
    this.remainingSeconds = Math.max(15, config.roundDuration || 120);

    if (this.onRoundStartCallback) {
      this.onRoundStartCallback();
    }

    this.timerInterval = setInterval(() => {
      // Authoritative server-side pause check: do not decrement when PAUSED
      if (this.status !== 'ACTIVE') return;

      this.remainingSeconds = Math.max(0, this.remainingSeconds - 1);
      const isFinalCountdown = this.remainingSeconds <= 10 && this.remainingSeconds > 0;

      this.eventManager.emitGameEvent('round:timer', {
        roundNumber: this.roundNumber,
        remainingSeconds: this.remainingSeconds,
        status: this.status,
        isFinalCountdown,
      });

      if (this.remainingSeconds <= 0) {
        this.endRound('TIME_EXPIRED', config);
      }
    }, 1000);
  }

  public pauseRound(): boolean {
    if (this.status !== 'ACTIVE') return false;
    this.status = 'PAUSED';
    this.eventManager.emitGameEvent('game:paused', {
      roundNumber: this.roundNumber,
      remainingSeconds: this.remainingSeconds,
      status: this.status,
    });
    return true;
  }

  public resumeRound(): boolean {
    if (this.status !== 'PAUSED') return false;
    this.status = 'ACTIVE';
    this.eventManager.emitGameEvent('game:resumed', {
      roundNumber: this.roundNumber,
      remainingSeconds: this.remainingSeconds,
      status: this.status,
    });
    return true;
  }

  public addTime(seconds: number): number {
    if (this.status === 'ACTIVE' || this.status === 'PAUSED') {
      this.remainingSeconds = Math.max(1, this.remainingSeconds + seconds);
      this.eventManager.emitGameEvent('round:timer', {
        roundNumber: this.roundNumber,
        remainingSeconds: this.remainingSeconds,
        status: this.status,
        isFinalCountdown: this.remainingSeconds <= 10,
        timeAdded: seconds,
      });
    }
    return this.remainingSeconds;
  }

  public endRound(reason: string, config: RoundConfig): void {
    if (this.status === 'ROUND_END' || this.status === 'INTERMISSION') return;
    this.clearTimers();
    this.status = 'ROUND_END';

    if (this.onRoundEndCallback) {
      this.onRoundEndCallback(reason);
    }

    if (config.autoNextRound) {
      this.intermissionSeconds = Math.max(5, config.intermissionDuration || 10);
      this.status = 'INTERMISSION';
      this.timerInterval = setInterval(() => {
        if (this.status !== 'INTERMISSION') return;
        this.intermissionSeconds -= 1;
        this.eventManager.emitGameEvent('round:timer', {
          roundNumber: this.roundNumber,
          remainingSeconds: 0,
          intermissionSeconds: this.intermissionSeconds,
          status: this.status,
        });
        if (this.intermissionSeconds <= 0) {
          this.clearTimers();
          this.startCountdownAndRound(config, true);
        }
      }, 1000);
    }
  }

  public resetToIdle(defaultDuration = 120): void {
    this.clearTimers();
    this.status = 'IDLE';
    this.roundNumber = 1;
    this.remainingSeconds = defaultDuration;
    this.countdownSeconds = 0;
    this.intermissionSeconds = 0;
  }
}
