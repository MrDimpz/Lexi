import fs from 'fs';
import path from 'path';

export interface ValidationResult {
  valid: boolean;
  normalizedWord: string;
  reason?:
    | 'EMPTY_OR_INVALID_CHARS'
    | 'TOO_SHORT'
    | 'TOO_LONG'
    | 'MISSING_CENTER_LETTER'
    | 'LETTERS_NOT_ON_BOARD'
    | 'USED_LOCKED_LETTER'
    | 'USED_DECOY_LETTER'
    | 'EXCLUDED_WORD'
    | 'NOT_IN_DICTIONARY'
    | 'ALREADY_DISCOVERED';
  message: string;
  usedTileIndices?: number[];
  triggeredDecoyIndex?: number;
  triggeredLockedIndex?: number;
  usedHiddenIndices?: number[];
  usedBonusIndices?: number[];
}

export class WordValidator {
  private baseDictionary: Set<string> = new Set();
  private customWords: Set<string> = new Set();
  private excludedWords: Set<string> = new Set();
  private allWordsArray: string[] = [];

  constructor() {
    this.loadDictionary();
  }

  public loadDictionary(): void {
    try {
      const dictPath = path.resolve(process.cwd(), 'data/dictionary.json');
      const raw = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
      this.baseDictionary.clear();
      if (Array.isArray(raw)) {
        for (const word of raw) {
          const clean = this.normalize(String(word));
          if (clean.length >= 3 && /^[a-z]+$/.test(clean)) {
            this.baseDictionary.add(clean);
          }
        }
      }
      this.rebuildWordArray();
    } catch (err) {
      console.error('Failed to load dictionary.json:', err);
    }
  }

  public updateModerationLists(customWords: string[] = [], excludedWords: string[] = []): void {
    this.customWords = new Set(customWords.map((w) => this.normalize(w)).filter(Boolean));
    this.excludedWords = new Set(excludedWords.map((w) => this.normalize(w)).filter(Boolean));
    this.rebuildWordArray();
  }

  private rebuildWordArray(): void {
    const combined = new Set<string>([...this.baseDictionary, ...this.customWords]);
    for (const ex of this.excludedWords) {
      combined.delete(ex);
    }
    this.allWordsArray = Array.from(combined);
  }

  public normalize(word: string): string {
    return String(word || '').trim().toLowerCase();
  }

  public isInDictionary(word: string): boolean {
    const clean = this.normalize(word);
    if (this.excludedWords.has(clean)) return false;
    return this.baseDictionary.has(clean) || this.customWords.has(clean);
  }

  public getDictionarySize(): number {
    return this.allWordsArray.length;
  }

  public getAllDictionaryWords(): string[] {
    return this.allWordsArray;
  }

  /**
   * Checks whether `word` can be formed using the available `boardLetters`.
   * Prioritizes unlocked, non-decoy tiles first when duplicate letters exist!
   */
  public matchBoardTiles(
    word: string,
    boardLetters: string[],
    options?: {
      lockedIndices?: Set<number>;
      decoyIndices?: Set<number>;
    }
  ): {
    canForm: boolean;
    usedIndices: number[];
    usedLockedIndex?: number;
    usedDecoyIndex?: number;
  } {
    const upperWord = word.toUpperCase();
    const upperBoard = boardLetters.map((l) => l.toUpperCase());
    const used = new Array(upperBoard.length).fill(false);
    const usedIndices: number[] = [];
    const lockedSet = options?.lockedIndices || new Set<number>();
    const decoySet = options?.decoyIndices || new Set<number>();

    for (const ch of upperWord) {
      let foundIdx = -1;

      // Pass 1: Try to find an available tile that is NEITHER locked NOR decoy
      for (let i = 0; i < upperBoard.length; i++) {
        if (!used[i] && upperBoard[i] === ch && !lockedSet.has(i) && !decoySet.has(i)) {
          foundIdx = i;
          break;
        }
      }

      // Pass 2: Try to find a locked tile (so we can give specific locked feedback)
      if (foundIdx === -1) {
        for (let i = 0; i < upperBoard.length; i++) {
          if (!used[i] && upperBoard[i] === ch && lockedSet.has(i)) {
            foundIdx = i;
            break;
          }
        }
      }

      // Pass 3: Try to find a decoy tile (so we can give specific decoy trap feedback)
      if (foundIdx === -1) {
        for (let i = 0; i < upperBoard.length; i++) {
          if (!used[i] && upperBoard[i] === ch && decoySet.has(i)) {
            foundIdx = i;
            break;
          }
        }
      }

      if (foundIdx === -1) {
        return { canForm: false, usedIndices: [] };
      }
      used[foundIdx] = true;
      usedIndices.push(foundIdx);
    }

    const usedDecoyIndex = usedIndices.find((idx) => decoySet.has(idx));
    const usedLockedIndex = usedIndices.find((idx) => lockedSet.has(idx));

    return {
      canForm: true,
      usedIndices,
      usedLockedIndex,
      usedDecoyIndex,
    };
  }

  public validateSubmission(params: {
    word: string;
    boardLetters: string[];
    discoveredWords: Set<string>;
    minWordLength: number;
    maxWordLength: number;
    mandatoryCenterLetter?: string | null;
    activeLockedIndices?: number[];
    decoyIndices?: number[];
    hiddenIndices?: number[];
    bonusTileIndices?: number[];
  }): ValidationResult {
    const normalized = this.normalize(params.word);

    if (!normalized || !/^[a-z]+$/.test(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'EMPTY_OR_INVALID_CHARS',
        message: 'Word must contain only English letters A–Z.',
      };
    }

    if (normalized.length < params.minWordLength) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'TOO_SHORT',
        message: `Word must be at least ${params.minWordLength} letters long.`,
      };
    }

    const nonDecoyCount = params.boardLetters.length - (params.decoyIndices?.length || 0);
    const maxAllowed = Math.min(params.maxWordLength, Math.max(nonDecoyCount, params.boardLetters.length));
    if (normalized.length > maxAllowed) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'TOO_LONG',
        message: `Word cannot exceed ${maxAllowed} letters.`,
      };
    }

    if (this.excludedWords.has(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'EXCLUDED_WORD',
        message: 'This word is excluded by game moderation rules.',
      };
    }

    if (params.mandatoryCenterLetter) {
      const centerLower = params.mandatoryCenterLetter.toLowerCase();
      if (!normalized.includes(centerLower)) {
        return {
          valid: false,
          normalizedWord: normalized,
          reason: 'MISSING_CENTER_LETTER',
          message: `Word must include the mandatory center letter "${params.mandatoryCenterLetter.toUpperCase()}".`,
        };
      }
    }

    const lockedSet = new Set(params.activeLockedIndices || []);
    const decoySet = new Set(params.decoyIndices || []);
    const hiddenSet = new Set(params.hiddenIndices || []);
    const bonusSet = new Set(params.bonusTileIndices || []);

    const match = this.matchBoardTiles(normalized, params.boardLetters, {
      lockedIndices: lockedSet,
      decoyIndices: decoySet,
    });

    if (!match.canForm) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'LETTERS_NOT_ON_BOARD',
        message: 'Word uses letters not available on the current board.',
      };
    }

    if (match.usedDecoyIndex !== undefined) {
      const decoyChar = params.boardLetters[match.usedDecoyIndex]?.toUpperCase() || '?';
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'USED_DECOY_LETTER',
        message: `Trap triggered! "${decoyChar}" is a Decoy Letter and cannot be used!`,
        triggeredDecoyIndex: match.usedDecoyIndex,
      };
    }

    if (match.usedLockedIndex !== undefined) {
      const lockedChar = params.boardLetters[match.usedLockedIndex]?.toUpperCase() || '?';
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'USED_LOCKED_LETTER',
        message: `Tile "${lockedChar}" is currently Locked! Find more words to break its chains!`,
        triggeredLockedIndex: match.usedLockedIndex,
      };
    }

    if (params.discoveredWords.has(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'ALREADY_DISCOVERED',
        message: `"${normalized.toUpperCase()}" has already been discovered this round!`,
      };
    }

    if (!this.isInDictionary(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: 'NOT_IN_DICTIONARY',
        message: `"${normalized.toUpperCase()}" is not in the game dictionary.`,
      };
    }

    const usedHiddenIndices = match.usedIndices.filter((idx) => hiddenSet.has(idx));
    const usedBonusIndices = match.usedIndices.filter((idx) => bonusSet.has(idx));

    return {
      valid: true,
      normalizedWord: normalized,
      message: `"${normalized.toUpperCase()}" accepted!`,
      usedTileIndices: match.usedIndices,
      usedHiddenIndices,
      usedBonusIndices,
    };
  }

  /**
   * Finds all valid words in the dictionary that can be formed from the given core board letters.
   */
  public findPossibleWords(
    boardLetters: string[],
    minWordLength: number,
    maxWordLength: number,
    mandatoryCenterLetter?: string | null
  ): string[] {
    const boardCounts: Record<string, number> = {};
    for (const l of boardLetters) {
      const ch = l.toLowerCase();
      boardCounts[ch] = (boardCounts[ch] || 0) + 1;
    }
    const maxLen = Math.min(maxWordLength, boardLetters.length);
    const centerLower = mandatoryCenterLetter ? mandatoryCenterLetter.toLowerCase() : null;

    const results: string[] = [];
    for (const word of this.allWordsArray) {
      if (word.length < minWordLength || word.length > maxLen) continue;
      if (centerLower && !word.includes(centerLower)) continue;

      let possible = true;
      const wordCounts: Record<string, number> = {};
      for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const available = boardCounts[ch] || 0;
        if (available === 0) {
          possible = false;
          break;
        }
        const nextCount = (wordCounts[ch] || 0) + 1;
        if (nextCount > available) {
          possible = false;
          break;
        }
        wordCounts[ch] = nextCount;
      }

      if (possible) {
        results.push(word);
      }
    }

    return results.sort((a, b) => a.length - b.length || a.localeCompare(b));
  }
}

export const wordValidator = new WordValidator();
