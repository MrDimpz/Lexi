import React, { useState } from 'react';
import { GameFullState } from '../types/game.ts';
import { LetterBoard } from './LetterBoard.tsx';
import { DiscoveredWordsGrid } from './DiscoveredWordsGrid.tsx';
import { LiveLeaderboardPanel } from './LiveLeaderboardPanel.tsx';
import { VerticalTikTokView } from './VerticalTikTokView.tsx';
import { BrandLogo, BRAND_NAME, BRAND_TAGLINE } from './BrandLogo.tsx';
import { Copy, Check, Monitor, Smartphone, Layers, Maximize2, EyeOff, Eye } from 'lucide-react';

export type ObsLayoutPreset = 'fullscreen' | 'vertical' | 'horizontal' | 'compact' | 'transparent';

interface ObsOverlayViewProps {
  gameState: GameFullState;
  initialPreset?: ObsLayoutPreset;
  highlightedIndices: number[];
  lastWordBanner: {
    word: string;
    finder: string;
    points: number;
    isPangram: boolean;
    comboCount: number;
  } | null;
  submissionFeedback: { type: 'success' | 'error'; message: string } | null;
  onSubmitWord: (word: string, username: string) => void;
  onShuffle: () => void;
  onRevealHint: () => void;
  onUpdateSettings: (partial: any) => void;
}

export const ObsOverlayView: React.FC<ObsOverlayViewProps> = ({
  gameState,
  initialPreset = 'transparent',
  highlightedIndices,
  lastWordBanner,
  submissionFeedback,
  onSubmitWord,
  onShuffle,
  onRevealHint,
  onUpdateSettings,
}) => {
  const [preset, setPreset] = useState<ObsLayoutPreset>(initialPreset);
  const [hideControlsForObs, setHideControlsForObs] = useState<boolean>(() => {
    return new URLSearchParams(window.location.search).get('clean') === '1';
  });
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const scale = gameState.settingsConfig.overlay.scale || 1.0;
  const baseUrl = window.location.origin;

  const obsRoutes = [
    { label: 'Main Game Interface', path: '/game' },
    { label: 'Transparent Overlay', path: '/overlay?clean=1' },
    { label: 'Vertical 9:16 TikTok Layout', path: '/vertical?clean=1' },
    { label: 'Full-Screen Display', path: '/display?clean=1' },
    { label: 'Standalone Leaderboard', path: '/leaderboard?clean=1' },
  ];

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div
      className={`w-full min-h-[calc(100vh-64px)] flex flex-col ${
        preset === 'transparent' ? 'bg-transparent' : 'bg-slate-950'
      }`}
    >
      {/* Floating Toggle Button when OBS Controls are Hidden */}
      {hideControlsForObs && (
        <button
          type="button"
          onClick={() => setHideControlsForObs(false)}
          title="Show OBS Configuration Toolbar"
          className="fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-900 text-slate-300 border border-slate-700 text-xs flex items-center gap-1.5 opacity-25 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Show Overlay Toolbar</span>
        </button>
      )}

      {/* OBS Layout Configuration & Browser Source Instructions Bar */}
      {!hideControlsForObs && (
        <div className="w-full max-w-7xl mx-auto px-4 pt-4 pb-2">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <BrandLogo size="sm" />
                <div>
                  <h2 className="text-base font-display font-bold text-amber-300">
                    {BRAND_NAME} — OBS & Streaming Layout Studio
                  </h2>
                  <p className="text-xs text-slate-300">
                    Choose from 5 dedicated broadcast layouts or copy the Browser Source URLs directly into OBS Studio / TikTok LIVE Studio.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Scale:</span>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={scale}
                    onChange={(e) =>
                      onUpdateSettings({
                        overlay: {
                          ...gameState.settingsConfig.overlay,
                          scale: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-24 accent-amber-400"
                  />
                  <span className="font-mono tabular-nums">{Math.round(scale * 100)}%</span>
                </label>

                <button
                  type="button"
                  onClick={() => setHideControlsForObs(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide Toolbar for OBS Capture</span>
                </button>
              </div>
            </div>

            {/* 5 Streaming Layout Preset Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPreset('fullscreen')}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  preset === 'fullscreen'
                    ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>1. Full-Screen Game Overlay</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('vertical')}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  preset === 'vertical'
                    ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>2. Vertical 9:16 TikTok LIVE</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('horizontal')}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  preset === 'horizontal'
                    ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>3. Horizontal 16:9 Broadcast</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('compact')}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  preset === 'compact'
                    ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>4. Compact Lower-Third Overlay</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('transparent')}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  preset === 'transparent'
                    ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>5. Game-Only Transparent Overlay</span>
              </button>
            </div>

            {/* Copyable OBS Browser Source URLs & Setup Instructions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
              <div className="flex flex-col gap-1.5">
                <div className="font-semibold text-slate-200">
                  Dedicated OBS Browser Source URLs:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {obsRoutes.map((r) => {
                    const fullUrl = `${baseUrl}${r.path}`;
                    return (
                      <div
                        key={r.path}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800"
                      >
                        <div className="truncate">
                          <span className="text-slate-400">{r.label}: </span>
                          <span className="font-mono text-amber-300">{r.path}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(fullUrl)}
                          className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
                          title="Copy URL"
                        >
                          {copiedUrl === fullUrl ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-slate-300 flex flex-col justify-center">
                <div className="font-semibold text-amber-300 mb-1">
                  How to add to OBS Studio / TikTok LIVE Studio:
                </div>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Add a new <strong>Browser Source</strong> in your scene.</li>
                  <li>Paste one of the URLs on the left (e.g. <code className="text-amber-300">/overlay?clean=1</code> or <code className="text-amber-300">/vertical?clean=1</code>).</li>
                  <li>Set width/height to <strong>1920×1080</strong> (16:9) or <strong>1080×1920</strong> (Vertical 9:16).</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Layout Viewport */}
      <div
        className="flex-1 flex items-center justify-center p-4"
        style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
      >
        {preset === 'vertical' && (
          <VerticalTikTokView
            gameState={gameState}
            highlightedIndices={highlightedIndices}
            lastWordBanner={lastWordBanner}
            submissionFeedback={submissionFeedback}
            onSubmitWord={onSubmitWord}
            onShuffle={onShuffle}
            onRevealHint={onRevealHint}
            pureBroadcast={true}
          />
        )}

        {preset === 'compact' && (
          <div className="w-full max-w-4xl rounded-2xl bg-slate-900/95 border-2 border-amber-400/50 p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3.5 text-center md:text-left shrink-0">
              <BrandLogo size="md" />
              <div className="flex flex-col gap-0.5">
                <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider">
                  Round {gameState.roundNumber} · {gameState.remainingSeconds}s Left
                </div>
                <div className="font-display font-extrabold text-xl text-white">
                  {BRAND_NAME}
                </div>
                <div className="text-xs text-slate-300 font-mono tabular-nums">
                  Score: {gameState.roundScore}/{gameState.targetScore} · Words: {gameState.discoveredWords.length}/{gameState.board.totalPossibleWords}
                </div>
              </div>
            </div>

            <div className="flex-1">
              <LetterBoard
                letters={gameState.board.letters}
                centerLetter={gameState.board.centerLetter}
                centerIndex={gameState.board.centerIndex}
                modifiers={gameState.board.modifiers}
                discoveredCount={gameState.discoveredWords.length}
                status={gameState.status}
                minWordLength={gameState.gameConfig.minWordLength}
                highlightedIndices={highlightedIndices}
                lastWordBanner={lastWordBanner}
                submissionFeedback={submissionFeedback}
                onSubmitWord={onSubmitWord}
                onShuffle={onShuffle}
                onRevealHint={onRevealHint}
                compact={true}
                hideInteractiveInput={true}
              />
            </div>
          </div>
        )}

        {preset === 'transparent' && (
          <div className="w-full max-w-5xl p-6 flex flex-col items-center gap-6">
            <div className="px-6 py-2.5 rounded-2xl bg-slate-950/90 border border-amber-400/50 backdrop-blur-md flex items-center gap-5 text-sm font-mono tabular-nums text-white shadow-xl">
              <BrandLogo size="sm" showText={true} />
              <span aria-hidden="true">·</span>
              <span>Round {gameState.roundNumber}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize text-amber-300">{gameState.difficulty}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400 font-bold">{gameState.remainingSeconds}s</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-bold">
                Score: {gameState.roundScore} / {gameState.targetScore}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Words: {gameState.discoveredWords.length} / {gameState.board.totalPossibleWords}
              </span>
            </div>

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
              highlightedIndices={highlightedIndices}
              lastWordBanner={lastWordBanner}
              submissionFeedback={submissionFeedback}
              onSubmitWord={onSubmitWord}
              onShuffle={onShuffle}
              onRevealHint={onRevealHint}
              hideInteractiveInput={true}
            />

            <div className="w-full max-w-3xl">
              <DiscoveredWordsGrid
                discoveredWords={gameState.discoveredWords}
                totalPossibleWords={gameState.board.totalPossibleWords}
                revealedHints={gameState.revealedHints}
                wordSlots={gameState.board.wordSlots}
                compact={true}
              />
            </div>
          </div>
        )}

        {(preset === 'fullscreen' || preset === 'horizontal') && (
          <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 flex flex-col gap-5">
              <div className="arcade-board-cabinet rounded-3xl p-3 sm:p-4">
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
                  highlightedIndices={highlightedIndices}
                  lastWordBanner={lastWordBanner}
                  submissionFeedback={submissionFeedback}
                  onSubmitWord={onSubmitWord}
                  onShuffle={onShuffle}
                  onRevealHint={onRevealHint}
                  hideInteractiveInput={preset === 'horizontal'}
                  middleSlot={
                    <DiscoveredWordsGrid
                      discoveredWords={gameState.discoveredWords}
                      totalPossibleWords={gameState.board.totalPossibleWords}
                      revealedHints={gameState.revealedHints}
                      wordSlots={gameState.board.wordSlots}
                    />
                  }
                />
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-5">
              <LiveLeaderboardPanel leaderboards={gameState.leaderboards} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
