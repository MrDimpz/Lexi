import React from 'react';
import { ActiveCelebration, RoundSummaryPayload } from '../services/gameClient.ts';
import { BrandLogo, BRAND_NAME } from './BrandLogo.tsx';
import { Gift, Heart, UserPlus, Share2, Sparkles, Play, RotateCcw } from 'lucide-react';

interface StreamOverlaysProps {
  celebration: ActiveCelebration | null;
  roundSummary: RoundSummaryPayload | null;
  intermissionSeconds: number;
  status: string;
  onStartNextRound: () => void;
  onDismissSummary: () => void;
}

export const StreamOverlays: React.FC<StreamOverlaysProps> = ({
  celebration,
  roundSummary,
  intermissionSeconds,
  status,
  onStartNextRound,
  onDismissSummary,
}) => {
  return (
    <>
      {/* Real-Time Gift / Milestone / Follow / Share Toast Overlay */}
      {celebration && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-lg px-4">
          <div
            className={`animate-word-celebrate rounded-2xl border p-4 shadow-2xl backdrop-blur-md flex items-center gap-4 ${
              celebration.tier === 'large'
                ? 'bg-amber-950/95 border-amber-400 text-amber-100'
                : celebration.type === 'gift'
                ? 'bg-rose-950/95 border-rose-400/70 text-rose-100'
                : 'bg-slate-900/95 border-amber-400/60 text-slate-100'
            }`}
          >
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              {celebration.type === 'gift' && <Gift className="w-6 h-6 text-rose-300" />}
              {celebration.type === 'milestone' && <Heart className="w-6 h-6 text-amber-300" />}
              {celebration.type === 'follow' && <UserPlus className="w-6 h-6 text-emerald-300" />}
              {celebration.type === 'share' && <Share2 className="w-6 h-6 text-sky-300" />}
              {celebration.type === 'word' && <Sparkles className="w-6 h-6 text-amber-300" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                {celebration.simulated && (
                  <span className="font-mono font-bold text-amber-300">[SIMULATED TEST EVENT]</span>
                )}
                {celebration.badgeText && (
                  <span className="font-semibold tracking-wider uppercase text-amber-300">
                    {celebration.badgeText}
                  </span>
                )}
              </div>
              <div className="font-display font-bold text-base text-white truncate">
                {celebration.title}
              </div>
              <div className="text-xs text-slate-200 mt-0.5">
                {celebration.subtitle}
              </div>
            </div>

            {celebration.points && celebration.points > 0 && (
              <div className="font-mono font-extrabold text-lg text-emerald-300 tabular-nums shrink-0">
                +{celebration.points} pts
              </div>
            )}
          </div>
        </div>
      )}

      {/* Round End / Intermission Summary Modal */}
      {roundSummary && (status === 'ROUND_END' || status === 'INTERMISSION') && (
        <div className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border-2 border-amber-400/50 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3.5">
                <BrandLogo size="md" />
                <div>
                  <div className="text-xs font-medium text-amber-400">
                    {BRAND_NAME} · Round {roundSummary.roundNumber} Complete
                    {status === 'INTERMISSION' && (
                      <span className="ml-2 font-mono text-slate-300 tabular-nums">
                        · Next round in {intermissionSeconds}s
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-display font-extrabold text-white mt-0.5">
                    {roundSummary.targetReached
                      ? 'Goal Reached — Advancing to Next Level!'
                      : 'Goal Not Met — Restarting from Level 1'}
                  </h2>
                </div>
              </div>

              <div className="text-right font-mono tabular-nums">
                <div className="text-xs text-slate-400">Round Score</div>
                <div className="text-2xl font-extrabold text-amber-400">
                  {roundSummary.roundScore} <span className="text-sm text-slate-400">/ {roundSummary.targetScore}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
              <div className="rounded-xl bg-slate-950 border border-slate-800/80 p-3.5">
                <div className="text-xs font-semibold text-emerald-400 mb-2">
                  Discovered Words ({roundSummary.discoveredWords.length} / {roundSummary.totalPossibleWords})
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {roundSummary.discoveredWords.length === 0 ? (
                    <span className="text-xs text-slate-500">None discovered this round.</span>
                  ) : (
                    roundSummary.discoveredWords.map((w) => (
                      <span
                        key={w.word}
                        className="text-xs font-mono text-emerald-300 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded"
                      >
                        {w.word} (+{w.points})
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800/80 p-3.5">
                <div className="text-xs font-semibold text-slate-400 mb-2">
                  Missed Words ({roundSummary.missedWords.length})
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {roundSummary.missedWords.slice(0, 35).map((word) => (
                    <span
                      key={word}
                      className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onDismissSummary}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Close Summary
              </button>
              <button
                type="button"
                onClick={onStartNextRound}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {roundSummary.targetReached ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Advance to Level {roundSummary.roundNumber + 1}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restart from Level 1</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
