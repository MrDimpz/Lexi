import React, { useState, useEffect } from 'react';
import {
  Shuffle,
  Lightbulb,
  Send,
  Delete,
  Sparkles,
  Lock,
  HelpCircle,
  AlertTriangle,
  Zap,
  Settings,
  X,
} from 'lucide-react';
import { BoardModifiers, RoundStatus } from '../types/game.ts';
import { BrandLogo } from './BrandLogo.tsx';

const LETTER_VALUES: Record<string, string> = {
  A: '1', E: '1', I: '1', O: '1', U: '1', L: '1', N: '1', S: '1', T: '1', R: '1',
  D: '2', G: '2',
  B: '3', C: '3', M: '3', P: '3',
  F: '4', H: '4', V: '4', W: '4', Y: '4',
  K: '5',
  J: '8', X: '8',
  Q: '10', Z: '10',
  '?': '★',
};

interface LetterBoardProps {
  letters: string[];
  centerLetter: string | null;
  centerIndex: number | null;
  modifiers?: BoardModifiers;
  discoveredCount?: number;
  totalPossibleWords?: number;
  roundNumber?: number;
  status: RoundStatus;
  minWordLength: number;
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
  onNewRound?: () => void;
  onOpenSettings?: () => void;
  compact?: boolean;
  hideInteractiveInput?: boolean;
  middleSlot?: React.ReactNode;
}

export const LetterBoard: React.FC<LetterBoardProps> = ({
  letters,
  centerLetter,
  centerIndex,
  modifiers,
  discoveredCount = 0,
  totalPossibleWords = 27,
  roundNumber = 1,
  status,
  minWordLength,
  highlightedIndices,
  lastWordBanner,
  submissionFeedback,
  onSubmitWord,
  onShuffle,
  onRevealHint,
  onNewRound,
  onOpenSettings,
  compact = false,
  hideInteractiveInput = false,
  middleSlot,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [typedWord, setTypedWord] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('lexistream_player_name') || 'SpaceFinder';
  });

  // Reset selected tiles when board letters change
  useEffect(() => {
    setSelectedIndices([]);
    setTypedWord('');
  }, [letters]);

  const currentWord = typedWord;

  const isTileLocked = (index: number): boolean => {
    const rule = modifiers?.lockedTiles?.[index];
    return Boolean(rule && !rule.unlocked);
  };

  const isTileExposedDecoy = (index: number): boolean => {
    return Boolean(modifiers?.exposedDecoyIndices?.includes(index));
  };

  const handleTileClick = (index: number) => {
    if (status !== 'ACTIVE') return;
    if (isTileLocked(index) || isTileExposedDecoy(index)) return;
    const ch = letters[index];
    if (ch === '?') return;

    setSelectedIndices((prev) => {
      if (prev.includes(index)) {
        const next = prev.filter((i) => i !== index);
        setTypedWord(next.map((idx) => letters[idx] || '').join(''));
        return next;
      }
      const next = [...prev, index];
      setTypedWord(next.map((idx) => letters[idx] || '').join(''));
      return next;
    });
  };

  const handleBackspace = () => {
    setTypedWord((prev) => prev.slice(0, -1));
    setSelectedIndices((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setSelectedIndices([]);
    setTypedWord('');
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanWord = currentWord.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (!cleanWord || cleanWord.length < minWordLength || status !== 'ACTIVE') return;
    localStorage.setItem('lexistream_player_name', playerName.trim() || 'SpaceFinder');
    onSubmitWord(cleanWord, playerName.trim() || 'SpaceFinder');
    setSelectedIndices([]);
    setTypedWord('');
  };

  // Keyboard typing support when not focused inside another text input
  useEffect(() => {
    if (hideInteractiveInput) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (status !== 'ACTIVE') return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cleanWord = currentWord.replace(/[^A-Za-z]/g, '').toUpperCase();
        if (cleanWord.length >= minWordLength) {
          onSubmitWord(cleanWord, playerName.trim() || 'SpaceFinder');
          setSelectedIndices([]);
          setTypedWord('');
        }
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        const ch = e.key.toUpperCase();
        let availableIdx = letters.findIndex(
          (l, idx) =>
            l.toUpperCase() === ch &&
            !selectedIndices.includes(idx) &&
            !isTileLocked(idx) &&
            !isTileExposedDecoy(idx)
        );
        if (availableIdx === -1) {
          availableIdx = letters.findIndex(
            (l, idx) => l === '?' && !selectedIndices.includes(idx) && !isTileLocked(idx)
          );
        }
        if (availableIdx !== -1) {
          setSelectedIndices((prev) => [...prev, availableIdx]);
          setTypedWord((prev) => prev + ch);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    letters,
    selectedIndices,
    currentWord,
    minWordLength,
    status,
    hideInteractiveInput,
    playerName,
    onSubmitWord,
    modifiers,
  ]);

  const unrevealedHiddenCount =
    (modifiers?.hiddenIndices?.length || 0) - (modifiers?.revealedHiddenIndices?.length || 0);
  const totalDecoyCount = modifiers?.decoyIndices?.length || 0;
  const exposedDecoyCount = modifiers?.exposedDecoyIndices?.length || 0;
  const activeLockedTiles = Object.values(modifiers?.lockedTiles || {}).filter((r) => !r.unlocked);
  const bonusTileCount = modifiers?.bonusTileIndices?.length || 0;
  const hasAnyModifiers =
    (modifiers?.hiddenIndices?.length || 0) > 0 ||
    totalDecoyCount > 0 ||
    Object.keys(modifiers?.lockedTiles || {}).length > 0 ||
    bonusTileCount > 0;

  // Dynamic single-line tile sizing based on total letter count so tiles ALWAYS fit on one horizontal line
  const tileCount = letters.length;
  let rowGapClass = 'gap-2 sm:gap-2.5';
  let tileSizeClass = 'flex-1 min-w-0 max-w-[74px] sm:max-w-[82px] h-18 sm:h-21 text-2xl sm:text-4xl';

  if (compact) {
    if (tileCount >= 9) {
      rowGapClass = 'gap-1';
      tileSizeClass = 'flex-1 min-w-0 max-w-[34px] h-11 text-base';
    } else if (tileCount === 8) {
      rowGapClass = 'gap-1.5';
      tileSizeClass = 'flex-1 min-w-0 max-w-[40px] h-12 text-lg';
    } else {
      rowGapClass = 'gap-1.5 sm:gap-2';
      tileSizeClass = 'flex-1 min-w-0 max-w-[46px] h-13 text-xl';
    }
  } else {
    if (tileCount >= 10) {
      rowGapClass = 'gap-1 sm:gap-1.5';
      tileSizeClass = 'flex-1 min-w-0 max-w-[48px] sm:max-w-[56px] h-14 sm:h-16 text-lg sm:text-2xl';
    } else if (tileCount === 9) {
      rowGapClass = 'gap-1.5 sm:gap-2';
      tileSizeClass = 'flex-1 min-w-0 max-w-[54px] sm:max-w-[64px] h-15 sm:h-18 text-xl sm:text-2xl';
    } else if (tileCount === 8) {
      rowGapClass = 'gap-1.5 sm:gap-2';
      tileSizeClass = 'flex-1 min-w-0 max-w-[62px] sm:max-w-[72px] h-16 sm:h-19 text-xl sm:text-3xl';
    } else if (tileCount === 7) {
      rowGapClass = 'gap-2 sm:gap-2.5';
      tileSizeClass = 'flex-1 min-w-0 max-w-[70px] sm:max-w-[80px] h-17 sm:h-20 text-2xl sm:text-4xl';
    } else {
      rowGapClass = 'gap-2 sm:gap-3';
      tileSizeClass = 'flex-1 min-w-0 max-w-[76px] sm:max-w-[86px] h-18 sm:h-22 text-2xl sm:text-4xl';
    }
  }

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* TOP ARCADE CABINET HEADER: Brand Tile Emblem (Left) · Studded Light-Bulb Marquee (Center) · GOAL/LEVEL & Action Buttons (Right) */}
      {!compact && (
        <div className="w-full grid grid-cols-1 md:grid-cols-12 items-center gap-3 px-3 sm:px-5 pt-2 pb-3">
          {/* LEFT (3 cols): The Missing Piece 3D Medallion + Arched Arcade Tile Badge */}
          <div className="md:col-span-3 flex items-center justify-center md:justify-start gap-2.5">
            <BrandLogo size="md" />
            <div className="flex flex-col items-start select-none">
              {/* Arched Mini-Tiles spelling MISSING */}
              <div className="flex items-center gap-0.5 -rotate-2">
                {['M', 'I', 'S', 'S', 'I', 'N', 'G'].map((ch, idx) => (
                  <span
                    key={idx}
                    style={{
                      transform: `translateY(${Math.abs(idx - 3) * 1.4}px) rotate(${(idx - 3) * 3}deg)`,
                    }}
                    className={`w-5 h-6 rounded-[5px] font-display font-extrabold text-[11px] flex items-center justify-center border border-[#230638] shadow-[0_2px_0_0_#190429] ${
                      idx % 2 === 0
                        ? 'bg-gradient-to-b from-emerald-200 to-emerald-400 text-[#12031f]'
                        : 'bg-gradient-to-b from-white to-[#e2d0f7] text-[#230638]'
                    }`}
                  >
                    {ch}
                  </span>
                ))}
              </div>
              {/* Bottom Ribbon: PIECE · FIND YOUR SPACE */}
              <div className="mt-1 flex items-center gap-1 -rotate-1">
                <span className="px-1.5 py-0.5 rounded bg-gradient-to-b from-amber-300 to-amber-500 border border-[#230638] text-[#1e0533] font-display font-extrabold text-[10px] uppercase tracking-wider shadow-[0_2px_0_0_#230638]">
                  THE
                </span>
                <span className="font-display font-extrabold text-sm tracking-tight text-white drop-shadow-[0_2px_0_#1e0533]">
                  PIECE
                </span>
              </div>
            </div>
          </div>

          {/* CENTER (6 cols): Trapezoid Marquee Sign with 5 Glowing Gold Bulbs on Left & Right Pillars */}
          <div className="md:col-span-6 flex items-center justify-center">
            <div className="relative w-full max-w-md rounded-2xl bg-gradient-to-b from-[#d8c2f2] via-[#b88ce8] to-[#9864d4] p-1.5 border-2 border-[#230638] shadow-[0_8px_20px_rgba(0,0,0,0.55)]">
              <div className="flex items-stretch gap-1.5">
                {/* Left Column of 5 Studded Marquee Light Bulbs */}
                <div className="flex flex-col justify-between py-1 px-1 rounded-lg bg-[#381059]/70 border border-[#230638]/50">
                  {[0, 1, 2, 3, 4].map((bulb) => (
                    <span
                      key={bulb}
                      className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-white via-amber-200 to-amber-400 border border-[#4a1775] shadow-[0_0_8px_rgba(250,204,21,0.95)]"
                    />
                  ))}
                </div>

                {/* Center Halftone Marquee Screen */}
                <div className="arcade-halftone-screen flex-1 rounded-xl px-3 py-2.5 min-h-[68px] flex flex-col items-center justify-center text-center border-2 border-[#230638]">
                  {lastWordBanner ? (
                    <div className="animate-word-celebrate flex flex-wrap items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                      <div className="flex items-center gap-1">
                        {lastWordBanner.word.split('').map((ch, i) => (
                          <span
                            key={i}
                            className="mini-tile-3d-gold w-6 h-6 rounded font-display font-extrabold text-xs flex items-center justify-center"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                      <span className="font-mono font-extrabold text-emerald-300 text-sm tabular-nums">
                        +{lastWordBanner.points} PTS
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="font-display font-extrabold text-sm sm:text-lg uppercase tracking-wide text-white leading-tight drop-shadow-[0_2px_0_#120221]">
                        WORK TOGETHER
                        <br />
                        <span className="text-amber-300">TO FIND THE WORDS!</span>
                      </div>
                      {(centerLetter || unrevealedHiddenCount > 0) && (
                        <div className="text-[10px] font-semibold text-purple-200/90 mt-0.5">
                          {centerLetter ? `Center "${centerLetter}" Required` : ''}
                          {centerLetter && unrevealedHiddenCount > 0 ? ' · ' : ''}
                          {unrevealedHiddenCount > 0 ? `Deduce "?" Tile (+8 pts)` : ''}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Right Column of 5 Studded Marquee Light Bulbs */}
                <div className="flex flex-col justify-between py-1 px-1 rounded-lg bg-[#381059]/70 border border-[#230638]/50">
                  {[0, 1, 2, 3, 4].map((bulb) => (
                    <span
                      key={bulb}
                      className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-white via-amber-200 to-amber-400 border border-[#4a1775] shadow-[0_0_8px_rgba(250,204,21,0.95)]"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT (3 cols): Recessed GOAL / LEVEL Readout Capsule + 2 Stacked Tactile Square Buttons */}
          <div className="md:col-span-3 flex items-center justify-center md:justify-end gap-2">
            {/* Recessed GOAL & LEVEL Capsule */}
            <div className="px-3.5 py-2 rounded-2xl bg-[#1e0533] border-[3px] border-[#b78ce8] shadow-[inset_0_3px_10px_rgba(0,0,0,0.85),0_4px_0_0_#230638] flex items-center gap-4">
              <div className="text-center">
                <div className="text-[10px] font-display font-extrabold uppercase tracking-wider text-purple-200">
                  GOAL
                </div>
                <div className="font-display font-extrabold text-lg sm:text-xl text-emerald-300 tabular-nums leading-none mt-0.5 drop-shadow-[0_2px_0_#062e22]">
                  {discoveredCount}/{totalPossibleWords}
                </div>
              </div>

              <div className="w-px h-7 bg-purple-700/60" />

              <div className="text-center">
                <div className="text-[10px] font-display font-extrabold uppercase tracking-wider text-purple-200">
                  LEVEL
                </div>
                <div className="font-display font-extrabold text-lg sm:text-xl text-amber-300 tabular-nums leading-none mt-0.5 drop-shadow-[0_2px_0_#451a03]">
                  {roundNumber}
                </div>
              </div>
            </div>

            {/* 2 Stacked Tactile Square Icon Buttons ([X] New Round & [Gear] Settings/Shuffle) */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={onNewRound || onShuffle}
                title="Start New Round / Skip Board"
                className="w-8 h-8 rounded-lg bg-gradient-to-b from-[#d8c2f2] to-[#9b66db] hover:from-amber-200 hover:to-amber-400 border-2 border-[#230638] text-[#230638] shadow-[0_3px_0_0_#230638] active:translate-y-0.5 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 stroke-[3]" />
              </button>
              <button
                type="button"
                onClick={onOpenSettings || onShuffle}
                title="Open Host Admin & Game Settings"
                className="w-8 h-8 rounded-lg bg-gradient-to-b from-[#d8c2f2] to-[#9b66db] hover:from-amber-200 hover:to-amber-400 border-2 border-[#230638] text-[#230638] shadow-[0_3px_0_0_#230638] active:translate-y-0.5 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Settings className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-WIDTH PERFORATED CHEVRON TRACK + POINTED HEXAGONAL 3D TILE STAGE */}
      <div className="relative w-full flex items-center justify-center my-1">
        {/* Background Perforated Track with <<< and >>> Chevrons */}
        {!compact && (
          <div
            aria-hidden="true"
            className="arcade-chevron-track absolute inset-x-0 h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 pointer-events-none select-none overflow-hidden"
          >
            <div className="flex items-center text-[#120220] font-display font-black text-2xl sm:text-3xl tracking-[-0.18em] opacity-90">
              <span>‹‹‹‹‹‹</span>
            </div>
            <div className="flex items-center text-[#120220] font-display font-black text-2xl sm:text-3xl tracking-[-0.18em] opacity-90">
              <span>››››››</span>
            </div>
          </div>
        )}

        {/* Pointed Hexagonal Tile Stage Container — Always Single Line (flex-nowrap) */}
        <div className="relative z-10 w-full max-w-3xl px-2 sm:px-6 flex items-center justify-center">
          {/* Left Pointed Wing */}
          {!compact && (
            <div
              aria-hidden="true"
              className="hidden sm:block w-6 h-16 -mr-3 rotate-45 rounded-bl-lg bg-gradient-to-br from-[#cfaef5] to-[#9b66db] border-l-2 border-b-2 border-[#2b0846] shrink-0"
            />
          )}

          <div
            className={`tile-stage-perspective arcade-hex-tray w-full rounded-2xl px-2.5 sm:px-5 flex flex-nowrap items-center justify-center ${rowGapClass} ${
              compact ? 'py-2.5' : 'py-3 sm:py-3.5'
            }`}
          >
            {letters.map((letter, idx) => {
              const isCenter = centerIndex === idx;
              const isSelected = selectedIndices.includes(idx);
              const isDiscoveredHighlight = highlightedIndices.includes(idx);
              const selectionOrder = selectedIndices.indexOf(idx);

              const isMysteryHidden = letter === '?';
              const isMysteryRevealed = Boolean(modifiers?.revealedHiddenIndices?.includes(idx));
              const lockedRule = modifiers?.lockedTiles?.[idx];
              const isLocked = Boolean(lockedRule && !lockedRule.unlocked);
              const isExposedDecoy = Boolean(modifiers?.exposedDecoyIndices?.includes(idx));
              const isBonusTile = Boolean(modifiers?.bonusTileIndices?.includes(idx));

              const wordsRemainingToUnlock = isLocked
                ? Math.max(1, (lockedRule?.unlocksAtWords || 3) - discoveredCount)
                : 0;

              const upperLetter = letter.toUpperCase();
              const tilePointVal = LETTER_VALUES[upperLetter] || '1';

              // Determine 3D Material Class & Text Contrast
              let materialClass = 'tile-3d-royal text-[#230638]';
              let innerFrameClass = 'border-[#2d0a47]';
              let pointColorClass = 'text-[#230638]';

              if (isCenter) {
                materialClass = 'tile-3d-gold-center text-[#1f0633]';
                innerFrameClass = 'border-[#713f12]';
                pointColorClass = 'text-[#451a03]';
              }
              if (isBonusTile && !isLocked && !isExposedDecoy) {
                materialClass = 'tile-3d-bonus text-emerald-100';
                innerFrameClass = 'border-emerald-300/60';
                pointColorClass = 'text-emerald-200';
              }
              if (isMysteryHidden || isMysteryRevealed) {
                materialClass = 'tile-3d-mystery text-amber-200';
                innerFrameClass = 'border-amber-300/60';
                pointColorClass = 'text-amber-300';
              }
              if (isLocked) {
                materialClass = 'tile-3d-locked text-slate-400';
                innerFrameClass = 'border-purple-500/40';
                pointColorClass = 'text-slate-400';
              }
              if (isExposedDecoy) {
                materialClass = 'tile-3d-decoy text-rose-300 line-through opacity-85';
                innerFrameClass = 'border-rose-400/50';
                pointColorClass = 'text-rose-300';
              }
              if (isSelected) {
                materialClass = 'tile-3d-selected text-[#1f0633]';
                innerFrameClass = 'border-[#78350f]';
                pointColorClass = 'text-[#451a03]';
              } else if (isDiscoveredHighlight) {
                materialClass = 'tile-3d-discovered text-[#062e22]';
                innerFrameClass = 'border-[#064e3b]';
                pointColorClass = 'text-[#064e3b]';
              }

              return (
                <button
                  key={`${idx}-${letter}`}
                  type="button"
                  onClick={() => handleTileClick(idx)}
                  disabled={status !== 'ACTIVE' || isLocked || isExposedDecoy}
                  title={
                    isLocked
                      ? `Locked 3D Tile: Discover ${wordsRemainingToUnlock} more word(s) to unlock "${letter}"`
                      : isExposedDecoy
                      ? `Confirmed Decoy Trap Letter "${letter}" — Do not use!`
                      : isMysteryHidden
                      ? 'Mystery Hidden Letter — Type any word on your keyboard or in chat to deduce it (+8 pts)'
                      : isBonusTile
                      ? `Golden Bonus Tile "${letter}" (+5 bonus pts)`
                      : `3D Tile ${letter} (${tilePointVal} pt)`
                  }
                  className={`animate-tile-pop group relative select-none font-display font-extrabold rounded-xl flex flex-col items-center justify-center focus-visible:outline-2 focus-visible:outline-amber-300 ${tileSizeClass} ${materialClass} ${
                    status !== 'ACTIVE' || isLocked || isExposedDecoy
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  {/* Crisp Dark-Plum Inner Frame (Matching the Reference Screenshot Tiles) */}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-1 rounded-lg border-2 ${innerFrameClass}`}
                  />

                  {/* Top-left corner icon for special mechanics */}
                  {isLocked && (
                    <Lock className="w-3 h-3 text-slate-300 absolute top-1.5 left-1.5 z-10" />
                  )}
                  {isMysteryHidden && !isLocked && (
                    <HelpCircle className="w-3 h-3 text-amber-300 absolute top-1.5 left-1.5 z-10" />
                  )}
                  {isExposedDecoy && (
                    <AlertTriangle className="w-3 h-3 text-rose-300 absolute top-1.5 left-1.5 z-10" />
                  )}
                  {isBonusTile && !isLocked && !isExposedDecoy && !isMysteryHidden && (
                    <Zap className="w-3 h-3 text-emerald-300 absolute top-1.5 left-1.5 z-10" />
                  )}

                  {/* Centered Bold Letter */}
                  <span className="relative z-10 leading-none tracking-tight">
                    {letter}
                  </span>

                  {/* Subscript Point Value in Bottom-Right Corner (like T_1, C_3 in screenshot) */}
                  {!isLocked && !isExposedDecoy && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute bottom-1.5 right-2 text-[10px] sm:text-xs font-display font-black tabular-nums leading-none z-10 ${pointColorClass}`}
                    >
                      {tilePointVal}
                    </span>
                  )}

                  {/* Compact status sub-badge for locked/decoy tiles */}
                  {isLocked && (
                    <span className="relative z-10 text-[8px] font-mono font-bold uppercase mt-0.5 text-slate-300">
                      {wordsRemainingToUnlock}w
                    </span>
                  )}
                  {isExposedDecoy && (
                    <span className="relative z-10 text-[8px] font-mono font-bold uppercase mt-0.5 text-rose-200 no-underline">
                      TRAP
                    </span>
                  )}

                  {/* Selection Sequence Badge */}
                  {selectionOrder !== -1 && (
                    <span className="absolute -top-2 -right-2 z-20 w-5 h-5 rounded-full bg-[#1e0533] text-amber-300 border-2 border-white shadow-lg text-[10px] font-mono font-extrabold flex items-center justify-center">
                      {selectionOrder + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Pointed Wing */}
          {!compact && (
            <div
              aria-hidden="true"
              className="hidden sm:block w-6 h-16 -ml-3 rotate-45 rounded-tr-lg bg-gradient-to-tl from-[#9b66db] to-[#cfaef5] border-r-2 border-t-2 border-[#2b0846] shrink-0"
            />
          )}
        </div>
      </div>

      {/* Middle Slot (5-Padlock Checkpoint Progress Bar + 3-Column Anagram Word Slots Grid) */}
      {middleSlot && <div className="w-full px-3 sm:px-5 my-3 flex flex-col gap-4">{middleSlot}</div>}

      {/* Progressive Round Modifiers & Hazards Status Bar */}
      {hasAnyModifiers && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 py-1.5 rounded-xl bg-[#210638]/90 border border-[#7334ad] text-[11px] text-slate-200 mt-1 mb-2 shadow-inner">
          <span className="font-semibold text-amber-300 uppercase tracking-wider">
            Active Board Modifiers:
          </span>

          {(modifiers?.hiddenIndices?.length || 0) > 0 && (
            <span className="flex items-center gap-1 text-amber-200 font-medium">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {unrevealedHiddenCount > 0
                  ? `${unrevealedHiddenCount} Mystery "?" Tile (+8 pts)`
                  : 'Mystery Tile Revealed!'}
              </span>
            </span>
          )}

          {totalDecoyCount > 0 && (
            <span className="flex items-center gap-1 text-rose-300 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>
                {exposedDecoyCount < totalDecoyCount
                  ? `${totalDecoyCount - exposedDecoyCount} Decoy Trap Active`
                  : `${exposedDecoyCount} Decoy Exposed`}
              </span>
            </span>
          )}

          {Object.keys(modifiers?.lockedTiles || {}).length > 0 && (
            <span className="flex items-center gap-1 text-amber-300 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {activeLockedTiles.length > 0
                  ? `${activeLockedTiles.length} Locked Tile (${activeLockedTiles[0].unlocksAtWords}w)`
                  : 'Locked Tiles Unchained!'}
              </span>
            </span>
          )}

          {bonusTileCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-300 font-medium">
              <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{bonusTileCount} Golden Bonus Tile (+5 pts)</span>
            </span>
          )}
        </div>
      )}

      {/* BOTTOM BAR: Interactive Word Input & Controls */}
      {!hideInteractiveInput && (
        <div className="w-full max-w-2xl mx-auto px-3 sm:px-5 pb-2 pt-1 flex flex-col gap-2">
          {/* Live 3D Mini-Tile Word Tray when typing/clicking */}
          {currentWord.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 py-0.5">
              {currentWord.split('').map((ch, idx) => (
                <span
                  key={`${idx}-${ch}`}
                  className="animate-tile-pop mini-tile-3d-gold w-7 h-8 rounded-md font-display font-extrabold text-sm flex items-center justify-center"
                >
                  {ch}
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your Name"
              aria-label="Player display name"
              className="w-24 sm:w-32 px-2.5 py-2 rounded-xl bg-[#190429] border border-[#7c3aed]/70 text-xs font-medium text-slate-100 focus:outline-none focus:border-amber-400 shadow-inner"
            />

            <div className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#190429] border border-[#7c3aed]/70 min-h-[40px] focus-within:border-amber-400 shadow-inner">
              <input
                type="text"
                value={currentWord}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
                  setTypedWord(val);
                }}
                placeholder="Click 3D tiles or type a word..."
                aria-label="Word submission input"
                disabled={status !== 'ACTIVE'}
                className="w-full bg-transparent font-display font-bold tracking-widest text-base text-amber-300 placeholder:text-purple-300/60 placeholder:font-sans placeholder:font-normal placeholder:text-xs placeholder:tracking-normal focus:outline-none"
              />
              {currentWord && (
                <button
                  type="button"
                  onClick={handleBackspace}
                  title="Backspace"
                  className="text-slate-400 hover:text-slate-200 p-1 transition-colors shrink-0"
                >
                  <Delete className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={status !== 'ACTIVE' || currentWord.length < minWordLength}
              className="px-4 py-2 rounded-xl bg-gradient-to-b from-emerald-300 via-emerald-400 to-teal-500 hover:from-emerald-200 hover:to-teal-400 disabled:from-emerald-600/80 disabled:to-teal-700/80 disabled:text-emerald-100/90 text-[#042f2e] border-2 border-emerald-200/80 font-extrabold text-xs shadow-[0_3px_0_0_#064e3b] active:translate-y-0.5 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit</span>
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onShuffle}
                className="px-2.5 py-1 rounded-lg bg-[#24063d] hover:bg-[#320a52] border border-[#8b5cf6]/60 text-slate-100 font-semibold shadow-[0_2px_0_0_#150324] active:translate-y-0.5 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5 text-amber-300" />
                <span>Shuffle Tiles</span>
              </button>
              <button
                type="button"
                onClick={onRevealHint}
                disabled={status !== 'ACTIVE'}
                className="px-2.5 py-1 rounded-lg bg-[#24063d] hover:bg-[#320a52] disabled:opacity-50 border border-amber-400/50 text-amber-300 font-semibold shadow-[0_2px_0_0_#150324] active:translate-y-0.5 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Reveal Hint</span>
              </button>
              {currentWord.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-2 py-1 text-purple-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  Clear
                </button>
              )}
            </div>

            {submissionFeedback && (
              <span
                className={`font-semibold ${
                  submissionFeedback.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {submissionFeedback.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
