import React, { useState } from 'react';
import { GameFullState, GiftTierConfig } from '../types/game.ts';
import { soundEngine, SoundKey } from '../services/soundEngine.ts';
import { BrandLogo, BRAND_NAME, BRAND_TAGLINE } from './BrandLogo.tsx';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Shuffle,
  Lightbulb,
  Trash2,
  Radio,
  Wifi,
  WifiOff,
  Sliders,
  Award,
  Gift,
  ShieldAlert,
  Volume2,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Plus,
} from 'lucide-react';

interface AdminDashboardProps {
  gameState: GameFullState;
  onControlAction: (action: string) => Promise<any>;
  onUpdateGameConfig: (partial: any) => Promise<any>;
  onUpdateScoringConfig: (partial: any) => Promise<any>;
  onUpdateGiftsConfig: (partial: any) => Promise<any>;
  onUpdateSettingsConfig: (partial: any) => Promise<any>;
  onModerationAction: (action: string, target?: string) => Promise<any>;
  onConnectTikTok: (username: string) => Promise<any>;
  onDisconnectTikTok: () => Promise<any>;
  onReconnectTikTok: () => Promise<any>;
  onSimulateEvent: (payload: any) => Promise<any>;
  onRunTestSuite: () => Promise<any>;
}

type AdminTab = 'control' | 'modes' | 'scoring' | 'gifts' | 'moderation' | 'simulation';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  gameState,
  onControlAction,
  onUpdateGameConfig,
  onUpdateScoringConfig,
  onUpdateGiftsConfig,
  onUpdateSettingsConfig,
  onModerationAction,
  onConnectTikTok,
  onDisconnectTikTok,
  onReconnectTikTok,
  onSimulateEvent,
  onRunTestSuite,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('control');
  const [tiktokUsernameInput, setTiktokUsernameInput] = useState<string>(
    gameState.tiktok.username || gameState.settingsConfig.tiktok.username || ''
  );
  const [connectingTikTok, setConnectingTikTok] = useState(false);

  // Moderation & Dictionary local inputs
  const [blockUserInput, setBlockUserInput] = useState('');
  const [removeLeaderInput, setRemoveLeaderInput] = useState('');
  const [customWordInput, setCustomWordInput] = useState('');
  const [excludedWordInput, setExcludedWordInput] = useState('');

  // Simulation local inputs
  const [simUsername, setSimUsername] = useState('TikTokViewer77');
  const [simCustomText, setSimCustomText] = useState('!score');
  const [testResults, setTestResults] = useState<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: Array<{
      id: string;
      name: string;
      category: string;
      passed: boolean;
      details: string;
      durationMs: number;
    }>;
  } | null>(null);
  const [runningTests, setRunningTests] = useState(false);

  // New Gift local state
  const [newGiftName, setNewGiftName] = useState('');
  const [newGiftId, setNewGiftId] = useState('6001');
  const [newGiftDiamonds, setNewGiftDiamonds] = useState('10');
  const [newGiftPoints, setNewGiftPoints] = useState('30');
  const [newGiftTime, setNewGiftTime] = useState('5');
  const [newGiftEffect, setNewGiftEffect] = useState<GiftTierConfig['effect']>('add_time_and_points');

  const handleTikTokConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectingTikTok(true);
    try {
      await onConnectTikTok(tiktokUsernameInput);
    } finally {
      setConnectingTikTok(false);
    }
  };

  const handleRunTests = async () => {
    setRunningTests(true);
    try {
      const res = await onRunTestSuite();
      setTestResults(res);
    } finally {
      setRunningTests(false);
    }
  };

  const handleAddGiftTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGiftName.trim()) return;
    const diamonds = Math.max(1, parseInt(newGiftDiamonds, 10) || 1);
    const newTier: GiftTierConfig = {
      id: newGiftName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      giftId: parseInt(newGiftId, 10) || 6001,
      name: newGiftName.trim(),
      tier: diamonds >= 100 ? 'large' : diamonds >= 10 ? 'medium' : 'small',
      diamondValue: diamonds,
      effect: newGiftEffect,
      pointsAwarded: parseInt(newGiftPoints, 10) || 20,
      timeAddedSeconds: parseInt(newGiftTime, 10) || 5,
      multiplier: newGiftEffect === 'score_multiplier' ? 2 : newGiftEffect === 'frenzy_bonus_round' ? 3 : 1,
      durationSeconds: newGiftEffect === 'score_multiplier' || newGiftEffect === 'frenzy_bonus_round' ? 30 : 0,
      animation: 'sparkle_burst',
      soundEffect: 'gift_medium',
      messageTemplate: `{user} sent {gift}! +${parseInt(newGiftPoints, 10) || 20} Community Pts!`,
    };
    await onUpdateGiftsConfig({
      tiers: [...gameState.giftsConfig.tiers, newTier],
    });
    setNewGiftName('');
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'control', label: 'Live Control & TikTok', icon: <Radio className="w-4 h-4" /> },
    { id: 'modes', label: 'Game Modes & Rules', icon: <Sliders className="w-4 h-4" /> },
    { id: 'scoring', label: 'Scoring & Milestones', icon: <Award className="w-4 h-4" /> },
    { id: 'gifts', label: 'TikTok Gift Matrix', icon: <Gift className="w-4 h-4" /> },
    { id: 'moderation', label: 'Moderation & Audio', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'simulation', label: 'Simulation & Tests', icon: <FlaskConical className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      {/* Branded Admin Studio Header */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <BrandLogo size="md" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              {BRAND_TAGLINE} · Host Broadcast Studio
            </div>
            <h1 className="text-lg sm:text-xl font-display font-extrabold text-white">
              {BRAND_NAME} — Live Stream Control Center
            </h1>
          </div>
        </div>
        <div className="text-xs text-slate-300 font-mono">
          Difficulty: <strong className="text-amber-300 uppercase">{gameState.difficulty}</strong> · Mode:{' '}
          <strong className="text-white uppercase">{gameState.gameMode}</strong>
        </div>
      </div>

      {/* Top Status KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
          <div className="text-xs text-slate-400">Game Status</div>
          <div className="text-base font-display font-bold text-white mt-0.5">
            {gameState.status} · R{gameState.roundNumber}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
          <div className="text-xs text-slate-400">Round Timer</div>
          <div className="text-base font-mono font-bold text-amber-400 tabular-nums mt-0.5">
            {Math.floor(gameState.remainingSeconds / 60)}:
            {String(gameState.remainingSeconds % 60).padStart(2, '0')}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
          <div className="text-xs text-slate-400">Community Score</div>
          <div className="text-base font-mono font-bold text-emerald-400 tabular-nums mt-0.5">
            {gameState.roundScore} / {gameState.targetScore}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
          <div className="text-xs text-slate-400">Words Discovered</div>
          <div className="text-base font-mono font-bold text-slate-100 tabular-nums mt-0.5">
            {gameState.discoveredWords.length} / {gameState.board.totalPossibleWords}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
          <div className="text-xs text-slate-400">TikTok LIVE</div>
          <div
            className={`text-sm font-mono font-bold mt-0.5 truncate ${
              gameState.tiktok.status === 'CONNECTED'
                ? 'text-emerald-400'
                : gameState.tiktok.status === 'ERROR'
                ? 'text-rose-400'
                : 'text-slate-400'
            }`}
          >
            {gameState.tiktok.status}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
          <div className="text-xs text-slate-400">Displays & Viewers</div>
          <div className="text-base font-mono font-bold text-sky-400 tabular-nums mt-0.5">
            {gameState.connectedDisplays || 1} screens · {gameState.leaderboards.participatingViewersCount} players
          </div>
        </div>
      </div>

      {/* Admin Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === item.id
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: LIVE CONTROL & TIKTOK CONNECTION */}
      {activeTab === 'control' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Authoritative Game Controls & TikTok Connection */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Game Controls Panel */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <h2 className="text-base font-display font-bold text-white mb-1">
                Host Game Controls
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Control the authoritative server timer, board state, and round progression across all connected OBS and browser displays.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => onControlAction('start_round')}
                  className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  <span>Start / Restart Round</span>
                </button>

                {gameState.status === 'PAUSED' ? (
                  <button
                    type="button"
                    onClick={() => onControlAction('resume')}
                    className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>Resume Round</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onControlAction('pause')}
                    disabled={gameState.status !== 'ACTIVE'}
                    className="px-3.5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-500/40 text-amber-300 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    <span>Pause Timer</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onControlAction('next_round')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Skip to Next Round</span>
                </button>

                <button
                  type="button"
                  onClick={() => onControlAction('end_round')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>End Current Round</span>
                </button>

                <button
                  type="button"
                  onClick={() => onControlAction('shuffle_board')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle Tiles</span>
                </button>

                <button
                  type="button"
                  onClick={() => onControlAction('reveal_hint')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Reveal Word Hint</span>
                </button>

                <button
                  type="button"
                  onClick={() => onControlAction('reset_game')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Round (Keep Records)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onControlAction('reset_scores')}
                  className="px-3.5 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-800/60 text-rose-200 font-medium text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer sm:col-span-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Entire Game & All-Time Scores</span>
                </button>
              </div>

              {/* Live Progressive Round Mechanics & Hazard Injector */}
              <div className="mt-5 pt-4 border-t border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                      Progressive Round Mechanics & Live Board Modifiers
                    </h3>
                    <p className="text-xs text-slate-400">
                      Modifiers spawn automatically as rounds advance, or inject them into the current round now:
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameState.progressiveElementsEnabled ?? true}
                      onChange={(e) =>
                        onUpdateGameConfig({ progressiveElementsEnabled: e.target.checked })
                      }
                      className="rounded accent-amber-400"
                    />
                    <span>Auto-Spawn by Round</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => onControlAction('add_hidden')}
                    className="px-3 py-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>+ Mystery &ldquo;?&rdquo; Tile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onControlAction('add_decoy')}
                    className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>+ Decoy Trap Tile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onControlAction('add_locked')}
                    className="px-3 py-2 rounded-xl bg-amber-950/80 hover:bg-amber-900/80 border border-amber-500/40 text-amber-200 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>+ Locked Tile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onControlAction('add_bonus')}
                    className="px-3 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>+ Golden +5pt Tile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onControlAction('unlock_and_reveal_all')}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer col-span-2 sm:col-span-1"
                  >
                    <span>Unlock & Reveal All</span>
                  </button>
                </div>
              </div>
            </div>

            {/* TikTok LIVE Connection Panel */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-display font-bold text-white">
                    TikTok LIVE Stream Connector
                  </h2>
                  <p className="text-xs text-slate-400">
                    Connect to any active TikTok LIVE broadcast by username. No QR code or viewer install required.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  {gameState.tiktok.status === 'CONNECTED' ? (
                    <span className="text-emerald-400 flex items-center gap-1.5 font-semibold">
                      <Wifi className="w-4 h-4" /> CONNECTED
                    </span>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <WifiOff className="w-4 h-4" /> {gameState.tiktok.status}
                    </span>
                  )}
                </div>
              </div>

              <form onSubmit={handleTikTokConnectSubmit} className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  type="text"
                  value={tiktokUsernameInput}
                  onChange={(e) => setTiktokUsernameInput(e.target.value)}
                  placeholder="Enter TikTok @username (must be currently LIVE)"
                  className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={connectingTikTok}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {connectingTikTok ? 'Connecting...' : 'Connect LIVE'}
                </button>
                <button
                  type="button"
                  onClick={onReconnectTikTok}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Reconnect
                </button>
                <button
                  type="button"
                  onClick={onDisconnectTikTok}
                  className="px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/50 text-rose-200 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Disconnect
                </button>
              </form>

              {gameState.tiktok.lastError && (
                <div className="mb-3 px-3.5 py-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-200">
                  <strong>Connection Notice:</strong> {gameState.tiktok.lastError}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gameState.settingsConfig.tiktok.autoReconnect}
                    onChange={(e) =>
                      onUpdateSettingsConfig({
                        tiktok: {
                          ...gameState.settingsConfig.tiktok,
                          autoReconnect: e.target.checked,
                        },
                      })
                    }
                    className="rounded accent-amber-400"
                  />
                  <span>Automatic Reconnection on Stream Drop</span>
                </label>
                {gameState.tiktok.roomId && (
                  <span className="font-mono text-emerald-400">Room ID: {gameState.tiktok.roomId}</span>
                )}
              </div>

              {/* Connection Logs */}
              <div className="rounded-lg bg-slate-950 border border-slate-800/90 p-3 max-h-40 overflow-y-auto font-mono text-[11px] space-y-1">
                {gameState.tiktok.logs.length === 0 ? (
                  <div className="text-slate-500">
                    No connection logs yet. Enter a TikTok LIVE username above or use Simulation Mode to test events.
                  </div>
                ) : (
                  gameState.tiktok.logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="text-slate-500 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={
                          log.level === 'error'
                            ? 'text-rose-400'
                            : log.level === 'warn'
                            ? 'text-amber-300'
                            : 'text-slate-300'
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Live Chat, Gifts, and System Telemetry */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Recent Chat & Word Submissions</h3>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {gameState.chatFeed.length} events
                </span>
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {gameState.chatFeed.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4 text-center">No chat messages yet.</div>
                ) : (
                  gameState.chatFeed.slice(0, 25).map((item) => (
                    <div
                      key={item.id}
                      className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 truncate">
                        {item.simulated && (
                          <span className="text-amber-400 font-mono mr-1.5">[SIM]</span>
                        )}
                        <strong className="text-slate-200">{item.nickname}: </strong>
                        <span
                          className={
                            item.status === 'accepted'
                              ? 'text-emerald-400 font-mono font-bold'
                              : item.status === 'rejected'
                              ? 'text-rose-400'
                              : 'text-sky-300'
                          }
                        >
                          {item.text}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {item.status === 'accepted'
                          ? `+${item.points} pts`
                          : item.reason || item.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Recent Gift Event History</h3>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {gameState.giftHistory?.length || 0} gifts
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {!gameState.giftHistory || gameState.giftHistory.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4 text-center">No gifts received yet.</div>
                ) : (
                  gameState.giftHistory.map((gift) => (
                    <div
                      key={gift.id}
                      className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 truncate">
                        {gift.simulated && (
                          <span className="text-amber-400 font-mono mr-1.5">[SIM]</span>
                        )}
                        <strong className="text-rose-300">{gift.nickname}</strong> sent{' '}
                        <span className="text-white font-semibold">
                          {gift.giftName} x{gift.repeatCount}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-400 shrink-0 tabular-nums">
                        +{gift.pointsAwarded} pts
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GAME MODES & RULES */}
      {activeTab === 'modes' && (
        <div className="flex flex-col gap-6">
          {/* Dynamic Difficulty & Real-Time Adaptive Scaling Panel */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-display font-bold text-white mb-1">
                  Dynamic Difficulty & Automatic Audience Adaptation
                </h2>
                <p className="text-xs text-slate-400">
                  Adjusts round duration, minimum word length, target score multiplier, and vowel/consonant board complexity.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2 text-amber-300 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gameState.autoDifficulty ?? true}
                    onChange={(e) => onUpdateGameConfig({ autoDifficulty: e.target.checked })}
                    className="rounded accent-amber-400"
                  />
                  <span>Auto-Adapt Difficulty to Viewer Performance</span>
                </label>

                <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gameState.progressiveElementsEnabled ?? true}
                    onChange={(e) =>
                      onUpdateGameConfig({ progressiveElementsEnabled: e.target.checked })
                    }
                    className="rounded accent-amber-400"
                  />
                  <span>Progressive Round Elements (Hidden, Decoy, Locked)</span>
                </label>
              </div>
            </div>

            {/* 4 Difficulty Level Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {(
                [
                  {
                    key: 'easy',
                    label: 'Easy',
                    desc: '+30s duration · Min 3L · High vowel friendliness · 0.8x Target',
                  },
                  {
                    key: 'medium',
                    label: 'Medium',
                    desc: 'Standard duration · Min 3L · Balanced letter mix · 1.0x Target',
                  },
                  {
                    key: 'hard',
                    label: 'Hard',
                    desc: '-15s duration · Min 4L · Complex consonant blends · 1.25x Target',
                  },
                  {
                    key: 'extreme',
                    label: 'Extreme',
                    desc: '-30s duration · Min 4L · Rare letters & high target · 1.5x Target',
                  },
                ] as const
              ).map((d) => {
                const isSelected = (gameState.difficulty || 'medium') === d.key;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => onUpdateGameConfig({ difficulty: d.key })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-sm text-white">{d.label}</span>
                      {isSelected && (
                        <span className="text-[11px] font-mono font-bold text-amber-400">ACTIVE</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{d.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* Real-Time Audience Performance & Engagement Telemetry */}
            {gameState.performanceMetrics && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-6 font-mono tabular-nums">
                  <div>
                    <span className="text-slate-400 font-sans">Words / Min: </span>
                    <strong className="text-emerald-400">
                      {gameState.performanceMetrics.wordsPerMinute} WPM
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans">Chat Accuracy: </span>
                    <strong className="text-sky-400">
                      {gameState.performanceMetrics.submissionAccuracy}%
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans">Target Completion: </span>
                    <strong className="text-amber-400">
                      {Math.round(gameState.performanceMetrics.targetCompletionRatio * 100)}%
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans">Engagement Index: </span>
                    <strong className="text-white">
                      {gameState.performanceMetrics.engagementScore} / 100
                    </strong>
                  </div>
                </div>
                {gameState.performanceMetrics.lastAdaptationNotice && (
                  <div className="text-amber-300 font-medium">
                    {gameState.performanceMetrics.lastAdaptationNotice}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
            <h2 className="text-base font-display font-bold text-white mb-1">
              Select Game Mode Preset
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Switching game mode automatically updates round duration, board size, and target rules.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(gameState.gameConfig.modes).map(([modeKey, mode]) => {
                const isSelected = gameState.gameConfig.gameMode === modeKey;
                return (
                  <button
                    key={modeKey}
                    type="button"
                    onClick={() => onUpdateGameConfig({ gameMode: modeKey })}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-sm text-white">{mode.name}</span>
                      {isSelected && (
                        <span className="text-[11px] font-mono font-bold text-amber-400">ACTIVE</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{mode.description}</p>
                    <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                      <span>{mode.roundDuration}s</span>
                      <span aria-hidden="true">·</span>
                      <span>{mode.boardSize} tiles</span>
                      <span aria-hidden="true">·</span>
                      <span>Min {mode.minWordLength}L</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Board & Timer Configuration</h3>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-400">Round Duration (seconds)</span>
                  <input
                    type="number"
                    min="20"
                    max="600"
                    value={gameState.gameConfig.roundDuration}
                    onChange={(e) =>
                      onUpdateGameConfig({ roundDuration: Math.max(20, Number(e.target.value)) })
                    }
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-slate-400">Board Letter Count (5–9)</span>
                  <input
                    type="number"
                    min="5"
                    max="9"
                    value={gameState.gameConfig.boardSize}
                    onChange={(e) =>
                      onUpdateGameConfig({
                        boardSize: Math.max(5, Math.min(9, Number(e.target.value))),
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-slate-400">Minimum Word Length</span>
                  <input
                    type="number"
                    min="3"
                    max="6"
                    value={gameState.gameConfig.minWordLength}
                    onChange={(e) =>
                      onUpdateGameConfig({
                        minWordLength: Math.max(3, Math.min(6, Number(e.target.value))),
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-slate-400">Submission Cooldown (ms)</span>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="250"
                    value={gameState.gameConfig.submissionCooldownMs}
                    onChange={(e) =>
                      onUpdateGameConfig({ submissionCooldownMs: Math.max(0, Number(e.target.value)) })
                    }
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </label>
              </div>

              <div className="space-y-2 pt-2 text-xs text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gameState.gameConfig.mandatoryCenterLetter}
                    onChange={(e) =>
                      onUpdateGameConfig({ mandatoryCenterLetter: e.target.checked })
                    }
                    className="rounded accent-amber-400"
                  />
                  <span>Require Mandatory Center Letter in every submitted word</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gameState.gameConfig.autoNextRound}
                    onChange={(e) => onUpdateGameConfig({ autoNextRound: e.target.checked })}
                    className="rounded accent-amber-400"
                  />
                  <span>Automatic Next-Round Progression after intermission</span>
                </label>
              </div>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">TikTok Chat Commands & Prefixes</h3>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-400">Command Prefix</span>
                  <input
                    type="text"
                    maxLength={2}
                    value={gameState.gameConfig.commandPrefix}
                    onChange={(e) =>
                      onUpdateGameConfig({ commandPrefix: e.target.value || '!' })
                    }
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </label>

                <label className="flex items-center gap-2 cursor-pointer pt-5">
                  <input
                    type="checkbox"
                    checked={gameState.gameConfig.requirePrefixForWords}
                    onChange={(e) =>
                      onUpdateGameConfig({ requirePrefixForWords: e.target.checked })
                    }
                    className="rounded accent-amber-400"
                  />
                  <span>Require prefix for words (e.g. !apple)</span>
                </label>
              </div>

              <div className="pt-2">
                <div className="text-xs text-slate-400 mb-2">Enable / Disable Individual Chat Commands:</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {Object.entries(gameState.gameConfig.enabledCommands).map(([cmd, enabled]) => (
                    <label
                      key={cmd}
                      className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          onUpdateGameConfig({
                            enabledCommands: {
                              ...gameState.gameConfig.enabledCommands,
                              [cmd]: e.target.checked,
                            },
                          })
                        }
                        className="rounded accent-amber-400"
                      />
                      <span className="font-mono text-slate-200">
                        {gameState.gameConfig.commandPrefix}
                        {cmd}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SCORING & SOCIAL MILESTONES */}
      {activeTab === 'scoring' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Points by Word Length</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(gameState.scoringConfig.lengthPoints).map(([len, pts]) => (
                <label key={len} className="flex flex-col gap-1">
                  <span className="text-slate-400">{len} Letters</span>
                  <input
                    type="number"
                    min="1"
                    value={pts}
                    onChange={(e) =>
                      onUpdateScoringConfig({
                        lengthPoints: {
                          ...gameState.scoringConfig.lengthPoints,
                          [len]: Math.max(1, Number(e.target.value)),
                        },
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 font-mono"
                  />
                </label>
              ))}
            </div>

            <h3 className="text-sm font-semibold text-white pt-3 border-t border-slate-800">
              Special Bonuses & Combos
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Unique First-Discovery Bonus</span>
                <input
                  type="number"
                  min="0"
                  value={gameState.scoringConfig.bonuses.uniqueWordBonus}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      bonuses: {
                        ...gameState.scoringConfig.bonuses,
                        uniqueWordBonus: Number(e.target.value),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Full-Board Pangram Bonus</span>
                <input
                  type="number"
                  min="0"
                  value={gameState.scoringConfig.bonuses.fullBoardPangramBonus}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      bonuses: {
                        ...gameState.scoringConfig.bonuses,
                        fullBoardPangramBonus: Number(e.target.value),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Combo Bonus per Consecutive Word</span>
                <input
                  type="number"
                  min="0"
                  value={gameState.scoringConfig.bonuses.comboStepBonus}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      bonuses: {
                        ...gameState.scoringConfig.bonuses,
                        comboStepBonus: Number(e.target.value),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Community Score Milestone Bonus</span>
                <input
                  type="number"
                  min="0"
                  value={gameState.scoringConfig.bonuses.communityMilestoneBonus}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      bonuses: {
                        ...gameState.scoringConfig.bonuses,
                        communityMilestoneBonus: Number(e.target.value),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">
              TikTok Likes, Follows & Shares Rewards
            </h2>
            <p className="text-xs text-slate-400">
              Configure milestone thresholds and automatic community point rewards for stream engagement.
            </p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Like Milestone Threshold (Likes)</span>
                <input
                  type="number"
                  min="10"
                  value={gameState.scoringConfig.socialRewards.likeMilestoneThreshold}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      socialRewards: {
                        ...gameState.scoringConfig.socialRewards,
                        likeMilestoneThreshold: Math.max(10, Number(e.target.value)),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Like Milestone Bonus Points</span>
                <input
                  type="number"
                  min="0"
                  value={gameState.scoringConfig.socialRewards.likeMilestonePoints}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      socialRewards: {
                        ...gameState.scoringConfig.socialRewards,
                        likeMilestonePoints: Number(e.target.value),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400">New Follower Bonus Points</span>
                <input
                  type="number"
                  min="0"
                  value={gameState.scoringConfig.socialRewards.followPoints}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      socialRewards: {
                        ...gameState.scoringConfig.socialRewards,
                        followPoints: Number(e.target.value),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Stream Share Bonus Points</span>
                <input
                  type="number"
                  min="0"
                  value={gameState.scoringConfig.socialRewards.sharePoints}
                  onChange={(e) =>
                    onUpdateScoringConfig({
                      socialRewards: {
                        ...gameState.scoringConfig.socialRewards,
                        sharePoints: Number(e.target.value),
                      },
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TIKTOK GIFT MATRIX */}
      {activeTab === 'gifts' && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-display font-bold text-white">
                  TikTok Gift Effect Matrix
                </h2>
                <p className="text-xs text-slate-400">
                  Assign game effects (bonus time, hints, 2X/3X score multipliers, community points) to specific TikTok LIVE gifts.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gameState.giftsConfig.giftsEnabled}
                  onChange={(e) => onUpdateGiftsConfig({ giftsEnabled: e.target.checked })}
                  className="rounded accent-amber-400"
                />
                <span>Enable Gift Game Triggers</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {gameState.giftsConfig.tiers.map((gift, idx) => (
                <div
                  key={gift.id}
                  className="rounded-xl bg-slate-950 border border-slate-800 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-white text-sm">
                        {gift.name} (ID: {gift.giftId})
                      </span>
                      <span className="text-xs font-mono text-amber-400">
                        {gift.diamondValue} Diamonds
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mb-3">
                      Tier: <strong className="uppercase text-slate-200">{gift.tier}</strong> · Effect:{' '}
                      <strong className="text-emerald-400">{gift.effect}</strong>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-500">Points Awarded</span>
                        <input
                          type="number"
                          value={gift.pointsAwarded}
                          onChange={(e) => {
                            const nextTiers = [...gameState.giftsConfig.tiers];
                            nextTiers[idx] = {
                              ...gift,
                              pointsAwarded: Number(e.target.value),
                            };
                            onUpdateGiftsConfig({ tiers: nextTiers });
                          }}
                          className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-white font-mono"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-500">Time Added (s)</span>
                        <input
                          type="number"
                          value={gift.timeAddedSeconds}
                          onChange={(e) => {
                            const nextTiers = [...gameState.giftsConfig.tiers];
                            nextTiers[idx] = {
                              ...gift,
                              timeAddedSeconds: Number(e.target.value),
                            };
                            onUpdateGiftsConfig({ tiers: nextTiers });
                          }}
                          className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-white font-mono"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 italic border-t border-slate-800/80 pt-2">
                    "{gift.messageTemplate}"
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Gift Trigger Form */}
            <form
              onSubmit={handleAddGiftTier}
              className="rounded-xl bg-slate-950 border border-slate-800 p-4 flex flex-wrap items-end gap-3 text-xs"
            >
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Gift Name</span>
                <input
                  type="text"
                  value={newGiftName}
                  onChange={(e) => setNewGiftName(e.target.value)}
                  placeholder="e.g. Lion"
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                />
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-slate-400">Gift ID</span>
                <input
                  type="number"
                  value={newGiftId}
                  onChange={(e) => setNewGiftId(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                />
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-slate-400">Diamonds</span>
                <input
                  type="number"
                  value={newGiftDiamonds}
                  onChange={(e) => setNewGiftDiamonds(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Effect</span>
                <select
                  value={newGiftEffect}
                  onChange={(e) => setNewGiftEffect(e.target.value as GiftTierConfig['effect'])}
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                >
                  <option value="add_time_and_points">Add Time & Points</option>
                  <option value="bonus_points">Bonus Points</option>
                  <option value="reveal_hint">Reveal Word Hint</option>
                  <option value="score_multiplier">2X Score Multiplier</option>
                  <option value="frenzy_bonus_round">3X Frenzy Bonus</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-slate-400">Points</span>
                <input
                  type="number"
                  value={newGiftPoints}
                  onChange={(e) => setNewGiftPoints(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                />
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-slate-400">+Time (s)</span>
                <input
                  type="number"
                  value={newGiftTime}
                  onChange={(e) => setNewGiftTime(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                />
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Gift Trigger</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: MODERATION, DICTIONARY & AUDIO */}
      {activeTab === 'moderation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Moderation & Dictionary Controls */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-white">Moderation & Dictionary Management</h2>

            {/* Block User */}
            <div className="space-y-2 text-xs">
              <div className="text-slate-400">Blocked Users (Prevented from submitting words):</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={blockUserInput}
                  onChange={(e) => setBlockUserInput(e.target.value)}
                  placeholder="Username to block"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (blockUserInput.trim()) {
                      onModerationAction('block_user', blockUserInput.trim());
                      setBlockUserInput('');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Block User
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {gameState.settingsConfig.moderation.blockedUsers.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => onModerationAction('unblock_user', u)}
                    className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-rose-300 hover:text-white text-xs cursor-pointer"
                  >
                    {u} ×
                  </button>
                ))}
              </div>
            </div>

            {/* Remove User from Leaderboard */}
            <div className="space-y-2 text-xs pt-3 border-t border-slate-800">
              <div className="text-slate-400">Remove User from Leaderboards:</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={removeLeaderInput}
                  onChange={(e) => setRemoveLeaderInput(e.target.value)}
                  placeholder="Username or User ID"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (removeLeaderInput.trim()) {
                      onModerationAction('remove_from_leaderboard', removeLeaderInput.trim());
                      setRemoveLeaderInput('');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Remove Player
                </button>
              </div>
            </div>

            {/* Custom & Excluded Dictionary Words */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800 text-xs">
              <div className="space-y-2">
                <div className="text-slate-400">Custom Dictionary Words:</div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customWordInput}
                    onChange={(e) => setCustomWordInput(e.target.value)}
                    placeholder="Add custom word"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customWordInput.trim()) {
                        onModerationAction('add_custom_word', customWordInput.trim());
                        setCustomWordInput('');
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium shrink-0 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {gameState.settingsConfig.moderation.customWords.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onModerationAction('remove_custom_word', w)}
                      className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-300 font-mono cursor-pointer"
                    >
                      {w} ×
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-slate-400">Excluded Dictionary Words:</div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={excludedWordInput}
                    onChange={(e) => setExcludedWordInput(e.target.value)}
                    placeholder="Exclude word"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (excludedWordInput.trim()) {
                        onModerationAction('add_excluded_word', excludedWordInput.trim());
                        setExcludedWordInput('');
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-medium shrink-0 cursor-pointer"
                  >
                    Exclude
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {gameState.settingsConfig.moderation.excludedWords.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onModerationAction('remove_excluded_word', w)}
                      className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-rose-300 font-mono cursor-pointer"
                    >
                      {w} ×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Audio & Event Stream Toggles */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-400" />
                <span>Audio Feedback & Sound Mixer</span>
              </h2>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gameState.settingsConfig.audio.muted}
                  onChange={(e) =>
                    onUpdateSettingsConfig({
                      audio: {
                        ...gameState.settingsConfig.audio,
                        muted: e.target.checked,
                      },
                    })
                  }
                  className="rounded accent-amber-400"
                />
                <span>Mute All Audio</span>
              </label>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">Master Volume:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={gameState.settingsConfig.audio.masterVolume}
                onChange={(e) =>
                  onUpdateSettingsConfig({
                    audio: {
                      ...gameState.settingsConfig.audio,
                      masterVolume: parseFloat(e.target.value),
                    },
                  })
                }
                className="flex-1 accent-amber-400"
              />
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(gameState.settingsConfig.audio.masterVolume * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(gameState.settingsConfig.audio.sounds).map(([sndKey, enabled]) => (
                <div
                  key={sndKey}
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        onUpdateSettingsConfig({
                          audio: {
                            ...gameState.settingsConfig.audio,
                            sounds: {
                              ...gameState.settingsConfig.audio.sounds,
                              [sndKey]: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded accent-amber-400"
                    />
                    <span className="text-slate-200 capitalize">{sndKey}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => soundEngine.play(sndKey as SoundKey)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    Test
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SIMULATION LAB & AUTOMATED TESTS */}
      {activeTab === 'simulation' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Interactive Event Simulator */}
          <div className="lg:col-span-6 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div>
              <h2 className="text-base font-display font-bold text-white">
                TikTok LIVE Event Simulator
              </h2>
              <p className="text-xs text-slate-400">
                Test every game interaction without requiring an active live stream. Simulated events are clearly labeled <code className="text-amber-300">[SIMULATED]</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Simulated Viewer Username</span>
                <input
                  type="text"
                  value={simUsername}
                  onChange={(e) => setSimUsername(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Custom Chat / Command Text</span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={simCustomText}
                    onChange={(e) => setSimCustomText(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onSimulateEvent({
                        type: 'chat_custom',
                        username: simUsername,
                        text: simCustomText,
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-amber-500 text-slate-950 font-semibold shrink-0 cursor-pointer"
                  >
                    Send
                  </button>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs pt-2">
              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'chat_valid', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold cursor-pointer"
              >
                Simulate Valid Word
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'chat_invalid', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold cursor-pointer"
              >
                Simulate Invalid Word
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'chat_duplicate', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
              >
                Simulate Duplicate Word
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'gift_small', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700/50 text-rose-200 font-medium cursor-pointer"
              >
                Small Gift (Rose +5s)
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'gift_medium', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 font-medium cursor-pointer"
              >
                Medium Gift (2X Score)
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'gift_large', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
              >
                Large Gift (Galaxy 3X)
              </button>

              <button
                type="button"
                onClick={() =>
                  onSimulateEvent({ type: 'gift_streak', username: simUsername, repeatCount: 5 })
                }
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium cursor-pointer"
              >
                Gift Streak (Finger Heart x5)
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'like', username: simUsername, likeCount: 50 })}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 font-medium cursor-pointer"
              >
                Simulate +50 Likes
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'follow', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium cursor-pointer"
              >
                Simulate New Follower
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'share', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-medium cursor-pointer"
              >
                Simulate Stream Share
              </button>

              <button
                type="button"
                onClick={() =>
                  onSimulateEvent({ type: 'command', username: simUsername, text: '!top' })
                }
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono cursor-pointer"
              >
                Command: !top
              </button>

              <button
                type="button"
                onClick={() => onSimulateEvent({ type: 'connection_error', username: simUsername })}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 font-medium cursor-pointer"
              >
                Simulate Disconnect Error
              </button>
            </div>
          </div>

          {/* Right: Automated Test Suite Runner */}
          <div className="lg:col-span-6 rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-display font-bold text-white">
                    Automated Verification Suite
                  </h2>
                  <p className="text-xs text-slate-400">
                    Runs 9 server-side unit & integration tests (Letter Gen, Validation, Duplicates, Scoring, Rounds, Timers, Gift Streaks, WS Sync, Leaderboards).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunTests}
                  disabled={runningTests}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {runningTests ? 'Running Suite...' : 'Run All 9 Tests'}
                </button>
              </div>

              {testResults ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span className="text-emerald-400 font-bold">
                      PASSED: {testResults.passedCount} / {testResults.totalCount}
                    </span>
                    <span className="text-slate-400">FAILED: {testResults.failedCount}</span>
                  </div>
                  {testResults.results.map((r) => (
                    <div
                      key={r.id}
                      className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {r.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <div className="truncate">
                          <strong className="text-slate-200">{r.category}:</strong>{' '}
                          <span className="text-slate-400">{r.name}</span>
                        </div>
                      </div>
                      <span className="font-mono text-slate-500 shrink-0 tabular-nums">
                        {r.durationMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  Click "Run All 9 Tests" above to verify all backend engines in real time.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
