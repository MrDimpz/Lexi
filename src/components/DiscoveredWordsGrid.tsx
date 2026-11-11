import React, { useState, useMemo } from 'react';
import { BoardWordSlot, DiscoveredWordEntry } from '../types/game.ts';
import { Lightbulb, Award, ChevronDown, ChevronUp } from 'lucide-react';

interface DiscoveredWordsGridProps {
  discoveredWords: DiscoveredWordEntry[];
  totalPossibleWords: number;
  revealedHints: string[];
  wordSlots?: BoardWordSlot[];
  compact?: boolean;
}

export const DiscoveredWordsGrid: React.FC<DiscoveredWordsGridProps> = ({
  discoveredWords,
  totalPossibleWords,
  revealedHints,
  wordSlots,
  compact = false,
}) => {
  const [showAllSlots, setShowAllSlots] = useState(false);

  // Build authoritative slot list (sorted shortest -> longest)
  const allSlots: BoardWordSlot[] = useMemo(() => {
    if (wordSlots && wordSlots.length > 0) {
      return [...wordSlots].sort((a, b) => a.length - b.length || a.id.localeCompare(b.id));
    }

    // Fallback synthesis if wordSlots isn't populated yet
    const foundSlots: BoardWordSlot[] = discoveredWords.map((d, idx) => ({
      id: `found-${idx}-${d.word}`,
      length: d.word.length,
      discovered: true,
      word: d.word,
      points: d.points,
      isPangram: d.isPangram,
      hintMask: null,
    }));

    const remainingCount = Math.max(0, totalPossibleWords - foundSlots.length);
    const unfoundSlots: BoardWordSlot[] = Array.from({ length: remainingCount }, (_, i) => {
      const len = i < remainingCount * 0.4 ? 4 : i < remainingCount * 0.75 ? 5 : 6;
      return {
        id: `unfound-${i}`,
        length: len,
        discovered: false,
        word: null,
        points: null,
        isPangram: len >= 7,
        hintMask: null,
      };
    });

    return [...foundSlots, ...unfoundSlots].sort((a, b) => a.length - b.length);
  }, [wordSlots, discoveredWords, totalPossibleWords]);

  // Select 12 or 15 balanced slots across the 3 columns by default (like the reference board), or all if expanded
  const visibleSlots = useMemo(() => {
    const defaultCap = compact ? 9 : 12;
    if (showAllSlots || allSlots.length <= defaultCap) {
      return allSlots;
    }

    // Always include discovered slots and hinted slots, then fill evenly across length buckets
    const priority = allSlots.filter(
      (s) => s.discovered || (s.hintMask && s.hintMask.some((ch) => ch !== ''))
    );
    const others = allSlots.filter(
      (s) => !s.discovered && !(s.hintMask && s.hintMask.some((ch) => ch !== ''))
    );

    if (priority.length >= defaultCap) {
      return priority.sort((a, b) => a.length - b.length);
    }

    const needed = defaultCap - priority.length;
    const pickedOthers: BoardWordSlot[] = [];
    if (others.length <= needed) {
      pickedOthers.push(...others);
    } else {
      // Sample evenly from shortest to longest so all 3 columns have 4-letter, 5-letter, and 6+ letter boxes
      for (let i = 0; i < needed; i++) {
        const idx = Math.min(
          others.length - 1,
          Math.floor((i * others.length) / needed)
        );
        pickedOthers.push(others[idx]);
      }
    }

    return [...priority, ...pickedOthers].sort(
      (a, b) => a.length - b.length || a.id.localeCompare(b.id)
    );
  }, [allSlots, showAllSlots, compact]);

  // Split visibleSlots into 3 columns (Col 1: shortest, Col 2: medium, Col 3: longest)
  const columns = useMemo(() => {
    const colSize = Math.ceil(visibleSlots.length / 3);
    return [
      visibleSlots.slice(0, colSize),
      visibleSlots.slice(colSize, colSize * 2),
      visibleSlots.slice(colSize * 2),
    ];
  }, [visibleSlots]);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Revealed Hints Strip if any hints have been triggered */}
      {revealedHints.length > 0 && (
        <div className="px-3.5 py-2 rounded-xl bg-[#220638]/90 border border-amber-400/50 flex flex-wrap items-center justify-center gap-3 text-xs shadow-inner">
          <div className="flex items-center gap-1.5 text-amber-300 font-bold shrink-0">
            <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
            <span>Active Hints:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-amber-100 font-mono font-bold">
            {revealedHints.map((hint, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-[#140221] border border-amber-400/30">
                {hint}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3-Column Arcade Word Slot Rows (Left side sleek status, Right side individual letter boxes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3.5 items-end">
        {columns.map((colSlots, colIdx) => (
          <div key={colIdx} className="flex flex-col gap-2">
            {colSlots.map((slot) => {
              const lettersArray = Array.from({ length: slot.length }, (_, i) => {
                if (slot.discovered && slot.word) {
                  return slot.word[i] || '';
                }
                if (slot.hintMask && slot.hintMask[i]) {
                  return slot.hintMask[i];
                }
                return '';
              });

              const hasHint = Boolean(
                !slot.discovered && slot.hintMask && slot.hintMask.some((c) => c !== '')
              );

              return (
                <div
                  key={slot.id}
                  className={`min-h-[38px] sm:min-h-[42px] px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 transition-all ${
                    slot.discovered
                      ? slot.isPangram
                        ? 'bg-gradient-to-r from-amber-500/30 via-[#381059] to-[#2b0b47] border-amber-300/80 shadow-[0_3px_10px_rgba(250,204,21,0.22)]'
                        : 'bg-[#350e57]/95 border-[#9d65d4] shadow-[0_2px_6px_rgba(0,0,0,0.45)]'
                      : hasHint
                      ? 'bg-[#2c094a]/90 border-amber-400/60 shadow-inner'
                      : 'bg-[#2c0a49]/80 border-[#6d2ea6]/70 shadow-[inset_0_2px_5px_rgba(0,0,0,0.45)]'
                  }`}
                >
                  {/* Left side of the slot bar (Finder's name omitted per user specification) */}
                  <div className="flex items-center gap-1.5 min-w-0 pl-0.5">
                    {slot.discovered ? (
                      <>
                        {slot.isPangram && (
                          <span
                            title="Full-Board Pangram!"
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-[#1d0430] shrink-0 shadow"
                          >
                            <Award className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span className="font-mono font-extrabold text-xs text-emerald-300 tabular-nums">
                          +{slot.points}
                        </span>
                      </>
                    ) : hasHint ? (
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3 text-amber-300" />
                        <span>Hint</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-purple-300/35 select-none">
                        {slot.length}L
                      </span>
                    )}
                  </div>

                  {/* Right side of the slot bar: Individual square letter boxes */}
                  <div className="flex items-center justify-end gap-1 shrink-0">
                    {lettersArray.map((ch, letterIdx) => {
                      if (slot.discovered) {
                        return (
                          <span
                            key={letterIdx}
                            className={`animate-tile-pop w-6 h-6 sm:w-7 sm:h-7 rounded-[6px] font-display font-extrabold text-xs sm:text-sm flex items-center justify-center select-none ${
                              slot.isPangram
                                ? 'bg-gradient-to-b from-amber-200 via-amber-300 to-amber-400 text-[#1e0533] border border-white shadow-[0_2px_0_0_#78350f]'
                                : 'bg-gradient-to-b from-white via-[#f5effc] to-[#e2d0f7] text-[#210538] border border-white shadow-[0_2px_0_0_#1e0533]'
                            }`}
                          >
                            {ch}
                          </span>
                        );
                      }

                      const isHintChar = ch !== '';
                      return (
                        <span
                          key={letterIdx}
                          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-[6px] font-display font-extrabold text-xs sm:text-sm flex items-center justify-center select-none ${
                            isHintChar
                              ? 'bg-[#24063d] border border-amber-300/80 text-amber-300 shadow-[0_0_8px_rgba(250,204,21,0.35)]'
                              : 'bg-[#170329] border border-[#5d2391]/90 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85)]'
                          }`}
                        >
                          {ch}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Expand/Collapse toggle when total board slots exceed default 12-slot arcade view */}
      {allSlots.length > (compact ? 9 : 12) && (
        <div className="flex items-center justify-center pt-1">
          <button
            type="button"
            onClick={() => setShowAllSlots((prev) => !prev)}
            className="px-3 py-1 rounded-full bg-[#24063b]/90 hover:bg-[#310a50] border border-[#7c3aed]/60 text-[11px] font-semibold text-amber-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {showAllSlots ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
                <span>Show Compact 12-Slot Arcade Grid</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  Show All {allSlots.length} Anagram Slots ({discoveredWords.length}/{totalPossibleWords} Found)
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
