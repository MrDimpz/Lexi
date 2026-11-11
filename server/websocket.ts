import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { eventManager, SequencedEvent } from './eventManager.ts';
import { gameEngine } from './gameEngine.ts';
import { tiktokService } from '../integrations/tiktok.ts';
import { giftHandler } from '../integrations/giftHandler.ts';

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private viteFallbackWss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({ noServer: true });
    this.viteFallbackWss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => {
        if (protocols.has('vite-hmr')) return 'vite-hmr';
        return false;
      },
    });
    this.setup();

    httpServer.on('upgrade', (request, socket, head) => {
      try {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (pathname === '/ws') {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
          });
          return;
        }

        // In Vite 8, @vite/client still attempts a "vite-hmr" WebSocket connection even when DISABLE_HMR=true.
        // If Vite did not attach its own upgrade listener (because HMR is disabled), accept it cleanly so @vite/client never errors.
        const proto = String(request.headers['sec-websocket-protocol'] || '');
        if (proto.includes('vite-hmr') && httpServer.listenerCount('upgrade') <= 1) {
          this.viteFallbackWss.handleUpgrade(request, socket, head, (ws) => {
            ws.send(JSON.stringify({ type: 'connected' }));
            ws.on('error', () => {});
          });
        }
      } catch {
        // Ignore malformed upgrade URLs
      }
    });
  }

  private setup(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      // Send authoritative initial state immediately on connection
      this.sendFullState(ws);

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleClientMessage(ws, msg);
        } catch (err) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Malformed WebSocket JSON payload.',
            })
          );
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    eventManager.on('broadcast', (event: SequencedEvent) => {
      this.broadcast(event);
    });
  }

  private sendFullState(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        seqId: eventManager.getSeqId(),
        type: 'state:sync',
        timestamp: Date.now(),
        payload: {
          ...gameEngine.getFullState(),
          tiktok: tiktokService.getState(),
          giftsConfig: giftHandler.getConfig(),
          giftHistory: giftHandler.getGiftHistory(25),
          connectedDisplays: this.clients.size,
        },
      })
    );
  }

  private handleClientMessage(ws: WebSocket, msg: any): void {
    if (!msg || typeof msg.action !== 'string') return;

    switch (msg.action) {
      case 'sync': {
        this.sendFullState(ws);
        break;
      }
      case 'submit_word': {
        const word = String(msg.word || '').trim();
        const username = String(msg.username || 'SoloPlayer').trim();
        const userId = String(msg.userId || `web_${username.toLowerCase()}`);
        const res = gameEngine.submitWord({
          userId,
          username,
          nickname: username,
          word,
          source: 'web',
        });
        ws.send(
          JSON.stringify({
            type: 'submission:Ack',
            payload: res,
          })
        );
        break;
      }
      case 'shuffle_board': {
        gameEngine.shuffleCurrentBoard();
        break;
      }
      case 'reveal_hint': {
        gameEngine.revealHint('Player', false);
        break;
      }
      default:
        break;
    }
  }

  public broadcast(event: SequencedEvent): void {
    const serialized = JSON.stringify({
      ...event,
      connectedDisplays: this.clients.size,
    });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }
}
