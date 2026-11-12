import fs from 'fs';
import path from 'path';
import { eventManager, EventManager } from './eventManager.ts';
import { wordValidator, WordValidator } from './wordValidator.ts';
import { LetterGenerator, GeneratedBoard, DifficultyLevel, BoardModifiers } from './letterGenerator.ts';
import { scoringEngine, ScoringEngine, WordScoreBreakdown } from './scoringEngine.ts';
import { leaderboardManager, LeaderboardManager } from './leaderboard.ts';
import { RoundManager } from './roundManager.ts';

export interface DiscoveredWordEntry {
  word: string;
  foundByUserId: string;
  foundByUsername: string;
  foundByNickname: string;
  foundByAvatar?: string;
  points: number;
  timestamp: number;
  isPangram: boolean;
  isRareWord: boolean;
  comboCount: number;
  usedTileIndices: number[];
}

export interface DifficultyPreset {
  name: string;
  description: string;
  durationModifierSeconds: number;
  minWordLengthOverride: number;
  targetScoreMultiplier: number;
  letterComplexity: string;
  extraModifiers: {
    maxHidden: number;
    maxDecoys: number;
    maxLocked: number;
  };
}

export interface PerformanceMetrics {
  wordsPerMinute: number;
  submissionAccuracy: number;
  targetCompletionRatio: number;
  roundTotalSubmissions: number;
  roundValidSubmissions: number;
  lastAdaptationNotice: string | null;
  engagementScore: number;
}

export interface GameConfig {
  gameMode: string;
  difficulty: DifficultyLevel;
  autoDifficulty: boolean;
  progressiveElementsEnabled: boolean;
  roundDuration: number;
  prepDuration: number;
  boardSize: number;
  minWordLength: number;
  maxWordLength: number;
  mandatoryCenterLetter: boolean;
  autoNextRound: boolean;
  intermissionDuration: number;
  targetScoreBase: number;
  targetScoreIncrement: number;
  submissionCooldownMs: number;
  allowChatSubmissions: boolean;
  commandPrefix: string;
  requirePrefixForWords: boolean;
  enabledCommands: Record<string, boolean>;
  difficulties: Record<DifficultyLevel, DifficultyPreset>;
  modes: Record<
    string,
    {
      name: string;
      description: string;
      roundDuration: number;
      boardSize: number;
      minWordLength: number;
      mandatoryCenterLetter: boolean;
      targetScoreBase: number;
    }
  >;
}

export interface SettingsConfig {
  tiktok: {
    username: string;
    apiKey?: string;
    autoReconnect: boolean;
    reconnectIntervalMs: number;
    enableChatEvents: boolean;
    enableGiftEvents: boolean;
    enableLikeEvents: boolean;
    enableFollowEvents: boolean;
    enableShareEvents: boolean;
  };
  moderation: {
    blockedUsers: string[];
    excludedWords: string[];
    customWords: string[];
  };
  audio: {
    masterVolume: number;
    muted: boolean;
    sounds: Record<string, boolean>;
  };
  overlay: {
    theme: string;
    scale: number;
    transparentBackground: boolean;
    showChatFeed: boolean;
    showLeaderboard: boolean;
    width: number;
    height: number;
  };
}

const DIFFICULTY_ORDER: DifficultyLevel[] = ['easy', 'medium', 'hard', 'extreme'];

export class GameEngine {
  private gameConfigPath: string;
  private settingsConfigPath: string;
  private gameConfig!: GameConfig;
  private settingsConfig!: SettingsConfig;

  private events: EventManager;
  private validator: WordValidator;
  private letterGen: LetterGenerator;
  private scorer: ScoringEngine;
  private leaderboard: LeaderboardManager;
  private rounds: RoundManager;

  private currentBoard: GeneratedBoard;
  private discoveredWordsMap: Map<string, DiscoveredWordEntry> = new Map();
  private revealedHints: string[] = [];
  private revealedHintWords: Set<string> = new Set();
  private roundScore = 0;
  private targetScore = 120;
  private roundLikes = 0;
  private lastLikeMilestone = 0;
  private userCooldownMap: Map<string, number> = new Map();

  // Real-time viewer performance & adaptive difficulty tracking
  private roundStartedAt = Date.now();
  private roundTotalSubmissions = 0;
  private roundValidSubmissions = 0;
  private lastAdaptationNotice: string | null = null;

  private chatFeed: Array<{
    id: string;
    userId: string;
    username: string;
    nickname: string;
    avatarUrl?: string;
    text: string;
    status: 'accepted' | 'rejected' | 'command' | 'chat';
    reason?: string;
    points?: number;
    simulated?: boolean;
    timestamp: number;
  }> = [];

  constructor() {
    this.gameConfigPath = path.resolve(process.cwd(), 'config/game.json');
    this.settingsConfigPath = path.resolve(process.cwd(), 'config/settings.json');
    this.events = eventManager;
    this.validator = wordValidator;
    this.letterGen = new LetterGenerator(this.validator);
    this.scorer = scoringEngine;
    this.leaderboard = leaderboardManager;
    this.rounds = new RoundManager(this.events);

    this.loadConfigs();

    this.currentBoard = this.letterGen.generateBoard({
      boardSize: this.gameConfig.boardSize,
      minWordLength: this.getEffectiveMinWordLength(),
      maxWordLength: this.gameConfig.maxWordLength,
      mandatoryCenterLetter: this.gameConfig.mandatoryCenterLetter,
      difficulty: this.gameConfig.difficulty,
      roundNumber: 1,
      progressiveElementsEnabled: this.gameConfig.progressiveElementsEnabled,
    });

    this.rounds.registerCallbacks({
      onPrepareNextRound: () => this.prepareBoardForRound(),
      onRoundStart: () => this.handleRoundStarted(),
      onRoundEnd: (reason) => this.handleRoundEnded(reason),
    });

    this.startRound(false);
  }

  public loadConfigs(): void {
    try {
      const loaded = JSON.parse(fs.readFileSync(this.gameConfigPath, 'utf-8'));
      this.gameConfig = {
        ...loaded,
        difficulty: loaded.difficulty || 'medium',
        autoDifficulty: loaded.autoDifficulty ?? true,
        progressiveElementsEnabled: loaded.progressiveElementsEnabled ?? true,
      };
    } catch (err) {
      console.error('Error loading game.json:', err);
    }

    try {
      this.settingsConfig = JSON.parse(fs.readFileSync(this.settingsConfigPath, 'utf-8'));
      this.validator.updateModerationLists(
        this.settingsConfig.moderation.customWords,
        this.settingsConfig.moderation.excludedWords
      );
    } catch (err) {
      console.error('Error loading settings.json:', err);
    }
  }

  public getEffectiveRoundDuration(): number {
    const base = this.gameConfig.roundDuration || 120;
    const diffPreset = this.gameConfig.difficulties?.[this.gameConfig.difficulty];
    const mod = diffPreset?.durationModifierSeconds || 0;
    return Math.max(30, base + mod);
  }

  public getEffectiveMinWordLength(): number {
    const base = this.gameConfig.minWordLength || 3;
    const diffPreset = this.gameConfig.difficulties?.[this.gameConfig.difficulty];
    if (diffPreset && diffPreset.minWordLengthOverride) {
      return Math.max(base, diffPreset.minWordLengthOverride);
    }
    return base;
  }

  public updateGameConfig(partial: Partial<GameConfig>): GameConfig {
    const prevDifficulty = this.gameConfig.difficulty;
    const prevProgressive = this.gameConfig.progressiveElementsEnabled;

    if (partial.gameMode && this.gameConfig.modes[partial.gameMode]) {
      const modePreset = this.gameConfig.modes[partial.gameMode];
      this.gameConfig = {
        ...this.gameConfig,
        ...partial,
        roundDuration: partial.roundDuration ?? modePreset.roundDuration,
        boardSize: partial.boardSize ?? modePreset.boardSize,
        minWordLength: partial.minWordLength ?? modePreset.minWordLength,
        mandatoryCenterLetter: partial.mandatoryCenterLetter ?? modePreset.mandatoryCenterLetter,
        targetScoreBase: partial.targetScoreBase ?? modePreset.targetScoreBase,
      };
    } else {
      this.gameConfig = {
        ...this.gameConfig,
        ...partial,
        enabledCommands: {
          ...this.gameConfig.enabledCommands,
          ...(partial.enabledCommands || {}),
        },
      };
    }

    // If difficulty changed manually, regenerate board modifiers or update target score immediately
    if (
      (partial.difficulty && partial.difficulty !== prevDifficulty) ||
      (partial.progressiveElementsEnabled !== undefined && partial.progressiveElementsEnabled !== prevProgressive)
    ) {
      const diffName = this.gameConfig.difficulties?.[this.gameConfig.difficulty]?.name || this.gameConfig.difficulty;
      this.lastAdaptationNotice = `Host set difficulty to ${diffName.toUpperCase()}.`;
      this.recalculateTargetScore();
    }

    fs.writeFileSync(this.gameConfigPath, JSON.stringify(this.gameConfig, null, 2));
    this.events.emitGameEvent('config:updated', {
      gameConfig: this.gameConfig,
      settingsConfig: this.settingsConfig,
      scoringConfig: this.scorer.getConfig(),
    });
    return this.gameConfig;
  }

  public updateSettingsConfig(partial: Partial<SettingsConfig>): SettingsConfig {
    this.settingsConfig = {
      ...this.settingsConfig,
      ...partial,
      tiktok: { ...this.settingsConfig.tiktok, ...(partial.tiktok || {}) },
      moderation: { ...this.settingsConfig.moderation, ...(partial.moderation || {}) },
      audio: {
        ...this.settingsConfig.audio,
        ...(partial.audio || {}),
        sounds: {
          ...this.settingsConfig.audio.sounds,
          ...(partial.audio?.sounds || {}),
        },
      },
      overlay: { ...this.settingsConfig.overlay, ...(partial.overlay || {}) },
    };

    this.validator.updateModerationLists(
      this.settingsConfig.moderation.customWords,
      this.settingsConfig.moderation.excludedWords
    );

    fs.writeFileSync(this.settingsConfigPath, JSON.stringify(this.settingsConfig, null, 2));
    this.events.emitGameEvent('config:updated', {
      gameConfig: this.gameConfig,
      settingsConfig: this.settingsConfig,
      scoringConfig: this.scorer.getConfig(),
    });
    return this.settingsConfig;
  }

  private recalculateTargetScore(): void {
    const roundNum = this.rounds.getRoundNumber();
    const rawTarget =
      (this.gameConfig.targetScoreBase || 120) +
      Math.max(0, roundNum - 1) * (this.gameConfig.targetScoreIncrement || 35);
    const mult = this.gameConfig.difficulties?.[this.gameConfig.difficulty]?.targetScoreMultiplier || 1.0;
    this.targetScore = Math.round(rawTarget * mult);
  }

  private prepareBoardForRound(): void {
    this.discoveredWordsMap.clear();
    this.revealedHints = [];
    this.revealedHintWords.clear();
    this.roundScore = 0;
    this.roundTotalSubmissions = 0;
    this.roundValidSubmissions = 0;
    this.roundStartedAt = Date.now();
    this.scorer.resetRoundState();
    this.leaderboard.resetRoundStats();

    const roundNum = this.rounds.getRoundNumber();
    this.recalculateTargetScore();

    this.currentBoard = this.letterGen.generateBoard({
      boardSize: this.gameConfig.boardSize,
      minWordLength: this.getEffectiveMinWordLength(),
      maxWordLength: this.gameConfig.maxWordLength,
      mandatoryCenterLetter: this.gameConfig.mandatoryCenterLetter,
      difficulty: this.gameConfig.difficulty,
      roundNumber: roundNum,
      progressiveElementsEnabled: this.gameConfig.progressiveElementsEnabled,
    });

    this.events.emitGameEvent('board:generated', {
      roundNumber: roundNum,
      letters: this.getPublicBoardLetters(),
      centerLetter: this.currentBoard.centerLetter,
      centerIndex: this.currentBoard.centerIndex,
      totalPossibleWords: this.currentBoard.possibleWords.length,
      pangramCount: this.currentBoard.pangrams.length,
      targetScore: this.targetScore,
      difficulty: this.currentBoard.difficulty,
      modifiers: this.currentBoard.modifiers,
      wordSlots: this.getPublicWordSlots(),
    });
  }

  /**
   * Returns the board letters array where unrevealed Hidden Tiles are masked as '?'
   */
  public getPublicBoardLetters(): string[] {
    const mod = this.currentBoard.modifiers;
    return this.currentBoard.letters.map((ch, idx) => {
      if (mod.hiddenIndices.includes(idx) && !mod.revealedHiddenIndices.includes(idx)) {
        return '?';
      }
      return ch;
    });
  }

  public getPublicWordSlots() {
    const sorted = [...this.currentBoard.possibleWords].sort(
      (a, b) => a.length - b.length || a.localeCompare(b)
    );
    return sorted.map((rawWord, idx) => {
      const lower = rawWord.toLowerCase();
      const upper = rawWord.toUpperCase();
      const found = this.discoveredWordsMap.get(lower);
      const isHinted = this.revealedHintWords.has(upper);
      const hintMask = isHinted
        ? upper.split('').map((ch, i) => (i === 0 || i === upper.length - 1 ? ch : ''))
        : null;

      return {
        id: `slot-${idx}-${upper.length}`,
        length: upper.length,
        discovered: Boolean(found),
        word: found ? found.word : null,
        points: found ? found.points : null,
        isPangram: found ? found.isPangram : upper.length === this.currentBoard.coreLetters.length,
        hintMask,
      };
    });
  }

  private handleRoundStarted(): void {
    this.roundStartedAt = Date.now();
    this.events.emitGameEvent('round:started', {
      roundNumber: this.rounds.getRoundNumber(),
      remainingSeconds: this.rounds.getRemainingSeconds(),
      letters: this.getPublicBoardLetters(),
      centerLetter: this.currentBoard.centerLetter,
      centerIndex: this.currentBoard.centerIndex,
      targetScore: this.targetScore,
      totalPossibleWords: this.currentBoard.possibleWords.length,
      status: this.rounds.getStatus(),
      difficulty: this.currentBoard.difficulty,
      modifiers: this.currentBoard.modifiers,
      wordSlots: this.getPublicWordSlots(),
    });
  }

  /**
   * Evaluates viewer performance at the end of a round and adapts difficulty if `autoDifficulty` is enabled.
   */
  private evaluateAutoDifficultyAdaptation(): void {
    if (!this.gameConfig.autoDifficulty) return;

    const metrics = this.getPerformanceMetrics();
    const currentIdx = DIFFICULTY_ORDER.indexOf(this.gameConfig.difficulty);
    if (currentIdx === -1) return;

    let nextIdx = currentIdx;
    let reason = '';

    if (
      (metrics.targetCompletionRatio >= 1.25 ||
        (metrics.targetCompletionRatio >= 1.0 && metrics.wordsPerMinute >= 8)) &&
      currentIdx < DIFFICULTY_ORDER.length - 1
    ) {
      nextIdx = currentIdx + 1;
      reason = `High viewer performance (${Math.round(metrics.targetCompletionRatio * 100)}% of target, ${metrics.wordsPerMinute} WPM) — Auto-scaled difficulty UP to ${DIFFICULTY_ORDER[nextIdx].toUpperCase()}!`;
    } else if (metrics.targetCompletionRatio < 0.6 && currentIdx > 0) {
      nextIdx = currentIdx - 1;
      reason = `Tough round (${Math.round(metrics.targetCompletionRatio * 100)}% of target) — Auto-adjusted difficulty DOWN to ${DIFFICULTY_ORDER[nextIdx].toUpperCase()} for better stream flow!`;
    } else {
      reason = `Balanced stream pace (${Math.round(metrics.targetCompletionRatio * 100)}% target, ${metrics.wordsPerMinute} WPM) — Maintaining ${this.gameConfig.difficulty.toUpperCase()} difficulty.`;
    }

    this.lastAdaptationNotice = reason;

    if (nextIdx !== currentIdx) {
      const newDifficulty = DIFFICULTY_ORDER[nextIdx];
      this.gameConfig.difficulty = newDifficulty;
      fs.writeFileSync(this.gameConfigPath, JSON.stringify(this.gameConfig, null, 2));

      this.events.emitGameEvent('difficulty:adapted', {
        previousDifficulty: DIFFICULTY_ORDER[currentIdx],
        newDifficulty,
        reason,
        metrics,
      });
    }
  }

  private handleRoundEnded(reason: string): void {
    const roundNumber = this.rounds.getRoundNumber();
    const missedWords = this.currentBoard.possibleWords
      .filter((w) => !this.discoveredWordsMap.has(w))
      .map((w) => w.toUpperCase());

    const targetReached =
      this.roundScore >= this.targetScore ||
      this.discoveredWordsMap.size >= this.currentBoard.possibleWords.length;

    // If the goal is not met, restart from Level 1 on the next round
    this.rounds.setNextRoundResetsToLevelOne(!targetReached);

    // Reveal all remaining hidden or decoy tiles at the end of the round
    this.currentBoard.modifiers.revealedHiddenIndices = [...this.currentBoard.modifiers.hiddenIndices];
    this.currentBoard.modifiers.exposedDecoyIndices = [...this.currentBoard.modifiers.decoyIndices];

    this.evaluateAutoDifficultyAdaptation();
    if (!targetReached) {
      this.lastAdaptationNotice = `Goal not met (${this.roundScore}/${this.targetScore} pts) — Restarting from Level 1!`;
    }

    this.leaderboard.recordRoundCompleted({
      roundNumber,
      mode: this.gameConfig.gameMode,
      score: this.roundScore,
      targetScore: this.targetScore,
      wordsFound: this.discoveredWordsMap.size,
      totalPossibleWords: this.currentBoard.possibleWords.length,
    });

    this.events.emitGameEvent('round:ended', {
      roundNumber,
      reason,
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      targetReached,
      discoveredWords: Array.from(this.discoveredWordsMap.values()),
      missedWords: missedWords.slice(0, 60),
      totalPossibleWords: this.currentBoard.possibleWords.length,
      leaderboards: this.leaderboard.getAllLeaderboards(),
      status: this.rounds.getStatus(),
      difficulty: this.gameConfig.difficulty,
      performanceMetrics: this.getPerformanceMetrics(),
    });
  }

  public startRound(incrementRound = false): void {
    this.rounds.startCountdownAndRound(
      {
        roundDuration: this.getEffectiveRoundDuration(),
        prepDuration: this.gameConfig.prepDuration,
        intermissionDuration: this.gameConfig.intermissionDuration,
        autoNextRound: this.gameConfig.autoNextRound,
      },
      incrementRound
    );
    this.events.emitGameEvent('game:started', {
      roundNumber: this.rounds.getRoundNumber(),
      status: this.rounds.getStatus(),
    });
  }

  public pauseRound(): boolean {
    return this.rounds.pauseRound();
  }

  public resumeRound(): boolean {
    return this.rounds.resumeRound();
  }

  public endCurrentRound(reason = 'HOST_ENDED'): void {
    this.rounds.endRound(reason, {
      roundDuration: this.getEffectiveRoundDuration(),
      prepDuration: this.gameConfig.prepDuration,
      intermissionDuration: this.gameConfig.intermissionDuration,
      autoNextRound: this.gameConfig.autoNextRound,
    });
  }

  public nextRound(): void {
    const goalMet =
      this.roundScore >= this.targetScore ||
      this.discoveredWordsMap.size >= this.currentBoard.possibleWords.length;

    if (!goalMet) {
      this.rounds.setRoundNumber(1);
      this.rounds.setNextRoundResetsToLevelOne(false);
      this.lastAdaptationNotice = 'Goal not met — restarted from Level 1!';
      this.startRound(false);
    } else {
      this.rounds.setNextRoundResetsToLevelOne(false);
      this.startRound(true);
    }
  }

  public restartRound(): void {
    this.rounds.setRoundNumber(1);
    this.rounds.setNextRoundResetsToLevelOne(false);
    this.startRound(false);
  }

  public shuffleCurrentBoard(): string[] {
    // Shuffle while preserving modifier mappings by shuffling an index permutation
    const n = this.currentBoard.letters.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    const fixedIdx = this.currentBoard.centerIndex;

    const movable = indices.filter((i) => i !== fixedIdx);
    for (let i = movable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [movable[i], movable[j]] = [movable[j], movable[i]];
    }
    if (fixedIdx !== null && fixedIdx >= 0 && fixedIdx < n) {
      movable.splice(fixedIdx, 0, fixedIdx);
    }

    // `movable[newPos] = oldPos` -> create reverse map `oldToNew[oldPos] = newPos`
    const oldToNew: Record<number, number> = {};
    const newLetters: string[] = new Array(n);
    for (let newPos = 0; newPos < n; newPos++) {
      const oldPos = movable[newPos];
      oldToNew[oldPos] = newPos;
      newLetters[newPos] = this.currentBoard.letters[oldPos];
    }

    this.currentBoard.letters = newLetters;
    const mod = this.currentBoard.modifiers;
    mod.hiddenIndices = mod.hiddenIndices.map((idx) => oldToNew[idx]);
    mod.revealedHiddenIndices = mod.revealedHiddenIndices.map((idx) => oldToNew[idx]);
    mod.decoyIndices = mod.decoyIndices.map((idx) => oldToNew[idx]);
    mod.exposedDecoyIndices = mod.exposedDecoyIndices.map((idx) => oldToNew[idx]);
    mod.bonusTileIndices = mod.bonusTileIndices.map((idx) => oldToNew[idx]);

    const newLocked: Record<number, { tileIndex: number; unlocksAtWords: number; unlocked: boolean }> = {};
    for (const rule of Object.values(mod.lockedTiles)) {
      const mapped = oldToNew[rule.tileIndex];
      newLocked[mapped] = { ...rule, tileIndex: mapped };
    }
    mod.lockedTiles = newLocked;

    this.emitModifierUpdate('Board tiles rearranged!');
    return this.getPublicBoardLetters();
  }

  /**
   * Host/Admin action to manually inject or clear progressive board elements in any round.
   */
  public triggerModifierAction(
    action: 'add_hidden' | 'add_decoy' | 'add_locked' | 'add_bonus' | 'unlock_and_reveal_all'
  ): BoardModifiers {
    const mod = this.currentBoard.modifiers;
    const n = this.currentBoard.letters.length;

    if (action === 'unlock_and_reveal_all') {
      mod.revealedHiddenIndices = [...mod.hiddenIndices];
      mod.exposedDecoyIndices = [...mod.decoyIndices];
      for (const key of Object.keys(mod.lockedTiles)) {
        mod.lockedTiles[Number(key)].unlocked = true;
      }
      this.emitModifierUpdate('All Hidden, Decoy, and Locked tiles revealed/unlocked!');
      return mod;
    }

    if (action === 'add_decoy') {
      const usedChars = new Set(this.currentBoard.letters.map((c) => c.toUpperCase()));
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((c) => !usedChars.has(c));
      const decoyChar = alphabet.length > 0 ? alphabet[Math.floor(Math.random() * alphabet.length)] : 'Z';
      this.currentBoard.letters.push(decoyChar);
      const newIdx = this.currentBoard.letters.length - 1;
      mod.decoyIndices.push(newIdx);
      this.emitModifierUpdate(`Added a hidden Decoy Letter tile to the board!`);
      return mod;
    }

    // Find an eligible core tile index not currently carrying that modifier
    const eligible = Array.from({ length: n }, (_, i) => i).filter(
      (i) => i !== this.currentBoard.centerIndex && !mod.decoyIndices.includes(i)
    );

    if (action === 'add_hidden') {
      const target = eligible.find((i) => !mod.hiddenIndices.includes(i));
      if (target !== undefined) {
        mod.hiddenIndices.push(target);
        mod.revealedHiddenIndices = mod.revealedHiddenIndices.filter((x) => x !== target);
        this.emitModifierUpdate(`Disguised tile #${target + 1} as a Mystery '?' Letter!`);
      }
    } else if (action === 'add_locked') {
      const target = eligible.find((i) => !mod.lockedTiles[i] || mod.lockedTiles[i].unlocked);
      if (target !== undefined) {
        const threshold = this.discoveredWordsMap.size + 2;
        mod.lockedTiles[target] = {
          tileIndex: target,
          unlocksAtWords: threshold,
          unlocked: false,
        };
        this.emitModifierUpdate(`Locked tile "${this.currentBoard.letters[target]}" (unlocks at ${threshold} words)!`);
      }
    } else if (action === 'add_bonus') {
      const target = eligible.find((i) => !mod.bonusTileIndices.includes(i));
      if (target !== undefined) {
        mod.bonusTileIndices.push(target);
        this.emitModifierUpdate(`Charged tile "${this.currentBoard.letters[target]}" with +5 Golden Bonus Points!`);
      }
    }

    return mod;
  }

  private emitModifierUpdate(notice?: string): void {
    this.events.emitGameEvent('board:modifier_updated', {
      letters: this.getPublicBoardLetters(),
      centerLetter: this.currentBoard.centerLetter,
      centerIndex: this.currentBoard.centerIndex,
      modifiers: this.currentBoard.modifiers,
      notice,
    });
  }

  public resetGame(clearAllTimeScores = false): void {
    this.rounds.resetToIdle(this.getEffectiveRoundDuration());
    this.discoveredWordsMap.clear();
    this.revealedHints = [];
    this.revealedHintWords.clear();
    this.roundScore = 0;
    this.roundLikes = 0;
    this.lastLikeMilestone = 0;
    this.roundTotalSubmissions = 0;
    this.roundValidSubmissions = 0;
    this.scorer.resetRoundState();

    if (clearAllTimeScores) {
      this.leaderboard.resetAllStats();
    } else {
      this.leaderboard.resetRoundStats();
    }

    this.prepareBoardForRound();
    this.events.emitGameEvent('game:reset', this.getFullState());
  }

  public revealHint(sourceUser = 'Host', simulated = false): { hint: string | null; word: string | null } {
    // Also reveal 1 unrevealed Hidden Tile OR expose 1 unexposed Decoy Tile when a Hint is triggered!
    const mod = this.currentBoard.modifiers;
    const unrevealedHidden = mod.hiddenIndices.find((idx) => !mod.revealedHiddenIndices.includes(idx));
    if (unrevealedHidden !== undefined) {
      mod.revealedHiddenIndices.push(unrevealedHidden);
      this.emitModifierUpdate(
        `Hint revealed Mystery Tile #${unrevealedHidden + 1}: "${this.currentBoard.letters[unrevealedHidden]}"!`
      );
    } else {
      const unexposedDecoy = mod.decoyIndices.find((idx) => !mod.exposedDecoyIndices.includes(idx));
      if (unexposedDecoy !== undefined) {
        mod.exposedDecoyIndices.push(unexposedDecoy);
        this.emitModifierUpdate(
          `Hint exposed Decoy Tile "${this.currentBoard.letters[unexposedDecoy]}"!`
        );
      }
    }

    const unfound = this.currentBoard.possibleWords.filter(
      (w) => !this.discoveredWordsMap.has(w) && !this.revealedHints.some((h) => h.startsWith(w.toUpperCase()))
    );

    if (unfound.length === 0) {
      return { hint: null, word: null };
    }

    const preferred = unfound.filter((w) => w.length >= 4);
    const target = (preferred.length > 0 ? preferred : unfound)[
      Math.floor(Math.random() * (preferred.length > 0 ? preferred.length : unfound.length))
    ].toUpperCase();

    const masked = target
      .split('')
      .map((ch, idx) => (idx === 0 || idx === target.length - 1 ? ch : '_'))
      .join(' ');

    const hintLabel = `${masked} (${target.length} letters)`;
    this.revealedHints.push(hintLabel);
    this.revealedHintWords.add(target);

    this.events.emitGameEvent(
      'hint:revealed',
      {
        hint: hintLabel,
        wordLength: target.length,
        firstLetter: target[0],
        lastLetter: target[target.length - 1],
        triggeredBy: sourceUser,
        revealedHints: this.revealedHints,
        wordSlots: this.getPublicWordSlots(),
      },
      simulated
    );

    return { hint: hintLabel, word: target };
  }

  public submitWord(params: {
    userId: string;
    username: string;
    nickname?: string;
    avatarUrl?: string;
    word: string;
    source: 'web' | 'tiktok' | 'simulation';
  }): {
    accepted: boolean;
    word: string;
    reason?: string;
    message: string;
    scoreBreakdown?: WordScoreBreakdown;
    entry?: DiscoveredWordEntry;
  } {
    const simulated = params.source === 'simulation';
    const cleanUser = params.username.trim() || 'Player';
    const nickname = params.nickname?.trim() || cleanUser;

    if (
      this.settingsConfig.moderation.blockedUsers.some(
        (u) => u.toLowerCase() === cleanUser.toLowerCase() || u.toLowerCase() === params.userId.toLowerCase()
      )
    ) {
      this.pushChatFeed({
        userId: params.userId,
        username: cleanUser,
        nickname,
        avatarUrl: params.avatarUrl,
        text: params.word.toUpperCase(),
        status: 'rejected',
        reason: 'User Blocked',
        simulated,
      });
      return {
        accepted: false,
        word: params.word,
        reason: 'USER_BLOCKED',
        message: 'User is blocked by moderation settings.',
      };
    }

    if (params.source === 'tiktok' && !this.gameConfig.allowChatSubmissions) {
      this.pushChatFeed({
        userId: params.userId,
        username: cleanUser,
        nickname,
        avatarUrl: params.avatarUrl,
        text: params.word.toUpperCase(),
        status: 'rejected',
        reason: 'Submissions Paused',
        simulated,
      });
      return {
        accepted: false,
        word: params.word,
        reason: 'CHAT_SUBMISSIONS_DISABLED',
        message: 'Chat submissions are currently paused by the host.',
      };
    }

    const now = Date.now();
    const cooldownMs = this.gameConfig.submissionCooldownMs || 0;
    if (cooldownMs > 0 && params.source !== 'web') {
      const lastSub = this.userCooldownMap.get(params.userId) || 0;
      if (now - lastSub < cooldownMs) {
        return {
          accepted: false,
          word: params.word,
          reason: 'COOLDOWN_ACTIVE',
          message: 'Please wait a moment before submitting another word.',
        };
      }
    }
    this.userCooldownMap.set(params.userId, now);

    const status = this.rounds.getStatus();
    if (status !== 'ACTIVE') {
      this.pushChatFeed({
        userId: params.userId,
        username: cleanUser,
        nickname,
        avatarUrl: params.avatarUrl,
        text: params.word.toUpperCase(),
        status: 'rejected',
        reason: status === 'PAUSED' ? 'Round Paused' : 'Round Inactive',
        simulated,
      });
      return {
        accepted: false,
        word: params.word,
        reason: 'ROUND_NOT_ACTIVE',
        message: status === 'PAUSED' ? 'Round is paused!' : 'Wait for the round to start!',
      };
    }

    this.roundTotalSubmissions += 1;
    this.leaderboard.recordSubmissionAttempt(params.userId, cleanUser, nickname, params.avatarUrl);

    const mod = this.currentBoard.modifiers;
    const activeLockedIndices = Object.values(mod.lockedTiles)
      .filter((r) => !r.unlocked)
      .map((r) => r.tileIndex);
    const unrevealedHiddenIndices = mod.hiddenIndices.filter(
      (idx) => !mod.revealedHiddenIndices.includes(idx)
    );

    const discoveredSet = new Set(this.discoveredWordsMap.keys());
    const validation = this.validator.validateSubmission({
      word: params.word,
      boardLetters: this.currentBoard.letters,
      discoveredWords: discoveredSet,
      minWordLength: this.getEffectiveMinWordLength(),
      maxWordLength: this.gameConfig.maxWordLength,
      mandatoryCenterLetter: this.currentBoard.centerLetter,
      activeLockedIndices,
      decoyIndices: mod.decoyIndices,
      hiddenIndices: unrevealedHiddenIndices,
      bonusTileIndices: mod.bonusTileIndices,
    });

    // If a player stepped on a Decoy Tile, expose that Decoy Tile for the entire community!
    if (
      !validation.valid &&
      validation.reason === 'USED_DECOY_LETTER' &&
      validation.triggeredDecoyIndex !== undefined
    ) {
      if (!mod.exposedDecoyIndices.includes(validation.triggeredDecoyIndex)) {
        mod.exposedDecoyIndices.push(validation.triggeredDecoyIndex);
        this.emitModifierUpdate(
          `${nickname} triggered Decoy Tile "${this.currentBoard.letters[validation.triggeredDecoyIndex]}"!`
        );
      }
    }

    this.events.emitGameEvent(
      'word:submitted',
      {
        userId: params.userId,
        username: cleanUser,
        nickname,
        word: validation.normalizedWord.toUpperCase(),
        valid: validation.valid,
        source: params.source,
      },
      simulated
    );

    if (!validation.valid) {
      this.pushChatFeed({
        userId: params.userId,
        username: cleanUser,
        nickname,
        avatarUrl: params.avatarUrl,
        text: validation.normalizedWord.toUpperCase() || params.word,
        status: 'rejected',
        reason: validation.message,
        simulated,
      });

      this.events.emitGameEvent(
        'word:rejected',
        {
          userId: params.userId,
          username: cleanUser,
          nickname,
          word: validation.normalizedWord.toUpperCase() || params.word,
          reason: validation.reason,
          message: validation.message,
          source: params.source,
        },
        simulated
      );

      return {
        accepted: false,
        word: validation.normalizedWord.toUpperCase(),
        reason: validation.reason,
        message: validation.message,
      };
    }

    this.roundValidSubmissions += 1;
    const upperWord = validation.normalizedWord.toUpperCase();
    const isFirstTimeEver = !this.leaderboard.isWordEverDiscovered(validation.normalizedWord);

    const usedHiddenCount = validation.usedHiddenIndices?.length || 0;
    const usedBonusCount = validation.usedBonusIndices?.length || 0;

    // If the word deduced a Hidden '?' Tile, reveal that tile for all players!
    let modifierChanged = false;
    if (validation.usedHiddenIndices && validation.usedHiddenIndices.length > 0) {
      for (const hIdx of validation.usedHiddenIndices) {
        if (!mod.revealedHiddenIndices.includes(hIdx)) {
          mod.revealedHiddenIndices.push(hIdx);
          modifierChanged = true;
        }
      }
    }

    const scoreBreakdown = this.scorer.calculateWordScore({
      word: validation.normalizedWord,
      userId: params.userId,
      boardSize: this.currentBoard.coreLetters.length,
      rareBonusWord: this.currentBoard.rareBonusWord,
      currentCommunityScore: this.roundScore,
      isFirstTimeEverFound: isFirstTimeEver,
      usedHiddenCount,
      usedBonusCount,
    });

    const totalAwarded = scoreBreakdown.totalPoints + scoreBreakdown.milestoneBonusPoints;
    this.roundScore += totalAwarded;

    const entry: DiscoveredWordEntry = {
      word: upperWord,
      foundByUserId: params.userId,
      foundByUsername: cleanUser,
      foundByNickname: nickname,
      foundByAvatar: params.avatarUrl,
      points: scoreBreakdown.totalPoints,
      timestamp: now,
      isPangram: scoreBreakdown.isPangram,
      isRareWord: scoreBreakdown.isRareWord,
      comboCount: scoreBreakdown.comboCount,
      usedTileIndices: validation.usedTileIndices || [],
    };

    this.discoveredWordsMap.set(validation.normalizedWord, entry);

    // Check if any Locked Tiles should now unlock based on total discovered words!
    const currentWordCount = this.discoveredWordsMap.size;
    for (const rule of Object.values(mod.lockedTiles)) {
      if (!rule.unlocked && currentWordCount >= rule.unlocksAtWords) {
        rule.unlocked = true;
        modifierChanged = true;
      }
    }

    if (modifierChanged) {
      this.emitModifierUpdate();
    }

    const { isNewPersonalHigh } = this.leaderboard.recordValidWord({
      userId: params.userId,
      username: cleanUser,
      nickname,
      avatarUrl: params.avatarUrl,
      word: validation.normalizedWord,
      points: scoreBreakdown.totalPoints,
    });

    this.pushChatFeed({
      userId: params.userId,
      username: cleanUser,
      nickname,
      avatarUrl: params.avatarUrl,
      text: upperWord,
      status: 'accepted',
      points: scoreBreakdown.totalPoints,
      simulated,
    });

    this.events.emitGameEvent(
      'word:accepted',
      {
        entry,
        scoreBreakdown,
        isNewPersonalHigh,
        roundScore: this.roundScore,
        targetScore: this.targetScore,
        discoveredCount: this.discoveredWordsMap.size,
        totalPossibleWords: this.currentBoard.possibleWords.length,
        performanceMetrics: this.getPerformanceMetrics(),
        wordSlots: this.getPublicWordSlots(),
      },
      simulated
    );

    this.events.emitGameEvent(
      'score:updated',
      {
        roundScore: this.roundScore,
        targetScore: this.targetScore,
        activeMultiplier: this.scorer.getActiveMultiplier(),
      },
      simulated
    );

    this.events.emitGameEvent('leaderboard:updated', this.leaderboard.getAllLeaderboards(), simulated);

    if (this.discoveredWordsMap.size >= this.currentBoard.possibleWords.length) {
      this.endCurrentRound('ALL_WORDS_DISCOVERED');
    }

    return {
      accepted: true,
      word: upperWord,
      message: validation.message,
      scoreBreakdown,
      entry,
    };
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    const elapsedMinutes = Math.max(0.25, (Date.now() - this.roundStartedAt) / 60000);
    const wordsPerMinute = Math.round((this.discoveredWordsMap.size / elapsedMinutes) * 10) / 10;
    const submissionAccuracy =
      this.roundTotalSubmissions > 0
        ? Math.round((this.roundValidSubmissions / this.roundTotalSubmissions) * 100)
        : 100;
    const targetCompletionRatio =
      Math.round((this.roundScore / Math.max(1, this.targetScore)) * 100) / 100;

    const activePlayers = this.leaderboard.getAllLeaderboards().participatingViewersCount;
    const engagementScore = Math.min(
      100,
      Math.round(wordsPerMinute * 6 + submissionAccuracy * 0.3 + activePlayers * 5)
    );

    return {
      wordsPerMinute,
      submissionAccuracy,
      targetCompletionRatio,
      roundTotalSubmissions: this.roundTotalSubmissions,
      roundValidSubmissions: this.roundValidSubmissions,
      lastAdaptationNotice: this.lastAdaptationNotice,
      engagementScore,
    };
  }

  public addCommunityBonusPoints(points: number): number {
    this.roundScore += points;
    this.events.emitGameEvent('score:updated', {
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      activeMultiplier: this.scorer.getActiveMultiplier(),
    });
    return this.roundScore;
  }

  public addRoundTime(seconds: number): number {
    return this.rounds.addTime(seconds);
  }

  public activateScoreMultiplier(multiplier: number, durationSeconds: number) {
    const result = this.scorer.activateMultiplier(multiplier, durationSeconds);
    this.events.emitGameEvent('score:updated', {
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      activeMultiplier: this.scorer.getActiveMultiplier(),
    });
    return result;
  }

  public addLikes(
    count: number,
    user: { userId: string; username: string; nickname?: string; avatarUrl?: string },
    simulated = false
  ) {
    this.roundLikes += count;
    const socialConfig = this.scorer.getConfig().socialRewards;
    const threshold = Math.max(10, socialConfig.likeMilestoneThreshold || 100);
    const milestoneReached = Math.floor(this.roundLikes / threshold) * threshold;

    this.leaderboard.recordSocialContribution({
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      type: 'like',
      count,
      pointsAwarded: 0,
    });

    this.events.emitGameEvent(
      'like:updated',
      {
        roundLikes: this.roundLikes,
        nextMilestone: (Math.floor(this.roundLikes / threshold) + 1) * threshold,
        user,
        count,
      },
      simulated
    );

    if (milestoneReached > 0 && milestoneReached > this.lastLikeMilestone) {
      this.lastLikeMilestone = milestoneReached;
      const bonusPts = socialConfig.likeMilestonePoints || 15;
      const bonusTime = socialConfig.likeMilestoneTimeBonus || 5;
      this.addCommunityBonusPoints(bonusPts);
      this.addRoundTime(bonusTime);

      this.events.emitGameEvent(
        'like:milestone',
        {
          milestone: milestoneReached,
          bonusPoints: bonusPts,
          bonusTimeSeconds: bonusTime,
          triggeredBy: user.nickname || user.username,
          roundScore: this.roundScore,
        },
        simulated
      );
    }
  }

  public pushChatFeed(item: {
    userId: string;
    username: string;
    nickname: string;
    avatarUrl?: string;
    text: string;
    status: 'accepted' | 'rejected' | 'command' | 'chat';
    reason?: string;
    points?: number;
    simulated?: boolean;
  }) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...item,
      timestamp: Date.now(),
    };
    this.chatFeed.unshift(entry);
    if (this.chatFeed.length > 60) {
      this.chatFeed.length = 60;
    }
    this.events.emitGameEvent('chat:message', entry, Boolean(item.simulated));
    return entry;
  }

  public clearActivityLogs(): void {
    this.chatFeed = [];
    this.events.clearRecentEvents();
  }

  public getGameConfig(): GameConfig {
    return this.gameConfig;
  }

  public getSettingsConfig(): SettingsConfig {
    return this.settingsConfig;
  }

  public getFullState() {
    return {
      seqId: this.events.getSeqId(),
      status: this.rounds.getStatus(),
      roundNumber: this.rounds.getRoundNumber(),
      remainingSeconds: this.rounds.getRemainingSeconds(),
      countdownSeconds: this.rounds.getCountdownSeconds(),
      intermissionSeconds: this.rounds.getIntermissionSeconds(),
      gameMode: this.gameConfig.gameMode,
      difficulty: this.gameConfig.difficulty,
      autoDifficulty: this.gameConfig.autoDifficulty,
      progressiveElementsEnabled: this.gameConfig.progressiveElementsEnabled,
      performanceMetrics: this.getPerformanceMetrics(),
      board: {
        letters: this.getPublicBoardLetters(),
        centerLetter: this.currentBoard.centerLetter,
        centerIndex: this.currentBoard.centerIndex,
        totalPossibleWords: this.currentBoard.possibleWords.length,
        pangramCount: this.currentBoard.pangrams.length,
        rareBonusWordLength: this.currentBoard.rareBonusWord?.length || 0,
        modifiers: this.currentBoard.modifiers,
        wordSlots: this.getPublicWordSlots(),
      },
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      roundLikes: this.roundLikes,
      nextLikeMilestone:
        (Math.floor(
          this.roundLikes / Math.max(10, this.scorer.getConfig().socialRewards.likeMilestoneThreshold || 100)
        ) +
          1) *
        Math.max(10, this.scorer.getConfig().socialRewards.likeMilestoneThreshold || 100),
      activeMultiplier: this.scorer.getActiveMultiplier(),
      discoveredWords: Array.from(this.discoveredWordsMap.values()),
      revealedHints: this.revealedHints,
      chatFeed: this.chatFeed,
      leaderboards: this.leaderboard.getAllLeaderboards(),
      gameConfig: this.gameConfig,
      scoringConfig: this.scorer.getConfig(),
      settingsConfig: this.settingsConfig,
      dictionarySize: this.validator.getDictionarySize(),
    };
  }
}

export const gameEngine = new GameEngine();
