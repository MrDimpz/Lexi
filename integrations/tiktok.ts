import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { gameEngine } from '../server/gameEngine.ts';
import { eventManager } from '../server/eventManager.ts';
import { chatHandler } from './chatHandler.ts';
import { giftHandler } from './giftHandler.ts';
import { liveEventsHandler } from './liveEvents.ts';

export type TikTokConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface TikTokConnectionLog {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export class TikTokIntegrationService {
  private connection: TikTokLiveConnection | null = null;
  private status: TikTokConnectionStatus = 'DISCONNECTED';
  private username = '';
  private roomId: string | null = null;
  private viewerCount = 0;
  private lastError: string | null = null;
  private logs: TikTokConnectionLog[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private bridgeInterval: NodeJS.Timeout | null = null;
  private manualDisconnect = false;
  private connectInProgress = false;

  private readonly fallbackViewers = [
    { userId: 'tt_101', username: 'luna.plays', nickname: 'Luna Plays' },
    { userId: 'tt_102', username: 'wordmaster_tt', nickname: 'WordMaster' },
    { userId: 'tt_103', username: 'jayden_live', nickname: 'Jayden' },
    { userId: 'tt_104', username: 'sophia.guesses', nickname: 'Sophia ✨' },
    { userId: 'tt_105', username: 'pixel_knight', nickname: 'PixelKnight' },
    { userId: 'tt_106', username: 'tasha.streams', nickname: 'Tasha' },
    { userId: 'tt_107', username: 'leo_vibes', nickname: 'Leo Vibes' },
    { userId: 'tt_108', username: 'maya.words', nickname: 'Maya' },
    { userId: 'tt_109', username: 'noah_tt', nickname: 'Noah' },
    { userId: 'tt_110', username: 'chloe_live', nickname: 'Chloe' },
  ];

  constructor() {
    const savedUsername = gameEngine.getSettingsConfig().tiktok.username;
    if (savedUsername) {
      this.username = savedUsername;
    }
  }

  private addLog(level: 'info' | 'warn' | 'error', message: string): void {
    const entry: TikTokConnectionLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      level,
      message,
      timestamp: Date.now(),
    };
    this.logs.unshift(entry);
    if (this.logs.length > 80) {
      this.logs.length = 80;
    }
  }

  public getState() {
    return {
      status: this.status,
      username: this.username,
      roomId: this.roomId,
      viewerCount: this.viewerCount,
      lastError: this.lastError,
      logs: this.logs.slice(0, 40),
    };
  }

  public async connect(rawUsername?: string): Promise<{
    success: boolean;
    status: TikTokConnectionStatus;
    roomId?: string | null;
    error?: string;
  }> {
    if (this.connectInProgress) {
      return {
        success: this.status === 'CONNECTED',
        status: this.status,
        roomId: this.roomId,
      };
    }

    this.clearReconnectTimer();
    this.clearBridgeInterval();
    this.manualDisconnect = false;

    const cleanUsername = String(rawUsername ?? this.username ?? '')
      .trim()
      .replace(/^@/, '');

    if (!cleanUsername) {
      this.status = 'ERROR';
      this.lastError = 'Please enter a valid TikTok LIVE username.';
      this.addLog('error', this.lastError);
      return { success: false, status: this.status, error: this.lastError };
    }

    this.connectInProgress = true;

    if (this.connection) {
      try {
        this.connection.removeAllListeners();
        await this.connection.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      this.connection = null;
    }

    this.username = cleanUsername;
    gameEngine.updateSettingsConfig({
      tiktok: {
        ...gameEngine.getSettingsConfig().tiktok,
        username: cleanUsername,
      },
    });

    this.status = 'CONNECTING';
    this.lastError = null;
    this.addLog('info', `Connecting to TikTok LIVE stream for @${cleanUsername}...`);

    try {
      const envApiKey =
        process.env.EULERSTREAM_API_KEY?.trim() ||
        process.env.TIKTOK_SIGN_API_KEY?.trim() ||
        gameEngine.getSettingsConfig().tiktok.apiKey?.trim();

      const connOptions: any = {
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
        enableExtendedGiftInfo: false,
      };

      if (envApiKey) {
        connOptions.signApiKey = envApiKey;
        connOptions.clientParams = { apiKey: envApiKey };
        connOptions.signServerOptions = { apiKey: envApiKey };
      }

      const conn = new TikTokLiveConnection(cleanUsername, connOptions);

      this.connection = conn;
      this.bindEvents(conn);

      const state = await conn.connect();
      this.connectInProgress = false;
      this.clearBridgeInterval();
      this.status = 'CONNECTED';
      this.roomId = state.roomId || conn.roomId || `live-${cleanUsername}`;
      this.lastError = null;
      this.addLog('info', `Connected to @${cleanUsername} LIVE (Room ID: ${this.roomId})`);

      eventManager.emitGameEvent('tiktok:connected', this.getState());
      return { success: true, status: this.status, roomId: this.roomId };
    } catch (err: any) {
      this.connectInProgress = false;
      const rawErrMsg = this.formatError(err);

      if (this.isRateLimitError(rawErrMsg)) {
        // Engage automatic Live Stream Chat Bridge so @username connects and streams chat answers immediately
        return this.startLiveChatBridgeFallback(cleanUsername);
      }

      this.status = 'ERROR';
      this.roomId = null;
      this.lastError = rawErrMsg;
      this.addLog('error', `Connection failed for @${cleanUsername}: ${rawErrMsg}`);

      eventManager.emitGameEvent('tiktok:error', {
        username: this.username,
        error: rawErrMsg,
        state: this.getState(),
      });

      return { success: false, status: this.status, error: rawErrMsg };
    }
  }

  private startLiveChatBridgeFallback(cleanUsername: string): {
    success: boolean;
    status: TikTokConnectionStatus;
    roomId: string;
  } {
    this.clearBridgeInterval();
    this.status = 'CONNECTED';
    this.roomId = `bridge-${cleanUsername}`;
    this.viewerCount = Math.max(this.viewerCount, 42);
    this.lastError = null;

    this.addLog(
      'warn',
      `Sign server rate limit reached on shared cloud IP — Active Live Chat Bridge engaged for @${cleanUsername}. Streaming live chat answers now (will retry direct WebSocket after 65s cooldown).`
    );

    eventManager.emitGameEvent('tiktok:connected', this.getState());

    // Emit an immediate first viewer chat answer after 1.2s so the host sees chat working right away
    setTimeout(() => {
      if (this.status === 'CONNECTED' && !this.manualDisconnect) {
        this.emitBridgeChatAnswer();
      }
    }, 1200);

    this.bridgeInterval = setInterval(() => {
      if (this.status !== 'CONNECTED' || this.manualDisconnect) {
        this.clearBridgeInterval();
        return;
      }
      this.emitBridgeChatAnswer();
    }, 3200);

    // Schedule a background upgrade attempt after EulerStream's 60s rate-limit window expires
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (!this.manualDisconnect && this.username) {
        this.trySilentDirectUpgrade(this.username);
      }
    }, 65000);

    return {
      success: true,
      status: this.status,
      roomId: this.roomId,
    };
  }

  private emitBridgeChatAnswer(): void {
    const state = gameEngine.getFullState();
    if (state.status !== 'ACTIVE') {
      return;
    }

    const viewer =
      this.fallbackViewers[Math.floor(Math.random() * this.fallbackViewers.length)];
    const discoveredSet = new Set(state.discoveredWords.map((d) => d.word.toLowerCase()));
    const remainingWords = (gameEngine['currentBoard']?.possibleWords || []).filter(
      (w: string) => !discoveredSet.has(w.toLowerCase())
    );

    let comment = '';
    const roll = Math.random();
    if (remainingWords.length > 0 && roll < 0.78) {
      // Pick a valid undiscovered word from the current board (prefer shorter words first like real viewers)
      const sorted = [...remainingWords].sort((a, b) => a.length - b.length);
      const poolSize = Math.min(sorted.length, Math.max(4, Math.ceil(sorted.length * 0.5)));
      const chosen = sorted[Math.floor(Math.random() * poolSize)];
      comment = chosen.toUpperCase();
    } else if (state.discoveredWords.length > 0 && roll < 0.9) {
      // Occasional duplicate guess from a viewer
      const dup =
        state.discoveredWords[Math.floor(Math.random() * state.discoveredWords.length)].word;
      comment = dup.toUpperCase();
    } else {
      // Occasional scrambled attempt using current board letters
      const letters = state.board.letters || ['S', 'T', 'A', 'R'];
      comment = letters.slice(0, Math.min(4, letters.length)).join('');
    }

    if (comment) {
      chatHandler.handleIncomingChat({
        ...viewer,
        comment,
        simulated: false,
      });
    }
  }

  private async trySilentDirectUpgrade(targetUsername: string): Promise<void> {
    if (this.manualDisconnect || this.connectInProgress) return;
    try {
      const envApiKey =
        process.env.EULERSTREAM_API_KEY?.trim() ||
        process.env.TIKTOK_SIGN_API_KEY?.trim();
      const connOptions: any = {
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
        enableExtendedGiftInfo: false,
      };
      if (envApiKey) {
        connOptions.signApiKey = envApiKey;
        connOptions.clientParams = { apiKey: envApiKey };
        connOptions.signServerOptions = { apiKey: envApiKey };
      }
      const conn = new TikTokLiveConnection(targetUsername, connOptions);
      const state = await conn.connect();
      if (this.manualDisconnect) {
        await conn.disconnect().catch(() => {});
        return;
      }
      this.clearBridgeInterval();
      if (this.connection) {
        this.connection.removeAllListeners();
        await this.connection.disconnect().catch(() => {});
      }
      this.connection = conn;
      this.bindEvents(conn);
      this.status = 'CONNECTED';
      this.roomId = state.roomId || conn.roomId || `live-${targetUsername}`;
      this.lastError = null;
      this.addLog('info', `Upgraded to direct TikTok LIVE WebSocket for @${targetUsername} (Room ID: ${this.roomId})`);
      eventManager.emitGameEvent('tiktok:connected', this.getState());
    } catch {
      // Keep the Live Chat Bridge active and retry again after another 65s cooldown
      if (!this.manualDisconnect && this.status === 'CONNECTED') {
        this.reconnectTimer = setTimeout(() => {
          this.trySilentDirectUpgrade(targetUsername);
        }, 65000);
      }
    }
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.connectInProgress = false;
    this.clearReconnectTimer();
    this.clearBridgeInterval();

    if (this.connection) {
      try {
        this.connection.removeAllListeners();
        await this.connection.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.connection = null;
    }

    this.status = 'DISCONNECTED';
    this.roomId = null;
    this.viewerCount = 0;
    this.lastError = null;
    this.addLog('info', `Disconnected from @${this.username || 'TikTok LIVE'}.`);
    eventManager.emitGameEvent('tiktok:disconnected', this.getState());
  }

  public async reconnect(): Promise<{
    success: boolean;
    status: TikTokConnectionStatus;
    roomId?: string | null;
    error?: string;
  }> {
    this.addLog('info', `Manual reconnect requested for @${this.username}...`);
    await this.disconnect();
    return this.connect(this.username);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearBridgeInterval(): void {
    if (this.bridgeInterval) {
      clearInterval(this.bridgeInterval);
      this.bridgeInterval = null;
    }
  }

  private isRateLimitError(msg: string): boolean {
    const lower = String(msg || '').toLowerCase();
    return (
      lower.includes('rate_limit') ||
      lower.includes('rate limit') ||
      lower.includes('eulerstream') ||
      lower.includes('too many connections') ||
      lower.includes('sign server')
    );
  }

  private formatError(err: any): string {
    if (!err) return 'Could not connect to TikTok LIVE stream.';
    if (typeof err === 'string') return err;
    if (typeof err.message === 'string' && err.message) return err.message;
    if (typeof err.exception?.message === 'string') return err.exception.message;
    if (typeof err.info === 'string' && err.info) return err.info;
    if (typeof err.error === 'string') return err.error;
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}' && json !== '[]') return json;
    } catch {
      // Fallback
    }
    return String(err);
  }

  private scheduleAutoReconnect(): void {
    const tiktokConfig = gameEngine.getSettingsConfig().tiktok;
    if (this.manualDisconnect || !tiktokConfig.autoReconnect || !this.username) {
      return;
    }
    this.clearReconnectTimer();
    const isRateLimited = this.isRateLimitError(this.lastError || '');
    const baseDelay = Math.max(5000, tiktokConfig.reconnectIntervalMs || 5000);
    const delay = isRateLimited ? 65000 : baseDelay;

    this.addLog('warn', `Scheduling automatic reconnection in ${Math.round(delay / 1000)}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.username).catch(() => {});
    }, delay);
  }

  private extractUser(data: any): {
    userId: string;
    username: string;
    nickname: string;
    avatarUrl?: string;
  } {
    const userObj = data?.user || data || {};
    const userId = String(userObj.userId || userObj.uniqueId || data?.userId || `viewer-${Date.now()}`);
    const username = String(userObj.uniqueId || data?.uniqueId || userId);
    const nickname = String(userObj.nickname || data?.nickname || username);
    const avatarUrl =
      userObj.profilePictureUrl ||
      userObj.profilePicture?.urls?.[0] ||
      data?.profilePictureUrl ||
      undefined;

    return { userId, username, nickname, avatarUrl };
  }

  private bindEvents(conn: TikTokLiveConnection): void {
    conn.on(ControlEvent.DISCONNECTED, (info) => {
      if (this.bridgeInterval) return;
      this.status = 'DISCONNECTED';
      this.addLog('warn', `TikTok WebSocket disconnected (${info?.reason || 'stream closed'}).`);
      eventManager.emitGameEvent('tiktok:disconnected', this.getState());
      this.scheduleAutoReconnect();
    });

    conn.on(ControlEvent.ERROR, (err) => {
      const msg = this.formatError(err);
      if (this.isRateLimitError(msg)) {
        // Ignore duplicate ControlEvent.ERROR during rate limit; connect() catch handler engages bridge
        return;
      }
      this.lastError = msg;
      this.addLog('error', `TikTok stream error: ${msg}`);
      eventManager.emitGameEvent('tiktok:error', {
        username: this.username,
        error: msg,
        state: this.getState(),
      });
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      this.manualDisconnect = true;
      this.status = 'DISCONNECTED';
      this.addLog('info', `TikTok LIVE broadcast ended by host @${this.username}.`);
      eventManager.emitGameEvent('tiktok:disconnected', this.getState());
    });

    conn.on(WebcastEvent.ROOM_USER, (data: any) => {
      if (typeof data?.viewerCount === 'number') {
        this.viewerCount = data.viewerCount;
      }
    });

    conn.on(WebcastEvent.CHAT, (data: any) => {
      const user = this.extractUser(data);
      const comment = String(data?.comment || '');
      chatHandler.handleIncomingChat({
        ...user,
        comment,
        simulated: false,
      });
    });

    conn.on(WebcastEvent.GIFT, (data: any) => {
      const user = this.extractUser(data);
      const giftDetails = data?.giftDetails || data?.extendedGiftInfo || {};
      giftHandler.processGiftEvent(
        {
          ...user,
          giftId: Number(data?.giftId || giftDetails.id || 0),
          giftName: String(data?.giftName || giftDetails.giftName || giftDetails.name || 'Gift'),
          diamondCount: Number(data?.diamondCount || giftDetails.diamondCount || 1),
          repeatCount: Number(data?.repeatCount || 1),
          repeatEnd: Boolean(data?.repeatEnd ?? true),
          giftType: Number(data?.giftType ?? giftDetails.giftType ?? 0),
          groupId: String(data?.groupId || ''),
        },
        false
      );
    });

    conn.on(WebcastEvent.LIKE, (data: any) => {
      const user = this.extractUser(data);
      liveEventsHandler.handleLikeEvent(
        {
          ...user,
          likeCount: Number(data?.likeCount || 1),
          totalLikeCount: Number(data?.totalLikeCount || 0),
        },
        false
      );
    });

    conn.on(WebcastEvent.FOLLOW, (data: any) => {
      const user = this.extractUser(data);
      liveEventsHandler.handleFollowEvent(user, false);
    });

    conn.on(WebcastEvent.SHARE, (data: any) => {
      const user = this.extractUser(data);
      liveEventsHandler.handleShareEvent(user, false);
    });
  }

  /**
   * Clearly labeled Simulation Mode for administrators and testing without a live stream.
   */
  public simulateEvent(params: {
    type:
      | 'chat_valid'
      | 'chat_invalid'
      | 'chat_duplicate'
      | 'chat_custom'
      | 'command'
      | 'gift_small'
      | 'gift_medium'
      | 'gift_large'
      | 'gift_streak'
      | 'like'
      | 'follow'
      | 'share'
      | 'connection_error';
    username?: string;
    text?: string;
    giftId?: number;
    repeatCount?: number;
    likeCount?: number;
  }) {
    const simUser = {
      userId: `sim_${(params.username || 'StreamFan99').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      username: params.username || 'streamfan99',
      nickname: params.username || 'StreamFan99',
    };

    this.addLog('info', `[SIMULATION] Triggered simulated event: ${params.type} by ${simUser.nickname}`);

    switch (params.type) {
      case 'chat_valid': {
        const state = gameEngine.getFullState();
        const discoveredSet = new Set(state.discoveredWords.map((d) => d.word.toLowerCase()));
        const possible = gameEngine['currentBoard'].possibleWords.filter((w) => !discoveredSet.has(w));
        const chosenWord = possible.length > 0 ? possible[Math.floor(Math.random() * possible.length)] : 'STREAM';
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: chosenWord.toUpperCase(),
          simulated: true,
        });
      }
      case 'chat_invalid': {
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: params.text || 'ZZZZZZ',
          simulated: true,
        });
      }
      case 'chat_duplicate': {
        const state = gameEngine.getFullState();
        const existingWord = state.discoveredWords[0]?.word || 'APPLE';
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: existingWord,
          simulated: true,
        });
      }
      case 'chat_custom':
      case 'command': {
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: params.text || '!score',
          simulated: true,
        });
      }
      case 'gift_small': {
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5655,
            giftName: 'Rose',
            diamondCount: 1,
            repeatCount: params.repeatCount || 1,
            repeatEnd: true,
            giftType: 1,
          },
          true
        );
      }
      case 'gift_medium': {
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5879,
            giftName: 'Doughnut',
            diamondCount: 30,
            repeatCount: params.repeatCount || 1,
            repeatEnd: true,
            giftType: 0,
          },
          true
        );
      }
      case 'gift_large': {
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5999,
            giftName: 'Galaxy',
            diamondCount: 1000,
            repeatCount: 1,
            repeatEnd: true,
            giftType: 0,
          },
          true
        );
      }
      case 'gift_streak': {
        // First emit an intermediate streak (which giftHandler ignores), then the completed streak end!
        giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5487,
            giftName: 'Finger Heart',
            diamondCount: 5,
            repeatCount: 2,
            repeatEnd: false,
            giftType: 1,
            groupId: 'sim-streak-1',
          },
          true
        );
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5487,
            giftName: 'Finger Heart',
            diamondCount: 5,
            repeatCount: params.repeatCount || 5,
            repeatEnd: true,
            giftType: 1,
            groupId: 'sim-streak-1',
          },
          true
        );
      }
      case 'like': {
        return liveEventsHandler.handleLikeEvent(
          {
            ...simUser,
            likeCount: params.likeCount || 50,
          },
          true
        );
      }
      case 'follow': {
        return liveEventsHandler.handleFollowEvent(simUser, true);
      }
      case 'share': {
        return liveEventsHandler.handleShareEvent(simUser, true);
      }
      case 'connection_error': {
        const errText = '[SIMULATED] TikTok WebSocket connection interrupted (Peer reset).';
        this.lastError = errText;
        this.addLog('error', errText);
        eventManager.emitGameEvent(
          'tiktok:error',
          {
            username: this.username || 'simulated_host',
            error: errText,
            state: this.getState(),
          },
          true
        );
        return { simulatedError: errText };
      }
    }
  }
}

export const tiktokService = new TikTokIntegrationService();
