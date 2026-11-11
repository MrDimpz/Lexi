import fs from 'fs';
import path from 'path';

export interface ScoringConfig {
  lengthPoints: Record<string, number>;
  bonuses: {
    uniqueWordBonus: number;
    longWordThreshold: number;
    longWordBonus: number;
    fullBoardPangramBonus: number;
    comboWindowMs: number;
    comboStepBonus: number;
    maxComboMultiplier: number;
    communityMilestoneStep: number;
    communityMilestoneBonus: number;
  };
  socialRewards: {
    likeMilestoneThreshold: number;
    likeMilestonePoints: number;
    likeMilestoneTimeBonus: number;
    followPoints: number;
    autoRegisterFollower: boolean;
    sharePoints: number;
  };
}

export interface WordScoreBreakdown {
  basePoints: number;
  uniqueBonus: number;
  longWordBonus: number;
  pangramBonus: number;
  rareWordBonus: number;
  mysteryTileBonus: number;
  goldenTileBonus: number;
  comboBonus: number;
  comboCount: number;
  activeMultiplier: number;
  totalPoints: number;
  isPangram: boolean;
  isRareWord: boolean;
  milestoneTriggered: boolean;
  milestoneBonusPoints: number;
}

export class ScoringEngine {
  private config!: ScoringConfig;
  private configPath: string;
  private playerComboState: Map<string, { count: number; lastTimestamp: number }> = new Map();
  private activeMultiplier = 1;
  private multiplierExpiresAt = 0;
  private lastMilestoneTriggered = 0;

  constructor() {
    this.configPath = path.resolve(process.cwd(), 'config/scoring.json');
    this.loadConfig();
  }

  public loadConfig(): ScoringConfig {
    try {
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      this.config = raw;
    } catch (err) {
      console.error('Error loading scoring.json, using defaults:', err);
      this.config = {
        lengthPoints: { '3': 3, '4': 5, '5': 8, '6': 12, '7': 20, '8': 30, '9': 45, '10': 60 },
        bonuses: {
          uniqueWordBonus: 2,
          longWordThreshold: 6,
          longWordBonus: 5,
          fullBoardPangramBonus: 15,
          comboWindowMs: 8000,
          comboStepBonus: 2,
          maxComboMultiplier: 3.0,
          communityMilestoneStep: 100,
          communityMilestoneBonus: 15,
        },
        socialRewards: {
          likeMilestoneThreshold: 100,
          likeMilestonePoints: 15,
          likeMilestoneTimeBonus: 5,
          followPoints: 10,
          autoRegisterFollower: true,
          sharePoints: 15,
        },
      };
    }
    return this.config;
  }

  public saveConfig(newConfig: Partial<ScoringConfig>): ScoringConfig {
    this.config = {
      ...this.config,
      ...newConfig,
      lengthPoints: { ...this.config.lengthPoints, ...(newConfig.lengthPoints || {}) },
      bonuses: { ...this.config.bonuses, ...(newConfig.bonuses || {}) },
      socialRewards: { ...this.config.socialRewards, ...(newConfig.socialRewards || {}) },
    };
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    return this.config;
  }

  public getConfig(): ScoringConfig {
    return this.config;
  }

  public resetRoundState(): void {
    this.playerComboState.clear();
    this.lastMilestoneTriggered = 0;
  }

  public activateMultiplier(multiplier: number, durationSeconds: number): { multiplier: number; expiresAt: number } {
    const now = Date.now();
    this.activeMultiplier = Math.max(1, multiplier);
    this.multiplierExpiresAt = now + durationSeconds * 1000;
    return { multiplier: this.activeMultiplier, expiresAt: this.multiplierExpiresAt };
  }

  public getActiveMultiplier(): { multiplier: number; remainingSeconds: number } {
    const now = Date.now();
    if (this.activeMultiplier > 1 && now < this.multiplierExpiresAt) {
      return {
        multiplier: this.activeMultiplier,
        remainingSeconds: Math.ceil((this.multiplierExpiresAt - now) / 1000),
      };
    }
    this.activeMultiplier = 1;
    this.multiplierExpiresAt = 0;
    return { multiplier: 1, remainingSeconds: 0 };
  }

  public calculateWordScore(params: {
    word: string;
    userId: string;
    boardSize: number;
    rareBonusWord: string | null;
    currentCommunityScore: number;
    isFirstTimeEverFound: boolean;
    usedHiddenCount?: number;
    usedBonusCount?: number;
  }): WordScoreBreakdown {
    const len = params.word.length;
    const basePoints =
      this.config.lengthPoints[String(len)] ??
      (len > 7 ? 20 + (len - 7) * 10 : Math.max(1, len));

    const uniqueBonus = params.isFirstTimeEverFound ? this.config.bonuses.uniqueWordBonus : 0;
    const longWordBonus = len >= this.config.bonuses.longWordThreshold ? this.config.bonuses.longWordBonus : 0;
    const isPangram = len >= params.boardSize;
    const pangramBonus = isPangram ? this.config.bonuses.fullBoardPangramBonus : 0;
    const isRareWord =
      Boolean(params.rareBonusWord) && params.word.toUpperCase() === params.rareBonusWord?.toUpperCase();
    const rareWordBonus = isRareWord ? 25 : 0;

    // Bonus for deducing a hidden mystery tile or using a Golden Bonus tile
    const mysteryTileBonus = (params.usedHiddenCount || 0) * 8;
    const goldenTileBonus = (params.usedBonusCount || 0) * 5;

    // Combo calculation for consecutive submissions within window
    const now = Date.now();
    const prevCombo = this.playerComboState.get(params.userId);
    let comboCount = 1;
    if (prevCombo && now - prevCombo.lastTimestamp <= this.config.bonuses.comboWindowMs) {
      comboCount = prevCombo.count + 1;
    }
    this.playerComboState.set(params.userId, { count: comboCount, lastTimestamp: now });

    const comboBonus = comboCount > 1 ? Math.min(15, (comboCount - 1) * this.config.bonuses.comboStepBonus) : 0;

    const { multiplier } = this.getActiveMultiplier();

    const rawSubtotal =
      basePoints +
      uniqueBonus +
      longWordBonus +
      pangramBonus +
      rareWordBonus +
      mysteryTileBonus +
      goldenTileBonus +
      comboBonus;
    const totalPoints = Math.round(rawSubtotal * multiplier);

    // Check community score milestone
    const newScoreBeforeMilestone = params.currentCommunityScore + totalPoints;
    const step = this.config.bonuses.communityMilestoneStep || 100;
    const milestoneLevel = Math.floor(newScoreBeforeMilestone / step) * step;
    let milestoneTriggered = false;
    let milestoneBonusPoints = 0;

    if (milestoneLevel > 0 && milestoneLevel > this.lastMilestoneTriggered) {
      this.lastMilestoneTriggered = milestoneLevel;
      milestoneTriggered = true;
      milestoneBonusPoints = this.config.bonuses.communityMilestoneBonus || 15;
    }

    return {
      basePoints,
      uniqueBonus,
      longWordBonus,
      pangramBonus,
      rareWordBonus,
      mysteryTileBonus,
      goldenTileBonus,
      comboBonus,
      comboCount,
      activeMultiplier: multiplier,
      totalPoints,
      isPangram,
      isRareWord,
      milestoneTriggered,
      milestoneBonusPoints,
    };
  }
}

export const scoringEngine = new ScoringEngine();
