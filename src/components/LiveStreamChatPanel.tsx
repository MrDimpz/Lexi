import React, { useState, useRef, useEffect } from 'react';
import { ChatFeedItem } from '../types/game.ts';
import { MessageSquare, Send, CheckCircle2, XCircle, Sparkles, Terminal } from 'lucide-react';

interface LiveStreamChatPanelProps {
  chatFeed: ChatFeedItem[];
  onSimulateChat?: (text: string, username?: string) => void;
  compact?: boolean;
}

export const LiveStreamChatPanel: React.FC<LiveStreamChatPanelProps> = ({
  chatFeed,
  onSimulateChat,
  compact = false,
}) => {
  const [testMessage, setTestMessage] = useState('');
  const [testUsername, setTestUsername] = useState('ChatViewer');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new chat items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [chatFeed]);

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = testMessage.trim();
    if (!cleanText || !onSimulateChat) return;
    onSimulateChat(cleanText, testUsername.trim() || 'ChatViewer');
    setTestMessage('');
  };

  return (
    <div
      className={`rounded-2xl bg-[#19032b]/95 border border-[#6d2ea6]/70 flex flex-col justify-between shadow-xl overflow-hidden ${
        compact ? 'p-3 max-h-72' : 'p-4 sm:p-5 max-h-[380px]'
      }`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#3b105d] mb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-display font-extrabold text-white tracking-wide flex items-center gap-1.5">
              <span>Live TikTok Chat & Answers</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </h3>
            <div className="text-[11px] text-purple-200/80">
              Real-time chat answers, !commands & live activity
            </div>
          </div>
        </div>

        <div className="text-xs font-mono font-bold text-amber-300 bg-[#2b0846] px-2.5 py-1 rounded-full border border-amber-400/40">
          {chatFeed.length} messages
        </div>
      </div>

      {/* Auto-scrolling Chat Message Stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px] max-h-[260px] scrollbar-thin scrollbar-thumb-purple-700"
      >
        {chatFeed.length === 0 ? (
          <div className="py-8 text-center text-purple-200/60 text-xs flex flex-col items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300/80 animate-bounce" />
            <span>
              No chat submissions yet. Type a word in the test box below or send a message in TikTok LIVE chat!
            </span>
          </div>
        ) : (
          chatFeed.map((item) => {
            const isAccepted = item.status === 'accepted';
            const isRejected = item.status === 'rejected';
            const isCommand = item.status === 'command';

            let statusBadge = (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 text-purple-200">
                CHAT
              </span>
            );

            if (isAccepted) {
              statusBadge = (
                <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-400/80 text-emerald-300 flex items-center gap-1 shadow">
                  <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                  <span>+{item.points || 0} PTS</span>
                </span>
              );
            } else if (isRejected) {
              statusBadge = (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-950/90 border border-rose-400/70 text-rose-300 flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-rose-400" />
                  <span>{item.reason || 'REJECTED'}</span>
                </span>
              );
            } else if (isCommand) {
              statusBadge = (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-950/90 border border-sky-400/70 text-sky-300 flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-sky-300" />
                  <span>COMMAND</span>
                </span>
              );
            }

            return (
              <div
                key={item.id}
                className={`animate-tile-pop p-2.5 rounded-xl border flex items-start justify-between gap-2 transition-all ${
                  isAccepted
                    ? 'bg-gradient-to-r from-[#17382c] via-[#210938] to-[#170326] border-emerald-400/60 shadow-[0_2px_8px_rgba(16,185,129,0.18)]'
                    : isRejected
                    ? 'bg-[#290518]/90 border-rose-500/40 text-rose-100'
                    : isCommand
                    ? 'bg-[#0b1f3d]/90 border-sky-500/40 text-sky-100'
                    : 'bg-[#140224] border-[#3d135e] text-slate-100'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {/* Avatar / User Initials */}
                  {item.avatarUrl ? (
                    <img
                      src={item.avatarUrl}
                      alt={item.nickname}
                      className="w-7 h-7 rounded-full border border-purple-400/50 shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-[#19032b] font-display font-extrabold text-xs flex items-center justify-center shrink-0 border border-white/40 shadow-xs">
                      {item.nickname.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs truncate">
                      {item.simulated && (
                        <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/80 px-1 rounded border border-amber-400/40 shrink-0">
                          TEST
                        </span>
                      )}
                      <strong className="text-amber-200 font-display font-bold truncate">
                        {item.nickname}
                      </strong>
                    </div>

                    <div className="text-xs font-mono font-semibold tracking-wide text-white mt-0.5 break-words">
                      {item.text}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pt-0.5">{statusBadge}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Test Chat Submission Form inside panel */}
      {onSimulateChat && (
        <form onSubmit={handleTestSubmit} className="mt-3 pt-2.5 border-t border-[#3b105d] flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={testUsername}
            onChange={(e) => setTestUsername(e.target.value)}
            placeholder="Username"
            className="w-24 px-2 py-1.5 rounded-lg bg-[#0e021a] border border-[#5c2491] text-xs font-medium text-amber-200 focus:outline-none focus:border-amber-400"
          />
          <input
            type="text"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Test chat answer or command (e.g. STREAM, !score)..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-[#0e021a] border border-[#5c2491] text-xs text-white placeholder:text-purple-300/50 focus:outline-none focus:border-amber-400 font-mono"
          />
          <button
            type="submit"
            disabled={!testMessage.trim()}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-b from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 shadow cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      )}
    </div>
  );
};
