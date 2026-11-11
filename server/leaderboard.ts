import fs from 'fs';
import path from 'path';

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

export interface PersistentScoresData {
  allTime: Record<string, PlayerRecord>;
  today: {
    date: string;
    players: Record<string, PlayerRecord>;
  };
  giftContributors: Record<
    string,
    {
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
  >;
}

export interface PersistentStatsData {
  totalRoundsPlayed: number;
  totalWordsDiscovered: number;
  totalPointsScored: number;
  highestRoundScore: number;
  longestWordFound: string;
  totalGiftsReceived: number;
  totalLikesReceived: number;
  totalFollowsReceived: number;
  totalSharesReceived: number;
  discoveredWordsGlobal: string[];
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
}

export class LeaderboardManager {
  private scoresPath: string;
  private statsPath: string;
  private scoresData!: PersistentScoresData;
  private statsData!: PersistentStatsData;
  private roundPlayers: Map<string, PlayerRecord> = new Map();
  private discoveredWordsEverSet: Set<string> = new Set();

  constructor() {
    this.scoresPath = path.resolve(process.cwd(), 'data/scores.json');
    this.statsPath = path.resolve(process.cwd(), 'data/statistics.json');
    this.load();
  }

  private getTodayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public load(): void {
    const todayStr = this.getTodayString();
    try {
      const rawScores = JSON.parse(fs.readFileSync(this.scoresPath, 'utf-8'));
      this.scoresData = {
        allTime: rawScores.allTime || {},
        today:
          rawScores.today && rawScores.today.date === todayStr
            ? rawScores.today
            : { date: todayStr, players: {} },
        giftContributors: rawScores.giftContributors || {},
      };
    } catch {
      this.scoresData = {
        allTime: {},
        today: { date: todayStr, players: {} },
        giftContributors: {},
      };
    }

    try {
      const rawStats = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
      this.statsData = {
        totalRoundsPlayed: rawStats.totalRoundsPlayed || 0,
        totalWordsDiscovered: rawStats.totalWordsDiscovered || 0,
        totalPointsScored: rawStats.totalPointsScored || 0,
        highestRoundScore: rawStats.highestRoundScore || 0,
        longestWordFound: rawStats.longestWordFound || '',
        totalGiftsReceived: rawStats.totalGiftsReceived || 0,
        totalLikesReceived: rawStats.totalLikesReceived || 0,
        totalFollowsReceived: rawStats.totalFollowsReceived || 0,
        totalSharesReceived: rawStats.totalSharesReceived || 0,
        discoveredWordsGlobal: rawStats.discoveredWordsGlobal || [],
        history: rawStats.history || [],
      };
      this.discoveredWordsEverSet = new Set(this.statsData.discoveredWordsGlobal);
    } catch {
      this.statsData = {
        totalRoundsPlayed: 0,
        totalWordsDiscovered: 0,
        totalPointsScored: 0,
        highestRoundScore: 0,
        longestWordFound: '',
        totalGiftsReceived: 0,
        totalLikesReceived: 0,
        totalFollowsReceived: 0,
        totalSharesReceived: 0,
        discoveredWordsGlobal: [],
        history: [],
      };
    }
  }

  public save(): void {
    try {
      this.statsData.discoveredWordsGlobal = Array.from(this.discoveredWordsEverSet).slice(-2000);
      fs.writeFileSync(this.scoresPath, JSON.stringify(this.scoresData, null, 2));
      fs.writeFileSync(this.statsPath, JSON.stringify(this.statsData, null, 2));
    } catch (err) {
      console.error('Failed to persist scores/stats:', err);
    }
  }

  private ensureTodayCurrent(): void {
    const todayStr = this.getTodayString();
    if (this.scoresData.today.date !== todayStr) {
      this.scoresData.today = { date: todayStr, players: {} };
    }
  }

  private createBlankRecord(userId: string, username: string, nickname?: string, avatarUrl?: string): PlayerRecord {
    return {
      userId,
      username,
      nickname: nickname || username,
      avatarUrl,
      totalPoints: 0,
      validWordsCount: 0,
      totalSubmissions: 0,
      longestWord: '',
      highestSingleWordScore: 0,
      giftsSentCount: 0,
      giftDiamondsTotal: 0,
      giftPointsContributed: 0,
      likesContributed: 0,
      lastActiveAt: Date.now(),
    };
  }

  public registerPlayer(userId: string, username: string, nickname?: string, avatarUrl?: string): PlayerRecord {
    this.ensureTodayCurrent();
    if (!this.roundPlayers.has(userId)) {
      this.roundPlayers.set(userId, this.createBlankRecord(userId, username, nickname, avatarUrl));
    } else {
      const existing = this.roundPlayers.get(userId)!;
      if (nickname) existing.nickname = nickname;
      if (avatarUrl) existing.avatarUrl = avatarUrl;
      existing.lastActiveAt = Date.now();
    }

    if (!this.scoresData.allTime[userId]) {
      this.scoresData.allTime[userId] = this.createBlankRecord(userId, username, nickname, avatarUrl);
    }
    if (!this.scoresData.today.players[userId]) {
      this.scoresData.today.players[userId] = this.createBlankRecord(userId, username, nickname, avatarUrl);
    }

    return this.roundPlayers.get(userId)!;
  }

  public isWordEverDiscovered(word: string): boolean {
    return this.discoveredWordsEverSet.has(word.toLowerCase());
  }

  public recordSubmissionAttempt(userId: string, username: string, nickname?: string, avatarUrl?: string): void {
    const roundRec = this.registerPlayer(userId, username, nickname, avatarUrl);
    roundRec.totalSubmissions += 1;
    this.scoresData.today.players[userId].totalSubmissions += 1;
    this.scoresData.allTime[userId].totalSubmissions += 1;
  }

  public recordValidWord(params: {
    userId: string;
    username: string;
    nickname?: string;
    avatarUrl?: string;
    word: string;
    points: number;
  }): { isNewPersonalHigh: boolean; roundPlayer: PlayerRecord; allTimePlayer: PlayerRecord } {
    this.ensureTodayCurrent();
    const roundRec = this.registerPlayer(params.userId, params.username, params.nickname, params.avatarUrl);
    const todayRec = this.scoresData.today.players[params.userId];
    const allTimeRec = this.scoresData.allTime[params.userId];

    const isNewPersonalHigh = params.points > allTimeRec.highestSingleWordScore && allTimeRec.validWordsCount > 0;

    for (const rec of [roundRec, todayRec, allTimeRec]) {
      rec.totalPoints += params.points;
      rec.validWordsCount += 1;
      if (params.word.length > rec.longestWord.length) {
        rec.longestWord = params.word.toUpperCase();
      }
      if (params.points > rec.highestSingleWordScore) {
        rec.highestSingleWordScore = params.points;
      }
      rec.lastActiveAt = Date.now();
    }

    this.discoveredWordsEverSet.add(params.word.toLowerCase());
    this.statsData.totalWordsDiscovered += 1;
    this.statsData.totalPointsScored += params.points;
    if (params.word.length > this.statsData.longestWordFound.length) {
      this.statsData.longestWordFound = params.word.toUpperCase();
    }

    this.save();
    return { isNewPersonalHigh, roundPlayer: roundRec, allTimePlayer: allTimeRec };
  }

  public recordGiftContribution(params: {
    userId: string;
    username: string;
    nickname?: string;
    avatarUrl?: string;
    giftName: string;
    repeatCount: number;
    diamondValue: number;
    pointsAwarded: number;
  }): void {
    const roundRec = this.registerPlayer(params.userId, params.username, params.nickname, params.avatarUrl);
    const todayRec = this.scoresData.today.players[params.userId];
    const allTimeRec = this.scoresData.allTime[params.userId];

    const totalDiamonds = params.diamondValue * params.repeatCount;

    for (const rec of [roundRec, todayRec, allTimeRec]) {
      rec.giftsSentCount += params.repeatCount;
      rec.giftDiamondsTotal += totalDiamonds;
      rec.giftPointsContributed += params.pointsAwarded;
      rec.totalPoints += params.pointsAwarded;
      rec.lastActiveAt = Date.now();
    }

    const existingGiftRec = this.scoresData.giftContributors[params.userId] || {
      userId: params.userId,
      username: params.username,
      nickname: params.nickname || params.username,
      avatarUrl: params.avatarUrl,
      giftsSentCount: 0,
      giftDiamondsTotal: 0,
      giftPointsContributed: 0,
      lastGiftName: params.giftName,
      lastGiftAt: Date.now(),
    };

    existingGiftRec.giftsSentCount += params.repeatCount;
    existingGiftRec.giftDiamondsTotal += totalDiamonds;
    existingGiftRec.giftPointsContributed += params.pointsAwarded;
    existingGiftRec.lastGiftName = params.giftName;
    existingGiftRec.lastGiftAt = Date.now();
    if (params.avatarUrl) existingGiftRec.avatarUrl = params.avatarUrl;

    this.scoresData.giftContributors[params.userId] = existingGiftRec;
    this.statsData.totalGiftsReceived += params.repeatCount;
    this.statsData.totalPointsScored += params.pointsAwarded;
    this.save();
  }

  public recordSocialContribution(params: {
    userId: string;
    username: string;
    nickname?: string;
    avatarUrl?: string;
    type: 'like' | 'follow' | 'share';
    count?: number;
    pointsAwarded: number;
  }): void {
    const roundRec = this.registerPlayer(params.userId, params.username, params.nickname, params.avatarUrl);
    const todayRec = this.scoresData.today.players[params.userId];
    const allTimeRec = this.scoresData.allTime[params.userId];

    for (const rec of [roundRec, todayRec, allTimeRec]) {
      rec.totalPoints += params.pointsAwarded;
      if (params.type === 'like') {
        rec.likesContributed += params.count || 1;
      }
      rec.lastActiveAt = Date.now();
    }

    if (params.type === 'like') this.statsData.totalLikesReceived += params.count || 1;
    if (params.type === 'follow') this.statsData.totalFollowsReceived += 1;
    if (params.type === 'share') this.statsData.totalSharesReceived += 1;
    this.statsData.totalPointsScored += params.pointsAwarded;
    this.save();
  }

  public recordRoundCompleted(summary: {
    roundNumber: number;
    mode: string;
    score: number;
    targetScore: number;
    wordsFound: number;
    totalPossibleWords: number;
  }): void {
    this.statsData.totalRoundsPlayed += 1;
    if (summary.score > this.statsData.highestRoundScore) {
      this.statsData.highestRoundScore = summary.score;
    }

    const roundBoard = this.getRoundLeaderboard(1);
    const topPlayer = roundBoard[0]?.nickname || 'Community';

    this.statsData.history.unshift({
      ...summary,
      topPlayer,
      endedAt: Date.now(),
    });
    if (this.statsData.history.length > 50) {
      this.statsData.history.length = 50;
    }

    this.save();
  }

  public resetRoundStats(): void {
    this.roundPlayers.clear();
  }

  public resetAllStats(): void {
    this.roundPlayers.clear();
    this.scoresData = {
      allTime: {},
      today: { date: this.getTodayString(), players: {} },
      giftContributors: {},
    };
    this.statsData = {
      totalRoundsPlayed: 0,
      totalWordsDiscovered: 0,
      totalPointsScored: 0,
      highestRoundScore: 0,
      longestWordFound: '',
      totalGiftsReceived: 0,
      totalLikesReceived: 0,
      totalFollowsReceived: 0,
      totalSharesReceived: 0,
      discoveredWordsGlobal: [],
      history: [],
    };
    this.discoveredWordsEverSet.clear();
    this.save();
  }

  public removeUserFromLeaderboards(userIdOrUsername: string): boolean {
    const target = userIdOrUsername.toLowerCase();
    let removed = false;

    for (const [key, rec] of this.roundPlayers.entries()) {
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        this.roundPlayers.delete(key);
        removed = true;
      }
    }

    for (const key of Object.keys(this.scoresData.today.players)) {
      const rec = this.scoresData.today.players[key];
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        delete this.scoresData.today.players[key];
        removed = true;
      }
    }

    for (const key of Object.keys(this.scoresData.allTime)) {
      const rec = this.scoresData.allTime[key];
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        delete this.scoresData.allTime[key];
        removed = true;
      }
    }

    for (const key of Object.keys(this.scoresData.giftContributors)) {
      const rec = this.scoresData.giftContributors[key];
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        delete this.scoresData.giftContributors[key];
        removed = true;
      }
    }

    if (removed) this.save();
    return removed;
  }

  public getPlayerStats(userIdOrUsername: string): {
    round: PlayerRecord | null;
    today: PlayerRecord | null;
    allTime: PlayerRecord | null;
  } {
    const key = userIdOrUsername.toLowerCase();
    const findInMap = (records: Iterable<PlayerRecord>) => {
      for (const r of records) {
        if (r.userId.toLowerCase() === key || r.username.toLowerCase() === key) return r;
      }
      return null;
    };

    return {
      round: findInMap(this.roundPlayers.values()),
      today: findInMap(Object.values(this.scoresData.today.players)),
      allTime: findInMap(Object.values(this.scoresData.allTime)),
    };
  }

  public getRoundLeaderboard(limit = 20): PlayerRecord[] {
    return Array.from(this.roundPlayers.values())
      .sort((a, b) => b.totalPoints - a.totalPoints || b.validWordsCount - a.validWordsCount)
      .slice(0, limit);
  }

  public getTodayLeaderboard(limit = 20): PlayerRecord[] {
    this.ensureTodayCurrent();
    return Object.values(this.scoresData.today.players)
      .sort((a, b) => b.totalPoints - a.totalPoints || b.validWordsCount - a.validWordsCount)
      .slice(0, limit);
  }

  public getAllTimeLeaderboard(limit = 20): PlayerRecord[] {
    return Object.values(this.scoresData.allTime)
      .sort((a, b) => b.totalPoints - a.totalPoints || b.validWordsCount - a.validWordsCount)
      .slice(0, limit);
  }

  public getMostWordsLeaderboard(limit = 20): PlayerRecord[] {
    return Object.values(this.scoresData.allTime)
      .sort((a, b) => b.validWordsCount - a.validWordsCount || b.totalPoints - a.totalPoints)
      .slice(0, limit);
  }

  public getHighestScoringViewers(limit = 20): PlayerRecord[] {
    return Object.values(this.scoresData.allTime)
      .sort((a, b) => b.highestSingleWordScore - a.highestSingleWordScore || b.totalPoints - a.totalPoints)
      .slice(0, limit);
  }

  public getGiftLeaderboard(limit = 20) {
    return Object.values(this.scoresData.giftContributors)
      .sort((a, b) => b.giftDiamondsTotal - a.giftDiamondsTotal || b.giftsSentCount - a.giftsSentCount)
      .slice(0, limit);
  }

  public getAllLeaderboards(limit = 15) {
    return {
      round: this.getRoundLeaderboard(limit),
      today: this.getTodayLeaderboard(limit),
      allTime: this.getAllTimeLeaderboard(limit),
      gifts: this.getGiftLeaderboard(limit),
      mostWords: this.getMostWordsLeaderboard(limit),
      highScorers: this.getHighestScoringViewers(limit),
      participatingViewersCount: this.roundPlayers.size,
      statistics: this.statsData,
    };
  }
}

export const leaderboardManager = new LeaderboardManager();
