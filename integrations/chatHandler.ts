import { gameEngine } from '../server/gameEngine.ts';
import { leaderboardManager } from '../server/leaderboard.ts';
import { eventManager } from '../server/eventManager.ts';

export interface IncomingChatPayload {
  userId: string;
  username: string;
  nickname?: string;
  avatarUrl?: string;
  comment: string;
  simulated?: boolean;
}

export class ChatHandler {
  public handleIncomingChat(payload: IncomingChatPayload) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableChatEvents) {
      return { handled: false, reason: 'CHAT_EVENTS_DISABLED' };
    }

    const rawText = String(payload.comment || '').trim();
    if (!rawText) {
      return { handled: false, reason: 'EMPTY_MESSAGE' };
    }

    const gameConfig = gameEngine.getGameConfig();
    const prefix = gameConfig.commandPrefix || '!';
    const simulated = Boolean(payload.simulated);
    const displayName = payload.nickname || payload.username || 'Viewer';

    // Check if this is a supported system command (!score, !top, !words, !time, !help, !join, !stats)
    if (rawText.startsWith(prefix)) {
      const parts = rawText.slice(prefix.length).trim().split(/\s+/);
      const cmd = (parts[0] || '').toLowerCase();

      if (this.isSupportedCommand(cmd)) {
        if (!gameConfig.enabledCommands[cmd]) {
          return { handled: false, reason: 'COMMAND_DISABLED' };
        }
        return this.executeCommand(cmd, payload, simulated);
      }
    }

    // Strip common command prefixes or wrappers (e.g., "!guess stream", "!w stream", "word: stream", "!apple")
    let cleanedText = rawText;
    if (cleanedText.startsWith(prefix)) {
      cleanedText = cleanedText.slice(prefix.length).trim();
    }
    cleanedText = cleanedText.replace(/^(guess|word|w|answer|find)[:\s]+/i, '').trim();

    // Extract word tokens from comment
    const tokens = cleanedText.split(/[\s,.:;!?"'()-]+/).filter(Boolean);
    if (tokens.length === 0) {
      return { handled: false, reason: 'NO_TOKENS' };
    }

    // 1. If it's a single word token, submit it directly to game engine
    if (tokens.length === 1) {
      const candidateWord = tokens[0].replace(/[^a-zA-Z]/g, '');
      if (!candidateWord) {
        gameEngine.pushChatFeed({
          userId: payload.userId,
          username: payload.username,
          nickname: displayName,
          avatarUrl: payload.avatarUrl,
          text: rawText.slice(0, 80),
          status: 'chat',
          simulated,
        });
        return { handled: true, type: 'chat' };
      }

      return gameEngine.submitWord({
        userId: payload.userId,
        username: payload.username,
        nickname: displayName,
        avatarUrl: payload.avatarUrl,
        word: candidateWord,
        source: simulated ? 'simulation' : 'tiktok',
      });
    }

    // 2. If it's a multi-word message (e.g. "I think STREAM is on the board" or "!guess STREAM"), check if any token is a valid word on the board!
    const state = gameEngine.getFullState();
    const boardLetters = state.board.letters;
    const discoveredSet = new Set(state.discoveredWords.map((d) => d.word.toLowerCase()));

    for (const token of tokens) {
      const cleanToken = token.replace(/[^a-zA-Z]/g, '');
      if (cleanToken.length >= (gameConfig.minWordLength || 3)) {
        const validation = gameEngine['validator'].validateSubmission({
          word: cleanToken,
          boardLetters,
          discoveredWords: discoveredSet,
          minWordLength: gameConfig.minWordLength || 3,
          maxWordLength: gameConfig.maxWordLength || 10,
          mandatoryCenterLetter: state.board.centerLetter,
          activeLockedIndices: [],
          decoyIndices: [],
          hiddenIndices: [],
          bonusTileIndices: [],
        });

        if (validation.valid) {
          return gameEngine.submitWord({
            userId: payload.userId,
            username: payload.username,
            nickname: displayName,
            avatarUrl: payload.avatarUrl,
            word: cleanToken,
            source: simulated ? 'simulation' : 'tiktok',
          });
        }
      }
    }

    // 3. General multi-word chat message -> Record in chat stream so all viewer messages appear live!
    gameEngine.pushChatFeed({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      text: rawText.slice(0, 100),
      status: 'chat',
      simulated,
    });
    return { handled: true, type: 'chat' };
  }

  private isSupportedCommand(cmd: string): boolean {
    return ['score', 'top', 'words', 'time', 'help', 'join', 'stats'].includes(cmd);
  }

  private executeCommand(cmd: string, payload: IncomingChatPayload, simulated: boolean) {
    const displayName = payload.nickname || payload.username || 'Viewer';
    const state = gameEngine.getFullState();
    let responseText = '';

    switch (cmd) {
      case 'join': {
        leaderboardManager.registerPlayer(payload.userId, payload.username, displayName, payload.avatarUrl);
        responseText = `${displayName} joined the word arena! Type words from the board to score!`;
        eventManager.emitGameEvent('leaderboard:updated', leaderboardManager.getAllLeaderboards(), simulated);
        break;
      }
      case 'score': {
        const stats = leaderboardManager.getPlayerStats(payload.userId);
        const roundPts = stats.round?.totalPoints || 0;
        const allTimePts = stats.allTime?.totalPoints || 0;
        responseText = `@${displayName} — Round: ${roundPts} pts | All-Time: ${allTimePts} pts`;
        break;
      }
      case 'stats': {
        const stats = leaderboardManager.getPlayerStats(payload.userId);
        const words = stats.allTime?.validWordsCount || 0;
        const best = stats.allTime?.longestWord || '—';
        responseText = `@${displayName} Stats — Words: ${words} | Longest: ${best} | Gifts: ${stats.allTime?.giftsSentCount || 0}`;
        break;
      }
      case 'top': {
        const top3 = leaderboardManager
          .getRoundLeaderboard(3)
          .map((p, i) => `#${i + 1} ${p.nickname} (${p.totalPoints})`)
          .join(' · ');
        responseText = top3 ? `Round Leaders: ${top3}` : 'No scores yet this round — find the first word!';
        break;
      }
      case 'words': {
        responseText = `Discovered ${state.discoveredWords.length} / ${state.board.totalPossibleWords} possible words this round!`;
        break;
      }
      case 'time': {
        responseText = `Round ${state.roundNumber}: ${state.remainingSeconds}s remaining (${state.status}).`;
        break;
      }
      case 'help': {
        responseText = 'Type any valid word from the letter tiles! Commands: !join !score !top !words !time !stats';
        break;
      }
    }

    gameEngine.pushChatFeed({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      text: `!${cmd} → ${responseText}`,
      status: 'command',
      simulated,
    });

    eventManager.emitGameEvent(
      'command:response',
      {
        command: cmd,
        userId: payload.userId,
        username: payload.username,
        nickname: displayName,
        responseText,
      },
      simulated
    );

    return { handled: true, type: 'command', command: cmd, responseText };
  }
}

export const chatHandler = new ChatHandler();
