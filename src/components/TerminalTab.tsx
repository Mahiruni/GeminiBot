'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Power, Zap, ArrowUpRight, ArrowDownRight, CheckCircle2, CircleDot, Sparkles, Clock } from 'lucide-react';
import { ChartCanvas } from './ChartCanvas';
import { Candle, PairSymbol, RiskTelemetry, SignalDiagnostics, SocketConnectionStatus, TradeDirection, TradeRecord } from '@/types/bot';

interface Props {
  selectedPair: PairSymbol;
  onSelectPair: (p: PairSymbol) => void;
  connectionStatus: SocketConnectionStatus;
  isBotRunning: boolean;
  onToggleBot: () => void;
  livePayout: number;
  candles: Candle[];
  diagnostics: SignalDiagnostics | null;
  cooldownRemainingSeconds: number;
  telemetry: RiskTelemetry;
  activeTrade: TradeRecord | null;
  onManualExecute: (d: TradeDirection) => void;
  onSimulateSweep: (d: TradeDirection) => void;
}

export const TerminalTab: React.FC<Props> = ({
  selectedPair, onSelectPair, connectionStatus, isBotRunning, onToggleBot,
  livePayout, candles, diagnostics, cooldownRemainingSeconds, telemetry, activeTrade, onManualExecute, onSimulateSweep,
}) => {
  const pairs: PairSymbol[] = ['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD'];
  const dec = selectedPair === 'XAUUSD' ? 2 : 5;
  const px = candles.length ? candles[candles.length - 1].close.toFixed(dec) : '--';
  const [secLeft, setSecLeft] = useState(60);

  useEffect(() => {
    const t = setInterval(() => setSecLeft(60 - (Math.floor(Date.now() / 1000) % 60)), 500);
    return () => clearInterval(t);
  }, []);

  const score = diagnostics?.confluenceScore ?? 0;

  return (
    <div className="flex flex-col space-y-2.5 pb-20">
      <div className="bg-obsidian-surface/95 border border-obsidian-border rounded-2xl p-2.5 space-y-2 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-950 border border-obsidian-border text-[10px] font-mono">
              <span className={`w-2 h-2 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-neon-emerald' : 'bg-neon-cyan'}`} />
              <span className="font-bold text-slate-200">{connectionStatus === 'CONNECTED' ? 'PO LIVE' : 'QUANT SIM'}</span>
            </div>
            <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-obsidian-border text-[10px] font-mono text-slate-400">
              EQ: <span className="text-slate-100 font-bold">${telemetry.currentBalance.toFixed(2)}</span>
            </div>
          </div>
          <button onClick={onToggleBot} className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl font-mono font-bold text-[11px] ${isBotRunning ? 'bg-neon-crimson text-white' : 'bg-neon-emerald text-slate-950'}`}>
            <Power className="w-3.5 h-3.5" /><span>{isBotRunning ? 'HALT BOT' : 'AUTO-PILOT'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-obsidian-border">
          <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-obsidian-border flex-1 mr-2">
            {pairs.map((p) => (
              <button key={p} onClick={() => onSelectPair(p)} className={`py-1 text-[11px] font-mono font-bold rounded-lg ${selectedPair === p ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40' : 'text-slate-400'}`}>
                {p}
              </button>
            ))}
          </div>
          <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold ${livePayout >= 82 ? 'bg-neon-emerald/10 border-neon-emerald/30 text-neon-emerald' : 'bg-neon-crimson/10 border-neon-crimson/30 text-neon-crimson'}`}>
            +{livePayout}%
          </div>
        </div>
      </div>

      <div className="w-full bg-obsidian-surface/80 border border-obsidian-border rounded-2xl overflow-hidden relative shadow-lg">
        <div className="absolute top-2.5 left-3 z-20 flex items-center space-x-2 pointer-events-none">
          <div className="bg-slate-950/85 border border-obsidian-border px-2.5 py-1 rounded-lg font-mono">
            <div className="text-[9px] text-slate-400">{selectedPair} <span className="text-neon-cyan">• 1M</span></div>
            <div className="text-sm font-bold text-slate-100">{px}</div>
          </div>
          <div className="bg-slate-950/85 border border-obsidian-border px-2 py-1 rounded-lg font-mono flex items-center space-x-1 text-[11px] text-slate-300">
            <Clock className="w-3 h-3 text-neon-cyan" /><span>00:{secLeft < 10 ? `0${secLeft}` : secLeft}</span>
          </div>
          {cooldownRemainingSeconds > 0 && (
            <div className="bg-neon-amber/20 border border-neon-amber/50 px-2 py-1 rounded-lg text-neon-amber text-[10px] font-mono font-bold">
              LOCK {cooldownRemainingSeconds}s
            </div>
          )}
        </div>
        <ChartCanvas pair={selectedPair} candles={candles} diagnostics={diagnostics} activeTrade={activeTrade} />
      </div>

      <div className="bg-obsidian-surface/95 border border-obsidian-border rounded-2xl p-3 space-y-2 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
            <Activity className="w-3.5 h-3.5 text-neon-cyan" /><span>INSTITUTIONAL CONFLUENCE</span>
          </div>
          <span className="text-[11px] font-mono text-neon-cyan font-bold">SCORE: {score}%</span>
        </div>

        <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-obsidian-border">
          <div className={`h-full ${score >= 78 ? 'bg-neon-emerald' : 'bg-neon-cyan'}`} style={{ width: `${Math.max(8, score)}%` }} />
        </div>

        <div className="grid grid-cols-4 gap-1.5 font-mono text-center">
          <div className="bg-slate-950/70 p-1.5 rounded-xl border border-obsidian-border">
            <div className="text-[9px] text-slate-400">RSI(7)</div>
            <div className="text-xs font-bold text-slate-100">{diagnostics?.rsi7?.toFixed(1) ?? '--'}</div>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded-xl border border-obsidian-border">
            <div className="text-[9px] text-slate-400">ATR(14)</div>
            <div className="text-xs font-bold text-slate-100">{diagnostics?.atr14 ? (selectedPair === 'XAUUSD' ? diagnostics.atr14.toFixed(2) : `${(diagnostics.atr14 * 10000).toFixed(1)}p`) : '--'}</div>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded-xl border border-obsidian-border">
            <div className="text-[9px] text-slate-400">WICK REJ</div>
            <div className="text-xs font-bold text-neon-cyan">{diagnostics ? `${(Math.max(diagnostics.lowerWickRatio, diagnostics.upperWickRatio) * 100).toFixed(0)}%` : '0%'}</div>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded-xl border border-obsidian-border">
            <div className="text-[9px] text-slate-400">REGIME</div>
            <div className={`text-xs font-bold ${diagnostics?.atrSpikeBlocked ? 'text-neon-crimson' : 'text-neon-emerald'}`}>{diagnostics?.atrSpikeBlocked ? 'SPIKE' : 'OPTIMAL'}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'LIQ SWEEP', ok: diagnostics?.checklist?.liquiditySweep },
            { label: 'OTE 0.618', ok: diagnostics?.checklist?.oteFibZone },
            { label: 'FVG / OB', ok: diagnostics?.checklist?.fvgImbalance },
          ].map((it) => (
            <div key={it.label} className={`flex items-center justify-center space-x-1 py-1 px-2 rounded-lg border text-[10px] font-mono ${it.ok ? 'bg-neon-emerald/15 border-neon-emerald/40 text-neon-emerald font-bold' : 'bg-slate-950/50 border-obsidian-border text-slate-500'}`}>
              {it.ok ? <CheckCircle2 className="w-3 h-3" /> : <CircleDot className="w-3 h-3" />}<span>{it.label}</span>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1.5 truncate">
          <Zap className="w-3 h-3 text-neon-amber shrink-0" /><span className="truncate">{diagnostics?.reason ?? 'Scanning...'}</span>
        </div>
      </div>

      <div className="bg-obsidian-surface/95 border border-obsidian-border rounded-2xl p-2.5 space-y-2 shadow-lg">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onManualExecute('CALL')} className="flex items-center justify-center space-x-1 py-2 rounded-xl bg-neon-emerald/20 border border-neon-emerald/50 text-neon-emerald font-mono font-bold text-xs">
            <ArrowUpRight className="w-4 h-4" /><span>EXEC CALL (1.5%)</span>
          </button>
          <button onClick={() => onManualExecute('PUT')} className="flex items-center justify-center space-x-1 py-2 rounded-xl bg-neon-crimson/20 border border-neon-crimson/50 text-neon-crimson font-mono font-bold text-xs">
            <ArrowDownRight className="w-4 h-4" /><span>EXEC PUT (1.5%)</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-obsidian-border">
          <button onClick={() => onSimulateSweep('CALL')} className="flex items-center justify-center space-x-1 py-1.5 rounded-lg bg-slate-900 border border-obsidian-border text-[10px] font-mono text-slate-300">
            <Sparkles className="w-3 h-3 text-neon-emerald" /><span>SIM BULL SWEEP</span>
          </button>
          <button onClick={() => onSimulateSweep('PUT')} className="flex items-center justify-center space-x-1 py-1.5 rounded-lg bg-slate-900 border border-obsidian-border text-[10px] font-mono text-slate-300">
            <Sparkles className="w-3 h-3 text-neon-crimson" /><span>SIM BEAR SWEEP</span>
          </button>
        </div>
      </div>
    </div>
  );
};
