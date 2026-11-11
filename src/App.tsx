/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useGameClient } from './services/gameClient.ts';
import { LetterBoard } from './components/LetterBoard.tsx';
import { DiscoveredWordsGrid } from './components/DiscoveredWordsGrid.tsx';
import { LiveLeaderboardPanel } from './components/LiveLeaderboardPanel.tsx';
import { StreamOverlays } from './components/StreamOverlays.tsx';
import { VerticalTikTokView } from './components/VerticalTikTokView.tsx';
import { ObsOverlayView } from './components/ObsOverlayView.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { BrandLogo, BRAND_NAME, BRAND_TAGLINE } from './components/BrandLogo.tsx';
import {
  Clock,
  Heart,
  Flame,
  MessageSquare,
  Gift,
  Wifi,
  WifiOff,
  Play,
  Pause,
  Sparkles,
  Lock,
  Unlock,
} from 'lucide-react';

type ActiveRoute = 'game' | 'vertical' | 'overlay' | 'display' | 'leaderboard' | 'admin';

function resolveRouteFromPathname(pathname: string): ActiveRoute {
  const clean = pathname.toLowerCase().replace(/\/+$/, '');
  if (clean === '/vertical') return 'vertical';
  if (clean === '/overlay') return 'overlay';
  if (clean === '/display') return 'display';
  if (clean === '/leaderboard') return 'leaderboard';
  if (clean === '/admin') return 'admin';
  return 'game';
}

export default function App() {
  const {
    gameState,
    wsConnected,
    lastHighlightedIndices,
    lastWordBanner,
    activeCelebration,
    roundSummary,
    setRoundSummary,
    submissionFeedback,
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
  } = useGameClient();

  const [route, setRoute] = useState<ActiveRoute>(() =>
    resolveRouteFromPathname(window.location.pathname)
  );

  const isCleanObsCapture = new URLSearchParams(window.location.search).get('clean') === '1';

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveRouteFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (targetRoute: ActiveRoute, pathStr: string) => {
    window.history.pushState({}, '', pathStr);
    setRoute(targetRoute);
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <BrandLogo size="xl" />
          <div>
            <div className="text-xl font-display font-extrabold text-amber-300">
              {BRAND_NAME}
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 mt-1">
              {BRAND_TAGLINE} · Loading Live Puzzle Engine...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = Math.min(
    100,
    Math.round((gameState.roundScore / Math.max(1, gameState.targetScore)) * 100)
  );

  return (
    <div
      className={`min-h-screen flex flex-col ${
        isCleanObsCapture && route === 'overlay'
          ? 'bg-transparent text-slate-100'
          : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Strict 3-Zone Top Bar Contract (hidden in clean OBS capture mode) */}
      {!isCleanObsCapture && (
        <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
          {/* Zone 1: Brand Medallion & Wordmark */}
          <a
            href="/game"
            onClick={(e) => {
              e.preventDefault();
              navigate('game', '/game');
            }}
            className="flex items-center gap-3 whitespace-nowrap shrink-0"
          >
            <BrandLogo size="sm" showText={true} showTagline={true} />
          </a>

          {/* Zone 2: 5 clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a
              href="/game"
              onClick={(e) => {
                e.preventDefault();
                navigate('game', '/game');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                route === 'game' ? 'text-amber-400 font-semibold underline underline-offset-8' : ''
              }`}
            >
              Game Arena
            </a>
            <a
              href="/vertical"
              onClick={(e) => {
                e.preventDefault();
                navigate('vertical', '/vertical');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                route === 'vertical' ? 'text-amber-400 font-semibold underline underline-offset-8' : ''
              }`}
            >
              Vertical 9:16
            </a>
            <a
              href="/overlay"
              onClick={(e) => {
                e.preventDefault();
                navigate('overlay', '/overlay');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                route === 'overlay' || route === 'display'
                  ? 'text-amber-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              OBS Overlay
            </a>
            <a
              href="/leaderboard"
              onClick={(e) => {
                e.preventDefault();
                navigate('leaderboard', '/leaderboard');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                route === 'leaderboard' ? 'text-amber-400 font-semibold underline underline-offset-8' : ''
              }`}
            >
              Leaderboard
            </a>
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                navigate('admin', '/admin');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                route === 'admin' ? 'text-amber-400 font-semibold underline underline-offset-8' : ''
              }`}
            >
              Admin Studio
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => sendControlAction('next_round')}
              className="px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-b from-amber-300 to-amber-500 rounded-lg hover:from-amber-200 hover:to-amber-400 shadow-md transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              New Round
            </button>
          </div>
        </header>
      )}

      {/* Mobile Route Switcher when viewport < md */}
      {!isCleanObsCapture && (
        <div className="flex md:hidden items-center justify-around gap-1 px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => navigate('game', '/game')}
            className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
              route === 'game' ? 'bg-slate-800 text-amber-400 font-semibold' : 'text-slate-400'
            }`}
          >
            Arena
          </button>
          <button
            type="button"
            onClick={() => navigate('vertical', '/vertical')}
            className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
              route === 'vertical' ? 'bg-slate-800 text-amber-400 font-semibold' : 'text-slate-400'
            }`}
          >
            Vertical 9:16
          </button>
          <button
            type="button"
            onClick={() => navigate('overlay', '/overlay')}
            className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
              route === 'overlay' ? 'bg-slate-800 text-amber-400 font-semibold' : 'text-slate-400'
            }`}
          >
            OBS
          </button>
          <button
            type="button"
            onClick={() => navigate('leaderboard', '/leaderboard')}
            className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
              route === 'leaderboard' ? 'bg-slate-800 text-amber-400 font-semibold' : 'text-slate-400'
            }`}
          >
            Ranks
          </button>
          <button
            type="button"
            onClick={() => navigate('admin', '/admin')}
            className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
              route === 'admin' ? 'bg-slate-800 text-amber-400 font-semibold' : 'text-slate-400'
            }`}
          >
            Admin
          </button>
        </div>
      )}

      {/* Celebrations & Round Summary Modal */}
      <StreamOverlays
        celebration={activeCelebration}
        roundSummary={roundSummary}
        intermissionSeconds={gameState.intermissionSeconds}
        status={gameState.status}
        onStartNextRound={() => {
          setRoundSummary(null);
          sendControlAction('next_round');
        }}
        onDismissSummary={() => setRoundSummary(null)}
      />

      {/* ROUTE 1: MAIN GAME ARENA (/ or /game) */}
      {route === 'game' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col justify-between gap-6">
          {/* TOP SECTION: 3D Medallion Showcase, Round Number, Status, Mode & Difficulty Switcher, and Countdown Timer */}
          <section className="rounded-2xl bg-slate-900/95 border border-slate-800 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-4">
              <BrandLogo size="lg" />
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="font-semibold text-amber-400 uppercase tracking-wider">
                    {BRAND_TAGLINE}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-white">Round {gameState.roundNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>Status: {gameState.status}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Mode:{' '}
                    <strong className="text-slate-100 capitalize">
                      {gameState.gameConfig.modes[gameState.gameMode]?.name || gameState.gameMode}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Difficulty:{' '}
                    <strong className="text-amber-300 uppercase">
                      {gameState.difficulty || 'medium'}
                    </strong>
                    {gameState.autoDifficulty && (
                      <span className="text-emerald-400 ml-1">(Auto-Adaptive)</span>
                    )}
                  </span>
                  {gameState.performanceMetrics && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-300 tabular-nums">
                        {gameState.performanceMetrics.wordsPerMinute} WPM · Engagement{' '}
                        {gameState.performanceMetrics.engagementScore}/100
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-display font-extrabold text-white tracking-tight">
                  <span className="text-amber-300">{BRAND_NAME}</span> — Collaborative Live Word Puzzle
                </h1>
                {gameState.performanceMetrics?.lastAdaptationNotice && (
                  <div className="text-xs text-amber-300 font-medium">
                    ⚡ {gameState.performanceMetrics.lastAdaptationNotice}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Mode, Difficulty & Simulation Controls + Authoritative Round Timer */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Game Mode Selector */}
              <select
                value={gameState.gameMode}
                onChange={(e) => updateGameConfig({ gameMode: e.target.value })}
                aria-label="Select Game Mode"
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                {Object.entries(gameState.gameConfig.modes).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.name}
                  </option>
                ))}
              </select>

              {/* Dynamic Difficulty Selector */}
              <select
                value={gameState.difficulty || 'medium'}
                onChange={(e) => updateGameConfig({ difficulty: e.target.value })}
                aria-label="Select Difficulty Level"
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-amber-300 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="easy">Difficulty: Easy</option>
                <option value="medium">Difficulty: Medium</option>
                <option value="hard">Difficulty: Hard</option>
                <option value="extreme">Difficulty: Extreme</option>
              </select>

              {/* Auto-Adaptive Difficulty Toggle */}
              <button
                type="button"
                onClick={() => updateGameConfig({ autoDifficulty: !gameState.autoDifficulty })}
                title="Automatically scale difficulty between rounds based on viewer WPM, accuracy, and engagement"
                className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameState.autoDifficulty
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {gameState.autoDifficulty ? 'Auto-Adapt: ON' : 'Auto-Adapt: OFF'}
              </button>

              {/* Pause / Resume Quick Button */}
              {gameState.status === 'PAUSED' ? (
                <button
                  type="button"
                  onClick={() => sendControlAction('resume')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendControlAction('pause')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              )}

              {/* Authoritative Countdown / Round Timer */}
              <div
                className={`px-4 py-2 rounded-xl border font-mono font-extrabold text-xl tabular-nums flex items-center gap-2 ${
                  gameState.remainingSeconds <= 10 && gameState.status === 'ACTIVE'
                    ? 'bg-rose-950/90 border-rose-500 text-rose-300 animate-urgent'
                    : 'bg-slate-950 border-slate-800 text-amber-400'
                }`}
              >
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {gameState.status === 'COUNTDOWN'
                    ? `Starting in ${gameState.countdownSeconds}s`
                    : `${Math.floor(gameState.remainingSeconds / 60)}:${String(
                        gameState.remainingSeconds % 60
                      ).padStart(2, '0')}`}
                </span>
              </div>
            </div>
          </section>

          {/* CENTRAL & SIDE SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* CENTRAL SECTION (8 cols): Arcade Game-Show Cabinet Board */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              <div className="arcade-board-cabinet relative rounded-3xl p-2 sm:p-3 flex flex-col gap-2 overflow-hidden">
                {/* Top & Bottom Beveled Metallic Trim Notches */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-56 h-1.5 rounded-b-full bg-gradient-to-r from-[#b384eb] via-amber-300 to-[#b384eb] opacity-85"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-56 h-1.5 rounded-t-full bg-gradient-to-r from-[#b384eb] via-amber-300 to-[#b384eb] opacity-85"
                />

                {/* Central Animated 3D Letter Board with 5-Padlock Checkpoint Bar & 3-Column Word Slots */}
                <LetterBoard
                  letters={gameState.board.letters}
                  centerLetter={gameState.board.centerLetter}
                  centerIndex={gameState.board.centerIndex}
                  modifiers={gameState.board.modifiers}
                  discoveredCount={gameState.discoveredWords.length}
                  totalPossibleWords={gameState.board.totalPossibleWords}
                  roundNumber={gameState.roundNumber}
                  status={gameState.status}
                  minWordLength={gameState.gameConfig.minWordLength}
                  highlightedIndices={lastHighlightedIndices}
                  lastWordBanner={lastWordBanner}
                  submissionFeedback={submissionFeedback}
                  onSubmitWord={(word, username) => submitWord(word, username)}
                  onShuffle={() => sendControlAction('shuffle_board')}
                  onRevealHint={() => sendControlAction('reveal_hint')}
                  onNewRound={() => sendControlAction('next_round')}
                  onOpenSettings={() => navigate('admin', '/admin')}
                  middleSlot={
                    <>
                      {/* Horizontal Progress & Timer Bar with 5 Circular Padlock Checkpoints (matching reference screenshot) */}
                      <div className="w-full max-w-2xl mx-auto flex flex-col gap-1.5 pt-1 pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] px-2">
                          <div className="flex items-center gap-2 text-purple-100 font-bold uppercase tracking-wider">
                            <span>Community Target Progress</span>
                            {gameState.activeMultiplier.multiplier > 1 && (
                              <span className="text-amber-300 font-mono font-extrabold flex items-center gap-1">
                                <Flame className="w-3.5 h-3.5 text-amber-400" />
                                {gameState.activeMultiplier.multiplier}X (
                                {gameState.activeMultiplier.remainingSeconds}s)
                              </span>
                            )}
                          </div>
                          <div className="font-mono font-extrabold text-xs text-amber-300 tabular-nums">
                            {gameState.roundScore} / {gameState.targetScore} pts ({progressPct}%)
                          </div>
                        </div>

                        {/* Glowing Track with 5 Padlock Medallions at 18%, 34%, 50%, 66%, 82% */}
                        <div className="relative w-full h-5 flex items-center">
                          {/* Recessed Dark Track */}
                          <div className="w-full h-3.5 rounded-full bg-[#19032b] border-2 border-[#230638] overflow-hidden p-0.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 shadow-[0_0_14px_rgba(52,211,153,0.85)] transition-all duration-300"
                              style={{ width: `${Math.max(6, progressPct)}%` }}
                            />
                          </div>

                          {/* 5 Circular Padlock Checkpoints */}
                          {[20, 40, 60, 80, 100].map((threshold, idx) => {
                            const isUnlocked = progressPct >= threshold;
                            const leftPositions = ['16%', '33%', '50%', '67%', '84%'];
                            return (
                              <div
                                key={threshold}
                                style={{ left: leftPositions[idx] }}
                                title={
                                  isUnlocked
                                    ? `Milestone #${idx + 1} (${threshold}%) Unlocked!`
                                    : `Reach ${threshold}% of Round Target to unlock Milestone #${idx + 1}`
                                }
                                className={`-translate-x-1/2 absolute w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform ${
                                  isUnlocked
                                    ? 'bg-gradient-to-b from-amber-300 to-amber-500 border-white text-[#1e0533] scale-105 shadow-[0_0_12px_rgba(250,204,21,0.8)]'
                                    : 'bg-[#4a1775] border-[#b78ce8] text-amber-300 shadow-[0_3px_0_0_#230638]'
                                }`}
                              >
                                <span className="w-5 h-5 rounded-full bg-[#210638] flex items-center justify-center">
                                  {isUnlocked ? (
                                    <Unlock className="w-3.5 h-3.5 text-emerald-300 stroke-[2.5]" />
                                  ) : (
                                    <Lock className="w-3.5 h-3.5 text-amber-300 stroke-[2.5]" />
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 3-Column Anagram Word Slots Board */}
                      <DiscoveredWordsGrid
                        discoveredWords={gameState.discoveredWords}
                        totalPossibleWords={gameState.board.totalPossibleWords}
                        revealedHints={gameState.revealedHints}
                        wordSlots={gameState.board.wordSlots}
                      />
                    </>
                  }
                />
              </div>
            </div>

            {/* SIDE SECTION (4 cols): Live Leaderboard, Progressive Mechanics & Stream Simulator */}
            <aside className="lg:col-span-4 flex flex-col gap-5">
              <LiveLeaderboardPanel leaderboards={gameState.leaderboards} />

              {/* Quick Stream & Progressive Mechanics Simulator Bar */}
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Quick Stream & Mechanics Studio</span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-400">[HOST TOOLS]</span>
                </div>
                <p className="text-xs text-slate-400 mb-2.5">
                  Simulate TikTok LIVE chat & gifts or inject progressive round elements onto the board:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <button
                    type="button"
                    onClick={() => simulateEvent({ type: 'chat_valid', username: 'WordMaster_TT' })}
                    className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + Chat Valid Word
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateEvent({ type: 'gift_medium', username: 'SuperGifter' })}
                    className="px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + Gift 2X Boost
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      simulateEvent({ type: 'like', username: 'HypeSquad', likeCount: 50 })
                    }
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + 50 Stream Likes
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateEvent({ type: 'follow', username: 'NewFan2026' })}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + New Follower
                  </button>
                </div>

                <div className="pt-2.5 border-t border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center justify-between">
                    <span>Progressive Board Modifiers (Auto-spawns R2+)</span>
                    <button
                      type="button"
                      onClick={() => sendControlAction('unlock_and_reveal_all')}
                      className="text-amber-400 hover:underline font-mono cursor-pointer"
                    >
                      Reveal/Unlock All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => sendControlAction('add_hidden')}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + Mystery &ldquo;?&rdquo; Tile
                    </button>
                    <button
                      type="button"
                      onClick={() => sendControlAction('add_decoy')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + Decoy Trap Tile
                    </button>
                    <button
                      type="button"
                      onClick={() => sendControlAction('add_locked')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900/80 border border-amber-500/40 text-amber-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + Locked Tile
                    </button>
                    <button
                      type="button"
                      onClick={() => sendControlAction('add_bonus')}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + Golden +5pt Tile
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Gift & Social Activity */}
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-rose-400" />
                    <span>Recent TikTok Gifts</span>
                  </h3>
                  <span className="text-xs font-mono text-rose-300 tabular-nums">
                    <Heart className="w-3 h-3 inline mr-1" />
                    {gameState.roundLikes} / {gameState.nextLikeMilestone} likes
                  </span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {!gameState.giftHistory || gameState.giftHistory.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">
                      Gifts sent during TikTok LIVE trigger bonus time, hints, and score multipliers.
                    </div>
                  ) : (
                    gameState.giftHistory.slice(0, 6).map((g) => (
                      <div
                        key={g.id}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div className="truncate">
                          {g.simulated && (
                            <span className="text-[10px] font-mono text-amber-400 mr-1">[SIM]</span>
                          )}
                          <strong className="text-rose-300">{g.nickname}</strong> · {g.giftName}
                          {g.repeatCount > 1 ? ` x${g.repeatCount}` : ''}
                        </div>
                        <span className="font-mono text-emerald-400 tabular-nums shrink-0 ml-2">
                          +{g.pointsAwarded} pts
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* BOTTOM SECTION: Brand Emblem, Community Score, Total Words, Participating Viewers, TikTok LIVE Status, Recent Chat */}
          <footer className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-7 flex flex-wrap items-center gap-5 text-xs">
              <BrandLogo size="xs" showText={true} />
              <span aria-hidden="true" className="text-slate-700">|</span>
              <div>
                <div className="text-slate-400">Community Score</div>
                <div className="text-base font-mono font-bold text-amber-400 tabular-nums">
                  {gameState.roundScore} pts
                </div>
              </div>
              <span aria-hidden="true" className="text-slate-700">|</span>
              <div>
                <div className="text-slate-400">Words Discovered</div>
                <div className="text-base font-mono font-bold text-emerald-400 tabular-nums">
                  {gameState.discoveredWords.length} / {gameState.board.totalPossibleWords}
                </div>
              </div>
              <span aria-hidden="true" className="text-slate-700">|</span>
              <div>
                <div className="text-slate-400">Participating Viewers</div>
                <div className="text-base font-mono font-bold text-slate-100 tabular-nums">
                  {gameState.leaderboards.participatingViewersCount}
                </div>
              </div>
              <span aria-hidden="true" className="text-slate-700">|</span>
              <div>
                <div className="text-slate-400">TikTok LIVE Connection</div>
                <button
                  type="button"
                  onClick={() => navigate('admin', '/admin')}
                  className="flex items-center gap-1.5 font-mono font-semibold text-xs mt-0.5 hover:underline cursor-pointer"
                >
                  {gameState.tiktok.status === 'CONNECTED' ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5" /> @{gameState.tiktok.username} (LIVE)
                    </span>
                  ) : (
                    <span className="text-slate-300 flex items-center gap-1">
                      <WifiOff className="w-3.5 h-3.5 text-slate-400" /> {gameState.tiktok.status} (Configure)
                    </span>
                  )}
                </button>
              </div>
              <span aria-hidden="true" className="text-slate-700">|</span>
              <div>
                <div className="text-slate-400">Real-Time Engine</div>
                <div className="text-xs font-mono text-slate-300 mt-0.5">
                  {wsConnected ? 'WebSocket Synced' : 'Reconnecting...'}
                </div>
              </div>
            </div>

            {/* Recent Chat Activity Stream */}
            <div className="lg:col-span-5 rounded-xl bg-slate-950 border border-slate-800/90 px-3.5 py-2.5 flex items-center gap-3 overflow-hidden">
              <MessageSquare className="w-4 h-4 text-sky-400 shrink-0" />
              <div className="flex-1 min-w-0 text-xs truncate">
                {gameState.chatFeed.length === 0 ? (
                  <span className="text-slate-500">
                    Live chat submissions and !commands (!score, !top, !words) appear here...
                  </span>
                ) : (
                  <div className="truncate">
                    {gameState.chatFeed[0].simulated && (
                      <span className="font-mono text-amber-400 mr-1.5">[SIM]</span>
                    )}
                    <strong className="text-slate-200">{gameState.chatFeed[0].nickname}: </strong>
                    <span
                      className={
                        gameState.chatFeed[0].status === 'accepted'
                          ? 'text-emerald-400 font-mono font-bold'
                          : gameState.chatFeed[0].status === 'rejected'
                          ? 'text-rose-400'
                          : 'text-sky-300'
                      }
                    >
                      {gameState.chatFeed[0].text}
                    </span>
                    {gameState.chatFeed[0].reason && (
                      <span className="text-slate-500 ml-1.5">
                        ({gameState.chatFeed[0].reason})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </footer>
        </main>
      )}

      {/* ROUTE 2: VERTICAL 9:16 TIKTOK LIVE LAYOUT (/vertical) */}
      {route === 'vertical' && (
        <main className="flex-1 flex items-center justify-center">
          <VerticalTikTokView
            gameState={gameState}
            highlightedIndices={lastHighlightedIndices}
            lastWordBanner={lastWordBanner}
            submissionFeedback={submissionFeedback}
            onSubmitWord={(word, username) => submitWord(word, username)}
            onShuffle={() => sendControlAction('shuffle_board')}
            onRevealHint={() => sendControlAction('reveal_hint')}
            pureBroadcast={isCleanObsCapture}
          />
        </main>
      )}

      {/* ROUTE 3 & 4: OBS OVERLAY & FULL-SCREEN DISPLAY (/overlay and /display) */}
      {(route === 'overlay' || route === 'display') && (
        <main className="flex-1">
          <ObsOverlayView
            gameState={gameState}
            initialPreset={route === 'display' ? 'fullscreen' : 'transparent'}
            highlightedIndices={lastHighlightedIndices}
            lastWordBanner={lastWordBanner}
            submissionFeedback={submissionFeedback}
            onSubmitWord={(word, username) => submitWord(word, username)}
            onShuffle={() => sendControlAction('shuffle_board')}
            onRevealHint={() => sendControlAction('reveal_hint')}
            onUpdateSettings={(partial) => updateSettingsConfig(partial)}
          />
        </main>
      )}

      {/* ROUTE 5: STANDALONE LEADERBOARD (/leaderboard) */}
      {route === 'leaderboard' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
          <LiveLeaderboardPanel leaderboards={gameState.leaderboards} fullPage={true} />
        </main>
      )}

      {/* ROUTE 6: HOST ADMIN CONTROL PANEL (/admin) */}
      {route === 'admin' && (
        <main className="flex-1">
          <AdminDashboard
            gameState={gameState}
            onControlAction={sendControlAction}
            onUpdateGameConfig={updateGameConfig}
            onUpdateScoringConfig={updateScoringConfig}
            onUpdateGiftsConfig={updateGiftsConfig}
            onUpdateSettingsConfig={updateSettingsConfig}
            onModerationAction={sendModerationAction}
            onConnectTikTok={connectTikTok}
            onDisconnectTikTok={disconnectTikTok}
            onReconnectTikTok={reconnectTikTok}
            onSimulateEvent={simulateEvent}
            onRunTestSuite={runTestSuite}
          />
        </main>
      )}
    </div>
  );
}
