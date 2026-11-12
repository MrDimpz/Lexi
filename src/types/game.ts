export type RoundStatus = 'IDLE' | 'COUNTDOWN' | 'ACTIVE' | 'PAUSED' | 'ROUND_END' | 'INTERMISSION';
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'extreme';

export interface LockedTileRule {
  tileIndex: number;
  unlocksAtWords: number;
  unlocked: boolean;
}

export interface BoardModifiers {
  hiddenIndices: number[];
  revealedHiddenIndices: number[];
  decoyIndices: number[];
  exposedDecoyIndices: number[];
  lockedTiles: Record<number, LockedTileRule>;
  bonusTileIndices: number[];
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

export interface PlayerRecord {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  totalPoints: number;
  validWordsCount: number;
  totalSubmissions: number;
  longestWord: string;
  highestSingleWordScore: number;
  giftsSentCount: number;
  giftDiamondsTotal: number;
  giftPointsContributed: number;
  likesContributed: number;
  lastActiveAt: number;
}

export interface GiftContributorRecord {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  giftsSentCount: number;
  giftDiamondsTotal: number;
  giftPointsContributed: number;
  lastGiftName: string;
  lastGiftAt: number;
}

export interface AllLeaderboards {
  round: PlayerRecord[];
  today: PlayerRecord[];
  allTime: PlayerRecord[];
  gifts: GiftContributorRecord[];
  mostWords: PlayerRecord[];
  highScorers: PlayerRecord[];
  participatingViewersCount: number;
  statistics: {
    totalRoundsPlayed: number;
    totalWordsDiscovered: number;
    totalPointsScored: number;
    highestRoundScore: number;
    longestWordFound: string;
    totalGiftsReceived: number;
    totalLikesReceived: number;
    totalFollowsReceived: number;
    totalSharesReceived: number;
    history: Array<{
      roundNumber: number;
      mode: string;
      score: number;
      targetScore: number;
      wordsFound: number;
      totalPossibleWords: number;
      topPlayer: string;
      endedAt: number;
    }>;
  };
}

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

export interface ChatFeedItem {
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
}

export interface TikTokConnectionState {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
  username: string;
  roomId: string | null;
  viewerCount: number;
  lastError: string | null;
  logs: Array<{
    id: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: number;
  }>;
}

export interface BoardWordSlot {
  id: string;
  length: number;
  discovered: boolean;
  word: string | null;
  points: number | null;
  isPangram: boolean;
  hintMask: string[] | null;
}

export interface GameFullState {
  seqId: number;
  status: RoundStatus;
  roundNumber: number;
  remainingSeconds: number;
  countdownSeconds: number;
  intermissionSeconds: number;
  gameMode: string;
  difficulty: DifficultyLevel;
  autoDifficulty: boolean;
  progressiveElementsEnabled: boolean;
  performanceMetrics: PerformanceMetrics;
  board: {
    letters: string[];
    centerLetter: string | null;
    centerIndex: number | null;
    totalPossibleWords: number;
    pangramCount: number;
    rareBonusWordLength: number;
    modifiers: BoardModifiers;
    wordSlots?: BoardWordSlot[];
  };
  roundScore: number;
  targetScore: number;
  roundLikes: number;
  nextLikeMilestone: number;
  activeMultiplier: {
    multiplier: number;
    remainingSeconds: number;
  };
  discoveredWords: DiscoveredWordEntry[];
  revealedHints: string[];
  chatFeed: ChatFeedItem[];
  leaderboards: AllLeaderboards;
  gameConfig: {
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
  };
  scoringConfig: {
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
  };
  settingsConfig: {
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
  };
  dictionarySize: number;
  tiktok: TikTokConnectionState;
  giftsConfig: {
    giftsEnabled: boolean;
    tiers: GiftTierConfig[];
  };
  giftHistory: ProcessedGiftRecord[];
  connectedDisplays?: number;
  systemHealth?: {
    uptimeSeconds: number;
    memoryRssMb: number;
    wsClients: number;
  };
}
