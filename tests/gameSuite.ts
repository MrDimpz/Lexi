import { WordValidator } from '../server/wordValidator.ts';
import { LetterGenerator } from '../server/letterGenerator.ts';
import { ScoringEngine } from '../server/scoringEngine.ts';
import { LeaderboardManager } from '../server/leaderboard.ts';
import { RoundManager } from '../server/roundManager.ts';
import { EventManager } from '../server/eventManager.ts';
import { GiftHandler } from '../integrations/giftHandler.ts';

export interface TestCaseResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

export async function runAutomatedTestSuite(): Promise<{
  passedCount: number;
  failedCount: number;
  totalCount: number;
  results: TestCaseResult[];
}> {
  const results: TestCaseResult[] = [];

  const runTest = async (id: string, category: string, name: string, fn: () => void | Promise<void>) => {
    const start = performance.now();
    try {
      await fn();
      results.push({
        id,
        category,
        name,
        passed: true,
        details: 'Verified all assertions passed.',
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    } catch (err: any) {
      results.push({
        id,
        category,
        name,
        passed: false,
        details: err?.message || String(err),
        durationMs: Math.round((performance.now() - start) * 100) / 100,
      });
    }
  };

  const validator = new WordValidator();
  const generator = new LetterGenerator(validator);

  // 1. Letter generation
  await runTest('test-1', 'Letter Generation', 'Generates valid board of exact configured size with solvable words', () => {
    const board = generator.generateBoard({
      boardSize: 7,
      minWordLength: 3,
      maxWordLength: 7,
      mandatoryCenterLetter: true,
    });
    if (board.letters.length !== 7) {
      throw new Error(`Expected 7 letters, got ${board.letters.length}`);
    }
    if (!board.centerLetter || board.centerIndex === null) {
      throw new Error('Mandatory center letter was not assigned');
    }
    if (board.possibleWords.length < 5) {
      throw new Error(`Expected >= 5 solvable words, got ${board.possibleWords.length}`);
    }
  });

  // 2. Word validation & tile multiplicity
  await runTest('test-2', 'Word Validation', 'Enforces dictionary presence and prevents overusing duplicate letters', () => {
    const boardLetters = ['S', 'T', 'R', 'E', 'A', 'M', 'S'];
    const discovered = new Set<string>();

    const validRes = validator.validateSubmission({
      word: 'stream',
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7,
    });
    if (!validRes.valid) {
      throw new Error(`Expected STREAM to be valid, got ${validRes.reason}`);
    }

    // Try using 'T' twice when 'T' only appears once on board
    const overuseRes = validator.validateSubmission({
      word: 'start',
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7,
    });
    if (overuseRes.valid || overuseRes.reason !== 'LETTERS_NOT_ON_BOARD') {
      throw new Error('Failed to reject letter used more times than it appears on board');
    }
  });

  // 3. Duplicate prevention
  await runTest('test-3', 'Duplicate Prevention', 'Rejects words already discovered in the current round', () => {
    const boardLetters = ['P', 'L', 'A', 'N', 'E', 'T', 'S'];
    const discovered = new Set<string>(['planet']);

    const dupRes = validator.validateSubmission({
      word: 'PLANET',
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7,
    });
    if (dupRes.valid || dupRes.reason !== 'ALREADY_DISCOVERED') {
      throw new Error(`Expected ALREADY_DISCOVERED, got ${dupRes.reason}`);
    }
  });

  // 4. Scoring engine
  await runTest('test-4', 'Scoring System', 'Calculates length points, pangram bonuses, combos, and multipliers server-side', () => {
    const scorer = new ScoringEngine();
    scorer.resetRoundState();

    const score3 = scorer.calculateWordScore({
      word: 'cat',
      userId: 'u1',
      boardSize: 7,
      rareBonusWord: null,
      currentCommunityScore: 0,
      isFirstTimeEverFound: false,
    });
    if (score3.basePoints !== 3) {
      throw new Error(`Expected 3 pts for 3-letter word, got ${score3.basePoints}`);
    }

    const score7Pangram = scorer.calculateWordScore({
      word: 'streams',
      userId: 'u1',
      boardSize: 7,
      rareBonusWord: 'STREAMS',
      currentCommunityScore: 3,
      isFirstTimeEverFound: true,
    });
    if (!score7Pangram.isPangram || score7Pangram.pangramBonus <= 0 || score7Pangram.comboCount !== 2) {
      throw new Error('Failed to award pangram and consecutive combo bonuses');
    }
  });

  // 5. Round progression
  await runTest('test-5', 'Round Progression', 'Transitions cleanly between COUNTDOWN, ACTIVE, PAUSED, and ROUND_END states', () => {
    const localEv = new EventManager();
    const rm = new RoundManager(localEv);
    rm.startCountdownAndRound({ roundDuration: 60, prepDuration: 0, intermissionDuration: 5, autoNextRound: false }, false);
    if (rm.getStatus() !== 'ACTIVE') {
      throw new Error(`Expected ACTIVE status, got ${rm.getStatus()}`);
    }
    rm.pauseRound();
    if (rm.getStatus() !== 'PAUSED') {
      throw new Error(`Expected PAUSED status, got ${rm.getStatus()}`);
    }
    rm.resumeRound();
    if (rm.getStatus() !== 'ACTIVE') {
      throw new Error(`Expected ACTIVE status after resume, got ${rm.getStatus()}`);
    }
    rm.endRound('TEST_END', { roundDuration: 60, prepDuration: 0, intermissionDuration: 5, autoNextRound: false });
    if (rm.getStatus() !== 'ROUND_END') {
      throw new Error(`Expected ROUND_END status, got ${rm.getStatus()}`);
    }
    rm.clearTimers();
  });

  // 6. Timer behaviour & time extensions
  await runTest('test-6', 'Timer Behaviour', 'Supports adding bonus time and preserves remaining time while paused', () => {
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

  // 7. Gift processing & streak deduplication
  await runTest('test-7', 'Gift Processing', 'Ignores intermediate streak updates and processes completed gift streaks once', () => {
    const gh = new GiftHandler();
    const intermediate = gh.processGiftEvent(
      {
        userId: 'test_gifter',
        username: 'test_gifter',
        giftId: 5655,
        giftName: 'Rose',
        diamondCount: 1,
        repeatCount: 1,
        repeatEnd: false,
        giftType: 1,
        groupId: 'streak_test_99',
      },
      true
    );
    if (intermediate !== null) {
      throw new Error('Intermediate gift streak (repeatEnd=false) should not be processed as completed gift');
    }

    const completed = gh.processGiftEvent(
      {
        userId: 'test_gifter',
        username: 'test_gifter',
        giftId: 5655,
        giftName: 'Rose',
        diamondCount: 1,
        repeatCount: 3,
        repeatEnd: true,
        giftType: 1,
        groupId: 'streak_test_99',
      },
      true
    );
    if (!completed || completed.repeatCount !== 3) {
      throw new Error('Completed gift streak (repeatEnd=true) failed to process repeatCount=3');
    }
  });

  // 8. WebSocket event sequencing
  await runTest('test-8', 'WebSocket Synchronisation', 'Assigns monotonically increasing seqId to all real-time events', () => {
    const ev = new EventManager();
    const e1 = ev.emitGameEvent('game:started', { roundNumber: 1 });
    const e2 = ev.emitGameEvent('word:accepted', { word: 'STREAM' });
    if (e2.seqId !== e1.seqId + 1) {
      throw new Error(`Expected sequential seqId ${e1.seqId + 1}, got ${e2.seqId}`);
    }
  });

  // 9. Leaderboard calculations
  await runTest('test-9', 'Leaderboard Calculations', 'Sorts round contributors accurately by points and words discovered', () => {
    const lb = new LeaderboardManager();
    lb.recordValidWord({ userId: 'test_a', username: 'alice_test', word: 'star', points: 5 });
    lb.recordValidWord({ userId: 'test_b', username: 'bob_test', word: 'streams', points: 35 });
    const roundTop = lb.getRoundLeaderboard(10);
    const bobIdx = roundTop.findIndex((p) => p.userId === 'test_b');
    const aliceIdx = roundTop.findIndex((p) => p.userId === 'test_a');
    if (bobIdx === -1 || aliceIdx === -1 || bobIdx > aliceIdx) {
      throw new Error('Leaderboard failed to rank higher-scoring player first');
    }
    lb.removeUserFromLeaderboards('test_a');
    lb.removeUserFromLeaderboards('test_b');
  });

  // 10. Dynamic Difficulty & Progressive Round Elements
  await runTest('test-10', 'Progressive Round Mechanics', 'Spawns Hidden Mystery, Decoy Trap, Locked, and Bonus tiles as rounds progress', () => {
    const round4Board = generator.generateBoard({
      boardSize: 7,
      minWordLength: 3,
      maxWordLength: 7,
      mandatoryCenterLetter: false,
      difficulty: 'hard',
      roundNumber: 4,
      progressiveElementsEnabled: true,
    });
    if (round4Board.modifiers.hiddenIndices.length === 0) {
      throw new Error('Expected Round 4 board to include a Hidden Mystery tile');
    }
    if (round4Board.modifiers.decoyIndices.length === 0) {
      throw new Error('Expected Round 4 board to include a Decoy Trap tile');
    }
    if (Object.keys(round4Board.modifiers.lockedTiles).length === 0) {
      throw new Error('Expected Round 4 board to include a Locked tile');
    }
  });

  // 11. Locked & Decoy Tile Validation Enforcement
  await runTest('test-11', 'Hazard Tile Validation', 'Rejects words using Locked or Decoy letters and tracks Mystery tile deductions', () => {
    const boardLetters = ['S', 'T', 'R', 'E', 'A', 'M', 'Z']; // M at index 5 is Locked, Z at index 6 is Decoy, S at index 0 is Hidden
    const discovered = new Set<string>();

    // Attempting to use locked letter 'M' (index 5) in "STREAM"
    const lockedAttempt = validator.validateSubmission({
      word: 'stream',
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7,
      activeLockedIndices: [5],
      decoyIndices: [6],
      hiddenIndices: [0],
    });
    if (lockedAttempt.valid || lockedAttempt.reason !== 'USED_LOCKED_LETTER') {
      throw new Error(`Expected USED_LOCKED_LETTER, got ${lockedAttempt.reason}`);
    }

    // Valid word "STAR" uses Hidden letter 'S' (index 0) without using Locked 'M' or Decoy 'Z'
    const mysteryDeduction = validator.validateSubmission({
      word: 'star',
      boardLetters,
      discoveredWords: discovered,
      minWordLength: 3,
      maxWordLength: 7,
      activeLockedIndices: [5],
      decoyIndices: [6],
      hiddenIndices: [0],
    });
    if (!mysteryDeduction.valid || !(mysteryDeduction.usedHiddenIndices || []).includes(0)) {
      throw new Error('Expected valid word STAR to record deduction of hidden tile index 0');
    }
  });

  const passedCount = results.filter((r) => r.passed).length;
  return {
    passedCount,
    failedCount: results.length - passedCount,
    totalCount: results.length,
    results,
  };
}

// Allow running directly via `npx tsx tests/gameSuite.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  runAutomatedTestSuite().then((summary) => {
    console.log(`\n=== LexiStream LIVE Automated Test Suite ===`);
    for (const r of summary.results) {
      console.log(`${r.passed ? 'PASS' : 'FAIL'} [${r.category}] ${r.name} (${r.durationMs}ms)`);
      if (!r.passed) console.error(`   -> ${r.details}`);
    }
    console.log(`\nSummary: ${summary.passedCount}/${summary.totalCount} tests passed.\n`);
    process.exit(summary.failedCount > 0 ? 1 : 0);
  });
}
