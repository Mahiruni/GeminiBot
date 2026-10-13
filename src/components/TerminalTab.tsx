'use client';

import React from 'react';
import { Activity, Power, Zap } from 'lucide-react';
import { ChartCanvas } from './ChartCanvas';
import {
  Candle,
  PairSymbol,
  SignalDiagnostics,
  SocketConnectionStatus,
} from '@/types/bot';

interface TerminalTabProps {
  selectedPair: PairSymbol;
  onSelectPair: (pair: PairSymbol) => void;
  connectionStatus: SocketConnectionStatus;
  isBotRunning: boolean;
  onToggleBot: () => void;
  livePayout: number;
  candles: Candle[];
  diagnostics: SignalDiagnostics | null;
  cooldownRemainingSeconds: number;
}

export const TerminalTab: React.FC<TerminalTabProps> = ({
  selectedPair,
  onSelectPair,
  connectionStatus,
  isBotRunning,
  onToggleBot,
  livePayout,
  candles,
  diagnostics,
  cooldownRemainingSeconds,
}) => {
  const pairs: PairSymbol[] = ['EURUSD', 'AUDUSD', 'GBPUSD'];
  const isPayoutSufficient = livePayout >= 82;

  return (
    <div className="flex flex-col h-full space-y-3 pb-24">
      <div className="bg-obsidian-surface/90 border border-obsidian-border rounded-2xl p-3 backdrop-blur-xl flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-obsidian-border text-[11px] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'CONNECTED'
                  ? 'bg-neon-emerald shadow-glow-emerald'
                  : connectionStatus === 'SIMULATOR'
                  ? 'bg-neon-cyan shadow-glow-cyan'
                  : 'bg-neon-amber animate-pulse'
              }`}
            />
            <span className="font-medium text-slate-300">
              {connectionStatus === 'CONNECTED'
                ? 'LIVE WS'
                : connectionStatus === 'SIMULATOR'
                ? 'SIMULATOR'
                : 'CONNECTING'}
            </span>
          </div>

          <div className="flex bg-slate-950/80 p-0.5 rounded-lg border border-obsidian-border">
            {pairs.map((pair) => (
              <button
                key={pair}
                onClick={() => onSelectPair(pair)}
                className={`px-2 py-1 text-xs font-mono font-semibold rounded-md transition-all ${
                  selectedPair === pair
                    ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {pair}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div
            className={`px-2 py-1 rounded-lg border text-xs font-mono font-bold flex items-center space-x-1 ${
              isPayoutSufficient
                ? 'bg-neon-emerald/10 border-neon-emerald/30 text-neon-emerald'
                : 'bg-neon-crimson/10 border-neon-crimson/30 text-neon-crimson'
            }`}
          >
            <span>{livePayout}%</span>
          </div>

          <button
            onClick={onToggleBot}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-all shadow-md ${
              isBotRunning
                ? 'bg-neon-crimson hover:bg-rose-600 text-white shadow-glow-crimson'
                : 'bg-neon-emerald hover:bg-emerald-600 text-slate-950 shadow-glow-emerald'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isBotRunning ? 'HALT' : 'START'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[310px] bg-obsidian-surface/60 border border-obsidian-border rounded-2xl overflow-hidden relative shadow-inner">
        <ChartCanvas candles={candles} diagnostics={diagnostics} />

        {cooldownRemainingSeconds > 0 && (
          <div className="absolute top-3 left-3 bg-slate-950/90 border border-neon-amber/50 px-2.5 py-1 rounded-lg text-neon-amber text-[11px] font-mono flex items-center space-x-1.5 shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-amber animate-ping" />
            <span>COOLDOWN: {cooldownRemainingSeconds}s</span>
          </div>
        )}
      </div>

      <div className="bg-obsidian-surface/90 border border-obsidian-border rounded-2xl p-3.5 backdrop-blur-xl shadow-lg">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-obsidian-border">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium">
            <Activity className="w-3.5 h-3.5 text-neon-cyan" />
            <span>ENGINE TELEMETRY</span>
          </div>
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
              diagnostics?.signal === 'CALL'
                ? 'bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/40'
                : diagnostics?.signal === 'PUT'
                ? 'bg-neon-crimson/20 text-neon-crimson border border-neon-crimson/40'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {diagnostics?.signal ?? 'SCANNING'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 font-mono text-center">
          <div className="bg-slate-950/60 p-2 rounded-xl border border-obsidian-border">
            <div className="text-[10px] text-slate-400">RSI(7)</div>
            <div
              className={`text-sm font-bold ${
                (diagnostics?.rsi7 ?? 50) < 28
                  ? 'text-neon-emerald'
                  : (diagnostics?.rsi7 ?? 50) > 72
                  ? 'text-neon-crimson'
                  : 'text-slate-200'
              }`}
            >
              {diagnostics?.rsi7?.toFixed(1) ?? '--'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-2 rounded-xl border border-obsidian-border">
            <div className="text-[10px] text-slate-400">ATR(14)</div>
            <div className="text-sm font-bold text-slate-200">
              {diagnostics?.atr14 ? (diagnostics.atr14 * 10000).toFixed(1) : '--'}p
            </div>
          </div>

          <div className="bg-slate-950/60 p-2 rounded-xl border border-obsidian-border">
            <div className="text-[10px] text-slate-400">WICK %</div>
            <div className="text-sm font-bold text-neon-cyan">
              {diagnostics?.lowerWickRatio && diagnostics.lowerWickRatio > 0.39
                ? `${(diagnostics.lowerWickRatio * 100).toFixed(0)}%`
                : diagnostics?.upperWickRatio && diagnostics.upperWickRatio > 0.39
                ? `${(diagnostics.upperWickRatio * 100).toFixed(0)}%`
                : '0%'}
            </div>
          </div>

          <div className="bg-slate-950/60 p-2 rounded-xl border border-obsidian-border">
            <div className="text-[10px] text-slate-400">SPIKE</div>
            <div
              className={`text-sm font-bold ${
                diagnostics?.atrSpikeBlocked ? 'text-neon-crimson' : 'text-neon-emerald'
              }`}
            >
              {diagnostics?.atrSpikeBlocked ? 'BLOCKED' : 'CLEAN'}
            </div>
          </div>
        </div>

        <div className="mt-2.5 text-[11px] text-slate-400 font-mono flex items-center space-x-1.5 truncate">
          <Zap className="w-3 h-3 text-neon-amber shrink-0" />
          <span className="truncate">{diagnostics?.reason ?? 'Awaiting candle close...'}</span>
        </div>
      </div>
    </div>
  );
};
