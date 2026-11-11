import React, { useState } from 'react';
import { AllLeaderboards, PlayerRecord } from '../types/game.ts';
import { BrandLogo, BRAND_NAME } from './BrandLogo.tsx';
import { Trophy, Gift } from 'lucide-react';

interface LiveLeaderboardPanelProps {
  leaderboards: AllLeaderboards;
  fullPage?: boolean;
}

type LeaderboardTab = 'round' | 'today' | 'allTime' | 'gifts' | 'mostWords' | 'highScorers';

export const LiveLeaderboardPanel: React.FC<LiveLeaderboardPanelProps> = ({
  leaderboards,
  fullPage = false,
}) => {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('round');

  const tabs: Array<{ id: LeaderboardTab; label: string }> = [
    { id: 'round', label: 'Round' },
    { id: 'today', label: 'Today' },
    { id: 'allTime', label: 'All-Time' },
    { id: 'gifts', label: 'Gifts' },
    { id: 'mostWords', label: 'Words' },
    { id: 'highScorers', label: 'Best Word' },
  ];

  const renderPlayerRow = (player: PlayerRecord, index: number) => {
    const rank = index + 1;
    const rankBadgeClasses =
      rank === 1
        ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-white shadow-[0_2px_0_0_#78350f]'
        : rank === 2
        ? 'bg-gradient-to-b from-slate-100 to-slate-300 text-slate-950 border-white shadow-[0_2px_0_0_#475569]'
        : rank === 3
        ? 'bg-gradient-to-b from-amber-500 to-amber-700 text-white border-amber-300 shadow-[0_2px_0_0_#451a03]'
        : 'bg-slate-950 text-slate-300 border-slate-700';

    let primaryMetric = `${player.totalPoints} pts`;
    let secondaryMetric = `${player.validWordsCount} words`;

    if (activeTab === 'mostWords') {
      primaryMetric = `${player.validWordsCount} words`;
      secondaryMetric = `${player.totalPoints} pts`;
    } else if (activeTab === 'highScorers') {
      primaryMetric = `${player.highestSingleWordScore} pts`;
      secondaryMetric = player.longestWord ? `Best: ${player.longestWord}` : `${player.totalPoints} total`;
    }

    return (
      <div
        key={player.userId}
        className={`flex items-center justify-between py-2.5 px-3 rounded-xl transition-all mb-1.5 border ${
          rank === 1
            ? 'bg-amber-400/12 border-amber-400/50 shadow-[0_3px_0_0_#451a03]'
            : 'bg-slate-950/75 hover:bg-slate-800/60 border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-6 h-6 rounded-lg border text-[11px] font-mono font-extrabold tabular-nums flex items-center justify-center shrink-0 ${rankBadgeClasses}`}
          >
            {rank}
          </span>
          <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-amber-400/60 flex items-center justify-center text-xs font-extrabold text-amber-300 shrink-0 overflow-hidden shadow-md">
            {player.avatarUrl ? (
              <img
                src={player.avatarUrl}
                alt={player.nickname}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              player.nickname.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">
              {player.nickname}
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-1.5">
              <span>{secondaryMetric}</span>
              {player.longestWord && activeTab !== 'highScorers' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-amber-200 font-semibold">{player.longestWord}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-right font-mono font-extrabold text-sm text-amber-300 tabular-nums shrink-0 ml-2">
          {primaryMetric}
        </div>
      </div>
    );
  };

  const currentList =
    activeTab === 'round'
      ? leaderboards.round
      : activeTab === 'today'
      ? leaderboards.today
      : activeTab === 'allTime'
      ? leaderboards.allTime
      : activeTab === 'mostWords'
      ? leaderboards.mostWords
      : leaderboards.highScorers;

  return (
    <div
      className={`rounded-2xl bg-slate-900/95 border border-slate-700/80 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.55)] flex flex-col ${
        fullPage ? 'max-w-5xl mx-auto w-full' : 'w-full'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          {fullPage ? <BrandLogo size="sm" /> : <Trophy className="w-4 h-4 text-amber-400" />}
          <div>
            <h2 className="text-sm font-display font-bold text-white">
              {fullPage ? `${BRAND_NAME} — 3D Podium Leaderboard` : 'Live Podium Leaderboard'}
            </h2>
          </div>
        </div>
        <span className="text-xs text-amber-300 font-mono font-semibold tabular-nums">
          {leaderboards.participatingViewersCount} active
        </span>
      </div>

      {/* Interactive Filter Tabs (3D Segmented Buttons) */}
      <div className="grid grid-cols-6 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-3 shadow-inner">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-1.5 py-1.5 text-[11px] font-bold rounded-lg transition-all text-center whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow-[0_2px_0_0_#78350f]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leaderboard List */}
      <div className={`flex flex-col ${fullPage ? 'max-h-[540px]' : 'max-h-[310px]'} overflow-y-auto pr-0.5`}>
        {activeTab === 'gifts' ? (
          leaderboards.gifts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-300">
              No TikTok gifts recorded yet. Gift contributors will appear here!
            </div>
          ) : (
            leaderboards.gifts.map((gifter, idx) => (
              <div
                key={gifter.userId}
                className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-slate-950/75 hover:bg-slate-800/60 transition-colors border border-slate-800/80 mb-1.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-400/50 text-xs font-mono text-rose-300 font-bold tabular-nums flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <Gift className="w-4 h-4 text-rose-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {gifter.nickname}
                    </div>
                    <div className="text-xs text-slate-300">
                      {gifter.giftsSentCount} gifts · Last: {gifter.lastGiftName}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-xs font-extrabold text-amber-300 tabular-nums shrink-0">
                  {gifter.giftDiamondsTotal} diamonds · +{gifter.giftPointsContributed} pts
                </div>
              </div>
            ))
          )
        ) : currentList.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-300">
            No player scores recorded in this view yet. Submit a word to claim #1 on the podium!
          </div>
        ) : (
          currentList.map((player, idx) => renderPlayerRow(player, idx))
        )}
      </div>

      {/* Global Lifetime Summary Footer when in Full Page Mode */}
      {fullPage && (
        <div className="mt-6 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-300">
          <div>
            <div className="text-slate-400">Total Rounds Played</div>
            <div className="text-lg font-mono font-bold text-white tabular-nums mt-0.5">
              {leaderboards.statistics.totalRoundsPlayed}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Total Words Discovered</div>
            <div className="text-lg font-mono font-bold text-emerald-400 tabular-nums mt-0.5">
              {leaderboards.statistics.totalWordsDiscovered}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Highest Round Score</div>
            <div className="text-lg font-mono font-bold text-amber-300 tabular-nums mt-0.5">
              {leaderboards.statistics.highestRoundScore} pts
            </div>
          </div>
          <div>
            <div className="text-slate-400">Longest Word Found</div>
            <div className="text-lg font-mono font-bold text-white mt-0.5">
              {leaderboards.statistics.longestWordFound || '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
