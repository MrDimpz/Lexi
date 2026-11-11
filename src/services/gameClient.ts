import { useState, useEffect, useRef, useCallback } from 'react';
import { GameFullState, DiscoveredWordEntry, ProcessedGiftRecord } from '../types/game.ts';
import { soundEngine } from './soundEngine.ts';

export interface ActiveCelebration {
  id: string;
  type: 'word' | 'gift' | 'milestone' | 'follow' | 'share';
  title: string;
  subtitle: string;
  points?: number;
  badgeText?: string;
  simulated?: boolean;
  tier?: 'small' | 'medium' | 'large';
}

export interface RoundSummaryPayload {
  roundNumber: number;
  reason: string;
  roundScore: number;
  targetScore: number;
  targetReached: boolean;
  discoveredWords: DiscoveredWordEntry[];
  missedWords: string[];
  totalPossibleWords: number;
}

export function useGameClient() {
  const [gameState, setGameState] = useState<GameFullState | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastHighlightedIndices, setLastHighlightedIndices] = useState<number[]>([]);
  const [lastWordBanner, setLastWordBanner] = useState<{
    word: string;
    finder: string;
    points: number;
    isPangram: boolean;
    comboCount: number;
  } | null>(null);
  const [activeCelebration, setActiveCelebration] = useState<ActiveCelebration | null>(null);
  const [roundSummary, setRoundSummary] = useState<RoundSummaryPayload | null>(null);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const celebrationTimeoutRef = useRef<number | null>(null);

  const fetchStateFallback = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data: GameFullState = await res.json();
        setGameState(data);
        soundEngine.configure(data.settingsConfig?.audio);
      }
    } catch (err) {
      console.error('Error fetching initial state:', err);
    }
  }, []);

  const triggerCelebration = useCallback((cel: ActiveCelebration, durationMs = 4200) => {
    setActiveCelebration(cel);
    if (celebrationTimeoutRef.current) {
      window.clearTimeout(celebrationTimeoutRef.current);
    }
    celebrationTimeoutRef.current = window.setTimeout(() => {
      setActiveCelebration(null);
    }, durationMs);
  }, []);

  useEffect(() => {
    fetchStateFallback();

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ action: 'sync' }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handleServerEvent(msg);
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeoutRef.current = window.setTimeout(connectWs, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    const handleServerEvent = (msg: any) => {
      const { type, payload, simulated, connectedDisplays } = msg;

      if (type === 'state:sync') {
        setGameState(payload);
        soundEngine.configure(payload.settingsConfig?.audio);
        return;
      }

      if (type === 'submission:Ack') {
        if (!payload.accepted) {
          setSubmissionFeedback({ type: 'error', message: payload.message });
        } else {
          setSubmissionFeedback({
            type: 'success',
            message: `+${payload.scoreBreakdown?.totalPoints || 0} pts · ${payload.word}`,
          });
        }
        return;
      }

      setGameState((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (typeof connectedDisplays === 'number') {
          next.connectedDisplays = connectedDisplays;
        }

        switch (type) {
          case 'round:countdown':
            next.status = payload.status;
            next.roundNumber = payload.roundNumber;
            next.countdownSeconds = payload.countdownSeconds;
            setRoundSummary(null);
            soundEngine.play('countdown', payload.countdownSeconds <= 1 ? 1 : 0);
            break;

          case 'board:generated':
            next.board = {
              ...next.board,
              letters: payload.letters,
              centerLetter: payload.centerLetter,
              centerIndex: payload.centerIndex,
              totalPossibleWords: payload.totalPossibleWords,
              pangramCount: payload.pangramCount,
              modifiers: payload.modifiers || next.board.modifiers,
              wordSlots: payload.wordSlots || next.board.wordSlots,
            };
            next.targetScore = payload.targetScore;
            if (payload.difficulty) next.difficulty = payload.difficulty;
            break;

          case 'board:modifier_updated':
            next.board = {
              ...next.board,
              letters: payload.letters,
              centerLetter: payload.centerLetter,
              centerIndex: payload.centerIndex,
              modifiers: payload.modifiers || next.board.modifiers,
            };
            if (payload.notice) {
              setSubmissionFeedback({ type: 'success', message: payload.notice });
            }
            break;

          case 'difficulty:adapted':
            next.difficulty = payload.newDifficulty;
            if (payload.metrics) {
              next.performanceMetrics = payload.metrics;
            }
            triggerCelebration({
              id: `diff-${Date.now()}`,
              type: 'milestone',
              title: `Adaptive Difficulty: ${payload.newDifficulty.toUpperCase()}`,
              subtitle: payload.reason,
              badgeText: 'DYNAMIC AI PACING',
            });
            break;

          case 'round:started':
            next.status = payload.status;
            next.roundNumber = payload.roundNumber;
            next.remainingSeconds = payload.remainingSeconds;
            next.discoveredWords = [];
            next.revealedHints = [];
            next.roundScore = 0;
            if (payload.modifiers || payload.wordSlots) {
              next.board = {
                ...next.board,
                letters: payload.letters || next.board.letters,
                modifiers: payload.modifiers || next.board.modifiers,
                wordSlots: payload.wordSlots || next.board.wordSlots,
              };
            }
            setRoundSummary(null);
            soundEngine.play('gameStart');
            break;

          case 'round:timer':
            next.status = payload.status;
            next.remainingSeconds = payload.remainingSeconds;
            if (typeof payload.intermissionSeconds === 'number') {
              next.intermissionSeconds = payload.intermissionSeconds;
            }
            if (payload.isFinalCountdown && payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) {
              soundEngine.play('countdown', payload.remainingSeconds <= 2 ? 1 : 0);
            }
            break;

          case 'game:paused':
          case 'game:resumed':
            next.status = payload.status;
            next.remainingSeconds = payload.remainingSeconds;
            break;

          case 'game:reset':
            return { ...prev, ...payload };

          case 'word:accepted': {
            const entry: DiscoveredWordEntry = payload.entry;
            const exists = next.discoveredWords.some((w) => w.word === entry.word);
            if (!exists) {
              next.discoveredWords = [entry, ...next.discoveredWords];
            }
            if (payload.wordSlots) {
              next.board = {
                ...next.board,
                wordSlots: payload.wordSlots,
              };
            }
            next.roundScore = payload.roundScore;
            next.targetScore = payload.targetScore;
            if (payload.performanceMetrics) {
              next.performanceMetrics = payload.performanceMetrics;
            }

            setLastHighlightedIndices(entry.usedTileIndices || []);
            setLastWordBanner({
              word: entry.word,
              finder: entry.foundByNickname,
              points: entry.points,
              isPangram: entry.isPangram,
              comboCount: entry.comboCount,
            });
            if (highlightTimeoutRef.current) {
              window.clearTimeout(highlightTimeoutRef.current);
            }
            highlightTimeoutRef.current = window.setTimeout(() => {
              setLastHighlightedIndices([]);
              setLastWordBanner(null);
            }, 2200);

            if (payload.isNewPersonalHigh || entry.isPangram) {
              soundEngine.play('highScore');
            } else {
              soundEngine.play('validWord', entry.word.length - 3);
            }

            if (payload.scoreBreakdown?.milestoneTriggered) {
              soundEngine.play('milestone');
              triggerCelebration({
                id: `ms-${Date.now()}`,
                type: 'milestone',
                title: 'Community Score Milestone!',
                subtitle: `+${payload.scoreBreakdown.milestoneBonusPoints} Bonus Community Points Unlocked!`,
                points: payload.scoreBreakdown.milestoneBonusPoints,
                simulated,
              });
            }
            break;
          }

          case 'word:rejected':
            soundEngine.play('invalidWord');
            break;

          case 'hint:revealed':
            next.revealedHints = payload.revealedHints || [...next.revealedHints, payload.hint];
            if (payload.wordSlots) {
              next.board = {
                ...next.board,
                wordSlots: payload.wordSlots,
              };
            }
            soundEngine.play('milestone');
            break;

          case 'score:updated':
            next.roundScore = payload.roundScore;
            next.targetScore = payload.targetScore;
            if (payload.activeMultiplier) {
              next.activeMultiplier = payload.activeMultiplier;
            }
            break;

          case 'leaderboard:updated':
            next.leaderboards = payload;
            break;

          case 'chat:message': {
            const exists = next.chatFeed.some((c) => c.id === payload.id);
            if (!exists) {
              next.chatFeed = [payload, ...next.chatFeed].slice(0, 60);
            }
            break;
          }

          case 'gift:received': {
            const giftRec: ProcessedGiftRecord = payload;
            next.giftHistory = [giftRec, ...(next.giftHistory || [])].slice(0, 30);
            soundEngine.play('giftReceived');
            triggerCelebration(
              {
                id: giftRec.id,
                type: 'gift',
                title: `${giftRec.nickname} sent ${giftRec.giftName}${giftRec.repeatCount > 1 ? ` x${giftRec.repeatCount}` : ''}!`,
                subtitle: giftRec.message,
                points: giftRec.pointsAwarded,
                badgeText: giftRec.tier.toUpperCase() + ' GIFT',
                tier: giftRec.tier,
                simulated: giftRec.simulated,
              },
              5000
            );
            break;
          }

          case 'like:updated':
            next.roundLikes = payload.roundLikes;
            next.nextLikeMilestone = payload.nextMilestone;
            break;

          case 'like:milestone':
            soundEngine.play('milestone');
            triggerCelebration({
              id: `like-ms-${Date.now()}`,
              type: 'milestone',
              title: `${payload.milestone} Stream Likes Reached!`,
              subtitle: `Triggered by ${payload.triggeredBy} · +${payload.bonusPoints} Pts & +${payload.bonusTimeSeconds}s Time!`,
              points: payload.bonusPoints,
              simulated,
            });
            break;

          case 'follow:received':
            soundEngine.play('newFollower');
            triggerCelebration({
              id: `follow-${Date.now()}`,
              type: 'follow',
              title: `Welcome New Follower: ${payload.nickname}!`,
              subtitle: `Joined the leaderboard +${payload.bonusPoints} Community Points!`,
              points: payload.bonusPoints,
              simulated,
            });
            break;

          case 'share:received':
            soundEngine.play('milestone');
            triggerCelebration({
              id: `share-${Date.now()}`,
              type: 'share',
              title: `${payload.nickname} Shared the Stream!`,
              subtitle: `Community Celebration +${payload.bonusPoints} Points!`,
              points: payload.bonusPoints,
              simulated,
            });
            break;

          case 'round:ended':
            next.status = payload.status;
            next.leaderboards = payload.leaderboards || next.leaderboards;
            if (payload.difficulty) next.difficulty = payload.difficulty;
            if (payload.performanceMetrics) next.performanceMetrics = payload.performanceMetrics;
            setRoundSummary({
              roundNumber: payload.roundNumber,
              reason: payload.reason,
              roundScore: payload.roundScore,
              targetScore: payload.targetScore,
              targetReached: payload.targetReached,
              discoveredWords: payload.discoveredWords,
              missedWords: payload.missedWords,
              totalPossibleWords: payload.totalPossibleWords,
            });
            if (payload.targetReached) {
              soundEngine.play('victory');
            } else {
              soundEngine.play('roundEnd');
            }
            break;

          case 'tiktok:connected':
          case 'tiktok:disconnected':
            next.tiktok = payload;
            break;

          case 'tiktok:error':
            next.tiktok = payload.state || next.tiktok;
            break;

          case 'config:updated':
            if (payload.gameConfig) {
              next.gameConfig = payload.gameConfig;
              next.difficulty = payload.gameConfig.difficulty;
              next.autoDifficulty = payload.gameConfig.autoDifficulty;
              next.progressiveElementsEnabled = payload.gameConfig.progressiveElementsEnabled;
            }
            if (payload.scoringConfig) next.scoringConfig = payload.scoringConfig;
            if (payload.settingsConfig) {
              next.settingsConfig = payload.settingsConfig;
              soundEngine.configure(payload.settingsConfig.audio);
            }
            if (payload.giftsConfig) next.giftsConfig = payload.giftsConfig;
            break;
        }

        return next;
      });
    };

    connectWs();

    return () => {
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
      if (celebrationTimeoutRef.current) window.clearTimeout(celebrationTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [fetchStateFallback, triggerCelebration]);

  const sendControlAction = async (action: string) => {
    const res = await fetch('/api/game/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.state) {
      setGameState((prev) => (prev ? { ...prev, ...data.state } : data.state));
    }
    return data;
  };

  const submitWord = async (word: string, username = 'SoloPlayer') => {
    setSubmissionFeedback(null);
    const res = await fetch('/api/game/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, username }),
    });
    const data = await res.json();
    if (!data.accepted) {
      setSubmissionFeedback({ type: 'error', message: data.message });
    } else {
      setSubmissionFeedback({
        type: 'success',
        message: `+${data.scoreBreakdown?.totalPoints || 0} pts · "${data.word}" accepted!`,
      });
    }
    return data;
  };

  const updateGameConfig = async (partial: any) => {
    const res = await fetch('/api/config/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    const data = await res.json();
    if (data.state) {
      setGameState((prev) => (prev ? { ...prev, ...data.state } : data.state));
    }
    return data;
  };

  const updateScoringConfig = async (partial: any) => {
    const res = await fetch('/api/config/scoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    return res.json();
  };

  const updateGiftsConfig = async (partial: any) => {
    const res = await fetch('/api/config/gifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    return res.json();
  };

  const updateSettingsConfig = async (partial: any) => {
    const res = await fetch('/api/config/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    return res.json();
  };

  const sendModerationAction = async (action: string, target?: string) => {
    const res = await fetch('/api/moderation/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, target }),
    });
    return res.json();
  };

  const connectTikTok = async (username: string) => {
    const res = await fetch('/api/tiktok/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (data.tiktok) {
      setGameState((prev) => (prev ? { ...prev, tiktok: data.tiktok } : prev));
    }
    return data;
  };

  const disconnectTikTok = async () => {
    const res = await fetch('/api/tiktok/disconnect', { method: 'POST' });
    const data = await res.json();
    if (data.tiktok) {
      setGameState((prev) => (prev ? { ...prev, tiktok: data.tiktok } : prev));
    }
    return data;
  };

  const reconnectTikTok = async () => {
    const res = await fetch('/api/tiktok/reconnect', { method: 'POST' });
    const data = await res.json();
    if (data.tiktok) {
      setGameState((prev) => (prev ? { ...prev, tiktok: data.tiktok } : prev));
    }
    return data;
  };

  const simulateEvent = async (payload: any) => {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  };

  const runTestSuite = async () => {
    const res = await fetch('/api/tests/run', { method: 'POST' });
    return res.json();
  };

  return {
    gameState,
    wsConnected,
    lastHighlightedIndices,
    lastWordBanner,
    activeCelebration,
    roundSummary,
    setRoundSummary,
    submissionFeedback,
    setSubmissionFeedback,
    sendControlAction,
    submitWord,
    updateGameConfig,
    updateScoringConfig,
    updateGiftsConfig,
    updateSettingsConfig,
    sendModerationAction,
    connectTikTok,
    disconnectTikTok,
    reconnectTikTok,
    simulateEvent,
    runTestSuite,
  };
}
