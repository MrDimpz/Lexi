import { gameEngine } from '../server/gameEngine.ts';
import { scoringEngine } from '../server/scoringEngine.ts';
import { leaderboardManager } from '../server/leaderboard.ts';
import { eventManager } from '../server/eventManager.ts';

export class LiveEventsHandler {
  private processedFollowUsers: Set<string> = new Set();
  private processedShareCooldown: Map<string, number> = new Map();

  public handleLikeEvent(
    payload: {
      userId: string;
      username: string;
      nickname?: string;
      avatarUrl?: string;
      likeCount?: number;
      totalLikeCount?: number;
    },
    simulated = false
  ) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableLikeEvents) return null;

    const count = Math.max(1, Math.min(500, payload.likeCount || 1));
    gameEngine.addLikes(
      count,
      {
        userId: payload.userId,
        username: payload.username,
        nickname: payload.nickname || payload.username,
        avatarUrl: payload.avatarUrl,
      },
      simulated
    );

    return { count };
  }

  public handleFollowEvent(
    payload: {
      userId: string;
      username: string;
      nickname?: string;
      avatarUrl?: string;
    },
    simulated = false
  ) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableFollowEvents) return null;

    // Avoid duplicate follow rewards for the same user in the same session
    if (!simulated && this.processedFollowUsers.has(payload.userId)) {
      return null;
    }
    this.processedFollowUsers.add(payload.userId);

    const socialConfig = scoringEngine.getConfig().socialRewards;
    const bonusPoints = socialConfig.followPoints ?? 10;
    const displayName = payload.nickname || payload.username || 'New Follower';

    if (socialConfig.autoRegisterFollower) {
      leaderboardManager.registerPlayer(payload.userId, payload.username, displayName, payload.avatarUrl);
    }

    leaderboardManager.recordSocialContribution({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      type: 'follow',
      pointsAwarded: bonusPoints,
    });

    if (bonusPoints > 0) {
      gameEngine.addCommunityBonusPoints(bonusPoints);
    }

    const eventPayload = {
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      bonusPoints,
      timestamp: Date.now(),
    };

    eventManager.emitGameEvent('follow:received', eventPayload, simulated);
    eventManager.emitGameEvent('leaderboard:updated', leaderboardManager.getAllLeaderboards(), simulated);

    return eventPayload;
  }

  public handleShareEvent(
    payload: {
      userId: string;
      username: string;
      nickname?: string;
      avatarUrl?: string;
    },
    simulated = false
  ) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableShareEvents) return null;

    const now = Date.now();
    const lastShare = this.processedShareCooldown.get(payload.userId) || 0;
    if (!simulated && now - lastShare < 15000) {
      return null;
    }
    this.processedShareCooldown.set(payload.userId, now);

    const socialConfig = scoringEngine.getConfig().socialRewards;
    const bonusPoints = socialConfig.sharePoints ?? 15;
    const displayName = payload.nickname || payload.username || 'Viewer';

    leaderboardManager.recordSocialContribution({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      type: 'share',
      pointsAwarded: bonusPoints,
    });

    if (bonusPoints > 0) {
      gameEngine.addCommunityBonusPoints(bonusPoints);
    }

    const eventPayload = {
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      bonusPoints,
      timestamp: now,
    };

    eventManager.emitGameEvent('share:received', eventPayload, simulated);
    eventManager.emitGameEvent('leaderboard:updated', leaderboardManager.getAllLeaderboards(), simulated);

    return eventPayload;
  }
}

export const liveEventsHandler = new LiveEventsHandler();
