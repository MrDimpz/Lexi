import { WordValidator } from './wordValidator.ts';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'extreme';

export interface LockedTileRule {
  tileIndex: number;
  unlocksAtWords: number;
  unlocked: boolean;
}

export interface BoardModifiers {
  hiddenIndices: number[];
  revealedHiddenIndices: number[];
  decoyIndices: number[];
  exposedDecoyIndices: number[];
  lockedTiles: Record<number, LockedTileRule>;
  bonusTileIndices: number[];
}

export interface GeneratedBoard {
  letters: string[];
  coreLetters: string[];
  centerLetter: string | null;
  centerIndex: number | null;
  possibleWords: string[];
  pangrams: string[];
  rareBonusWord: string | null;
  difficulty: DifficultyLevel;
  modifiers: BoardModifiers;
}

const VOWELS = ['A', 'E', 'I', 'O', 'U'];
const COMMON_CONSONANTS = ['R', 'S', 'T', 'L', 'N', 'C', 'D', 'P', 'M', 'G', 'B'];
const TRICKY_CONSONANTS = ['F', 'H', 'W', 'K', 'V', 'Y', 'Z', 'X', 'J', 'Q'];
const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export class LetterGenerator {
  private validator: WordValidator;

  constructor(validator: WordValidator) {
    this.validator = validator;
  }

  public generateBoard(params: {
    boardSize: number;
    minWordLength: number;
    maxWordLength: number;
    mandatoryCenterLetter: boolean;
    difficulty?: DifficultyLevel;
    roundNumber?: number;
    progressiveElementsEnabled?: boolean;
  }): GeneratedBoard {
    const difficulty: DifficultyLevel = params.difficulty || 'medium';
    const roundNumber = Math.max(1, params.roundNumber || 1);
    const progressive = params.progressiveElementsEnabled ?? true;

    const coreSize = Math.max(5, Math.min(9, params.boardSize || 7));
    const allWords = this.validator.getAllDictionaryWords();

    // Filter candidate root words based on difficulty complexity
    const exactLengthWords = allWords.filter((w) => {
      if (w.length !== coreSize) return false;
      const hasTricky = /[kvxyzjq]/i.test(w);
      if (difficulty === 'easy') return !hasTricky;
      if (difficulty === 'hard' || difficulty === 'extreme') return hasTricky || Math.random() < 0.45;
      return true;
    });

    const fallbackPool = exactLengthWords.length > 0 ? exactLengthWords : allWords.filter((w) => w.length === coreSize);

    // Minimum solvable words required depends on difficulty
    const minRequiredWords =
      difficulty === 'easy' ? 24 : difficulty === 'medium' ? 18 : difficulty === 'hard' ? 12 : 9;

    let bestCoreLetters: string[] = ['S', 'T', 'R', 'E', 'A', 'M', 'S'].slice(0, coreSize);
    let bestPossibleWords: string[] = [];
    let bestPangrams: string[] = [];

    const maxAttempts = 45;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let candidateCore: string[];
      if (fallbackPool.length > 0 && attempt < 36) {
        const seedWord = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        candidateCore = this.shuffleLetters(seedWord.toUpperCase().split(''));
      } else {
        candidateCore = this.generateBalancedRandomLetters(coreSize, difficulty);
      }

      const tempCenterIdx = params.mandatoryCenterLetter ? Math.floor(candidateCore.length / 2) : null;
      const tempCenterLetter = tempCenterIdx !== null ? candidateCore[tempCenterIdx] : null;

      const possible = this.validator.findPossibleWords(
        candidateCore,
        params.minWordLength,
        params.maxWordLength,
        tempCenterLetter
      );
      const pangrams = possible.filter((w) => w.length === coreSize);

      if (possible.length >= minRequiredWords && (pangrams.length >= 1 || attempt > 25)) {
        bestCoreLetters = candidateCore;
        bestPossibleWords = possible;
        bestPangrams = pangrams;
        break;
      }

      if (possible.length > bestPossibleWords.length) {
        bestCoreLetters = candidateCore;
        bestPossibleWords = possible;
        bestPangrams = pangrams;
      }
    }

    if (bestPossibleWords.length === 0) {
      bestPossibleWords = ['star', 'team', 'meat', 'seat', 'east', 'rate', 'tear', 'steam', 'stream', 'master'];
      bestPangrams = ['streams'];
    }

    // Build progressive round modifiers (Hidden Letters, Decoy Letters, Locked Letters, Golden Bonus Tiles)
    const { finalLetters, centerIndex, centerLetter, modifiers } = this.applyProgressiveMechanics({
      coreLetters: bestCoreLetters,
      mandatoryCenterLetter: params.mandatoryCenterLetter,
      roundNumber,
      difficulty,
      progressive,
    });

    const longWords = bestPossibleWords.filter((w) => w.length >= Math.max(5, coreSize - 1));
    const rareBonusWord =
      longWords.length > 0
        ? longWords[Math.floor(Math.random() * longWords.length)].toUpperCase()
        : bestPossibleWords[bestPossibleWords.length - 1]?.toUpperCase() || null;

    return {
      letters: finalLetters,
      coreLetters: bestCoreLetters,
      centerLetter,
      centerIndex,
      possibleWords: bestPossibleWords,
      pangrams: bestPangrams,
      rareBonusWord,
      difficulty,
      modifiers,
    };
  }

  private applyProgressiveMechanics(params: {
    coreLetters: string[];
    mandatoryCenterLetter: boolean;
    roundNumber: number;
    difficulty: DifficultyLevel;
    progressive: boolean;
  }): {
    finalLetters: string[];
    centerIndex: number | null;
    centerLetter: string | null;
    modifiers: BoardModifiers;
  } {
    const letters = [...params.coreLetters];
    const decoyIndices: number[] = [];
    const hiddenIndices: number[] = [];
    const lockedTiles: Record<number, LockedTileRule> = {};
    const bonusTileIndices: number[] = [];

    // Determine how many Decoy Letters to inject as rounds progress (or on Hard/Extreme)
    let decoyCount = 0;
    if (params.progressive) {
      if (params.roundNumber >= 6 || params.difficulty === 'extreme') {
        decoyCount = 2;
      } else if (params.roundNumber >= 4 || params.difficulty === 'hard') {
        decoyCount = 1;
      }
    }

    // Pick decoy letters that do NOT exist in `coreLetters` so they are true trap decoys
    const usedChars = new Set(letters.map((c) => c.toUpperCase()));
    const candidateDecoys = ALL_LETTERS.filter((c) => !usedChars.has(c));

    for (let d = 0; d < decoyCount && candidateDecoys.length > 0; d++) {
      const pickIdx = Math.floor(Math.random() * candidateDecoys.length);
      const decoyChar = candidateDecoys.splice(pickIdx, 1)[0];
      letters.push(decoyChar);
      decoyIndices.push(letters.length - 1);
    }

    const centerIndex = params.mandatoryCenterLetter ? Math.floor(params.coreLetters.length / 2) : null;
    const centerLetter = centerIndex !== null ? letters[centerIndex] : null;

    // Candidate indices for non-decoy, non-center tiles
    const eligibleCoreIndices = letters
      .map((_, idx) => idx)
      .filter((idx) => !decoyIndices.includes(idx) && idx !== centerIndex);

    if (params.progressive && eligibleCoreIndices.length > 0) {
      // 1. Golden Bonus Tile (Present from Round 1+ to reward strategic word crafting)
      const bonusIdx = eligibleCoreIndices.shift()!;
      bonusTileIndices.push(bonusIdx);

      // 2. Locked Tile(s) (Introduced in Round 2+, or Hard/Extreme)
      const lockedCount =
        params.roundNumber >= 5 || params.difficulty === 'extreme'
          ? 2
          : params.roundNumber >= 2 || params.difficulty === 'hard'
          ? 1
          : 0;

      for (let l = 0; l < lockedCount && eligibleCoreIndices.length > 0; l++) {
        const lockIdx = eligibleCoreIndices.shift()!;
        lockedTiles[lockIdx] = {
          tileIndex: lockIdx,
          unlocksAtWords: l === 0 ? 2 : 4,
          unlocked: false,
        };
      }

      // 3. Hidden Mystery '?' Tile(s) (Introduced in Round 3+, or Hard/Extreme)
      const hiddenCount =
        params.roundNumber >= 5 || params.difficulty === 'extreme'
          ? 2
          : params.roundNumber >= 3 || params.difficulty === 'hard'
          ? 1
          : 0;

      for (let h = 0; h < hiddenCount && eligibleCoreIndices.length > 0; h++) {
        const hidIdx = eligibleCoreIndices.shift()!;
        hiddenIndices.push(hidIdx);
      }
    }

    return {
      finalLetters: letters,
      centerIndex,
      centerLetter,
      modifiers: {
        hiddenIndices,
        revealedHiddenIndices: [],
        decoyIndices,
        exposedDecoyIndices: [],
        lockedTiles,
        bonusTileIndices,
      },
    };
  }

  public shuffleLetters(letters: string[], preserveIndex?: number | null): string[] {
    const copy = [...letters];
    if (preserveIndex !== undefined && preserveIndex !== null && preserveIndex >= 0 && preserveIndex < copy.length) {
      const fixed = copy[preserveIndex];
      const others = copy.filter((_, i) => i !== preserveIndex);
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      others.splice(preserveIndex, 0, fixed);
      return others;
    }

    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private generateBalancedRandomLetters(size: number, difficulty: DifficultyLevel): string[] {
    const vowelRatio = difficulty === 'easy' ? 0.44 : difficulty === 'medium' ? 0.38 : 0.32;
    const vowelCount = Math.max(2, Math.round(size * vowelRatio));
    const consonantCount = size - vowelCount;
    const result: string[] = [];

    for (let i = 0; i < vowelCount; i++) {
      result.push(VOWELS[Math.floor(Math.random() * VOWELS.length)]);
    }
    for (let i = 0; i < consonantCount; i++) {
      const useTricky =
        (difficulty === 'hard' && i === 0) || (difficulty === 'extreme' && i <= 1);
      const pool = useTricky ? TRICKY_CONSONANTS : COMMON_CONSONANTS;
      result.push(pool[Math.floor(Math.random() * pool.length)]);
    }

    return this.shuffleLetters(result);
  }
}
