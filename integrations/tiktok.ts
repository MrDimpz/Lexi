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
  private manualDisconnect = false;

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
    this.clearReconnectTimer();
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

    if (this.connection) {
      try {
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
      const conn = new TikTokLiveConnection(cleanUsername, {
        processInitialData: true,
        fetchRoomInfoOnConnect: true,
        enableExtendedGiftInfo: false,
      });

      this.connection = conn;
      this.bindEvents(conn);

      const state = await conn.connect();
      this.status = 'CONNECTED';
      this.roomId = state.roomId || conn.roomId || null;
      this.lastError = null;
      this.addLog('info', `Connected to @${cleanUsername} LIVE (Room ID: ${this.roomId})`);

      eventManager.emitGameEvent('tiktok:connected', this.getState());
      return { success: true, status: this.status, roomId: this.roomId };
    } catch (err: any) {
      const errMsg =
        err?.message ||
        'Could not connect to TikTok LIVE. Verify the streamer is currently LIVE and username is correct.';
      this.status = 'ERROR';
      this.roomId = null;
      this.lastError = errMsg;
      this.addLog('error', `Connection failed for @${cleanUsername}: ${errMsg}`);

      eventManager.emitGameEvent('tiktok:error', {
        username: this.username,
        error: errMsg,
        state: this.getState(),
      });

      return { success: false, status: this.status, error: errMsg };
    }
  }

  public async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.clearReconnectTimer();

    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.connection = null;
    }

    this.status = 'DISCONNECTED';
    this.roomId = null;
    this.viewerCount = 0;
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

  private scheduleAutoReconnect(): void {
    const tiktokConfig = gameEngine.getSettingsConfig().tiktok;
    if (this.manualDisconnect || !tiktokConfig.autoReconnect || !this.username) {
      return;
    }
    this.clearReconnectTimer();
    const delay = Math.max(3000, tiktokConfig.reconnectIntervalMs || 5000);
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
      this.status = 'DISCONNECTED';
      this.addLog('warn', `TikTok WebSocket disconnected (${info?.reason || 'stream closed'}).`);
      eventManager.emitGameEvent('tiktok:disconnected', this.getState());
      this.scheduleAutoReconnect();
    });

    conn.on(ControlEvent.ERROR, (err) => {
      const msg = err?.message || String(err);
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
