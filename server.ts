import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { gameEngine } from './server/gameEngine.ts';
import { scoringEngine } from './server/scoringEngine.ts';
import { leaderboardManager } from './server/leaderboard.ts';
import { eventManager } from './server/eventManager.ts';
import { GameWebSocketServer } from './server/websocket.ts';
import { tiktokService } from './integrations/tiktok.ts';
import { giftHandler } from './integrations/giftHandler.ts';
import { runAutomatedTestSuite } from './tests/gameSuite.ts';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Attach WebSocket server on /ws
  const wsServer = new GameWebSocketServer(server);

  // --- REST API ROUTES ---

  // Full game & system state
  app.get('/api/state', (_req, res) => {
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
        wsClients: wsServer.getConnectedClientsCount(),
      },
    });
  });

  // Game controls (Start, Pause, Resume, End, Next, Restart, Shuffle, Hint, Reset)
  app.post('/api/game/control', (req, res) => {
    const { action } = req.body || {};
    switch (action) {
      case 'start_game':
      case 'start_round':
        gameEngine.startRound(false);
        break;
      case 'pause':
        gameEngine.pauseRound();
        break;
      case 'resume':
        gameEngine.resumeRound();
        break;
      case 'end_round':
        gameEngine.endCurrentRound('HOST_ENDED');
        break;
      case 'next_round':
      case 'skip_round':
        gameEngine.nextRound();
        break;
      case 'restart_round':
        gameEngine.restartRound();
        break;
      case 'shuffle_board':
        gameEngine.shuffleCurrentBoard();
        break;
      case 'reveal_hint':
        gameEngine.revealHint('Host', false);
        break;
      case 'reset_scores':
        gameEngine.resetGame(true);
        break;
      case 'reset_game':
        gameEngine.resetGame(false);
        break;
      case 'add_hidden':
      case 'add_decoy':
      case 'add_locked':
      case 'add_bonus':
      case 'unlock_and_reveal_all':
        gameEngine.triggerModifierAction(action);
        break;
      default:
        return res.status(400).json({ error: `Unknown control action: ${action}` });
    }

    return res.json({
      success: true,
      action,
      state: gameEngine.getFullState(),
    });
  });

  // Direct word submission from browser/Solo Mode
  app.post('/api/game/submit', (req, res) => {
    const { word, username, userId } = req.body || {};
    const cleanUser = String(username || 'SoloPlayer').trim();
    const result = gameEngine.submitWord({
      userId: String(userId || `web_${cleanUser.toLowerCase()}`),
      username: cleanUser,
      nickname: cleanUser,
      word: String(word || ''),
      source: 'web',
    });
    res.json(result);
  });

  // Update Game Configuration
  app.post('/api/config/game', (req, res) => {
    const updated = gameEngine.updateGameConfig(req.body || {});
    res.json({ success: true, gameConfig: updated, state: gameEngine.getFullState() });
  });

  // Update Scoring Configuration
  app.post('/api/config/scoring', (req, res) => {
    const updated = scoringEngine.saveConfig(req.body || {});
    eventManager.emitGameEvent('config:updated', { scoringConfig: updated });
    res.json({ success: true, scoringConfig: updated });
  });

  // Update Gifts Configuration
  app.post('/api/config/gifts', (req, res) => {
    const updated = giftHandler.saveConfig(req.body || {});
    res.json({ success: true, giftsConfig: updated });
  });

  // Update Settings (TikTok, Moderation, Audio, Overlay)
  app.post('/api/config/settings', (req, res) => {
    const updated = gameEngine.updateSettingsConfig(req.body || {});
    res.json({ success: true, settingsConfig: updated });
  });

  // Moderation actions
  app.post('/api/moderation/action', (req, res) => {
    const { action, target } = req.body || {};
    const currentSettings = gameEngine.getSettingsConfig();
    const cleanTarget = String(target || '').trim();

    switch (action) {
      case 'block_user': {
        if (cleanTarget && !currentSettings.moderation.blockedUsers.includes(cleanTarget)) {
          gameEngine.updateSettingsConfig({
            moderation: {
              ...currentSettings.moderation,
              blockedUsers: [...currentSettings.moderation.blockedUsers, cleanTarget],
            },
          });
        }
        break;
      }
      case 'unblock_user': {
        gameEngine.updateSettingsConfig({
          moderation: {
            ...currentSettings.moderation,
            blockedUsers: currentSettings.moderation.blockedUsers.filter(
              (u) => u.toLowerCase() !== cleanTarget.toLowerCase()
            ),
          },
        });
        break;
      }
      case 'remove_from_leaderboard': {
        leaderboardManager.removeUserFromLeaderboards(cleanTarget);
        eventManager.emitGameEvent('leaderboard:updated', leaderboardManager.getAllLeaderboards());
        break;
      }
      case 'clear_activity': {
        gameEngine.clearActivityLogs();
        giftHandler.clearGiftHistory();
        break;
      }
      case 'add_custom_word': {
        const w = cleanTarget.toLowerCase().replace(/[^a-z]/g, '');
        if (w.length >= 3 && !currentSettings.moderation.customWords.includes(w)) {
          gameEngine.updateSettingsConfig({
            moderation: {
              ...currentSettings.moderation,
              customWords: [...currentSettings.moderation.customWords, w],
            },
          });
        }
        break;
      }
      case 'remove_custom_word': {
        gameEngine.updateSettingsConfig({
          moderation: {
            ...currentSettings.moderation,
            customWords: currentSettings.moderation.customWords.filter((w) => w !== cleanTarget.toLowerCase()),
          },
        });
        break;
      }
      case 'add_excluded_word': {
        const w = cleanTarget.toLowerCase().replace(/[^a-z]/g, '');
        if (w && !currentSettings.moderation.excludedWords.includes(w)) {
          gameEngine.updateSettingsConfig({
            moderation: {
              ...currentSettings.moderation,
              excludedWords: [...currentSettings.moderation.excludedWords, w],
            },
          });
        }
        break;
      }
      case 'remove_excluded_word': {
        gameEngine.updateSettingsConfig({
          moderation: {
            ...currentSettings.moderation,
            excludedWords: currentSettings.moderation.excludedWords.filter((w) => w !== cleanTarget.toLowerCase()),
          },
        });
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown moderation action: ${action}` });
    }

    return res.json({
      success: true,
      settingsConfig: gameEngine.getSettingsConfig(),
      leaderboards: leaderboardManager.getAllLeaderboards(),
    });
  });

  // TikTok LIVE Connection Management
  app.post('/api/tiktok/connect', async (req, res) => {
    const { username } = req.body || {};
    const result = await tiktokService.connect(username);
    res.json({
      ...result,
      tiktok: tiktokService.getState(),
    });
  });

  app.post('/api/tiktok/disconnect', async (_req, res) => {
    await tiktokService.disconnect();
    res.json({
      success: true,
      tiktok: tiktokService.getState(),
    });
  });

  app.post('/api/tiktok/reconnect', async (_req, res) => {
    const result = await tiktokService.reconnect();
    res.json({
      ...result,
      tiktok: tiktokService.getState(),
    });
  });

  // Simulation & Testing Mode
  app.post('/api/simulate', (req, res) => {
    const result = tiktokService.simulateEvent(req.body || {});
    res.json({
      success: true,
      simulated: true,
      result,
      state: gameEngine.getFullState(),
      tiktok: tiktokService.getState(),
    });
  });

  // Automated Test Suite Endpoint
  app.post('/api/tests/run', async (_req, res) => {
    const results = await runAutomatedTestSuite();
    res.json(results);
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LexiStream LIVE Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
