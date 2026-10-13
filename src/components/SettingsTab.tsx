'use client';

import React from 'react';
import { KeyRound, Sliders, PlayCircle } from 'lucide-react';
import { BotConfig } from '@/types/bot';

interface SettingsTabProps {
  config: BotConfig;
  onUpdateConfig: (newConfig: Partial<BotConfig>) => void;
  onReconnect: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  config,
  onUpdateConfig,
  onReconnect,
}) => {
  return (
    <div className="flex flex-col space-y-4 pb-24">
      <div className="bg-obsidian-surface border border-obsidian-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
          <KeyRound className="w-4 h-4 text-neon-cyan" />
          <span>POCKET OPTION DEMO SESSION</span>
        </div>
        <input
          type="password"
          value={config.ssid}
          onChange={(e) => onUpdateConfig({ ssid: e.target.value })}
          placeholder='42["auth",{"session":"...","isDemo":1}]'
          className="w-full bg-slate-950 border border-obsidian-border rounded-xl px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600"
        />
      </div>

      <div className="bg-obsidian-surface border border-obsidian-border rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <PlayCircle className="w-5 h-5 text-neon-emerald" />
          <div>
            <div className="text-xs font-semibold text-slate-200">Offline Market Simulator</div>
            <div className="text-[11px] text-slate-400">
              Inject synthetic price ticks for testing without an SSID.
            </div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={config.useSimulator}
          onChange={(e) => onUpdateConfig({ useSimulator: e.target.checked })}
          className="w-5 h-5 accent-neon-emerald rounded cursor-pointer"
        />
      </div>

      <div className="bg-obsidian-surface border border-obsidian-border rounded-2xl p-4 space-y-3 font-mono text-xs">
        <div className="flex items-center space-x-2 font-sans font-semibold text-slate-300">
          <Sliders className="w-4 h-4 text-neon-amber" />
          <span>PARAMETERS</span>
        </div>

        <div className="flex justify-between items-center py-1.5 border-b border-obsidian-border">
          <span className="text-slate-400">Expiry Duration</span>
          <select
            value={config.expirySeconds}
            onChange={(e) =>
              onUpdateConfig({ expirySeconds: Number(e.target.value) as 120 | 180 })
            }
            className="bg-slate-950 border border-obsidian-border rounded-lg px-2 py-1 text-slate-200 font-bold"
          >
            <option value={120}>2 Minutes (120s)</option>
            <option value={180}>3 Minutes (180s)</option>
          </select>
        </div>
      </div>

      <button
        onClick={onReconnect}
        className="w-full bg-slate-900 hover:bg-slate-800 border border-obsidian-border text-slate-200 py-3 rounded-2xl text-xs font-mono font-bold tracking-wider uppercase"
      >
        RELOAD CONNECTION & SYNC ENGINE
      </button>
    </div>
  );
};
