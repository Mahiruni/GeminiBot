'use client';

import React from 'react';
import { ShieldCheck, AlertOctagon, TrendingUp } from 'lucide-react';
import { RiskTelemetry } from '@/types/bot';

interface RiskHUDTabProps {
  telemetry: RiskTelemetry;
  riskPercent: number;
  dailyStopLossPercent: number;
  dailyTakeProfitPercent: number;
}

export const RiskHUDTab: React.FC<RiskHUDTabProps> = ({
  telemetry,
  riskPercent,
  dailyStopLossPercent,
  dailyTakeProfitPercent,
}) => {
  const currentDrawdown = Math.max(
    0,
    ((-telemetry.netPnL) / telemetry.startingDailyBalance) * 100
  );
  const drawdownProgress = Math.min(100, (currentDrawdown / dailyStopLossPercent) * 100);

  const currentProfitPercent = Math.max(
    0,
    (telemetry.netPnL / telemetry.startingDailyBalance) * 100
  );
  const profitProgress = Math.min(100, (currentProfitPercent / dailyTakeProfitPercent) * 100);

  return (
    <div className="flex flex-col space-y-4 pb-24">
      <div className="bg-neon-emerald/10 border border-neon-emerald/30 rounded-2xl p-3.5 flex items-center space-x-3 shadow-glow-emerald">
        <ShieldCheck className="w-6 h-6 text-neon-emerald shrink-0" />
        <div>
          <div className="text-xs font-bold text-neon-emerald uppercase tracking-wider">
            NO-MARTINGALE ENFORCED
          </div>
          <div className="text-[11px] text-slate-300">
            Strict {riskPercent}% flat fractional sizing. Multipliers are permanently disabled.
          </div>
        </div>
      </div>

      <div className="bg-obsidian-surface border border-obsidian-border rounded-2xl p-4 space-y-3">
        <div className="text-xs text-slate-400 font-medium">CAPITAL & PERFORMANCE</div>
        <div className="grid grid-cols-2 gap-3 font-mono">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-obsidian-border">
            <span className="text-[11px] text-slate-400">Live Balance</span>
            <div className="text-lg font-bold text-slate-100">
              ${telemetry.currentBalance.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-obsidian-border">
            <span className="text-[11px] text-slate-400">Net Daily PnL</span>
            <div
              className={`text-lg font-bold ${
                telemetry.netPnL >= 0 ? 'text-neon-emerald' : 'text-neon-crimson'
              }`}
            >
              {telemetry.netPnL >= 0 ? '+' : ''}${telemetry.netPnL.toFixed(2)} ({telemetry.pnlPercent.toFixed(2)}%)
            </div>
          </div>
        </div>
      </div>

      <div className="bg-obsidian-surface border border-obsidian-border rounded-2xl p-4 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 flex items-center space-x-1">
            <AlertOctagon className="w-3.5 h-3.5 text-neon-crimson" />
            <span>Daily Max Drawdown Guard</span>
          </span>
          <span className="font-mono text-neon-crimson font-bold">
            {currentDrawdown.toFixed(2)}% / {dailyStopLossPercent}%
          </span>
        </div>
        <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-obsidian-border">
          <div
            className="bg-neon-crimson h-full transition-all duration-300 shadow-glow-crimson"
            style={{ width: `${drawdownProgress}%` }}
          />
        </div>
      </div>

      <div className="bg-obsidian-surface border border-obsidian-border rounded-2xl p-4 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5 text-neon-emerald" />
            <span>Daily Take-Profit Target</span>
          </span>
          <span className="font-mono text-neon-emerald font-bold">
            {currentProfitPercent.toFixed(2)}% / {dailyTakeProfitPercent}%
          </span>
        </div>
        <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-obsidian-border">
          <div
            className="bg-neon-emerald h-full transition-all duration-300 shadow-glow-emerald"
            style={{ width: `${profitProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
