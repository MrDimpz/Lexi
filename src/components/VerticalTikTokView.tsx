import React from 'react';
import { GameFullState } from '../types/game.ts';
import { LetterBoard } from './LetterBoard.tsx';
import { BrandLogo, BRAND_NAME, BRAND_TAGLINE } from './BrandLogo.tsx';
import { Trophy, Heart, Clock, Flame, MessageSquare } from 'lucide-react';

interface VerticalTikTokViewProps {
  gameState: GameFullState;
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
  pureBroadcast?: boolean;
}

export const VerticalTikTokView: React.FC<VerticalTikTokViewProps> = ({
  gameState,
  highlightedIndices,
  lastWordBanner,
  submissionFeedback,
  onSubmitWord,
  onShuffle,
  onRevealHint,
  pureBroadcast = false,
}) => {
  const progressPct = Math.min(
    100,
    Math.round((gameState.roundScore / Math.max(1, gameState.targetScore)) * 100)
  );
  const top3Players = gameState.leaderboards.round.slice(0, 3);
  const recentWords = gameState.discoveredWords.slice(0, 12);

  return (
    <div className="w-full flex items-center justify-center py-4 px-2">
      {/* 9:16 Vertical Mobile Broadcast Frame */}
      <div className="w-full max-w-[430px] min-h-[760px] rounded-3xl bg-slate-950 border-2 border-amber-400/40 shadow-2xl p-4 flex flex-col justify-between relative overflow-hidden">
        {/* Top Broadcast HUD */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2.5">
              <BrandLogo size="sm" />
              <div>
                <div className="font-display font-extrabold text-base tracking-tight text-amber-300 leading-tight">
                  {BRAND_NAME}
                </div>
                <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                  <span className="uppercase tracking-wider text-slate-400">{BRAND_TAGLINE}</span>
                  <span aria-hidden="true">·</span>
                  <span>R{gameState.roundNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize text-amber-300">{gameState.difficulty}</span>
                </div>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl border font-mono font-extrabold text-lg tabular-nums flex items-center gap-1.5 ${
                gameState.remainingSeconds <= 10 && gameState.status === 'ACTIVE'
                  ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-urgent'
                  : 'bg-slate-900 border-slate-700 text-amber-400'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>
                {gameState.status === 'COUNTDOWN'
                  ? `Start ${gameState.countdownSeconds}s`
                  : `${Math.floor(gameState.remainingSeconds / 60)}:${String(
                      gameState.remainingSeconds % 60
                    ).padStart(2, '0')}`}
              </span>
            </div>
          </div>

          {/* Community Target Progress Bar & Active Multiplier */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-300 font-medium">
                Community Target
                {gameState.activeMultiplier.multiplier > 1 && (
                  <span className="ml-2 text-amber-300 font-mono font-bold">
                    <Flame className="w-3.5 h-3.5 inline mr-0.5 text-amber-400" />
                    {gameState.activeMultiplier.multiplier}X ({gameState.activeMultiplier.remainingSeconds}s)
                  </span>
                )}
              </span>
              <span className="font-mono font-bold text-amber-400 tabular-nums">
                {gameState.roundScore} / {gameState.targetScore} pts ({progressPct}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-700 p-0.5 shadow-inner">
              <div
                className="h-full rounded-full progress-gold-shimmer transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono tabular-nums">
              <span>
                Words: {gameState.discoveredWords.length}/{gameState.board.totalPossibleWords}
              </span>
              <span className="flex items-center gap-1 text-rose-300">
                <Heart className="w-3 h-3" /> Likes: {gameState.roundLikes}/{gameState.nextLikeMilestone}
              </span>
            </div>
          </div>
        </div>

        {/* Center Section: High-Contrast Letter Tiles for Mobile Viewers */}
        <div className="my-2">
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
            hideInteractiveInput={pureBroadcast}
          />
        </div>

        {/* Recently Discovered Words Compact Grid */}
        <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold mb-2">
            <span>Recent Discovered Words</span>
            <span className="text-[11px] text-amber-300 font-normal">Type words in chat!</span>
          </div>
          {recentWords.length === 0 ? (
            <div className="text-xs text-slate-500 py-3 text-center">
              Waiting for the first valid word in TikTok LIVE chat...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {recentWords.map((w) => (
                <div
                  key={w.word}
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <span className="font-mono font-bold text-white truncate">{w.word}</span>
                  <span className="font-mono text-emerald-400 text-[11px] tabular-nums">
                    +{w.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Section: Top 3 Contributors & Recent Chat Activity */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
            <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1 mb-1.5">
              <Trophy className="w-3.5 h-3.5" />
              <span>Top Contributors</span>
            </div>
            {top3Players.length === 0 ? (
              <div className="text-[11px] text-slate-500">No scores yet</div>
            ) : (
              <div className="flex flex-col gap-1">
                {top3Players.map((p, i) => (
                  <div key={p.userId} className="flex items-center justify-between text-xs">
                    <span className="text-slate-200 truncate">
                      #{i + 1} {p.nickname}
                    </span>
                    <span className="font-mono text-amber-400 tabular-nums font-semibold">
                      {p.totalPoints}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[#19032b]/95 border border-[#6d2ea6]/70 p-2.5">
            <div className="text-[11px] font-semibold text-amber-300 flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-amber-300" />
                <span>Live Chat & Answers</span>
              </span>
              <span className="text-[10px] font-mono text-purple-200">TikTok LIVE</span>
            </div>
            <div className="flex flex-col gap-1 max-h-20 overflow-hidden">
              {gameState.chatFeed.length === 0 ? (
                <div className="text-[10px] text-purple-200/50 py-1 text-center">
                  Chat answers appear here live...
                </div>
              ) : (
                gameState.chatFeed.slice(0, 4).map((item) => (
                  <div key={item.id} className="text-[10px] flex items-center justify-between gap-1.5 truncate">
                    <div className="truncate">
                      <span className="text-amber-200 font-bold">{item.nickname}: </span>
                      <span className="text-white font-mono font-semibold">{item.text}</span>
                    </div>
                    {item.status === 'accepted' ? (
                      <span className="font-mono text-[9px] font-extrabold text-emerald-300 bg-emerald-950 px-1 rounded border border-emerald-400/60 shrink-0">
                        +{item.points || 0}
                      </span>
                    ) : item.status === 'rejected' ? (
                      <span className="font-mono text-[9px] font-bold text-rose-300 bg-rose-950 px-1 rounded border border-rose-400/50 shrink-0">
                        REJECTED
                      </span>
                    ) : item.status === 'command' ? (
                      <span className="font-mono text-[9px] font-bold text-sky-300 bg-sky-950 px-1 rounded shrink-0">
                        CMD
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
