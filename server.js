// server.ts
import express from "express";
import http from "http";
import path6 from "path";
import { createServer as createViteServer } from "vite";

// server/gameEngine.ts
import fs4 from "fs";
import path4 from "path";

// server/eventManager.ts
import { EventEmitter } from "events";
var EventManager = class extends EventEmitter {
  constructor() {
    super(...arguments);
    this.seqId = 0;
    this.recentEvents = [];
    this.maxRecentEvents = 150;
  }
  emitGameEvent(type, payload, simulated = false) {
    this.seqId += 1;
    const event = {
      seqId: this.seqId,
      type,
      timestamp: Date.now(),
      simulated,
      payload
    };
    if (type !== "round:timer") {
      this.recentEvents.unshift(event);
      if (this.recentEvents.length > this.maxRecentEvents) {
        this.recentEvents.length = this.maxRecentEvents;
      }
    }
    this.emit("broadcast", event);
    this.emit(type, event);
    return event;
  }
  getSeqId() {
    return this.seqId;
  }
  getRecentEvents(limit = 50) {
    return this.recentEvents.slice(0, limit);
  }
  clearRecentEvents() {
    this.recentEvents = [];
  }
};
var eventManager = new EventManager();

// server/wordValidator.ts
import fs from "fs";
import path from "path";
var WordValidator = class {
  constructor() {
    this.baseDictionary = /* @__PURE__ */ new Set();
    this.customWords = /* @__PURE__ */ new Set();
    this.excludedWords = /* @__PURE__ */ new Set();
    this.allWordsArray = [];
    this.loadDictionary();
  }
  loadDictionary() {
    try {
      const dictPath = path.resolve(process.cwd(), "data/dictionary.json");
      const raw = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
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
      console.error("Failed to load dictionary.json:", err);
    }
  }
  updateModerationLists(customWords = [], excludedWords = []) {
    this.customWords = new Set(customWords.map((w) => this.normalize(w)).filter(Boolean));
    this.excludedWords = new Set(excludedWords.map((w) => this.normalize(w)).filter(Boolean));
    this.rebuildWordArray();
  }
  rebuildWordArray() {
    const combined = /* @__PURE__ */ new Set([...this.baseDictionary, ...this.customWords]);
    for (const ex of this.excludedWords) {
      combined.delete(ex);
    }
    this.allWordsArray = Array.from(combined);
  }
  normalize(word) {
    return String(word || "").trim().toLowerCase();
  }
  isInDictionary(word) {
    const clean = this.normalize(word);
    if (this.excludedWords.has(clean)) return false;
    return this.baseDictionary.has(clean) || this.customWords.has(clean);
  }
  getDictionarySize() {
    return this.allWordsArray.length;
  }
  getAllDictionaryWords() {
    return this.allWordsArray;
  }
  /**
   * Checks whether `word` can be formed using the available `boardLetters`.
   * Prioritizes unlocked, non-decoy tiles first when duplicate letters exist!
   */
  matchBoardTiles(word, boardLetters, options) {
    const upperWord = word.toUpperCase();
    const upperBoard = boardLetters.map((l) => l.toUpperCase());
    const used = new Array(upperBoard.length).fill(false);
    const usedIndices = [];
    const lockedSet = options?.lockedIndices || /* @__PURE__ */ new Set();
    const decoySet = options?.decoyIndices || /* @__PURE__ */ new Set();
    for (const ch of upperWord) {
      let foundIdx = -1;
      for (let i = 0; i < upperBoard.length; i++) {
        if (!used[i] && upperBoard[i] === ch && !lockedSet.has(i) && !decoySet.has(i)) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx === -1) {
        for (let i = 0; i < upperBoard.length; i++) {
          if (!used[i] && upperBoard[i] === ch && lockedSet.has(i)) {
            foundIdx = i;
            break;
          }
        }
      }
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
      usedDecoyIndex
    };
  }
  validateSubmission(params) {
    const normalized = this.normalize(params.word);
    if (!normalized || !/^[a-z]+$/.test(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "EMPTY_OR_INVALID_CHARS",
        message: "Word must contain only English letters A\u2013Z."
      };
    }
    if (normalized.length < params.minWordLength) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "TOO_SHORT",
        message: `Word must be at least ${params.minWordLength} letters long.`
      };
    }
    const nonDecoyCount = params.boardLetters.length - (params.decoyIndices?.length || 0);
    const maxAllowed = Math.min(params.maxWordLength, Math.max(nonDecoyCount, params.boardLetters.length));
    if (normalized.length > maxAllowed) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "TOO_LONG",
        message: `Word cannot exceed ${maxAllowed} letters.`
      };
    }
    if (this.excludedWords.has(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "EXCLUDED_WORD",
        message: "This word is excluded by game moderation rules."
      };
    }
    if (params.mandatoryCenterLetter) {
      const centerLower = params.mandatoryCenterLetter.toLowerCase();
      if (!normalized.includes(centerLower)) {
        return {
          valid: false,
          normalizedWord: normalized,
          reason: "MISSING_CENTER_LETTER",
          message: `Word must include the mandatory center letter "${params.mandatoryCenterLetter.toUpperCase()}".`
        };
      }
    }
    const lockedSet = new Set(params.activeLockedIndices || []);
    const decoySet = new Set(params.decoyIndices || []);
    const hiddenSet = new Set(params.hiddenIndices || []);
    const bonusSet = new Set(params.bonusTileIndices || []);
    const match = this.matchBoardTiles(normalized, params.boardLetters, {
      lockedIndices: lockedSet,
      decoyIndices: decoySet
    });
    if (!match.canForm) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "LETTERS_NOT_ON_BOARD",
        message: "Word uses letters not available on the current board."
      };
    }
    if (match.usedDecoyIndex !== void 0) {
      const decoyChar = params.boardLetters[match.usedDecoyIndex]?.toUpperCase() || "?";
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "USED_DECOY_LETTER",
        message: `Trap triggered! "${decoyChar}" is a Decoy Letter and cannot be used!`,
        triggeredDecoyIndex: match.usedDecoyIndex
      };
    }
    if (match.usedLockedIndex !== void 0) {
      const lockedChar = params.boardLetters[match.usedLockedIndex]?.toUpperCase() || "?";
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "USED_LOCKED_LETTER",
        message: `Tile "${lockedChar}" is currently Locked! Find more words to break its chains!`,
        triggeredLockedIndex: match.usedLockedIndex
      };
    }
    if (params.discoveredWords.has(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "ALREADY_DISCOVERED",
        message: `"${normalized.toUpperCase()}" has already been discovered this round!`
      };
    }
    if (!this.isInDictionary(normalized)) {
      return {
        valid: false,
        normalizedWord: normalized,
        reason: "NOT_IN_DICTIONARY",
        message: `"${normalized.toUpperCase()}" is not in the game dictionary.`
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
      usedBonusIndices
    };
  }
  /**
   * Finds all valid words in the dictionary that can be formed from the given core board letters.
   */
  findPossibleWords(boardLetters, minWordLength, maxWordLength, mandatoryCenterLetter) {
    const boardCounts = {};
    for (const l of boardLetters) {
      const ch = l.toLowerCase();
      boardCounts[ch] = (boardCounts[ch] || 0) + 1;
    }
    const maxLen = Math.min(maxWordLength, boardLetters.length);
    const centerLower = mandatoryCenterLetter ? mandatoryCenterLetter.toLowerCase() : null;
    const results = [];
    for (const word of this.allWordsArray) {
      if (word.length < minWordLength || word.length > maxLen) continue;
      if (centerLower && !word.includes(centerLower)) continue;
      let possible = true;
      const wordCounts = {};
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
};
var wordValidator = new WordValidator();

// server/letterGenerator.ts
var VOWELS = ["A", "E", "I", "O", "U"];
var COMMON_CONSONANTS = ["R", "S", "T", "L", "N", "C", "D", "P", "M", "G", "B"];
var TRICKY_CONSONANTS = ["F", "H", "W", "K", "V", "Y", "Z", "X", "J", "Q"];
var ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
var LetterGenerator = class {
  constructor(validator) {
    this.validator = validator;
  }
  generateBoard(params) {
    const difficulty = params.difficulty || "medium";
    const roundNumber = Math.max(1, params.roundNumber || 1);
    const progressive = params.progressiveElementsEnabled ?? true;
    const coreSize = Math.max(5, Math.min(9, params.boardSize || 7));
    const allWords = this.validator.getAllDictionaryWords();
    const exactLengthWords = allWords.filter((w) => {
      if (w.length !== coreSize) return false;
      const hasTricky = /[kvxyzjq]/i.test(w);
      if (difficulty === "easy") return !hasTricky;
      if (difficulty === "hard" || difficulty === "extreme") return hasTricky || Math.random() < 0.45;
      return true;
    });
    const fallbackPool = exactLengthWords.length > 0 ? exactLengthWords : allWords.filter((w) => w.length === coreSize);
    const minRequiredWords = difficulty === "easy" ? 24 : difficulty === "medium" ? 18 : difficulty === "hard" ? 12 : 9;
    let bestCoreLetters = ["S", "T", "R", "E", "A", "M", "S"].slice(0, coreSize);
    let bestPossibleWords = [];
    let bestPangrams = [];
    const maxAttempts = 45;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let candidateCore;
      if (fallbackPool.length > 0 && attempt < 36) {
        const seedWord = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        candidateCore = this.shuffleLetters(seedWord.toUpperCase().split(""));
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
      bestPossibleWords = ["star", "team", "meat", "seat", "east", "rate", "tear", "steam", "stream", "master"];
      bestPangrams = ["streams"];
    }
    const { finalLetters, centerIndex, centerLetter, modifiers } = this.applyProgressiveMechanics({
      coreLetters: bestCoreLetters,
      mandatoryCenterLetter: params.mandatoryCenterLetter,
      roundNumber,
      difficulty,
      progressive
    });
    const longWords = bestPossibleWords.filter((w) => w.length >= Math.max(5, coreSize - 1));
    const rareBonusWord = longWords.length > 0 ? longWords[Math.floor(Math.random() * longWords.length)].toUpperCase() : bestPossibleWords[bestPossibleWords.length - 1]?.toUpperCase() || null;
    return {
      letters: finalLetters,
      coreLetters: bestCoreLetters,
      centerLetter,
      centerIndex,
      possibleWords: bestPossibleWords,
      pangrams: bestPangrams,
      rareBonusWord,
      difficulty,
      modifiers
    };
  }
  applyProgressiveMechanics(params) {
    const letters = [...params.coreLetters];
    const decoyIndices = [];
    const hiddenIndices = [];
    const lockedTiles = {};
    const bonusTileIndices = [];
    let decoyCount = 0;
    if (params.progressive) {
      if (params.roundNumber >= 6 || params.difficulty === "extreme") {
        decoyCount = 2;
      } else if (params.roundNumber >= 4 || params.difficulty === "hard") {
        decoyCount = 1;
      }
    }
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
    const eligibleCoreIndices = letters.map((_, idx) => idx).filter((idx) => !decoyIndices.includes(idx) && idx !== centerIndex);
    if (params.progressive && eligibleCoreIndices.length > 0) {
      const bonusIdx = eligibleCoreIndices.shift();
      bonusTileIndices.push(bonusIdx);
      const lockedCount = params.roundNumber >= 5 || params.difficulty === "extreme" ? 2 : params.roundNumber >= 2 || params.difficulty === "hard" ? 1 : 0;
      for (let l = 0; l < lockedCount && eligibleCoreIndices.length > 0; l++) {
        const lockIdx = eligibleCoreIndices.shift();
        lockedTiles[lockIdx] = {
          tileIndex: lockIdx,
          unlocksAtWords: l === 0 ? 2 : 4,
          unlocked: false
        };
      }
      const hiddenCount = params.roundNumber >= 5 || params.difficulty === "extreme" ? 2 : params.roundNumber >= 3 || params.difficulty === "hard" ? 1 : 0;
      for (let h = 0; h < hiddenCount && eligibleCoreIndices.length > 0; h++) {
        const hidIdx = eligibleCoreIndices.shift();
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
        bonusTileIndices
      }
    };
  }
  shuffleLetters(letters, preserveIndex) {
    const copy = [...letters];
    if (preserveIndex !== void 0 && preserveIndex !== null && preserveIndex >= 0 && preserveIndex < copy.length) {
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
  generateBalancedRandomLetters(size, difficulty) {
    const vowelRatio = difficulty === "easy" ? 0.44 : difficulty === "medium" ? 0.38 : 0.32;
    const vowelCount = Math.max(2, Math.round(size * vowelRatio));
    const consonantCount = size - vowelCount;
    const result = [];
    for (let i = 0; i < vowelCount; i++) {
      result.push(VOWELS[Math.floor(Math.random() * VOWELS.length)]);
    }
    for (let i = 0; i < consonantCount; i++) {
      const useTricky = difficulty === "hard" && i === 0 || difficulty === "extreme" && i <= 1;
      const pool = useTricky ? TRICKY_CONSONANTS : COMMON_CONSONANTS;
      result.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return this.shuffleLetters(result);
  }
};

// server/scoringEngine.ts
import fs2 from "fs";
import path2 from "path";
var ScoringEngine = class {
  constructor() {
    this.playerComboState = /* @__PURE__ */ new Map();
    this.activeMultiplier = 1;
    this.multiplierExpiresAt = 0;
    this.lastMilestoneTriggered = 0;
    this.configPath = path2.resolve(process.cwd(), "config/scoring.json");
    this.loadConfig();
  }
  loadConfig() {
    try {
      const raw = JSON.parse(fs2.readFileSync(this.configPath, "utf-8"));
      this.config = raw;
    } catch (err) {
      console.error("Error loading scoring.json, using defaults:", err);
      this.config = {
        lengthPoints: { "3": 3, "4": 5, "5": 8, "6": 12, "7": 20, "8": 30, "9": 45, "10": 60 },
        bonuses: {
          uniqueWordBonus: 2,
          longWordThreshold: 6,
          longWordBonus: 5,
          fullBoardPangramBonus: 15,
          comboWindowMs: 8e3,
          comboStepBonus: 2,
          maxComboMultiplier: 3,
          communityMilestoneStep: 100,
          communityMilestoneBonus: 15
        },
        socialRewards: {
          likeMilestoneThreshold: 100,
          likeMilestonePoints: 15,
          likeMilestoneTimeBonus: 5,
          followPoints: 10,
          autoRegisterFollower: true,
          sharePoints: 15
        }
      };
    }
    return this.config;
  }
  saveConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
      lengthPoints: { ...this.config.lengthPoints, ...newConfig.lengthPoints || {} },
      bonuses: { ...this.config.bonuses, ...newConfig.bonuses || {} },
      socialRewards: { ...this.config.socialRewards, ...newConfig.socialRewards || {} }
    };
    fs2.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    return this.config;
  }
  getConfig() {
    return this.config;
  }
  resetRoundState() {
    this.playerComboState.clear();
    this.lastMilestoneTriggered = 0;
  }
  activateMultiplier(multiplier, durationSeconds) {
    const now = Date.now();
    this.activeMultiplier = Math.max(1, multiplier);
    this.multiplierExpiresAt = now + durationSeconds * 1e3;
    return { multiplier: this.activeMultiplier, expiresAt: this.multiplierExpiresAt };
  }
  getActiveMultiplier() {
    const now = Date.now();
    if (this.activeMultiplier > 1 && now < this.multiplierExpiresAt) {
      return {
        multiplier: this.activeMultiplier,
        remainingSeconds: Math.ceil((this.multiplierExpiresAt - now) / 1e3)
      };
    }
    this.activeMultiplier = 1;
    this.multiplierExpiresAt = 0;
    return { multiplier: 1, remainingSeconds: 0 };
  }
  calculateWordScore(params) {
    const len = params.word.length;
    const basePoints = this.config.lengthPoints[String(len)] ?? (len > 7 ? 20 + (len - 7) * 10 : Math.max(1, len));
    const uniqueBonus = params.isFirstTimeEverFound ? this.config.bonuses.uniqueWordBonus : 0;
    const longWordBonus = len >= this.config.bonuses.longWordThreshold ? this.config.bonuses.longWordBonus : 0;
    const isPangram = len >= params.boardSize;
    const pangramBonus = isPangram ? this.config.bonuses.fullBoardPangramBonus : 0;
    const isRareWord = Boolean(params.rareBonusWord) && params.word.toUpperCase() === params.rareBonusWord?.toUpperCase();
    const rareWordBonus = isRareWord ? 25 : 0;
    const mysteryTileBonus = (params.usedHiddenCount || 0) * 8;
    const goldenTileBonus = (params.usedBonusCount || 0) * 5;
    const now = Date.now();
    const prevCombo = this.playerComboState.get(params.userId);
    let comboCount = 1;
    if (prevCombo && now - prevCombo.lastTimestamp <= this.config.bonuses.comboWindowMs) {
      comboCount = prevCombo.count + 1;
    }
    this.playerComboState.set(params.userId, { count: comboCount, lastTimestamp: now });
    const comboBonus = comboCount > 1 ? Math.min(15, (comboCount - 1) * this.config.bonuses.comboStepBonus) : 0;
    const { multiplier } = this.getActiveMultiplier();
    const rawSubtotal = basePoints + uniqueBonus + longWordBonus + pangramBonus + rareWordBonus + mysteryTileBonus + goldenTileBonus + comboBonus;
    const totalPoints = Math.round(rawSubtotal * multiplier);
    const newScoreBeforeMilestone = params.currentCommunityScore + totalPoints;
    const step = this.config.bonuses.communityMilestoneStep || 100;
    const milestoneLevel = Math.floor(newScoreBeforeMilestone / step) * step;
    let milestoneTriggered = false;
    let milestoneBonusPoints = 0;
    if (milestoneLevel > 0 && milestoneLevel > this.lastMilestoneTriggered) {
      this.lastMilestoneTriggered = milestoneLevel;
      milestoneTriggered = true;
      milestoneBonusPoints = this.config.bonuses.communityMilestoneBonus || 15;
    }
    return {
      basePoints,
      uniqueBonus,
      longWordBonus,
      pangramBonus,
      rareWordBonus,
      mysteryTileBonus,
      goldenTileBonus,
      comboBonus,
      comboCount,
      activeMultiplier: multiplier,
      totalPoints,
      isPangram,
      isRareWord,
      milestoneTriggered,
      milestoneBonusPoints
    };
  }
};
var scoringEngine = new ScoringEngine();

// server/leaderboard.ts
import fs3 from "fs";
import path3 from "path";
var LeaderboardManager = class {
  constructor() {
    this.roundPlayers = /* @__PURE__ */ new Map();
    this.discoveredWordsEverSet = /* @__PURE__ */ new Set();
    this.scoresPath = path3.resolve(process.cwd(), "data/scores.json");
    this.statsPath = path3.resolve(process.cwd(), "data/statistics.json");
    this.load();
  }
  getTodayString() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  load() {
    const todayStr = this.getTodayString();
    try {
      const rawScores = JSON.parse(fs3.readFileSync(this.scoresPath, "utf-8"));
      this.scoresData = {
        allTime: rawScores.allTime || {},
        today: rawScores.today && rawScores.today.date === todayStr ? rawScores.today : { date: todayStr, players: {} },
        giftContributors: rawScores.giftContributors || {}
      };
    } catch {
      this.scoresData = {
        allTime: {},
        today: { date: todayStr, players: {} },
        giftContributors: {}
      };
    }
    try {
      const rawStats = JSON.parse(fs3.readFileSync(this.statsPath, "utf-8"));
      this.statsData = {
        totalRoundsPlayed: rawStats.totalRoundsPlayed || 0,
        totalWordsDiscovered: rawStats.totalWordsDiscovered || 0,
        totalPointsScored: rawStats.totalPointsScored || 0,
        highestRoundScore: rawStats.highestRoundScore || 0,
        longestWordFound: rawStats.longestWordFound || "",
        totalGiftsReceived: rawStats.totalGiftsReceived || 0,
        totalLikesReceived: rawStats.totalLikesReceived || 0,
        totalFollowsReceived: rawStats.totalFollowsReceived || 0,
        totalSharesReceived: rawStats.totalSharesReceived || 0,
        discoveredWordsGlobal: rawStats.discoveredWordsGlobal || [],
        history: rawStats.history || []
      };
      this.discoveredWordsEverSet = new Set(this.statsData.discoveredWordsGlobal);
    } catch {
      this.statsData = {
        totalRoundsPlayed: 0,
        totalWordsDiscovered: 0,
        totalPointsScored: 0,
        highestRoundScore: 0,
        longestWordFound: "",
        totalGiftsReceived: 0,
        totalLikesReceived: 0,
        totalFollowsReceived: 0,
        totalSharesReceived: 0,
        discoveredWordsGlobal: [],
        history: []
      };
    }
  }
  save() {
    try {
      this.statsData.discoveredWordsGlobal = Array.from(this.discoveredWordsEverSet).slice(-2e3);
      fs3.writeFileSync(this.scoresPath, JSON.stringify(this.scoresData, null, 2));
      fs3.writeFileSync(this.statsPath, JSON.stringify(this.statsData, null, 2));
    } catch (err) {
      console.error("Failed to persist scores/stats:", err);
    }
  }
  ensureTodayCurrent() {
    const todayStr = this.getTodayString();
    if (this.scoresData.today.date !== todayStr) {
      this.scoresData.today = { date: todayStr, players: {} };
    }
  }
  createBlankRecord(userId, username, nickname, avatarUrl) {
    return {
      userId,
      username,
      nickname: nickname || username,
      avatarUrl,
      totalPoints: 0,
      validWordsCount: 0,
      totalSubmissions: 0,
      longestWord: "",
      highestSingleWordScore: 0,
      giftsSentCount: 0,
      giftDiamondsTotal: 0,
      giftPointsContributed: 0,
      likesContributed: 0,
      lastActiveAt: Date.now()
    };
  }
  registerPlayer(userId, username, nickname, avatarUrl) {
    this.ensureTodayCurrent();
    if (!this.roundPlayers.has(userId)) {
      this.roundPlayers.set(userId, this.createBlankRecord(userId, username, nickname, avatarUrl));
    } else {
      const existing = this.roundPlayers.get(userId);
      if (nickname) existing.nickname = nickname;
      if (avatarUrl) existing.avatarUrl = avatarUrl;
      existing.lastActiveAt = Date.now();
    }
    if (!this.scoresData.allTime[userId]) {
      this.scoresData.allTime[userId] = this.createBlankRecord(userId, username, nickname, avatarUrl);
    }
    if (!this.scoresData.today.players[userId]) {
      this.scoresData.today.players[userId] = this.createBlankRecord(userId, username, nickname, avatarUrl);
    }
    return this.roundPlayers.get(userId);
  }
  isWordEverDiscovered(word) {
    return this.discoveredWordsEverSet.has(word.toLowerCase());
  }
  recordSubmissionAttempt(userId, username, nickname, avatarUrl) {
    const roundRec = this.registerPlayer(userId, username, nickname, avatarUrl);
    roundRec.totalSubmissions += 1;
    this.scoresData.today.players[userId].totalSubmissions += 1;
    this.scoresData.allTime[userId].totalSubmissions += 1;
  }
  recordValidWord(params) {
    this.ensureTodayCurrent();
    const roundRec = this.registerPlayer(params.userId, params.username, params.nickname, params.avatarUrl);
    const todayRec = this.scoresData.today.players[params.userId];
    const allTimeRec = this.scoresData.allTime[params.userId];
    const isNewPersonalHigh = params.points > allTimeRec.highestSingleWordScore && allTimeRec.validWordsCount > 0;
    for (const rec of [roundRec, todayRec, allTimeRec]) {
      rec.totalPoints += params.points;
      rec.validWordsCount += 1;
      if (params.word.length > rec.longestWord.length) {
        rec.longestWord = params.word.toUpperCase();
      }
      if (params.points > rec.highestSingleWordScore) {
        rec.highestSingleWordScore = params.points;
      }
      rec.lastActiveAt = Date.now();
    }
    this.discoveredWordsEverSet.add(params.word.toLowerCase());
    this.statsData.totalWordsDiscovered += 1;
    this.statsData.totalPointsScored += params.points;
    if (params.word.length > this.statsData.longestWordFound.length) {
      this.statsData.longestWordFound = params.word.toUpperCase();
    }
    this.save();
    return { isNewPersonalHigh, roundPlayer: roundRec, allTimePlayer: allTimeRec };
  }
  recordGiftContribution(params) {
    const roundRec = this.registerPlayer(params.userId, params.username, params.nickname, params.avatarUrl);
    const todayRec = this.scoresData.today.players[params.userId];
    const allTimeRec = this.scoresData.allTime[params.userId];
    const totalDiamonds = params.diamondValue * params.repeatCount;
    for (const rec of [roundRec, todayRec, allTimeRec]) {
      rec.giftsSentCount += params.repeatCount;
      rec.giftDiamondsTotal += totalDiamonds;
      rec.giftPointsContributed += params.pointsAwarded;
      rec.totalPoints += params.pointsAwarded;
      rec.lastActiveAt = Date.now();
    }
    const existingGiftRec = this.scoresData.giftContributors[params.userId] || {
      userId: params.userId,
      username: params.username,
      nickname: params.nickname || params.username,
      avatarUrl: params.avatarUrl,
      giftsSentCount: 0,
      giftDiamondsTotal: 0,
      giftPointsContributed: 0,
      lastGiftName: params.giftName,
      lastGiftAt: Date.now()
    };
    existingGiftRec.giftsSentCount += params.repeatCount;
    existingGiftRec.giftDiamondsTotal += totalDiamonds;
    existingGiftRec.giftPointsContributed += params.pointsAwarded;
    existingGiftRec.lastGiftName = params.giftName;
    existingGiftRec.lastGiftAt = Date.now();
    if (params.avatarUrl) existingGiftRec.avatarUrl = params.avatarUrl;
    this.scoresData.giftContributors[params.userId] = existingGiftRec;
    this.statsData.totalGiftsReceived += params.repeatCount;
    this.statsData.totalPointsScored += params.pointsAwarded;
    this.save();
  }
  recordSocialContribution(params) {
    const roundRec = this.registerPlayer(params.userId, params.username, params.nickname, params.avatarUrl);
    const todayRec = this.scoresData.today.players[params.userId];
    const allTimeRec = this.scoresData.allTime[params.userId];
    for (const rec of [roundRec, todayRec, allTimeRec]) {
      rec.totalPoints += params.pointsAwarded;
      if (params.type === "like") {
        rec.likesContributed += params.count || 1;
      }
      rec.lastActiveAt = Date.now();
    }
    if (params.type === "like") this.statsData.totalLikesReceived += params.count || 1;
    if (params.type === "follow") this.statsData.totalFollowsReceived += 1;
    if (params.type === "share") this.statsData.totalSharesReceived += 1;
    this.statsData.totalPointsScored += params.pointsAwarded;
    this.save();
  }
  recordRoundCompleted(summary) {
    this.statsData.totalRoundsPlayed += 1;
    if (summary.score > this.statsData.highestRoundScore) {
      this.statsData.highestRoundScore = summary.score;
    }
    const roundBoard = this.getRoundLeaderboard(1);
    const topPlayer = roundBoard[0]?.nickname || "Community";
    this.statsData.history.unshift({
      ...summary,
      topPlayer,
      endedAt: Date.now()
    });
    if (this.statsData.history.length > 50) {
      this.statsData.history.length = 50;
    }
    this.save();
  }
  resetRoundStats() {
    this.roundPlayers.clear();
  }
  resetAllStats() {
    this.roundPlayers.clear();
    this.scoresData = {
      allTime: {},
      today: { date: this.getTodayString(), players: {} },
      giftContributors: {}
    };
    this.statsData = {
      totalRoundsPlayed: 0,
      totalWordsDiscovered: 0,
      totalPointsScored: 0,
      highestRoundScore: 0,
      longestWordFound: "",
      totalGiftsReceived: 0,
      totalLikesReceived: 0,
      totalFollowsReceived: 0,
      totalSharesReceived: 0,
      discoveredWordsGlobal: [],
      history: []
    };
    this.discoveredWordsEverSet.clear();
    this.save();
  }
  removeUserFromLeaderboards(userIdOrUsername) {
    const target = userIdOrUsername.toLowerCase();
    let removed = false;
    for (const [key, rec] of this.roundPlayers.entries()) {
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        this.roundPlayers.delete(key);
        removed = true;
      }
    }
    for (const key of Object.keys(this.scoresData.today.players)) {
      const rec = this.scoresData.today.players[key];
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        delete this.scoresData.today.players[key];
        removed = true;
      }
    }
    for (const key of Object.keys(this.scoresData.allTime)) {
      const rec = this.scoresData.allTime[key];
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        delete this.scoresData.allTime[key];
        removed = true;
      }
    }
    for (const key of Object.keys(this.scoresData.giftContributors)) {
      const rec = this.scoresData.giftContributors[key];
      if (key.toLowerCase() === target || rec.username.toLowerCase() === target) {
        delete this.scoresData.giftContributors[key];
        removed = true;
      }
    }
    if (removed) this.save();
    return removed;
  }
  getPlayerStats(userIdOrUsername) {
    const key = userIdOrUsername.toLowerCase();
    const findInMap = (records) => {
      for (const r of records) {
        if (r.userId.toLowerCase() === key || r.username.toLowerCase() === key) return r;
      }
      return null;
    };
    return {
      round: findInMap(this.roundPlayers.values()),
      today: findInMap(Object.values(this.scoresData.today.players)),
      allTime: findInMap(Object.values(this.scoresData.allTime))
    };
  }
  getRoundLeaderboard(limit = 20) {
    return Array.from(this.roundPlayers.values()).sort((a, b) => b.totalPoints - a.totalPoints || b.validWordsCount - a.validWordsCount).slice(0, limit);
  }
  getTodayLeaderboard(limit = 20) {
    this.ensureTodayCurrent();
    return Object.values(this.scoresData.today.players).sort((a, b) => b.totalPoints - a.totalPoints || b.validWordsCount - a.validWordsCount).slice(0, limit);
  }
  getAllTimeLeaderboard(limit = 20) {
    return Object.values(this.scoresData.allTime).sort((a, b) => b.totalPoints - a.totalPoints || b.validWordsCount - a.validWordsCount).slice(0, limit);
  }
  getMostWordsLeaderboard(limit = 20) {
    return Object.values(this.scoresData.allTime).sort((a, b) => b.validWordsCount - a.validWordsCount || b.totalPoints - a.totalPoints).slice(0, limit);
  }
  getHighestScoringViewers(limit = 20) {
    return Object.values(this.scoresData.allTime).sort((a, b) => b.highestSingleWordScore - a.highestSingleWordScore || b.totalPoints - a.totalPoints).slice(0, limit);
  }
  getGiftLeaderboard(limit = 20) {
    return Object.values(this.scoresData.giftContributors).sort((a, b) => b.giftDiamondsTotal - a.giftDiamondsTotal || b.giftsSentCount - a.giftsSentCount).slice(0, limit);
  }
  getAllLeaderboards(limit = 15) {
    return {
      round: this.getRoundLeaderboard(limit),
      today: this.getTodayLeaderboard(limit),
      allTime: this.getAllTimeLeaderboard(limit),
      gifts: this.getGiftLeaderboard(limit),
      mostWords: this.getMostWordsLeaderboard(limit),
      highScorers: this.getHighestScoringViewers(limit),
      participatingViewersCount: this.roundPlayers.size,
      statistics: this.statsData
    };
  }
};
var leaderboardManager = new LeaderboardManager();

// server/roundManager.ts
var RoundManager = class {
  constructor(eventManager2) {
    this.status = "IDLE";
    this.roundNumber = 1;
    this.nextRoundResetsToLevelOne = false;
    this.remainingSeconds = 120;
    this.countdownSeconds = 0;
    this.intermissionSeconds = 0;
    this.timerInterval = null;
    this.onRoundStartCallback = null;
    this.onRoundEndCallback = null;
    this.onPrepareNextRoundCallback = null;
    this.eventManager = eventManager2;
  }
  registerCallbacks(callbacks) {
    this.onRoundStartCallback = callbacks.onRoundStart;
    this.onRoundEndCallback = callbacks.onRoundEnd;
    this.onPrepareNextRoundCallback = callbacks.onPrepareNextRound;
  }
  getStatus() {
    return this.status;
  }
  getRoundNumber() {
    return this.roundNumber;
  }
  setRoundNumber(num) {
    this.roundNumber = Math.max(1, num);
  }
  setNextRoundResetsToLevelOne(reset) {
    this.nextRoundResetsToLevelOne = reset;
  }
  getRemainingSeconds() {
    return this.remainingSeconds;
  }
  getCountdownSeconds() {
    return this.countdownSeconds;
  }
  getIntermissionSeconds() {
    return this.intermissionSeconds;
  }
  clearTimers() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
  startCountdownAndRound(config, incrementRound = false) {
    this.clearTimers();
    if (this.nextRoundResetsToLevelOne) {
      this.roundNumber = 1;
      this.nextRoundResetsToLevelOne = false;
    } else if (incrementRound) {
      this.roundNumber += 1;
    }
    const prep = Math.max(0, config.prepDuration ?? 3);
    this.remainingSeconds = Math.max(15, config.roundDuration || 120);
    if (prep <= 0) {
      this.beginActiveRound(config);
      return;
    }
    this.status = "COUNTDOWN";
    this.countdownSeconds = prep;
    if (this.onPrepareNextRoundCallback) {
      this.onPrepareNextRoundCallback();
    }
    this.eventManager.emitGameEvent("round:countdown", {
      roundNumber: this.roundNumber,
      countdownSeconds: this.countdownSeconds,
      status: this.status
    });
    this.timerInterval = setInterval(() => {
      if (this.status !== "COUNTDOWN") return;
      this.countdownSeconds -= 1;
      if (this.countdownSeconds <= 0) {
        this.clearTimers();
        this.beginActiveRound(config);
      } else {
        this.eventManager.emitGameEvent("round:countdown", {
          roundNumber: this.roundNumber,
          countdownSeconds: this.countdownSeconds,
          status: this.status
        });
      }
    }, 1e3);
  }
  beginActiveRound(config) {
    this.clearTimers();
    this.status = "ACTIVE";
    this.remainingSeconds = Math.max(15, config.roundDuration || 120);
    if (this.onRoundStartCallback) {
      this.onRoundStartCallback();
    }
    this.timerInterval = setInterval(() => {
      if (this.status !== "ACTIVE") return;
      this.remainingSeconds = Math.max(0, this.remainingSeconds - 1);
      const isFinalCountdown = this.remainingSeconds <= 10 && this.remainingSeconds > 0;
      this.eventManager.emitGameEvent("round:timer", {
        roundNumber: this.roundNumber,
        remainingSeconds: this.remainingSeconds,
        status: this.status,
        isFinalCountdown
      });
      if (this.remainingSeconds <= 0) {
        this.endRound("TIME_EXPIRED", config);
      }
    }, 1e3);
  }
  pauseRound() {
    if (this.status !== "ACTIVE") return false;
    this.status = "PAUSED";
    this.eventManager.emitGameEvent("game:paused", {
      roundNumber: this.roundNumber,
      remainingSeconds: this.remainingSeconds,
      status: this.status
    });
    return true;
  }
  resumeRound() {
    if (this.status !== "PAUSED") return false;
    this.status = "ACTIVE";
    this.eventManager.emitGameEvent("game:resumed", {
      roundNumber: this.roundNumber,
      remainingSeconds: this.remainingSeconds,
      status: this.status
    });
    return true;
  }
  addTime(seconds) {
    if (this.status === "ACTIVE" || this.status === "PAUSED") {
      this.remainingSeconds = Math.max(1, this.remainingSeconds + seconds);
      this.eventManager.emitGameEvent("round:timer", {
        roundNumber: this.roundNumber,
        remainingSeconds: this.remainingSeconds,
        status: this.status,
        isFinalCountdown: this.remainingSeconds <= 10,
        timeAdded: seconds
      });
    }
    return this.remainingSeconds;
  }
  endRound(reason, config) {
    if (this.status === "ROUND_END" || this.status === "INTERMISSION") return;
    this.clearTimers();
    this.status = "ROUND_END";
    if (this.onRoundEndCallback) {
      this.onRoundEndCallback(reason);
    }
    if (config.autoNextRound) {
      this.intermissionSeconds = Math.max(5, config.intermissionDuration || 10);
      this.status = "INTERMISSION";
      this.timerInterval = setInterval(() => {
        if (this.status !== "INTERMISSION") return;
        this.intermissionSeconds -= 1;
        this.eventManager.emitGameEvent("round:timer", {
          roundNumber: this.roundNumber,
          remainingSeconds: 0,
          intermissionSeconds: this.intermissionSeconds,
          status: this.status
        });
        if (this.intermissionSeconds <= 0) {
          this.clearTimers();
          this.startCountdownAndRound(config, true);
        }
      }, 1e3);
    }
  }
  resetToIdle(defaultDuration = 120) {
    this.clearTimers();
    this.status = "IDLE";
    this.roundNumber = 1;
    this.remainingSeconds = defaultDuration;
    this.countdownSeconds = 0;
    this.intermissionSeconds = 0;
  }
};

// server/gameEngine.ts
var DIFFICULTY_ORDER = ["easy", "medium", "hard", "extreme"];
var GameEngine = class {
  constructor() {
    this.discoveredWordsMap = /* @__PURE__ */ new Map();
    this.revealedHints = [];
    this.revealedHintWords = /* @__PURE__ */ new Set();
    this.roundScore = 0;
    this.targetScore = 120;
    this.roundLikes = 0;
    this.lastLikeMilestone = 0;
    this.userCooldownMap = /* @__PURE__ */ new Map();
    // Real-time viewer performance & adaptive difficulty tracking
    this.roundStartedAt = Date.now();
    this.roundTotalSubmissions = 0;
    this.roundValidSubmissions = 0;
    this.lastAdaptationNotice = null;
    this.chatFeed = [];
    this.gameConfigPath = path4.resolve(process.cwd(), "config/game.json");
    this.settingsConfigPath = path4.resolve(process.cwd(), "config/settings.json");
    this.events = eventManager;
    this.validator = wordValidator;
    this.letterGen = new LetterGenerator(this.validator);
    this.scorer = scoringEngine;
    this.leaderboard = leaderboardManager;
    this.rounds = new RoundManager(this.events);
    this.loadConfigs();
    this.currentBoard = this.letterGen.generateBoard({
      boardSize: this.gameConfig.boardSize,
      minWordLength: this.getEffectiveMinWordLength(),
      maxWordLength: this.gameConfig.maxWordLength,
      mandatoryCenterLetter: this.gameConfig.mandatoryCenterLetter,
      difficulty: this.gameConfig.difficulty,
      roundNumber: 1,
      progressiveElementsEnabled: this.gameConfig.progressiveElementsEnabled
    });
    this.rounds.registerCallbacks({
      onPrepareNextRound: () => this.prepareBoardForRound(),
      onRoundStart: () => this.handleRoundStarted(),
      onRoundEnd: (reason) => this.handleRoundEnded(reason)
    });
    this.startRound(false);
  }
  loadConfigs() {
    try {
      const loaded = JSON.parse(fs4.readFileSync(this.gameConfigPath, "utf-8"));
      this.gameConfig = {
        ...loaded,
        difficulty: loaded.difficulty || "medium",
        autoDifficulty: loaded.autoDifficulty ?? true,
        progressiveElementsEnabled: loaded.progressiveElementsEnabled ?? true
      };
    } catch (err) {
      console.error("Error loading game.json:", err);
    }
    try {
      this.settingsConfig = JSON.parse(fs4.readFileSync(this.settingsConfigPath, "utf-8"));
      this.validator.updateModerationLists(
        this.settingsConfig.moderation.customWords,
        this.settingsConfig.moderation.excludedWords
      );
    } catch (err) {
      console.error("Error loading settings.json:", err);
    }
  }
  getEffectiveRoundDuration() {
    const base = this.gameConfig.roundDuration || 120;
    const diffPreset = this.gameConfig.difficulties?.[this.gameConfig.difficulty];
    const mod = diffPreset?.durationModifierSeconds || 0;
    return Math.max(30, base + mod);
  }
  getEffectiveMinWordLength() {
    const base = this.gameConfig.minWordLength || 3;
    const diffPreset = this.gameConfig.difficulties?.[this.gameConfig.difficulty];
    if (diffPreset && diffPreset.minWordLengthOverride) {
      return Math.max(base, diffPreset.minWordLengthOverride);
    }
    return base;
  }
  updateGameConfig(partial) {
    const prevDifficulty = this.gameConfig.difficulty;
    const prevProgressive = this.gameConfig.progressiveElementsEnabled;
    if (partial.gameMode && this.gameConfig.modes[partial.gameMode]) {
      const modePreset = this.gameConfig.modes[partial.gameMode];
      this.gameConfig = {
        ...this.gameConfig,
        ...partial,
        roundDuration: partial.roundDuration ?? modePreset.roundDuration,
        boardSize: partial.boardSize ?? modePreset.boardSize,
        minWordLength: partial.minWordLength ?? modePreset.minWordLength,
        mandatoryCenterLetter: partial.mandatoryCenterLetter ?? modePreset.mandatoryCenterLetter,
        targetScoreBase: partial.targetScoreBase ?? modePreset.targetScoreBase
      };
    } else {
      this.gameConfig = {
        ...this.gameConfig,
        ...partial,
        enabledCommands: {
          ...this.gameConfig.enabledCommands,
          ...partial.enabledCommands || {}
        }
      };
    }
    if (partial.difficulty && partial.difficulty !== prevDifficulty || partial.progressiveElementsEnabled !== void 0 && partial.progressiveElementsEnabled !== prevProgressive) {
      const diffName = this.gameConfig.difficulties?.[this.gameConfig.difficulty]?.name || this.gameConfig.difficulty;
      this.lastAdaptationNotice = `Host set difficulty to ${diffName.toUpperCase()}.`;
      this.recalculateTargetScore();
    }
    fs4.writeFileSync(this.gameConfigPath, JSON.stringify(this.gameConfig, null, 2));
    this.events.emitGameEvent("config:updated", {
      gameConfig: this.gameConfig,
      settingsConfig: this.settingsConfig,
      scoringConfig: this.scorer.getConfig()
    });
    return this.gameConfig;
  }
  updateSettingsConfig(partial) {
    this.settingsConfig = {
      ...this.settingsConfig,
      ...partial,
      tiktok: { ...this.settingsConfig.tiktok, ...partial.tiktok || {} },
      moderation: { ...this.settingsConfig.moderation, ...partial.moderation || {} },
      audio: {
        ...this.settingsConfig.audio,
        ...partial.audio || {},
        sounds: {
          ...this.settingsConfig.audio.sounds,
          ...partial.audio?.sounds || {}
        }
      },
      overlay: { ...this.settingsConfig.overlay, ...partial.overlay || {} }
    };
    this.validator.updateModerationLists(
      this.settingsConfig.moderation.customWords,
      this.settingsConfig.moderation.excludedWords
    );
    fs4.writeFileSync(this.settingsConfigPath, JSON.stringify(this.settingsConfig, null, 2));
    this.events.emitGameEvent("config:updated", {
      gameConfig: this.gameConfig,
      settingsConfig: this.settingsConfig,
      scoringConfig: this.scorer.getConfig()
    });
    return this.settingsConfig;
  }
  recalculateTargetScore() {
    const roundNum = this.rounds.getRoundNumber();
    const rawTarget = (this.gameConfig.targetScoreBase || 120) + Math.max(0, roundNum - 1) * (this.gameConfig.targetScoreIncrement || 35);
    const mult = this.gameConfig.difficulties?.[this.gameConfig.difficulty]?.targetScoreMultiplier || 1;
    this.targetScore = Math.round(rawTarget * mult);
  }
  prepareBoardForRound() {
    this.discoveredWordsMap.clear();
    this.revealedHints = [];
    this.revealedHintWords.clear();
    this.roundScore = 0;
    this.roundTotalSubmissions = 0;
    this.roundValidSubmissions = 0;
    this.roundStartedAt = Date.now();
    this.scorer.resetRoundState();
    this.leaderboard.resetRoundStats();
    const roundNum = this.rounds.getRoundNumber();
    this.recalculateTargetScore();
    this.currentBoard = this.letterGen.generateBoard({
      boardSize: this.gameConfig.boardSize,
      minWordLength: this.getEffectiveMinWordLength(),
      maxWordLength: this.gameConfig.maxWordLength,
      mandatoryCenterLetter: this.gameConfig.mandatoryCenterLetter,
      difficulty: this.gameConfig.difficulty,
      roundNumber: roundNum,
      progressiveElementsEnabled: this.gameConfig.progressiveElementsEnabled
    });
    this.events.emitGameEvent("board:generated", {
      roundNumber: roundNum,
      letters: this.getPublicBoardLetters(),
      centerLetter: this.currentBoard.centerLetter,
      centerIndex: this.currentBoard.centerIndex,
      totalPossibleWords: this.currentBoard.possibleWords.length,
      pangramCount: this.currentBoard.pangrams.length,
      targetScore: this.targetScore,
      difficulty: this.currentBoard.difficulty,
      modifiers: this.currentBoard.modifiers,
      wordSlots: this.getPublicWordSlots()
    });
  }
  /**
   * Returns the board letters array where unrevealed Hidden Tiles are masked as '?'
   */
  getPublicBoardLetters() {
    const mod = this.currentBoard.modifiers;
    return this.currentBoard.letters.map((ch, idx) => {
      if (mod.hiddenIndices.includes(idx) && !mod.revealedHiddenIndices.includes(idx)) {
        return "?";
      }
      return ch;
    });
  }
  getPublicWordSlots() {
    const sorted = [...this.currentBoard.possibleWords].sort(
      (a, b) => a.length - b.length || a.localeCompare(b)
    );
    return sorted.map((rawWord, idx) => {
      const lower = rawWord.toLowerCase();
      const upper = rawWord.toUpperCase();
      const found = this.discoveredWordsMap.get(lower);
      const isHinted = this.revealedHintWords.has(upper);
      const hintMask = isHinted ? upper.split("").map((ch, i) => i === 0 || i === upper.length - 1 ? ch : "") : null;
      return {
        id: `slot-${idx}-${upper.length}`,
        length: upper.length,
        discovered: Boolean(found),
        word: found ? found.word : null,
        points: found ? found.points : null,
        isPangram: found ? found.isPangram : upper.length === this.currentBoard.coreLetters.length,
        hintMask
      };
    });
  }
  handleRoundStarted() {
    this.roundStartedAt = Date.now();
    this.events.emitGameEvent("round:started", {
      roundNumber: this.rounds.getRoundNumber(),
      remainingSeconds: this.rounds.getRemainingSeconds(),
      letters: this.getPublicBoardLetters(),
      centerLetter: this.currentBoard.centerLetter,
      centerIndex: this.currentBoard.centerIndex,
      targetScore: this.targetScore,
      totalPossibleWords: this.currentBoard.possibleWords.length,
      status: this.rounds.getStatus(),
      difficulty: this.currentBoard.difficulty,
      modifiers: this.currentBoard.modifiers,
      wordSlots: this.getPublicWordSlots()
    });
  }
  /**
   * Evaluates viewer performance at the end of a round and adapts difficulty if `autoDifficulty` is enabled.
   */
  evaluateAutoDifficultyAdaptation() {
    if (!this.gameConfig.autoDifficulty) return;
    const metrics = this.getPerformanceMetrics();
    const currentIdx = DIFFICULTY_ORDER.indexOf(this.gameConfig.difficulty);
    if (currentIdx === -1) return;
    let nextIdx = currentIdx;
    let reason = "";
    if ((metrics.targetCompletionRatio >= 1.25 || metrics.targetCompletionRatio >= 1 && metrics.wordsPerMinute >= 8) && currentIdx < DIFFICULTY_ORDER.length - 1) {
      nextIdx = currentIdx + 1;
      reason = `High viewer performance (${Math.round(metrics.targetCompletionRatio * 100)}% of target, ${metrics.wordsPerMinute} WPM) \u2014 Auto-scaled difficulty UP to ${DIFFICULTY_ORDER[nextIdx].toUpperCase()}!`;
    } else if (metrics.targetCompletionRatio < 0.6 && currentIdx > 0) {
      nextIdx = currentIdx - 1;
      reason = `Tough round (${Math.round(metrics.targetCompletionRatio * 100)}% of target) \u2014 Auto-adjusted difficulty DOWN to ${DIFFICULTY_ORDER[nextIdx].toUpperCase()} for better stream flow!`;
    } else {
      reason = `Balanced stream pace (${Math.round(metrics.targetCompletionRatio * 100)}% target, ${metrics.wordsPerMinute} WPM) \u2014 Maintaining ${this.gameConfig.difficulty.toUpperCase()} difficulty.`;
    }
    this.lastAdaptationNotice = reason;
    if (nextIdx !== currentIdx) {
      const newDifficulty = DIFFICULTY_ORDER[nextIdx];
      this.gameConfig.difficulty = newDifficulty;
      fs4.writeFileSync(this.gameConfigPath, JSON.stringify(this.gameConfig, null, 2));
      this.events.emitGameEvent("difficulty:adapted", {
        previousDifficulty: DIFFICULTY_ORDER[currentIdx],
        newDifficulty,
        reason,
        metrics
      });
    }
  }
  handleRoundEnded(reason) {
    const roundNumber = this.rounds.getRoundNumber();
    const missedWords = this.currentBoard.possibleWords.filter((w) => !this.discoveredWordsMap.has(w)).map((w) => w.toUpperCase());
    const targetReached = this.roundScore >= this.targetScore || this.discoveredWordsMap.size >= this.currentBoard.possibleWords.length;
    this.rounds.setNextRoundResetsToLevelOne(!targetReached);
    this.currentBoard.modifiers.revealedHiddenIndices = [...this.currentBoard.modifiers.hiddenIndices];
    this.currentBoard.modifiers.exposedDecoyIndices = [...this.currentBoard.modifiers.decoyIndices];
    this.evaluateAutoDifficultyAdaptation();
    if (!targetReached) {
      this.lastAdaptationNotice = `Goal not met (${this.roundScore}/${this.targetScore} pts) \u2014 Restarting from Level 1!`;
    }
    this.leaderboard.recordRoundCompleted({
      roundNumber,
      mode: this.gameConfig.gameMode,
      score: this.roundScore,
      targetScore: this.targetScore,
      wordsFound: this.discoveredWordsMap.size,
      totalPossibleWords: this.currentBoard.possibleWords.length
    });
    this.events.emitGameEvent("round:ended", {
      roundNumber,
      reason,
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      targetReached,
      discoveredWords: Array.from(this.discoveredWordsMap.values()),
      missedWords: missedWords.slice(0, 60),
      totalPossibleWords: this.currentBoard.possibleWords.length,
      leaderboards: this.leaderboard.getAllLeaderboards(),
      status: this.rounds.getStatus(),
      difficulty: this.gameConfig.difficulty,
      performanceMetrics: this.getPerformanceMetrics()
    });
  }
  startRound(incrementRound = false) {
    this.rounds.startCountdownAndRound(
      {
        roundDuration: this.getEffectiveRoundDuration(),
        prepDuration: this.gameConfig.prepDuration,
        intermissionDuration: this.gameConfig.intermissionDuration,
        autoNextRound: this.gameConfig.autoNextRound
      },
      incrementRound
    );
    this.events.emitGameEvent("game:started", {
      roundNumber: this.rounds.getRoundNumber(),
      status: this.rounds.getStatus()
    });
  }
  pauseRound() {
    return this.rounds.pauseRound();
  }
  resumeRound() {
    return this.rounds.resumeRound();
  }
  endCurrentRound(reason = "HOST_ENDED") {
    this.rounds.endRound(reason, {
      roundDuration: this.getEffectiveRoundDuration(),
      prepDuration: this.gameConfig.prepDuration,
      intermissionDuration: this.gameConfig.intermissionDuration,
      autoNextRound: this.gameConfig.autoNextRound
    });
  }
  nextRound() {
    const goalMet = this.roundScore >= this.targetScore || this.discoveredWordsMap.size >= this.currentBoard.possibleWords.length;
    if (!goalMet) {
      this.rounds.setRoundNumber(1);
      this.rounds.setNextRoundResetsToLevelOne(false);
      this.lastAdaptationNotice = "Goal not met \u2014 restarted from Level 1!";
      this.startRound(false);
    } else {
      this.rounds.setNextRoundResetsToLevelOne(false);
      this.startRound(true);
    }
  }
  restartRound() {
    this.rounds.setRoundNumber(1);
    this.rounds.setNextRoundResetsToLevelOne(false);
    this.startRound(false);
  }
  shuffleCurrentBoard() {
    const n = this.currentBoard.letters.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    const fixedIdx = this.currentBoard.centerIndex;
    const movable = indices.filter((i) => i !== fixedIdx);
    for (let i = movable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [movable[i], movable[j]] = [movable[j], movable[i]];
    }
    if (fixedIdx !== null && fixedIdx >= 0 && fixedIdx < n) {
      movable.splice(fixedIdx, 0, fixedIdx);
    }
    const oldToNew = {};
    const newLetters = new Array(n);
    for (let newPos = 0; newPos < n; newPos++) {
      const oldPos = movable[newPos];
      oldToNew[oldPos] = newPos;
      newLetters[newPos] = this.currentBoard.letters[oldPos];
    }
    this.currentBoard.letters = newLetters;
    const mod = this.currentBoard.modifiers;
    mod.hiddenIndices = mod.hiddenIndices.map((idx) => oldToNew[idx]);
    mod.revealedHiddenIndices = mod.revealedHiddenIndices.map((idx) => oldToNew[idx]);
    mod.decoyIndices = mod.decoyIndices.map((idx) => oldToNew[idx]);
    mod.exposedDecoyIndices = mod.exposedDecoyIndices.map((idx) => oldToNew[idx]);
    mod.bonusTileIndices = mod.bonusTileIndices.map((idx) => oldToNew[idx]);
    const newLocked = {};
    for (const rule of Object.values(mod.lockedTiles)) {
      const mapped = oldToNew[rule.tileIndex];
      newLocked[mapped] = { ...rule, tileIndex: mapped };
    }
    mod.lockedTiles = newLocked;
    this.emitModifierUpdate("Board tiles rearranged!");
    return this.getPublicBoardLetters();
  }
  /**
   * Host/Admin action to manually inject or clear progressive board elements in any round.
   */
  triggerModifierAction(action) {
    const mod = this.currentBoard.modifiers;
    const n = this.currentBoard.letters.length;
    if (action === "unlock_and_reveal_all") {
      mod.revealedHiddenIndices = [...mod.hiddenIndices];
      mod.exposedDecoyIndices = [...mod.decoyIndices];
      for (const key of Object.keys(mod.lockedTiles)) {
        mod.lockedTiles[Number(key)].unlocked = true;
      }
      this.emitModifierUpdate("All Hidden, Decoy, and Locked tiles revealed/unlocked!");
      return mod;
    }
    if (action === "add_decoy") {
      const usedChars = new Set(this.currentBoard.letters.map((c) => c.toUpperCase()));
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter((c) => !usedChars.has(c));
      const decoyChar = alphabet.length > 0 ? alphabet[Math.floor(Math.random() * alphabet.length)] : "Z";
      this.currentBoard.letters.push(decoyChar);
      const newIdx = this.currentBoard.letters.length - 1;
      mod.decoyIndices.push(newIdx);
      this.emitModifierUpdate(`Added a hidden Decoy Letter tile to the board!`);
      return mod;
    }
    const eligible = Array.from({ length: n }, (_, i) => i).filter(
      (i) => i !== this.currentBoard.centerIndex && !mod.decoyIndices.includes(i)
    );
    if (action === "add_hidden") {
      const target = eligible.find((i) => !mod.hiddenIndices.includes(i));
      if (target !== void 0) {
        mod.hiddenIndices.push(target);
        mod.revealedHiddenIndices = mod.revealedHiddenIndices.filter((x) => x !== target);
        this.emitModifierUpdate(`Disguised tile #${target + 1} as a Mystery '?' Letter!`);
      }
    } else if (action === "add_locked") {
      const target = eligible.find((i) => !mod.lockedTiles[i] || mod.lockedTiles[i].unlocked);
      if (target !== void 0) {
        const threshold = this.discoveredWordsMap.size + 2;
        mod.lockedTiles[target] = {
          tileIndex: target,
          unlocksAtWords: threshold,
          unlocked: false
        };
        this.emitModifierUpdate(`Locked tile "${this.currentBoard.letters[target]}" (unlocks at ${threshold} words)!`);
      }
    } else if (action === "add_bonus") {
      const target = eligible.find((i) => !mod.bonusTileIndices.includes(i));
      if (target !== void 0) {
        mod.bonusTileIndices.push(target);
        this.emitModifierUpdate(`Charged tile "${this.currentBoard.letters[target]}" with +5 Golden Bonus Points!`);
      }
    }
    return mod;
  }
  emitModifierUpdate(notice) {
    this.events.emitGameEvent("board:modifier_updated", {
      letters: this.getPublicBoardLetters(),
      centerLetter: this.currentBoard.centerLetter,
      centerIndex: this.currentBoard.centerIndex,
      modifiers: this.currentBoard.modifiers,
      notice
    });
  }
  resetGame(clearAllTimeScores = false) {
    this.rounds.resetToIdle(this.getEffectiveRoundDuration());
    this.discoveredWordsMap.clear();
    this.revealedHints = [];
    this.revealedHintWords.clear();
    this.roundScore = 0;
    this.roundLikes = 0;
    this.lastLikeMilestone = 0;
    this.roundTotalSubmissions = 0;
    this.roundValidSubmissions = 0;
    this.scorer.resetRoundState();
    if (clearAllTimeScores) {
      this.leaderboard.resetAllStats();
    } else {
      this.leaderboard.resetRoundStats();
    }
    this.prepareBoardForRound();
    this.events.emitGameEvent("game:reset", this.getFullState());
  }
  revealHint(sourceUser = "Host", simulated = false) {
    const mod = this.currentBoard.modifiers;
    const unrevealedHidden = mod.hiddenIndices.find((idx) => !mod.revealedHiddenIndices.includes(idx));
    if (unrevealedHidden !== void 0) {
      mod.revealedHiddenIndices.push(unrevealedHidden);
      this.emitModifierUpdate(
        `Hint revealed Mystery Tile #${unrevealedHidden + 1}: "${this.currentBoard.letters[unrevealedHidden]}"!`
      );
    } else {
      const unexposedDecoy = mod.decoyIndices.find((idx) => !mod.exposedDecoyIndices.includes(idx));
      if (unexposedDecoy !== void 0) {
        mod.exposedDecoyIndices.push(unexposedDecoy);
        this.emitModifierUpdate(
          `Hint exposed Decoy Tile "${this.currentBoard.letters[unexposedDecoy]}"!`
        );
      }
    }
    const unfound = this.currentBoard.possibleWords.filter(
      (w) => !this.discoveredWordsMap.has(w) && !this.revealedHints.some((h) => h.startsWith(w.toUpperCase()))
    );
    if (unfound.length === 0) {
      return { hint: null, word: null };
    }
    const preferred = unfound.filter((w) => w.length >= 4);
    const target = (preferred.length > 0 ? preferred : unfound)[Math.floor(Math.random() * (preferred.length > 0 ? preferred.length : unfound.length))].toUpperCase();
    const masked = target.split("").map((ch, idx) => idx === 0 || idx === target.length - 1 ? ch : "_").join(" ");
    const hintLabel = `${masked} (${target.length} letters)`;
    this.revealedHints.push(hintLabel);
    this.revealedHintWords.add(target);
    this.events.emitGameEvent(
      "hint:revealed",
      {
        hint: hintLabel,
        wordLength: target.length,
        firstLetter: target[0],
        lastLetter: target[target.length - 1],
        triggeredBy: sourceUser,
        revealedHints: this.revealedHints,
        wordSlots: this.getPublicWordSlots()
      },
      simulated
    );
    return { hint: hintLabel, word: target };
  }
  submitWord(params) {
    const simulated = params.source === "simulation";
    const cleanUser = params.username.trim() || "Player";
    const nickname = params.nickname?.trim() || cleanUser;
    if (this.settingsConfig.moderation.blockedUsers.some(
      (u) => u.toLowerCase() === cleanUser.toLowerCase() || u.toLowerCase() === params.userId.toLowerCase()
    )) {
      return {
        accepted: false,
        word: params.word,
        reason: "USER_BLOCKED",
        message: "User is blocked by moderation settings."
      };
    }
    if (params.source === "tiktok" && !this.gameConfig.allowChatSubmissions) {
      return {
        accepted: false,
        word: params.word,
        reason: "CHAT_SUBMISSIONS_DISABLED",
        message: "Chat submissions are currently paused by the host."
      };
    }
    const now = Date.now();
    const cooldownMs = this.gameConfig.submissionCooldownMs || 0;
    if (cooldownMs > 0 && params.source !== "web") {
      const lastSub = this.userCooldownMap.get(params.userId) || 0;
      if (now - lastSub < cooldownMs) {
        return {
          accepted: false,
          word: params.word,
          reason: "COOLDOWN_ACTIVE",
          message: "Please wait a moment before submitting another word."
        };
      }
    }
    this.userCooldownMap.set(params.userId, now);
    const status = this.rounds.getStatus();
    if (status !== "ACTIVE") {
      return {
        accepted: false,
        word: params.word,
        reason: "ROUND_NOT_ACTIVE",
        message: status === "PAUSED" ? "Round is paused!" : "Wait for the round to start!"
      };
    }
    this.roundTotalSubmissions += 1;
    this.leaderboard.recordSubmissionAttempt(params.userId, cleanUser, nickname, params.avatarUrl);
    const mod = this.currentBoard.modifiers;
    const activeLockedIndices = Object.values(mod.lockedTiles).filter((r) => !r.unlocked).map((r) => r.tileIndex);
    const unrevealedHiddenIndices = mod.hiddenIndices.filter(
      (idx) => !mod.revealedHiddenIndices.includes(idx)
    );
    const discoveredSet = new Set(this.discoveredWordsMap.keys());
    const validation = this.validator.validateSubmission({
      word: params.word,
      boardLetters: this.currentBoard.letters,
      discoveredWords: discoveredSet,
      minWordLength: this.getEffectiveMinWordLength(),
      maxWordLength: this.gameConfig.maxWordLength,
      mandatoryCenterLetter: this.currentBoard.centerLetter,
      activeLockedIndices,
      decoyIndices: mod.decoyIndices,
      hiddenIndices: unrevealedHiddenIndices,
      bonusTileIndices: mod.bonusTileIndices
    });
    if (!validation.valid && validation.reason === "USED_DECOY_LETTER" && validation.triggeredDecoyIndex !== void 0) {
      if (!mod.exposedDecoyIndices.includes(validation.triggeredDecoyIndex)) {
        mod.exposedDecoyIndices.push(validation.triggeredDecoyIndex);
        this.emitModifierUpdate(
          `${nickname} triggered Decoy Tile "${this.currentBoard.letters[validation.triggeredDecoyIndex]}"!`
        );
      }
    }
    this.events.emitGameEvent(
      "word:submitted",
      {
        userId: params.userId,
        username: cleanUser,
        nickname,
        word: validation.normalizedWord.toUpperCase(),
        valid: validation.valid,
        source: params.source
      },
      simulated
    );
    if (!validation.valid) {
      this.pushChatFeed({
        userId: params.userId,
        username: cleanUser,
        nickname,
        avatarUrl: params.avatarUrl,
        text: validation.normalizedWord.toUpperCase() || params.word,
        status: "rejected",
        reason: validation.message,
        simulated
      });
      this.events.emitGameEvent(
        "word:rejected",
        {
          userId: params.userId,
          username: cleanUser,
          nickname,
          word: validation.normalizedWord.toUpperCase() || params.word,
          reason: validation.reason,
          message: validation.message,
          source: params.source
        },
        simulated
      );
      return {
        accepted: false,
        word: validation.normalizedWord.toUpperCase(),
        reason: validation.reason,
        message: validation.message
      };
    }
    this.roundValidSubmissions += 1;
    const upperWord = validation.normalizedWord.toUpperCase();
    const isFirstTimeEver = !this.leaderboard.isWordEverDiscovered(validation.normalizedWord);
    const usedHiddenCount = validation.usedHiddenIndices?.length || 0;
    const usedBonusCount = validation.usedBonusIndices?.length || 0;
    let modifierChanged = false;
    if (validation.usedHiddenIndices && validation.usedHiddenIndices.length > 0) {
      for (const hIdx of validation.usedHiddenIndices) {
        if (!mod.revealedHiddenIndices.includes(hIdx)) {
          mod.revealedHiddenIndices.push(hIdx);
          modifierChanged = true;
        }
      }
    }
    const scoreBreakdown = this.scorer.calculateWordScore({
      word: validation.normalizedWord,
      userId: params.userId,
      boardSize: this.currentBoard.coreLetters.length,
      rareBonusWord: this.currentBoard.rareBonusWord,
      currentCommunityScore: this.roundScore,
      isFirstTimeEverFound: isFirstTimeEver,
      usedHiddenCount,
      usedBonusCount
    });
    const totalAwarded = scoreBreakdown.totalPoints + scoreBreakdown.milestoneBonusPoints;
    this.roundScore += totalAwarded;
    const entry = {
      word: upperWord,
      foundByUserId: params.userId,
      foundByUsername: cleanUser,
      foundByNickname: nickname,
      foundByAvatar: params.avatarUrl,
      points: scoreBreakdown.totalPoints,
      timestamp: now,
      isPangram: scoreBreakdown.isPangram,
      isRareWord: scoreBreakdown.isRareWord,
      comboCount: scoreBreakdown.comboCount,
      usedTileIndices: validation.usedTileIndices || []
    };
    this.discoveredWordsMap.set(validation.normalizedWord, entry);
    const currentWordCount = this.discoveredWordsMap.size;
    for (const rule of Object.values(mod.lockedTiles)) {
      if (!rule.unlocked && currentWordCount >= rule.unlocksAtWords) {
        rule.unlocked = true;
        modifierChanged = true;
      }
    }
    if (modifierChanged) {
      this.emitModifierUpdate();
    }
    const { isNewPersonalHigh } = this.leaderboard.recordValidWord({
      userId: params.userId,
      username: cleanUser,
      nickname,
      avatarUrl: params.avatarUrl,
      word: validation.normalizedWord,
      points: scoreBreakdown.totalPoints
    });
    this.pushChatFeed({
      userId: params.userId,
      username: cleanUser,
      nickname,
      avatarUrl: params.avatarUrl,
      text: upperWord,
      status: "accepted",
      points: scoreBreakdown.totalPoints,
      simulated
    });
    this.events.emitGameEvent(
      "word:accepted",
      {
        entry,
        scoreBreakdown,
        isNewPersonalHigh,
        roundScore: this.roundScore,
        targetScore: this.targetScore,
        discoveredCount: this.discoveredWordsMap.size,
        totalPossibleWords: this.currentBoard.possibleWords.length,
        performanceMetrics: this.getPerformanceMetrics(),
        wordSlots: this.getPublicWordSlots()
      },
      simulated
    );
    this.events.emitGameEvent(
      "score:updated",
      {
        roundScore: this.roundScore,
        targetScore: this.targetScore,
        activeMultiplier: this.scorer.getActiveMultiplier()
      },
      simulated
    );
    this.events.emitGameEvent("leaderboard:updated", this.leaderboard.getAllLeaderboards(), simulated);
    if (this.discoveredWordsMap.size >= this.currentBoard.possibleWords.length) {
      this.endCurrentRound("ALL_WORDS_DISCOVERED");
    }
    return {
      accepted: true,
      word: upperWord,
      message: validation.message,
      scoreBreakdown,
      entry
    };
  }
  getPerformanceMetrics() {
    const elapsedMinutes = Math.max(0.25, (Date.now() - this.roundStartedAt) / 6e4);
    const wordsPerMinute = Math.round(this.discoveredWordsMap.size / elapsedMinutes * 10) / 10;
    const submissionAccuracy = this.roundTotalSubmissions > 0 ? Math.round(this.roundValidSubmissions / this.roundTotalSubmissions * 100) : 100;
    const targetCompletionRatio = Math.round(this.roundScore / Math.max(1, this.targetScore) * 100) / 100;
    const activePlayers = this.leaderboard.getAllLeaderboards().participatingViewersCount;
    const engagementScore = Math.min(
      100,
      Math.round(wordsPerMinute * 6 + submissionAccuracy * 0.3 + activePlayers * 5)
    );
    return {
      wordsPerMinute,
      submissionAccuracy,
      targetCompletionRatio,
      roundTotalSubmissions: this.roundTotalSubmissions,
      roundValidSubmissions: this.roundValidSubmissions,
      lastAdaptationNotice: this.lastAdaptationNotice,
      engagementScore
    };
  }
  addCommunityBonusPoints(points) {
    this.roundScore += points;
    this.events.emitGameEvent("score:updated", {
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      activeMultiplier: this.scorer.getActiveMultiplier()
    });
    return this.roundScore;
  }
  addRoundTime(seconds) {
    return this.rounds.addTime(seconds);
  }
  activateScoreMultiplier(multiplier, durationSeconds) {
    const result = this.scorer.activateMultiplier(multiplier, durationSeconds);
    this.events.emitGameEvent("score:updated", {
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      activeMultiplier: this.scorer.getActiveMultiplier()
    });
    return result;
  }
  addLikes(count, user, simulated = false) {
    this.roundLikes += count;
    const socialConfig = this.scorer.getConfig().socialRewards;
    const threshold = Math.max(10, socialConfig.likeMilestoneThreshold || 100);
    const milestoneReached = Math.floor(this.roundLikes / threshold) * threshold;
    this.leaderboard.recordSocialContribution({
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      type: "like",
      count,
      pointsAwarded: 0
    });
    this.events.emitGameEvent(
      "like:updated",
      {
        roundLikes: this.roundLikes,
        nextMilestone: (Math.floor(this.roundLikes / threshold) + 1) * threshold,
        user,
        count
      },
      simulated
    );
    if (milestoneReached > 0 && milestoneReached > this.lastLikeMilestone) {
      this.lastLikeMilestone = milestoneReached;
      const bonusPts = socialConfig.likeMilestonePoints || 15;
      const bonusTime = socialConfig.likeMilestoneTimeBonus || 5;
      this.addCommunityBonusPoints(bonusPts);
      this.addRoundTime(bonusTime);
      this.events.emitGameEvent(
        "like:milestone",
        {
          milestone: milestoneReached,
          bonusPoints: bonusPts,
          bonusTimeSeconds: bonusTime,
          triggeredBy: user.nickname || user.username,
          roundScore: this.roundScore
        },
        simulated
      );
    }
  }
  pushChatFeed(item) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...item,
      timestamp: Date.now()
    };
    this.chatFeed.unshift(entry);
    if (this.chatFeed.length > 60) {
      this.chatFeed.length = 60;
    }
    this.events.emitGameEvent("chat:message", entry, Boolean(item.simulated));
    return entry;
  }
  clearActivityLogs() {
    this.chatFeed = [];
    this.events.clearRecentEvents();
  }
  getGameConfig() {
    return this.gameConfig;
  }
  getSettingsConfig() {
    return this.settingsConfig;
  }
  getFullState() {
    return {
      seqId: this.events.getSeqId(),
      status: this.rounds.getStatus(),
      roundNumber: this.rounds.getRoundNumber(),
      remainingSeconds: this.rounds.getRemainingSeconds(),
      countdownSeconds: this.rounds.getCountdownSeconds(),
      intermissionSeconds: this.rounds.getIntermissionSeconds(),
      gameMode: this.gameConfig.gameMode,
      difficulty: this.gameConfig.difficulty,
      autoDifficulty: this.gameConfig.autoDifficulty,
      progressiveElementsEnabled: this.gameConfig.progressiveElementsEnabled,
      performanceMetrics: this.getPerformanceMetrics(),
      board: {
        letters: this.getPublicBoardLetters(),
        centerLetter: this.currentBoard.centerLetter,
        centerIndex: this.currentBoard.centerIndex,
        totalPossibleWords: this.currentBoard.possibleWords.length,
        pangramCount: this.currentBoard.pangrams.length,
        rareBonusWordLength: this.currentBoard.rareBonusWord?.length || 0,
        modifiers: this.currentBoard.modifiers,
        wordSlots: this.getPublicWordSlots()
      },
      roundScore: this.roundScore,
      targetScore: this.targetScore,
      roundLikes: this.roundLikes,
      nextLikeMilestone: (Math.floor(
        this.roundLikes / Math.max(10, this.scorer.getConfig().socialRewards.likeMilestoneThreshold || 100)
      ) + 1) * Math.max(10, this.scorer.getConfig().socialRewards.likeMilestoneThreshold || 100),
      activeMultiplier: this.scorer.getActiveMultiplier(),
      discoveredWords: Array.from(this.discoveredWordsMap.values()),
      revealedHints: this.revealedHints,
      chatFeed: this.chatFeed,
      leaderboards: this.leaderboard.getAllLeaderboards(),
      gameConfig: this.gameConfig,
      scoringConfig: this.scorer.getConfig(),
      settingsConfig: this.settingsConfig,
      dictionarySize: this.validator.getDictionarySize()
    };
  }
};
var gameEngine = new GameEngine();

// server/websocket.ts
import { WebSocketServer, WebSocket } from "ws";

// integrations/tiktok.ts
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

// integrations/chatHandler.ts
var ChatHandler = class {
  handleIncomingChat(payload) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableChatEvents) {
      return { handled: false, reason: "CHAT_EVENTS_DISABLED" };
    }
    const rawText = String(payload.comment || "").trim();
    if (!rawText) {
      return { handled: false, reason: "EMPTY_MESSAGE" };
    }
    const gameConfig = gameEngine.getGameConfig();
    const prefix = gameConfig.commandPrefix || "!";
    const simulated = Boolean(payload.simulated);
    const displayName = payload.nickname || payload.username || "Viewer";
    if (rawText.startsWith(prefix)) {
      const parts = rawText.slice(prefix.length).trim().split(/\s+/);
      const cmd = (parts[0] || "").toLowerCase();
      if (this.isSupportedCommand(cmd)) {
        if (!gameConfig.enabledCommands[cmd]) {
          return { handled: false, reason: "COMMAND_DISABLED" };
        }
        return this.executeCommand(cmd, payload, simulated);
      }
      if (gameConfig.requirePrefixForWords) {
        const candidateWord2 = parts[0] || "";
        return gameEngine.submitWord({
          userId: payload.userId,
          username: payload.username,
          nickname: displayName,
          avatarUrl: payload.avatarUrl,
          word: candidateWord2,
          source: simulated ? "simulation" : "tiktok"
        });
      }
    }
    if (gameConfig.requirePrefixForWords && !rawText.startsWith(prefix)) {
      return { handled: false, reason: "PREFIX_REQUIRED" };
    }
    const tokens = rawText.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      gameEngine.pushChatFeed({
        userId: payload.userId,
        username: payload.username,
        nickname: displayName,
        avatarUrl: payload.avatarUrl,
        text: rawText.slice(0, 80),
        status: "chat",
        simulated
      });
      return { handled: true, type: "chat" };
    }
    const candidateWord = tokens[0].replace(/[^a-zA-Z]/g, "");
    if (!candidateWord) {
      return { handled: false, reason: "NO_LETTERS" };
    }
    return gameEngine.submitWord({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      word: candidateWord,
      source: simulated ? "simulation" : "tiktok"
    });
  }
  isSupportedCommand(cmd) {
    return ["score", "top", "words", "time", "help", "join", "stats"].includes(cmd);
  }
  executeCommand(cmd, payload, simulated) {
    const displayName = payload.nickname || payload.username || "Viewer";
    const state = gameEngine.getFullState();
    let responseText = "";
    switch (cmd) {
      case "join": {
        leaderboardManager.registerPlayer(payload.userId, payload.username, displayName, payload.avatarUrl);
        responseText = `${displayName} joined the word arena! Type words from the board to score!`;
        eventManager.emitGameEvent("leaderboard:updated", leaderboardManager.getAllLeaderboards(), simulated);
        break;
      }
      case "score": {
        const stats = leaderboardManager.getPlayerStats(payload.userId);
        const roundPts = stats.round?.totalPoints || 0;
        const allTimePts = stats.allTime?.totalPoints || 0;
        responseText = `@${displayName} \u2014 Round: ${roundPts} pts | All-Time: ${allTimePts} pts`;
        break;
      }
      case "stats": {
        const stats = leaderboardManager.getPlayerStats(payload.userId);
        const words = stats.allTime?.validWordsCount || 0;
        const best = stats.allTime?.longestWord || "\u2014";
        responseText = `@${displayName} Stats \u2014 Words: ${words} | Longest: ${best} | Gifts: ${stats.allTime?.giftsSentCount || 0}`;
        break;
      }
      case "top": {
        const top3 = leaderboardManager.getRoundLeaderboard(3).map((p, i) => `#${i + 1} ${p.nickname} (${p.totalPoints})`).join(" \xB7 ");
        responseText = top3 ? `Round Leaders: ${top3}` : "No scores yet this round \u2014 find the first word!";
        break;
      }
      case "words": {
        responseText = `Discovered ${state.discoveredWords.length} / ${state.board.totalPossibleWords} possible words this round!`;
        break;
      }
      case "time": {
        responseText = `Round ${state.roundNumber}: ${state.remainingSeconds}s remaining (${state.status}).`;
        break;
      }
      case "help": {
        responseText = "Type any valid word from the letter tiles! Commands: !join !score !top !words !time !stats";
        break;
      }
    }
    gameEngine.pushChatFeed({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      text: `!${cmd} \u2192 ${responseText}`,
      status: "command",
      simulated
    });
    eventManager.emitGameEvent(
      "command:response",
      {
        command: cmd,
        userId: payload.userId,
        username: payload.username,
        nickname: displayName,
        responseText
      },
      simulated
    );
    return { handled: true, type: "command", command: cmd, responseText };
  }
};
var chatHandler = new ChatHandler();

// integrations/giftHandler.ts
import fs5 from "fs";
import path5 from "path";
var GiftHandler = class {
  constructor() {
    this.processedStreaks = /* @__PURE__ */ new Map();
    this.giftHistory = [];
    this.configPath = path5.resolve(process.cwd(), "config/gifts.json");
    this.loadConfig();
  }
  loadConfig() {
    try {
      this.config = JSON.parse(fs5.readFileSync(this.configPath, "utf-8"));
    } catch (err) {
      console.error("Error loading gifts.json:", err);
      this.config = { giftsEnabled: true, tiers: [] };
    }
    return this.config;
  }
  saveConfig(partial) {
    this.config = {
      ...this.config,
      ...partial,
      tiers: partial.tiers || this.config.tiers
    };
    fs5.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    eventManager.emitGameEvent("config:updated", { giftsConfig: this.config });
    return this.config;
  }
  getConfig() {
    return this.config;
  }
  getGiftHistory(limit = 30) {
    return this.giftHistory.slice(0, limit);
  }
  clearGiftHistory() {
    this.giftHistory = [];
    this.processedStreaks.clear();
  }
  processGiftEvent(rawGift, simulated = false) {
    const settings = gameEngine.getSettingsConfig();
    if (!this.config.giftsEnabled || !settings.tiktok.enableGiftEvents) {
      return null;
    }
    const repeatCount = Math.max(1, rawGift.repeatCount || 1);
    const giftType = rawGift.giftType ?? 0;
    const repeatEnd = rawGift.repeatEnd ?? true;
    if (giftType === 1 && !repeatEnd) {
      return null;
    }
    const dedupeKey = `${rawGift.userId}:${rawGift.giftId || rawGift.giftName}:${rawGift.groupId || ""}:${repeatCount}`;
    const lastProcessedAt = this.processedStreaks.get(dedupeKey) || 0;
    if (!simulated && Date.now() - lastProcessedAt < 3500) {
      return null;
    }
    this.processedStreaks.set(dedupeKey, Date.now());
    const matchedConfig = this.findMatchingGiftConfig(rawGift.giftId, rawGift.giftName, rawGift.diamondCount);
    const totalPoints = matchedConfig.pointsAwarded * repeatCount;
    const totalTimeAdded = matchedConfig.timeAddedSeconds * repeatCount;
    let hintRevealed = null;
    if (totalPoints > 0) {
      gameEngine.addCommunityBonusPoints(totalPoints);
    }
    if (totalTimeAdded > 0) {
      gameEngine.addRoundTime(totalTimeAdded);
    }
    if (matchedConfig.effect === "reveal_hint" || matchedConfig.effect === "frenzy_bonus_round") {
      const hintRes = gameEngine.revealHint(rawGift.nickname || rawGift.username, simulated);
      hintRevealed = hintRes.hint;
    }
    if ((matchedConfig.effect === "score_multiplier" || matchedConfig.effect === "frenzy_bonus_round") && matchedConfig.multiplier > 1) {
      gameEngine.activateScoreMultiplier(matchedConfig.multiplier, matchedConfig.durationSeconds || 30);
    }
    const displayUser = rawGift.nickname || rawGift.username || "Viewer";
    const displayGiftName = repeatCount > 1 ? `${matchedConfig.name} x${repeatCount}` : matchedConfig.name;
    const formattedMessage = matchedConfig.messageTemplate.replace("{user}", displayUser).replace("{gift}", displayGiftName);
    leaderboardManager.recordGiftContribution({
      userId: rawGift.userId,
      username: rawGift.username,
      nickname: rawGift.nickname,
      avatarUrl: rawGift.avatarUrl,
      giftName: matchedConfig.name,
      repeatCount,
      diamondValue: matchedConfig.diamondValue,
      pointsAwarded: totalPoints
    });
    const record = {
      id: `gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: rawGift.userId,
      username: rawGift.username,
      nickname: displayUser,
      avatarUrl: rawGift.avatarUrl,
      giftId: matchedConfig.giftId,
      giftName: matchedConfig.name,
      tier: matchedConfig.tier,
      repeatCount,
      diamondValue: matchedConfig.diamondValue,
      totalDiamonds: matchedConfig.diamondValue * repeatCount,
      effect: matchedConfig.effect,
      pointsAwarded: totalPoints,
      timeAddedSeconds: totalTimeAdded,
      multiplierActivated: matchedConfig.multiplier,
      hintRevealed,
      message: formattedMessage,
      animation: matchedConfig.animation,
      soundEffect: matchedConfig.soundEffect,
      simulated,
      timestamp: Date.now()
    };
    this.giftHistory.unshift(record);
    if (this.giftHistory.length > 50) {
      this.giftHistory.length = 50;
    }
    eventManager.emitGameEvent("gift:received", record, simulated);
    eventManager.emitGameEvent("leaderboard:updated", leaderboardManager.getAllLeaderboards(), simulated);
    return record;
  }
  findMatchingGiftConfig(giftId, giftName, diamondCount) {
    if (giftId) {
      const byId = this.config.tiers.find((t) => t.giftId === giftId);
      if (byId) return byId;
    }
    if (giftName) {
      const lower = giftName.toLowerCase();
      const byName = this.config.tiers.find(
        (t) => t.name.toLowerCase() === lower || t.id.toLowerCase() === lower
      );
      if (byName) return byName;
    }
    const diamonds = Math.max(1, diamondCount || 1);
    if (diamonds >= 100) {
      return {
        id: "custom_large",
        giftId: giftId || 9999,
        name: giftName || "Mega Gift",
        tier: "large",
        diamondValue: diamonds,
        effect: "frenzy_bonus_round",
        pointsAwarded: Math.min(300, diamonds * 2),
        timeAddedSeconds: 20,
        multiplier: 3,
        durationSeconds: 30,
        animation: "cosmic_celebration",
        soundEffect: "gift_large",
        messageTemplate: "{user} sent {gift}! 3X Score Multiplier & +20s Time!"
      };
    } else if (diamonds >= 10) {
      return {
        id: "custom_medium",
        giftId: giftId || 9998,
        name: giftName || "Super Gift",
        tier: "medium",
        diamondValue: diamonds,
        effect: "reveal_hint",
        pointsAwarded: Math.min(100, diamonds * 3),
        timeAddedSeconds: 8,
        multiplier: 2,
        durationSeconds: 20,
        animation: "hint_beam",
        soundEffect: "gift_medium",
        messageTemplate: "{user} sent {gift}! Hint Revealed & Bonus Points!"
      };
    }
    return {
      id: "custom_small",
      giftId: giftId || 9997,
      name: giftName || "Stream Gift",
      tier: "small",
      diamondValue: diamonds,
      effect: "add_time_and_points",
      pointsAwarded: 10,
      timeAddedSeconds: 4,
      multiplier: 1,
      durationSeconds: 0,
      animation: "sparkle_burst",
      soundEffect: "gift_small",
      messageTemplate: "{user} sent {gift}! +10 Community Pts & +4s!"
    };
  }
};
var giftHandler = new GiftHandler();

// integrations/liveEvents.ts
var LiveEventsHandler = class {
  constructor() {
    this.processedFollowUsers = /* @__PURE__ */ new Set();
    this.processedShareCooldown = /* @__PURE__ */ new Map();
  }
  handleLikeEvent(payload, simulated = false) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableLikeEvents) return null;
    const count = Math.max(1, Math.min(500, payload.likeCount || 1));
    gameEngine.addLikes(
      count,
      {
        userId: payload.userId,
        username: payload.username,
        nickname: payload.nickname || payload.username,
        avatarUrl: payload.avatarUrl
      },
      simulated
    );
    return { count };
  }
  handleFollowEvent(payload, simulated = false) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableFollowEvents) return null;
    if (!simulated && this.processedFollowUsers.has(payload.userId)) {
      return null;
    }
    this.processedFollowUsers.add(payload.userId);
    const socialConfig = scoringEngine.getConfig().socialRewards;
    const bonusPoints = socialConfig.followPoints ?? 10;
    const displayName = payload.nickname || payload.username || "New Follower";
    if (socialConfig.autoRegisterFollower) {
      leaderboardManager.registerPlayer(payload.userId, payload.username, displayName, payload.avatarUrl);
    }
    leaderboardManager.recordSocialContribution({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      type: "follow",
      pointsAwarded: bonusPoints
    });
    if (bonusPoints > 0) {
      gameEngine.addCommunityBonusPoints(bonusPoints);
    }
    const eventPayload = {
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      bonusPoints,
      timestamp: Date.now()
    };
    eventManager.emitGameEvent("follow:received", eventPayload, simulated);
    eventManager.emitGameEvent("leaderboard:updated", leaderboardManager.getAllLeaderboards(), simulated);
    return eventPayload;
  }
  handleShareEvent(payload, simulated = false) {
    const settings = gameEngine.getSettingsConfig();
    if (!settings.tiktok.enableShareEvents) return null;
    const now = Date.now();
    const lastShare = this.processedShareCooldown.get(payload.userId) || 0;
    if (!simulated && now - lastShare < 15e3) {
      return null;
    }
    this.processedShareCooldown.set(payload.userId, now);
    const socialConfig = scoringEngine.getConfig().socialRewards;
    const bonusPoints = socialConfig.sharePoints ?? 15;
    const displayName = payload.nickname || payload.username || "Viewer";
    leaderboardManager.recordSocialContribution({
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      type: "share",
      pointsAwarded: bonusPoints
    });
    if (bonusPoints > 0) {
      gameEngine.addCommunityBonusPoints(bonusPoints);
    }
    const eventPayload = {
      userId: payload.userId,
      username: payload.username,
      nickname: displayName,
      avatarUrl: payload.avatarUrl,
      bonusPoints,
      timestamp: now
    };
    eventManager.emitGameEvent("share:received", eventPayload, simulated);
    eventManager.emitGameEvent("leaderboard:updated", leaderboardManager.getAllLeaderboards(), simulated);
    return eventPayload;
  }
};
var liveEventsHandler = new LiveEventsHandler();

// integrations/tiktok.ts
var TikTokIntegrationService = class {
  constructor() {
    this.connection = null;
    this.status = "DISCONNECTED";
    this.username = "";
    this.roomId = null;
    this.viewerCount = 0;
    this.lastError = null;
    this.logs = [];
    this.reconnectTimer = null;
    this.manualDisconnect = false;
    const savedUsername = gameEngine.getSettingsConfig().tiktok.username;
    if (savedUsername) {
      this.username = savedUsername;
    }
  }
  addLog(level, message) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      level,
      message,
      timestamp: Date.now()
    };
    this.logs.unshift(entry);
    if (this.logs.length > 80) {
      this.logs.length = 80;
    }
  }
  getState() {
    return {
      status: this.status,
      username: this.username,
      roomId: this.roomId,
      viewerCount: this.viewerCount,
      lastError: this.lastError,
      logs: this.logs.slice(0, 40)
    };
  }
  async connect(rawUsername) {
    this.clearReconnectTimer();
    this.manualDisconnect = false;
    const cleanUsername = String(rawUsername ?? this.username ?? "").trim().replace(/^@/, "");
    if (!cleanUsername) {
      this.status = "ERROR";
      this.lastError = "Please enter a valid TikTok LIVE username.";
      this.addLog("error", this.lastError);
      return { success: false, status: this.status, error: this.lastError };
    }
    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch {
      }
      this.connection = null;
    }
    this.username = cleanUsername;
    gameEngine.updateSettingsConfig({
      tiktok: {
        ...gameEngine.getSettingsConfig().tiktok,
        username: cleanUsername
      }
    });
    this.status = "CONNECTING";
    this.lastError = null;
    this.addLog("info", `Connecting to TikTok LIVE stream for @${cleanUsername}...`);
    try {
      const conn = new TikTokLiveConnection(cleanUsername, {
        processInitialData: true,
        fetchRoomInfoOnConnect: true,
        enableExtendedGiftInfo: false
      });
      this.connection = conn;
      this.bindEvents(conn);
      const state = await conn.connect();
      this.status = "CONNECTED";
      this.roomId = state.roomId || conn.roomId || null;
      this.lastError = null;
      this.addLog("info", `Connected to @${cleanUsername} LIVE (Room ID: ${this.roomId})`);
      eventManager.emitGameEvent("tiktok:connected", this.getState());
      return { success: true, status: this.status, roomId: this.roomId };
    } catch (err) {
      const errMsg = err?.message || "Could not connect to TikTok LIVE. Verify the streamer is currently LIVE and username is correct.";
      this.status = "ERROR";
      this.roomId = null;
      this.lastError = errMsg;
      this.addLog("error", `Connection failed for @${cleanUsername}: ${errMsg}`);
      eventManager.emitGameEvent("tiktok:error", {
        username: this.username,
        error: errMsg,
        state: this.getState()
      });
      return { success: false, status: this.status, error: errMsg };
    }
  }
  async disconnect() {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch {
      }
      this.connection = null;
    }
    this.status = "DISCONNECTED";
    this.roomId = null;
    this.viewerCount = 0;
    this.addLog("info", `Disconnected from @${this.username || "TikTok LIVE"}.`);
    eventManager.emitGameEvent("tiktok:disconnected", this.getState());
  }
  async reconnect() {
    this.addLog("info", `Manual reconnect requested for @${this.username}...`);
    await this.disconnect();
    return this.connect(this.username);
  }
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  scheduleAutoReconnect() {
    const tiktokConfig = gameEngine.getSettingsConfig().tiktok;
    if (this.manualDisconnect || !tiktokConfig.autoReconnect || !this.username) {
      return;
    }
    this.clearReconnectTimer();
    const delay = Math.max(3e3, tiktokConfig.reconnectIntervalMs || 5e3);
    this.addLog("warn", `Scheduling automatic reconnection in ${Math.round(delay / 1e3)}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.username).catch(() => {
      });
    }, delay);
  }
  extractUser(data) {
    const userObj = data?.user || data || {};
    const userId = String(userObj.userId || userObj.uniqueId || data?.userId || `viewer-${Date.now()}`);
    const username = String(userObj.uniqueId || data?.uniqueId || userId);
    const nickname = String(userObj.nickname || data?.nickname || username);
    const avatarUrl = userObj.profilePictureUrl || userObj.profilePicture?.urls?.[0] || data?.profilePictureUrl || void 0;
    return { userId, username, nickname, avatarUrl };
  }
  bindEvents(conn) {
    conn.on(ControlEvent.DISCONNECTED, (info) => {
      this.status = "DISCONNECTED";
      this.addLog("warn", `TikTok WebSocket disconnected (${info?.reason || "stream closed"}).`);
      eventManager.emitGameEvent("tiktok:disconnected", this.getState());
      this.scheduleAutoReconnect();
    });
    conn.on(ControlEvent.ERROR, (err) => {
      const msg = err?.message || String(err);
      this.lastError = msg;
      this.addLog("error", `TikTok stream error: ${msg}`);
      eventManager.emitGameEvent("tiktok:error", {
        username: this.username,
        error: msg,
        state: this.getState()
      });
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      this.manualDisconnect = true;
      this.status = "DISCONNECTED";
      this.addLog("info", `TikTok LIVE broadcast ended by host @${this.username}.`);
      eventManager.emitGameEvent("tiktok:disconnected", this.getState());
    });
    conn.on(WebcastEvent.ROOM_USER, (data) => {
      if (typeof data?.viewerCount === "number") {
        this.viewerCount = data.viewerCount;
      }
    });
    conn.on(WebcastEvent.CHAT, (data) => {
      const user = this.extractUser(data);
      const comment = String(data?.comment || "");
      chatHandler.handleIncomingChat({
        ...user,
        comment,
        simulated: false
      });
    });
    conn.on(WebcastEvent.GIFT, (data) => {
      const user = this.extractUser(data);
      const giftDetails = data?.giftDetails || data?.extendedGiftInfo || {};
      giftHandler.processGiftEvent(
        {
          ...user,
          giftId: Number(data?.giftId || giftDetails.id || 0),
          giftName: String(data?.giftName || giftDetails.giftName || giftDetails.name || "Gift"),
          diamondCount: Number(data?.diamondCount || giftDetails.diamondCount || 1),
          repeatCount: Number(data?.repeatCount || 1),
          repeatEnd: Boolean(data?.repeatEnd ?? true),
          giftType: Number(data?.giftType ?? giftDetails.giftType ?? 0),
          groupId: String(data?.groupId || "")
        },
        false
      );
    });
    conn.on(WebcastEvent.LIKE, (data) => {
      const user = this.extractUser(data);
      liveEventsHandler.handleLikeEvent(
        {
          ...user,
          likeCount: Number(data?.likeCount || 1),
          totalLikeCount: Number(data?.totalLikeCount || 0)
        },
        false
      );
    });
    conn.on(WebcastEvent.FOLLOW, (data) => {
      const user = this.extractUser(data);
      liveEventsHandler.handleFollowEvent(user, false);
    });
    conn.on(WebcastEvent.SHARE, (data) => {
      const user = this.extractUser(data);
      liveEventsHandler.handleShareEvent(user, false);
    });
  }
  /**
   * Clearly labeled Simulation Mode for administrators and testing without a live stream.
   */
  simulateEvent(params) {
    const simUser = {
      userId: `sim_${(params.username || "StreamFan99").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      username: params.username || "streamfan99",
      nickname: params.username || "StreamFan99"
    };
    this.addLog("info", `[SIMULATION] Triggered simulated event: ${params.type} by ${simUser.nickname}`);
    switch (params.type) {
      case "chat_valid": {
        const state = gameEngine.getFullState();
        const discoveredSet = new Set(state.discoveredWords.map((d) => d.word.toLowerCase()));
        const possible = gameEngine["currentBoard"].possibleWords.filter((w) => !discoveredSet.has(w));
        const chosenWord = possible.length > 0 ? possible[Math.floor(Math.random() * possible.length)] : "STREAM";
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: chosenWord.toUpperCase(),
          simulated: true
        });
      }
      case "chat_invalid": {
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: params.text || "ZZZZZZ",
          simulated: true
        });
      }
      case "chat_duplicate": {
        const state = gameEngine.getFullState();
        const existingWord = state.discoveredWords[0]?.word || "APPLE";
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: existingWord,
          simulated: true
        });
      }
      case "chat_custom":
      case "command": {
        return chatHandler.handleIncomingChat({
          ...simUser,
          comment: params.text || "!score",
          simulated: true
        });
      }
      case "gift_small": {
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5655,
            giftName: "Rose",
            diamondCount: 1,
            repeatCount: params.repeatCount || 1,
            repeatEnd: true,
            giftType: 1
          },
          true
        );
      }
      case "gift_medium": {
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5879,
            giftName: "Doughnut",
            diamondCount: 30,
            repeatCount: params.repeatCount || 1,
            repeatEnd: true,
            giftType: 0
          },
          true
        );
      }
      case "gift_large": {
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5999,
            giftName: "Galaxy",
            diamondCount: 1e3,
            repeatCount: 1,
            repeatEnd: true,
            giftType: 0
          },
          true
        );
      }
      case "gift_streak": {
        giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5487,
            giftName: "Finger Heart",
            diamondCount: 5,
            repeatCount: 2,
            repeatEnd: false,
            giftType: 1,
            groupId: "sim-streak-1"
          },
          true
        );
        return giftHandler.processGiftEvent(
          {
            ...simUser,
            giftId: 5487,
            giftName: "Finger Heart",
            diamondCount: 5,
            repeatCount: params.repeatCount || 5,
            repeatEnd: true,
            giftType: 1,
            groupId: "sim-streak-1"
          },
          true
        );
      }
      case "like": {
        return liveEventsHandler.handleLikeEvent(
          {
            ...simUser,
            likeCount: params.likeCount || 50
          },
          true
        );
      }
      case "follow": {
        return liveEventsHandler.handleFollowEvent(simUser, true);
      }
      case "share": {
        return liveEventsHandler.handleShareEvent(simUser, true);
      }
      case "connection_error": {
        const errText = "[SIMULATED] TikTok WebSocket connection interrupted (Peer reset).";
        this.lastError = errText;
        this.addLog("error", errText);
        eventManager.emitGameEvent(
          "tiktok:error",
          {
            username: this.username || "simulated_host",
            error: errText,
            state: this.getState()
          },
          true
        );
        return { simulatedError: errText };
      }
    }
  }
};
var tiktokService = new TikTokIntegrationService();

// server/websocket.ts
var GameWebSocketServer = class {
  constructor(httpServer) {
    this.clients = /* @__PURE__ */ new Set();
    this.wss = new WebSocketServer({ noServer: true });
    this.viteFallbackWss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => {
        if (protocols.has("vite-hmr")) return "vite-hmr";
        return false;
      }
    });
    this.setup();
    httpServer.on("upgrade", (request, socket, head) => {
      try {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname === "/ws") {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit("connection", ws, request);
          });
          return;
        }
        this.viteFallbackWss.handleUpgrade(request, socket, head, (ws) => {
          ws.send(JSON.stringify({ type: "connected" }));
          ws.on("error", () => {
          });
        });
      } catch {
      }
    });
  }
  setup() {
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      this.sendFullState(ws);
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleClientMessage(ws, msg);
        } catch (err) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Malformed WebSocket JSON payload."
            })
          );
        }
      });
      ws.on("close", () => {
        this.clients.delete(ws);
      });
      ws.on("error", () => {
        this.clients.delete(ws);
      });
    });
    eventManager.on("broadcast", (event) => {
      this.broadcast(event);
    });
  }
  sendFullState(ws) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        seqId: eventManager.getSeqId(),
        type: "state:sync",
        timestamp: Date.now(),
        payload: {
          ...gameEngine.getFullState(),
          tiktok: tiktokService.getState(),
          giftsConfig: giftHandler.getConfig(),
          giftHistory: giftHandler.getGiftHistory(25),
          connectedDisplays: this.clients.size
        }
      })
    );
  }
  handleClientMessage(ws, msg) {
    if (!msg || typeof msg.action !== "string") return;
    switch (msg.action) {
      case "sync": {
        this.sendFullState(ws);
        break;
      }
      case "submit_word": {
        const word = String(msg.word || "").trim();
        const username = String(msg.username || "SoloPlayer").trim();
        const userId = String(msg.userId || `web_${username.toLowerCase()}`);
        const res = gameEngine.submitWord({
          userId,
          username,
          nickname: username,
          word,
          source: "web"
        });
        ws.send(
          JSON.stringify({
            type: "submission:Ack",
            payload: res
          })
        );
        break;
      }
      case "shuffle_board": {
        gameEngine.shuffleCurrentBoard();
        break;
      }
      case "reveal_hint": {
        gameEngine.revealHint("Player", false);
        break;
      }
      default:
        break;
    }
  }
  broadcast(event) {
    const serialized = JSON.stringify({
      ...event,
      connectedDisplays: this.clients.size
    });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }
  getConnectedClientsCount() {
    return this.clients.size;
  }
};

// tests/gameSuite.ts
async function runAutomatedTestSuite() {
  const results = [];
  const runTest = async (id, category, name, fn) => {
    const start = performance.now();
    try {
      await fn();
      results.push({
        id,
        category,
        name,
        passed: true,
        details: "Verified all assertions passed.",
        durationMs: Math.round((performance.now() - start) * 100) / 100
      });
    } catch (err) {
      results.push({
        id,
        category,
        name,
        passed: false,
        details: err?.message || String(err),
        durationMs: Math.round((performance.now() - start) * 100) / 100
      });
    }
  };
  const validator = new WordValidator();
  const generator = new LetterGenerator(validator);
  await runTest("test-1", "Letter Generation", "Generates valid board of exact configured size with solvable words", () => {
    const board = generator.generateBoard({
      boardSize: 7,
      minWordLength: 3,
      maxWordLength: 7,
      mandatoryCenterLetter: true
    });
    if (board.letters.length !== 7) {
      throw new Error(`Expected 7 letters, got ${board.letters.length}`);
    }
    if (!board.centerLetter || board.centerIndex === null) {
      throw new Error("Mandatory center letter was not assigned");
    }
    if (board.possibleWords.length < 5) {
      throw new Error(`Expected >= 5 solvable words, got ${board.possibleWords.length}`);
    }
  });
  await runTest("test-2", "Word Validation", "Enforces dictionary presence and prevents overusing duplicate letters", () => {
    const boardLetters = ["S", "T", "R", "E", "A", "M", "S"];
    const discovered = /* @__PURE__ */ new Set();
    const validRes = validator.validateSubmission({
      word: "stream",
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7
    });
    if (!validRes.valid) {
      throw new Error(`Expected STREAM to be valid, got ${validRes.reason}`);
    }
    const overuseRes = validator.validateSubmission({
      word: "start",
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7
    });
    if (overuseRes.valid || overuseRes.reason !== "LETTERS_NOT_ON_BOARD") {
      throw new Error("Failed to reject letter used more times than it appears on board");
    }
  });
  await runTest("test-3", "Duplicate Prevention", "Rejects words already discovered in the current round", () => {
    const boardLetters = ["P", "L", "A", "N", "E", "T", "S"];
    const discovered = /* @__PURE__ */ new Set(["planet"]);
    const dupRes = validator.validateSubmission({
      word: "PLANET",
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7
    });
    if (dupRes.valid || dupRes.reason !== "ALREADY_DISCOVERED") {
      throw new Error(`Expected ALREADY_DISCOVERED, got ${dupRes.reason}`);
    }
  });
  await runTest("test-4", "Scoring System", "Calculates length points, pangram bonuses, combos, and multipliers server-side", () => {
    const scorer = new ScoringEngine();
    scorer.resetRoundState();
    const score3 = scorer.calculateWordScore({
      word: "cat",
      userId: "u1",
      boardSize: 7,
      rareBonusWord: null,
      currentCommunityScore: 0,
      isFirstTimeEverFound: false
    });
    if (score3.basePoints !== 3) {
      throw new Error(`Expected 3 pts for 3-letter word, got ${score3.basePoints}`);
    }
    const score7Pangram = scorer.calculateWordScore({
      word: "streams",
      userId: "u1",
      boardSize: 7,
      rareBonusWord: "STREAMS",
      currentCommunityScore: 3,
      isFirstTimeEverFound: true
    });
    if (!score7Pangram.isPangram || score7Pangram.pangramBonus <= 0 || score7Pangram.comboCount !== 2) {
      throw new Error("Failed to award pangram and consecutive combo bonuses");
    }
  });
  await runTest("test-5", "Round Progression", "Transitions cleanly between COUNTDOWN, ACTIVE, PAUSED, and ROUND_END states", () => {
    const localEv = new EventManager();
    const rm = new RoundManager(localEv);
    rm.startCountdownAndRound({ roundDuration: 60, prepDuration: 0, intermissionDuration: 5, autoNextRound: false }, false);
    if (rm.getStatus() !== "ACTIVE") {
      throw new Error(`Expected ACTIVE status, got ${rm.getStatus()}`);
    }
    rm.pauseRound();
    if (rm.getStatus() !== "PAUSED") {
      throw new Error(`Expected PAUSED status, got ${rm.getStatus()}`);
    }
    rm.resumeRound();
    if (rm.getStatus() !== "ACTIVE") {
      throw new Error(`Expected ACTIVE status after resume, got ${rm.getStatus()}`);
    }
    rm.endRound("TEST_END", { roundDuration: 60, prepDuration: 0, intermissionDuration: 5, autoNextRound: false });
    if (rm.getStatus() !== "ROUND_END") {
      throw new Error(`Expected ROUND_END status, got ${rm.getStatus()}`);
    }
    rm.clearTimers();
  });
  await runTest("test-6", "Timer Behaviour", "Supports adding bonus time and preserves remaining time while paused", () => {
    const localEv = new EventManager();
    const rm = new RoundManager(localEv);
    rm.startCountdownAndRound({ roundDuration: 90, prepDuration: 0, intermissionDuration: 5, autoNextRound: false }, false);
    const before = rm.getRemainingSeconds();
    const after = rm.addTime(15);
    if (after !== before + 15) {
      throw new Error(`Expected ${before + 15}s after +15s bonus, got ${after}s`);
    }
    rm.clearTimers();
  });
  await runTest("test-7", "Gift Processing", "Ignores intermediate streak updates and processes completed gift streaks once", () => {
    const gh = new GiftHandler();
    const intermediate = gh.processGiftEvent(
      {
        userId: "test_gifter",
        username: "test_gifter",
        giftId: 5655,
        giftName: "Rose",
        diamondCount: 1,
        repeatCount: 1,
        repeatEnd: false,
        giftType: 1,
        groupId: "streak_test_99"
      },
      true
    );
    if (intermediate !== null) {
      throw new Error("Intermediate gift streak (repeatEnd=false) should not be processed as completed gift");
    }
    const completed = gh.processGiftEvent(
      {
        userId: "test_gifter",
        username: "test_gifter",
        giftId: 5655,
        giftName: "Rose",
        diamondCount: 1,
        repeatCount: 3,
        repeatEnd: true,
        giftType: 1,
        groupId: "streak_test_99"
      },
      true
    );
    if (!completed || completed.repeatCount !== 3) {
      throw new Error("Completed gift streak (repeatEnd=true) failed to process repeatCount=3");
    }
  });
  await runTest("test-8", "WebSocket Synchronisation", "Assigns monotonically increasing seqId to all real-time events", () => {
    const ev = new EventManager();
    const e1 = ev.emitGameEvent("game:started", { roundNumber: 1 });
    const e2 = ev.emitGameEvent("word:accepted", { word: "STREAM" });
    if (e2.seqId !== e1.seqId + 1) {
      throw new Error(`Expected sequential seqId ${e1.seqId + 1}, got ${e2.seqId}`);
    }
  });
  await runTest("test-9", "Leaderboard Calculations", "Sorts round contributors accurately by points and words discovered", () => {
    const lb = new LeaderboardManager();
    lb.recordValidWord({ userId: "test_a", username: "alice_test", word: "star", points: 5 });
    lb.recordValidWord({ userId: "test_b", username: "bob_test", word: "streams", points: 35 });
    const roundTop = lb.getRoundLeaderboard(10);
    const bobIdx = roundTop.findIndex((p) => p.userId === "test_b");
    const aliceIdx = roundTop.findIndex((p) => p.userId === "test_a");
    if (bobIdx === -1 || aliceIdx === -1 || bobIdx > aliceIdx) {
      throw new Error("Leaderboard failed to rank higher-scoring player first");
    }
    lb.removeUserFromLeaderboards("test_a");
    lb.removeUserFromLeaderboards("test_b");
  });
  await runTest("test-10", "Progressive Round Mechanics", "Spawns Hidden Mystery, Decoy Trap, Locked, and Bonus tiles as rounds progress", () => {
    const round4Board = generator.generateBoard({
      boardSize: 7,
      minWordLength: 3,
      maxWordLength: 7,
      mandatoryCenterLetter: false,
      difficulty: "hard",
      roundNumber: 4,
      progressiveElementsEnabled: true
    });
    if (round4Board.modifiers.hiddenIndices.length === 0) {
      throw new Error("Expected Round 4 board to include a Hidden Mystery tile");
    }
    if (round4Board.modifiers.decoyIndices.length === 0) {
      throw new Error("Expected Round 4 board to include a Decoy Trap tile");
    }
    if (Object.keys(round4Board.modifiers.lockedTiles).length === 0) {
      throw new Error("Expected Round 4 board to include a Locked tile");
    }
  });
  await runTest("test-11", "Hazard Tile Validation", "Rejects words using Locked or Decoy letters and tracks Mystery tile deductions", () => {
    const boardLetters = ["S", "T", "R", "E", "A", "M", "Z"];
    const discovered = /* @__PURE__ */ new Set();
    const lockedAttempt = validator.validateSubmission({
      word: "stream",
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7,
      activeLockedIndices: [5],
      decoyIndices: [6],
      hiddenIndices: [0]
    });
    if (lockedAttempt.valid || lockedAttempt.reason !== "USED_LOCKED_LETTER") {
      throw new Error(`Expected USED_LOCKED_LETTER, got ${lockedAttempt.reason}`);
    }
    const mysteryDeduction = validator.validateSubmission({
      word: "star",
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7,
      activeLockedIndices: [5],
      decoyIndices: [6],
      hiddenIndices: [0]
    });
    if (!mysteryDeduction.valid || !(mysteryDeduction.usedHiddenIndices || []).includes(0)) {
      throw new Error("Expected valid word STAR to record deduction of hidden tile index 0");
    }
  });
  const passedCount = results.filter((r) => r.passed).length;
  return {
    passedCount,
    failedCount: results.length - passedCount,
    totalCount: results.length,
    results
  };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  runAutomatedTestSuite().then((summary) => {
    console.log(`
=== LexiStream LIVE Automated Test Suite ===`);
    for (const r of summary.results) {
      console.log(`${r.passed ? "PASS" : "FAIL"} [${r.category}] ${r.name} (${r.durationMs}ms)`);
      if (!r.passed) console.error(`   -> ${r.details}`);
    }
    console.log(`
Summary: ${summary.passedCount}/${summary.totalCount} tests passed.
`);
    process.exit(summary.failedCount > 0 ? 1 : 0);
  });
}

// server.ts
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3e3;
  app.use(express.json({ limit: "1mb" }));
  const wsServer = new GameWebSocketServer(server);
  app.get("/api/state", (_req, res) => {
    res.json({
      ...gameEngine.getFullState(),
      tiktok: tiktokService.getState(),
      giftsConfig: giftHandler.getConfig(),
      giftHistory: giftHandler.getGiftHistory(30),
      recentEvents: eventManager.getRecentEvents(40),
      connectedDisplays: wsServer.getConnectedClientsCount(),
      systemHealth: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        wsClients: wsServer.getConnectedClientsCount()
      }
    });
  });
  app.post("/api/game/control", (req, res) => {
    const { action } = req.body || {};
    switch (action) {
      case "start_game":
      case "start_round":
        gameEngine.startRound(false);
        break;
      case "pause":
        gameEngine.pauseRound();
        break;
      case "resume":
        gameEngine.resumeRound();
        break;
      case "end_round":
        gameEngine.endCurrentRound("HOST_ENDED");
        break;
      case "next_round":
      case "skip_round":
        gameEngine.nextRound();
        break;
      case "restart_round":
        gameEngine.restartRound();
        break;
      case "shuffle_board":
        gameEngine.shuffleCurrentBoard();
        break;
      case "reveal_hint":
        gameEngine.revealHint("Host", false);
        break;
      case "reset_scores":
        gameEngine.resetGame(true);
        break;
      case "reset_game":
        gameEngine.resetGame(false);
        break;
      case "add_hidden":
      case "add_decoy":
      case "add_locked":
      case "add_bonus":
      case "unlock_and_reveal_all":
        gameEngine.triggerModifierAction(action);
        break;
      default:
        return res.status(400).json({ error: `Unknown control action: ${action}` });
    }
    return res.json({
      success: true,
      action,
      state: gameEngine.getFullState()
    });
  });
  app.post("/api/game/submit", (req, res) => {
    const { word, username, userId } = req.body || {};
    const cleanUser = String(username || "SoloPlayer").trim();
    const result = gameEngine.submitWord({
      userId: String(userId || `web_${cleanUser.toLowerCase()}`),
      username: cleanUser,
      nickname: cleanUser,
      word: String(word || ""),
      source: "web"
    });
    res.json(result);
  });
  app.post("/api/config/game", (req, res) => {
    const updated = gameEngine.updateGameConfig(req.body || {});
    res.json({ success: true, gameConfig: updated, state: gameEngine.getFullState() });
  });
  app.post("/api/config/scoring", (req, res) => {
    const updated = scoringEngine.saveConfig(req.body || {});
    eventManager.emitGameEvent("config:updated", { scoringConfig: updated });
    res.json({ success: true, scoringConfig: updated });
  });
  app.post("/api/config/gifts", (req, res) => {
    const updated = giftHandler.saveConfig(req.body || {});
    res.json({ success: true, giftsConfig: updated });
  });
  app.post("/api/config/settings", (req, res) => {
    const updated = gameEngine.updateSettingsConfig(req.body || {});
    res.json({ success: true, settingsConfig: updated });
  });
  app.post("/api/moderation/action", (req, res) => {
    const { action, target } = req.body || {};
    const currentSettings = gameEngine.getSettingsConfig();
    const cleanTarget = String(target || "").trim();
    switch (action) {
      case "block_user": {
        if (cleanTarget && !currentSettings.moderation.blockedUsers.includes(cleanTarget)) {
          gameEngine.updateSettingsConfig({
            moderation: {
              ...currentSettings.moderation,
              blockedUsers: [...currentSettings.moderation.blockedUsers, cleanTarget]
            }
          });
        }
        break;
      }
      case "unblock_user": {
        gameEngine.updateSettingsConfig({
          moderation: {
            ...currentSettings.moderation,
            blockedUsers: currentSettings.moderation.blockedUsers.filter(
              (u) => u.toLowerCase() !== cleanTarget.toLowerCase()
            )
          }
        });
        break;
      }
      case "remove_from_leaderboard": {
        leaderboardManager.removeUserFromLeaderboards(cleanTarget);
        eventManager.emitGameEvent("leaderboard:updated", leaderboardManager.getAllLeaderboards());
        break;
      }
      case "clear_activity": {
        gameEngine.clearActivityLogs();
        giftHandler.clearGiftHistory();
        break;
      }
      case "add_custom_word": {
        const w = cleanTarget.toLowerCase().replace(/[^a-z]/g, "");
        if (w.length >= 3 && !currentSettings.moderation.customWords.includes(w)) {
          gameEngine.updateSettingsConfig({
            moderation: {
              ...currentSettings.moderation,
              customWords: [...currentSettings.moderation.customWords, w]
            }
          });
        }
        break;
      }
      case "remove_custom_word": {
        gameEngine.updateSettingsConfig({
          moderation: {
            ...currentSettings.moderation,
            customWords: currentSettings.moderation.customWords.filter((w) => w !== cleanTarget.toLowerCase())
          }
        });
        break;
      }
      case "add_excluded_word": {
        const w = cleanTarget.toLowerCase().replace(/[^a-z]/g, "");
        if (w && !currentSettings.moderation.excludedWords.includes(w)) {
          gameEngine.updateSettingsConfig({
            moderation: {
              ...currentSettings.moderation,
              excludedWords: [...currentSettings.moderation.excludedWords, w]
            }
          });
        }
        break;
      }
      case "remove_excluded_word": {
        gameEngine.updateSettingsConfig({
          moderation: {
            ...currentSettings.moderation,
            excludedWords: currentSettings.moderation.excludedWords.filter((w) => w !== cleanTarget.toLowerCase())
          }
        });
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown moderation action: ${action}` });
    }
    return res.json({
      success: true,
      settingsConfig: gameEngine.getSettingsConfig(),
      leaderboards: leaderboardManager.getAllLeaderboards()
    });
  });
  app.post("/api/tiktok/connect", async (req, res) => {
    const { username } = req.body || {};
    const result = await tiktokService.connect(username);
    res.json({
      ...result,
      tiktok: tiktokService.getState()
    });
  });
  app.post("/api/tiktok/disconnect", async (_req, res) => {
    await tiktokService.disconnect();
    res.json({
      success: true,
      tiktok: tiktokService.getState()
    });
  });
  app.post("/api/tiktok/reconnect", async (_req, res) => {
    const result = await tiktokService.reconnect();
    res.json({
      ...result,
      tiktok: tiktokService.getState()
    });
  });
  app.post("/api/simulate", (req, res) => {
    const result = tiktokService.simulateEvent(req.body || {});
    res.json({
      success: true,
      simulated: true,
      result,
      state: gameEngine.getFullState(),
      tiktok: tiktokService.getState()
    });
  });
  app.post("/api/tests/run", async (_req, res) => {
    const results = await runAutomatedTestSuite();
    res.json(results);
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path6.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path6.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`LexiStream LIVE Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Fatal server startup error:", err);
});
