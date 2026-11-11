# LexiStream LIVE — Interactive Stream Word Arena for TikTok LIVE

**LexiStream LIVE** is a standalone, browser-based multiplayer collaborative word puzzle game designed for live streamers and TikTok LIVE audiences, with dedicated OBS Browser Source layouts, real-time WebSocket state synchronization, and an authoritative server-side game engine.

---

## 1. Key Features

- **Authoritative Server-Side Game Engine**: Generates balanced, solvable letter boards (5–9 letters) with guaranteed full-board pangrams, validates words against an 11,100+ English dictionary, prevents letter overuse and duplicate submissions, and manages authoritative countdown/round/pause timers.
- **6 Game Modes**:
  - **Classic Mode**: Standard collaborative word discovery.
  - **Speed Blitz**: Fast 60-second rounds with 6 letters.
  - **Marathon Mode**: Extended 180-second rounds with 8 letters.
  - **Community Challenge**: Mandatory center letter required in every word.
  - **Solo Mode**: Playable directly in the browser without TikTok LIVE.
  - **Gift Challenge**: Audience gifts unlock hints, time extensions, and score multipliers.
- **TikTok LIVE Integration (`tiktok-live-connector`)**:
  - Connect to any active TikTok LIVE stream using only the streamer's `@username` (no QR code or viewer installation required).
  - Processes live chat word submissions and configurable commands (`!score`, `!top`, `!words`, `!time`, `!help`, `!join`, `!stats`).
  - Processes TikTok Gifts with gift-streak deduplication (`repeatEnd` handling) and configurable game triggers (bonus points, extra time, word hints, 2X/3X score multipliers).
  - Tracks Likes (with configurable milestone rewards), Follows, and Shares.
- **OBS & Streaming Layouts**:
  - `/game` — Main Game Interface
  - `/vertical` — Dedicated 9:16 Vertical TikTok LIVE Layout
  - `/overlay` — Transparent OBS Overlay (`?clean=1` hides toolbar)
  - `/display` — Full-Screen Broadcast Display
  - `/leaderboard` — Standalone Live Leaderboard
  - `/admin` — Host Administration & Simulation Studio

---

## 2. Installation & Running Locally

### Prerequisites
- Node.js 20+ (or Node.js 24+)

### Install Dependencies
```bash
npm install
```

### Start the Server
```bash
npm start
# Or to run on port 8080 specifically:
PORT=8080 npm start
```
By default, the server starts on `http://localhost:3000` (or `http://localhost:8080` when `PORT=8080` is set).

### Run Automated Test Suite
```bash
npm test
```

---

## 3. Connecting to TikTok LIVE

1. Open the **Admin Studio** (`/admin`).
2. Under **TikTok LIVE Stream Connector**, enter the TikTok username of an account that is **currently broadcasting LIVE** (with or without `@`).
3. Click **Connect LIVE**.
4. If the user is offline or TikTok rate-limits requests, the connector reports the exact error message in the Connection Notice and Logs panel.
5. For offline development or testing before going live, open the **Simulation & Tests** tab in `/admin` (or use the Quick Simulator on the main screen) to simulate valid/invalid words, gifts, gift streaks, likes, follows, and shares.
