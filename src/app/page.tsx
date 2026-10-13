'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Shield, History, Settings } from 'lucide-react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { BotConfig, Candle, PairSymbol, SignalDiagnostics, SocketConnectionStatus, TradeDirection, TradeRecord } from '@/types/bot';
import { StrategyEngine } from '@/lib/strategy';
import { RiskManager } from '@/lib/riskManager';
import { PocketSocketClient } from '@/lib/pocketSocket';
import { TerminalTab } from '@/components/TerminalTab';
import { RiskHUDTab } from '@/components/RiskHUDTab';
import { TradeHistoryTab } from '@/components/TradeHistoryTab';
import { SettingsTab } from '@/components/SettingsTab';

const PAIRS: PairSymbol[] = ['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD'];

export default function QuantTerminalPage() {
  const [tab, setTab] = useState<'terminal' | 'risk' | 'history' | 'settings'>('terminal');
  const [running, setRunning] = useState(true);
  const [status, setStatus] = useState<SocketConnectionStatus>('SIMULATOR');
  const [cfg, setCfg] = useState<BotConfig>({
    ssid: '', isDemo: true, useSimulator: true, activePairs: PAIRS, selectedPair: 'XAUUSD',
    expirySeconds: 120, riskPercent: 1.5, fixedStakeFallback: 15, minPayoutPercent: 82,
    cooldownCandles: 3, dailyStopLossPercent: 4.5, maxConsecutiveLosses: 3, dailyTakeProfitPercent: 6.0,
  });

  const [candles, setCandles] = useState<Record<PairSymbol, Candle[]>>({ XAUUSD: [], EURUSD: [], AUDUSD: [], GBPUSD: [] });
  const [diag, setDiag] = useState<Record<PairSymbol, SignalDiagnostics | null>>({ XAUUSD: null, EURUSD: null, AUDUSD: null, GBPUSD: null });
  const [payouts, setPayouts] = useState<Record<PairSymbol, number>>({ XAUUSD: 92, EURUSD: 88, AUDUSD: 86, GBPUSD: 88 });
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [cooldown, setCooldown] = useState(0);

  const riskRef = useRef(new RiskManager(1000));
  const wsRef = useRef<PocketSocketClient | null>(null);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const runRef = useRef(running); runRef.current = running;

  useEffect(() => {
    const cMap: Record<PairSymbol, Candle[]> = { XAUUSD: [], EURUSD: [], AUDUSD: [], GBPUSD: [] };
    const dMap: Record<PairSymbol, SignalDiagnostics | null> = { XAUUSD: null, EURUSD: null, AUDUSD: null, GBPUSD: null };
    const nowMin = Math.floor(Date.now() / 60000) * 60;
    PAIRS.forEach((p) => {
      let px = p === 'XAUUSD' ? 2648.5 : p === 'EURUSD' ? 1.0852 : p === 'AUDUSD' ? 0.6584 : 1.2941;
      const step = p === 'XAUUSD' ? 0.85 : 0.00035, dec = p === 'XAUUSD' ? 2 : 5;
      for (let i = 65; i >= 0; i--) {
        const o = px, c = Number((o + (Math.random() - 0.495) * step).toFixed(dec));
        const h = Number((Math.max(o, c) + Math.random() * step * 0.6).toFixed(dec));
        const l = Number((Math.min(o, c) - Math.random() * step * 0.6).toFixed(dec));
        cMap[p].push({ time: nowMin - i * 60, open: o, high: h, low: l, close: c });
        px = c;
      }
      dMap[p] = StrategyEngine.evaluate(p, cMap[p]);
    });
    setCandles(cMap); setDiag(dMap);
  }, []);

  const execTrade = async (p: PairSymbol, dir: TradeDirection, px: number, cTime: number, pay: number) => {
    const chk = riskRef.current.canExecuteTrade(p, pay, cTime, cfgRef.current);
    if (!chk.allowed) return;
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
    const id = `t_${Date.now()}`, exp = cfgRef.current.expirySeconds * 1000;
    setTrades((pr) => [{ id, pair: p, direction: dir, entryPrice: px, stake: chk.stake, payoutPercent: pay, entryTime: Date.now(), expiryTime: Date.now() + exp, status: 'ACTIVE', profit: 0 }, ...pr]);
    riskRef.current.registerExecution(p, cTime);
    setCooldown(cfgRef.current.cooldownCandles * 60);
    wsRef.current?.executeOrder(p, dir, chk.stake, cfgRef.current.expirySeconds);
    setTimeout(() => {
      setCandles((lat) => {
        const cur = lat[p][lat[p].length - 1]?.close ?? px;
        const win = (dir === 'CALL' && cur > px) || (dir === 'PUT' && cur < px);
        const st = win ? 'WIN' : cur === px ? 'TIE' : 'LOSS';
        const out: TradeRecord = { id, pair: p, direction: dir, entryPrice: px, exitPrice: cur, stake: chk.stake, payoutPercent: pay, entryTime: Date.now() - exp, expiryTime: Date.now(), status: st, profit: st === 'TIE' ? 0 : win ? chk.stake * (pay / 100) : -chk.stake };
        riskRef.current.recordOutcome(out);
        setTrades((pr) => pr.map((t) => (t.id === id ? out : t)));
        return lat;
      });
    }, exp);
  };

  useEffect(() => {
    const ws = new PocketSocketClient((p, px, ts, pay) => {
      setPayouts((pr) => ({ ...pr, [p]: pay }));
      setCandles((pr) => {
        const list = pr[p] ?? [];
        if (!list.length) return pr;
        const last = list[list.length - 1], cMin = Math.floor(ts / 60) * 60;
        const upd = cMin <= last.time
          ? [...list.slice(0, -1), { ...last, high: Math.max(last.high, px), low: Math.min(last.low, px), close: px }]
          : [...list.slice(-120), { time: cMin, open: last.close, high: px, low: px, close: px }];
        const ev = StrategyEngine.evaluate(p, upd);
        setDiag((d) => ({ ...d, [p]: ev }));
        if (ev.signal && runRef.current && cMin > last.time) execTrade(p, ev.signal, px, cMin, pay);
        return { ...pr, [p]: upd };
      });
    }, setStatus);
    wsRef.current = ws;
    ws.connect(cfg.ssid, cfg.useSimulator);
    return () => ws.disconnect();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onSimSweep = (dir: TradeDirection) => {
    const p = cfg.selectedPair, list = candles[p];
    if (list.length < 55) return;
    const last = list[list.length - 1], step = p === 'XAUUSD' ? 2.4 : 0.0012, dec = p === 'XAUUSD' ? 2 : 5;
    const sw: Candle = dir === 'CALL'
      ? { ...last, low: Number((last.close - step).toFixed(dec)), close: Number((last.close + step * 0.05).toFixed(dec)) }
      : { ...last, high: Number((last.close + step).toFixed(dec)), close: Number((last.close - step * 0.05).toFixed(dec)) };
    const upd = [...list.slice(0, -1), sw];
    setCandles((pr) => ({ ...pr, [p]: upd }));
    setDiag((pr) => ({ ...pr, [p]: { ...StrategyEngine.evaluate(p, upd), signal: dir, confluenceScore: 92, checklist: { trendAligned: true, liquiditySweep: true, fvgImbalance: true, oteFibZone: true, rsiExhaustion: true, atrRegimeClean: true }, reason: `Institutional ${dir} Sweep Confirmed (92% Confluence)` } }));
    execTrade(p, dir, sw.close, sw.time, payouts[p]);
  };

  const exportCSV = async () => {
    const csv = 'ID,Pair,Dir,Stake,Payout,Profit,Status\n' + trades.map((t) => `${t.id},${t.pair},${t.direction},${t.stake},${t.payoutPercent},${t.profit},${t.status}`).join('\n');
    try { await Filesystem.writeFile({ path: `trades_${Date.now()}.csv`, data: csv, directory: Directory.Documents, encoding: Encoding.UTF8 }); } catch {}
  };

  const activeTrade = trades.find((t) => t.status === 'ACTIVE' && t.pair === cfg.selectedPair) ?? null;

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col px-3 pt-2.5 relative bg-obsidian-bg">
      <div className="flex-1">
        {tab === 'terminal' && <TerminalTab selectedPair={cfg.selectedPair} onSelectPair={(p) => setCfg((pr) => ({ ...pr, selectedPair: p }))} connectionStatus={status} isBotRunning={running} onToggleBot={() => setRunning(!running)} livePayout={payouts[cfg.selectedPair]} candles={candles[cfg.selectedPair]} diagnostics={diag[cfg.selectedPair]} cooldownRemainingSeconds={cooldown} telemetry={riskRef.current.getTelemetry()} activeTrade={activeTrade} onManualExecute={(dir) => execTrade(cfg.selectedPair, dir, candles[cfg.selectedPair].slice(-1)[0]?.close ?? 1, Math.floor(Date.now() / 60000) * 60, payouts[cfg.selectedPair])} onSimulateSweep={onSimSweep} />}
        {tab === 'risk' && <RiskHUDTab telemetry={riskRef.current.getTelemetry()} riskPercent={cfg.riskPercent} dailyStopLossPercent={cfg.dailyStopLossPercent} dailyTakeProfitPercent={cfg.dailyTakeProfitPercent} />}
        {tab === 'history' && <TradeHistoryTab trades={trades} onExportCSV={exportCSV} />}
        {tab === 'settings' && <SettingsTab config={cfg} onUpdateConfig={(c) => setCfg((pr) => ({ ...pr, ...c }))} onReconnect={() => wsRef.current?.connect(cfg.ssid, cfg.useSimulator)} />}
      </div>
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-obsidian-surface/95 backdrop-blur-2xl border-t border-obsidian-border px-6 py-2.5 flex justify-between items-center z-50">
        {([['terminal', Terminal, 'TERMINAL'], ['risk', Shield, 'RISK HUD'], ['history', History, 'LEDGER'], ['settings', Settings, 'SETTINGS']] as const).map(([k, Icon, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex flex-col items-center space-y-1 ${tab === k ? 'text-neon-cyan' : 'text-slate-500'}`}>
            <Icon className="w-5 h-5" /><span className="text-[10px] font-mono">{lbl}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
