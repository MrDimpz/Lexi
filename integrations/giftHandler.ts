import fs from 'fs';
import path from 'path';
import { gameEngine } from '../server/gameEngine.ts';
import { leaderboardManager } from '../server/leaderboard.ts';
import { eventManager } from '../server/eventManager.ts';

export interface GiftTierConfig {
  id: string;
  giftId: number;
  name: string;
  tier: 'small' | 'medium' | 'large';
  diamondValue: number;
  effect: 'add_time_and_points' | 'bonus_points' | 'reveal_hint' | 'score_multiplier' | 'frenzy_bonus_round';
  pointsAwarded: number;
  timeAddedSeconds: number;
  multiplier: number;
  durationSeconds: number;
  animation: string;
  soundEffect: string;
  messageTemplate: string;
  imageUrl?: string;
}

export interface GiftsConfigFile {
  giftsEnabled: boolean;
  tiers: GiftTierConfig[];
}

export interface ProcessedGiftRecord {
  id: string;
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  giftId: number;
  giftName: string;
  tier: 'small' | 'medium' | 'large';
  repeatCount: number;
  diamondValue: number;
  totalDiamonds: number;
  effect: string;
  pointsAwarded: number;
  timeAddedSeconds: number;
  multiplierActivated: number;
  hintRevealed?: string | null;
  message: string;
  animation: string;
  soundEffect: string;
  simulated: boolean;
  timestamp: number;
}

export class GiftHandler {
  private configPath: string;
  private config!: GiftsConfigFile;
  private processedStreaks: Map<string, number> = new Map();
  private giftHistory: ProcessedGiftRecord[] = [];

  constructor() {
    this.configPath = path.resolve(process.cwd(), 'config/gifts.json');
    this.loadConfig();
  }

  public loadConfig(): GiftsConfigFile {
    try {
      this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch (err) {
      console.error('Error loading gifts.json:', err);
      this.config = { giftsEnabled: true, tiers: [] };
    }
    return this.config;
  }

  public saveConfig(partial: Partial<GiftsConfigFile>): GiftsConfigFile {
    this.config = {
      ...this.config,
      ...partial,
      tiers: partial.tiers || this.config.tiers,
    };
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    eventManager.emitGameEvent('config:updated', { giftsConfig: this.config });
    return this.config;
  }

  public getConfig(): GiftsConfigFile {
    return this.config;
  }

  public getGiftHistory(limit = 30): ProcessedGiftRecord[] {
    return this.giftHistory.slice(0, limit);
  }

  public clearGiftHistory(): void {
    this.giftHistory = [];
    this.processedStreaks.clear();
  }

  public processGiftEvent(
    rawGift: {
      userId: string;
      username: string;
      nickname?: string;
      avatarUrl?: string;
      giftId?: number;
      giftName?: string;
      diamondCount?: number;
      repeatCount?: number;
      repeatEnd?: boolean;
      giftType?: number;
      groupId?: string;
    },
    simulated = false
  ): ProcessedGiftRecord | null {
    const settings = gameEngine.getSettingsConfig();
    if (!this.config.giftsEnabled || !settings.tiktok.enableGiftEvents) {
      return null;
    }

    const repeatCount = Math.max(1, rawGift.repeatCount || 1);
    const giftType = rawGift.giftType ?? 0;
    const repeatEnd = rawGift.repeatEnd ?? true;

    // Streakable gifts in TikTok have giftType === 1.
    // Avoid counting intermediate streak updates as separate completed gifts!
    if (giftType === 1 && !repeatEnd) {
      return null;
    }

    // Prevent accidental duplicate processing of the exact same completed streak
    const dedupeKey = `${rawGift.userId}:${rawGift.giftId || rawGift.giftName}:${rawGift.groupId || ''}:${repeatCount}`;
    const lastProcessedAt = this.processedStreaks.get(dedupeKey) || 0;
    if (!simulated && Date.now() - lastProcessedAt < 3500) {
      return null;
    }
    this.processedStreaks.set(dedupeKey, Date.now());

    // Match configured gift by giftId or name, or fall back gracefully by diamondCount
    const matchedConfig = this.findMatchingGiftConfig(rawGift.giftId, rawGift.giftName, rawGift.diamondCount);

    const totalPoints = matchedConfig.pointsAwarded * repeatCount;
    const totalTimeAdded = matchedConfig.timeAddedSeconds * repeatCount;
    let hintRevealed: string | null = null;

    if (totalPoints > 0) {
      gameEngine.addCommunityBonusPoints(totalPoints);
    }

    if (totalTimeAdded > 0) {
      gameEngine.addRoundTime(totalTimeAdded);
    }

    if (matchedConfig.effect === 'reveal_hint' || matchedConfig.effect === 'frenzy_bonus_round') {
      const hintRes = gameEngine.revealHint(rawGift.nickname || rawGift.username, simulated);
      hintRevealed = hintRes.hint;
    }

    if (
      (matchedConfig.effect === 'score_multiplier' || matchedConfig.effect === 'frenzy_bonus_round') &&
      matchedConfig.multiplier > 1
    ) {
      gameEngine.activateScoreMultiplier(matchedConfig.multiplier, matchedConfig.durationSeconds || 30);
    }

    const displayUser = rawGift.nickname || rawGift.username || 'Viewer';
    const displayGiftName =
      repeatCount > 1 ? `${matchedConfig.name} x${repeatCount}` : matchedConfig.name;

    const formattedMessage = matchedConfig.messageTemplate
      .replace('{user}', displayUser)
      .replace('{gift}', displayGiftName);

    leaderboardManager.recordGiftContribution({
      userId: rawGift.userId,
      username: rawGift.username,
      nickname: rawGift.nickname,
      avatarUrl: rawGift.avatarUrl,
      giftName: matchedConfig.name,
      repeatCount,
      diamondValue: matchedConfig.diamondValue,
      pointsAwarded: totalPoints,
    });

    const record: ProcessedGiftRecord = {
      id: `gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: rawGift.userId,
      username: rawGift.username,
      nickname: displayUser,
      avatarUrl: rawGift.avatarUrl,
      giftId: matchedConfig.giftId,
      giftName: matchedConfig.name,
      tier: matchedConfig.tier,
      repeatCount,
      diamondValue: matchedConfig.diamondValue,
      totalDiamonds: matchedConfig.diamondValue * repeatCount,
      effect: matchedConfig.effect,
      pointsAwarded: totalPoints,
      timeAddedSeconds: totalTimeAdded,
      multiplierActivated: matchedConfig.multiplier,
      hintRevealed,
      message: formattedMessage,
      animation: matchedConfig.animation,
      soundEffect: matchedConfig.soundEffect,
      simulated,
      timestamp: Date.now(),
    };

    this.giftHistory.unshift(record);
    if (this.giftHistory.length > 50) {
      this.giftHistory.length = 50;
    }

    eventManager.emitGameEvent('gift:received', record, simulated);
    eventManager.emitGameEvent('leaderboard:updated', leaderboardManager.getAllLeaderboards(), simulated);

    return record;
  }

  private findMatchingGiftConfig(giftId?: number, giftName?: string, diamondCount?: number): GiftTierConfig {
    if (giftId) {
      const byId = this.config.tiers.find((t) => t.giftId === giftId);
      if (byId) return byId;
    }
    if (giftName) {
      const lower = giftName.toLowerCase();
      const byName = this.config.tiers.find(
        (t) => t.name.toLowerCase() === lower || t.id.toLowerCase() === lower
      );
      if (byName) return byName;
    }

    // Fallback for unsupported/unmapped gifts based on diamond count
    const diamonds = Math.max(1, diamondCount || 1);
    if (diamonds >= 100) {
      return {
        id: 'custom_large',
        giftId: giftId || 9999,
        name: giftName || 'Mega Gift',
        tier: 'large',
        diamondValue: diamonds,
        effect: 'frenzy_bonus_round',
        pointsAwarded: Math.min(300, diamonds * 2),
        timeAddedSeconds: 20,
        multiplier: 3,
        durationSeconds: 30,
        animation: 'cosmic_celebration',
        soundEffect: 'gift_large',
        messageTemplate: '{user} sent {gift}! 3X Score Multiplier & +20s Time!',
      };
    } else if (diamonds >= 10) {
      return {
        id: 'custom_medium',
        giftId: giftId || 9998,
        name: giftName || 'Super Gift',
        tier: 'medium',
        diamondValue: diamonds,
        effect: 'reveal_hint',
        pointsAwarded: Math.min(100, diamonds * 3),
        timeAddedSeconds: 8,
        multiplier: 2,
        durationSeconds: 20,
        animation: 'hint_beam',
        soundEffect: 'gift_medium',
        messageTemplate: '{user} sent {gift}! Hint Revealed & Bonus Points!',
      };
    }

    return {
      id: 'custom_small',
      giftId: giftId || 9997,
      name: giftName || 'Stream Gift',
      tier: 'small',
      diamondValue: diamonds,
      effect: 'add_time_and_points',
      pointsAwarded: 10,
      timeAddedSeconds: 4,
      multiplier: 1,
      durationSeconds: 0,
      animation: 'sparkle_burst',
      soundEffect: 'gift_small',
      messageTemplate: '{user} sent {gift}! +10 Community Pts & +4s!',
    };
  }
}

export const giftHandler = new GiftHandler();
