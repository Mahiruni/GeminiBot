'use client';

import React from 'react';
import { Download, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { TradeRecord } from '@/types/bot';

interface TradeHistoryTabProps {
  trades: TradeRecord[];
  onExportCSV: () => void;
}

export const TradeHistoryTab: React.FC<TradeHistoryTabProps> = ({ trades, onExportCSV }) => {
  const closedTrades = trades.filter((t) => t.status !== 'ACTIVE');
  const wins = closedTrades.filter((t) => t.status === 'WIN').length;
  const losses = closedTrades.filter((t) => t.status === 'LOSS').length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const totalProfit = closedTrades.reduce((acc, t) => acc + t.profit, 0);

  return (
    <div className="flex flex-col space-y-3 pb-24">
      <div className="grid grid-cols-3 gap-2 font-mono text-center">
        <div className="bg-obsidian-surface border border-obsidian-border p-2.5 rounded-xl">
          <span className="text-[10px] text-slate-400">WIN RATE</span>
          <div
            className={`text-base font-bold ${
              winRate >= 56 ? 'text-neon-emerald' : 'text-neon-crimson'
            }`}
          >
            {winRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-obsidian-surface border border-obsidian-border p-2.5 rounded-xl">
          <span className="text-[10px] text-slate-400">RECORD</span>
          <div className="text-base font-bold text-slate-200">
            {wins}W - {losses}L
          </div>
        </div>

        <div className="bg-obsidian-surface border border-obsidian-border p-2.5 rounded-xl">
          <span className="text-[10px] text-slate-400">TOTAL PnL</span>
          <div
            className={`text-base font-bold ${
              totalProfit >= 0 ? 'text-neon-emerald' : 'text-neon-crimson'
            }`}
          >
            {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-semibold text-slate-400">EXECUTION LEDGER</span>
        <button
          onClick={onExportCSV}
          className="flex items-center space-x-1.5 px-3 py-1 bg-slate-900 border border-obsidian-border text-neon-cyan text-xs font-mono font-medium rounded-lg"
        >
          <Download className="w-3.5 h-3.5" />
          <span>EXPORT CSV</span>
        </button>
      </div>

      <div className="space-y-2">
        {trades.length === 0 ? (
          <div className="bg-obsidian-surface/50 border border-obsidian-border rounded-xl p-8 text-center text-slate-400 text-xs font-mono">
            No trades executed in current session
          </div>
        ) : (
          trades.map((t) => (
            <div
              key={t.id}
              className="bg-obsidian-surface border border-obsidian-border rounded-xl p-3 flex items-center justify-between text-xs font-mono"
            >
              <div className="flex items-center space-x-2.5">
                <div
                  className={`p-1.5 rounded-lg ${
                    t.direction === 'CALL'
                      ? 'bg-neon-emerald/20 text-neon-emerald'
                      : 'bg-neon-crimson/20 text-neon-crimson'
                  }`}
                >
                  {t.direction === 'CALL' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-slate-100 flex items-center space-x-1">
                    <span>{t.pair}</span>
                    <span className="text-[10px] font-normal text-slate-400">({t.payoutPercent}%)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(t.entryTime).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-bold">
                  {t.status === 'ACTIVE' ? (
                    <span className="text-neon-cyan animate-pulse">EXPIRING</span>
                  ) : t.status === 'WIN' ? (
                    <span className="text-neon-emerald">+${t.profit.toFixed(2)}</span>
                  ) : (
                    <span className="text-neon-crimson">-${t.stake.toFixed(2)}</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">Stake: ${t.stake.toFixed(2)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
