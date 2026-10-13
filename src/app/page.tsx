'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Shield, History, Settings } from 'lucide-react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

import {
  BotConfig,
  Candle,
  PairSymbol,
  SignalDiagnostics,
  SocketConnectionStatus,
  TradeDirection,
  TradeRecord,
} from '@/types/bot';
import { StrategyEngine } from '@/lib/strategy';
import { RiskManager } from '@/lib/riskManager';
import { PocketSocketClient } from '@/lib/pocketSocket';

import { TerminalTab } from '@/components/TerminalTab';
import { RiskHUDTab } from '@/components/RiskHUDTab';
import { TradeHistoryTab } from '@/components/TradeHistoryTab';
import { SettingsTab } from '@/components/SettingsTab';

const ALL_PAIRS: PairSymbol[] = ['XAUUSD', 'EURUSD', 'AUDUSD', 'GBPUSD'];

export default function QuantTerminalPage() {
  const [activeTab, setActiveTab] = useState<'terminal' | 'risk' | 'history' | 'settings'>('terminal');
  const [isBotRunning, setIsBotRunning] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>('SIMULATOR');

  const [config, setConfig] = useState<BotConfig>({
    ssid: '',
    isDemo: true,
    useSimulator: true,
    activePairs: ALL_PAIRS,
    selectedPair: 'XAUUSD',
    expirySeconds: 120,
    riskPercent: 1.5,
    fixedStakeFallback: 15,
    minPayoutPercent: 82,
    cooldownCandles: 3,
    dailyStopLossPercent: 4.5,
    maxConsecutiveLosses: 3,
    dailyTakeProfitPercent: 6.0,
  });

  const [candlesMap, setCandlesMap] = useState<Record<PairSymbol, Candle[]>>({
    XAUUSD: [],
    EURUSD: [],
    AUDUSD: [],
    GBPUSD: [],
  });

  const [diagnosticsMap, setDiagnosticsMap] = useState<Record<PairSymbol, SignalDiagnostics | null>>({
    XAUUSD: null,
    EURUSD: null,
    AUDUSD: null,
    GBPUSD: null,
  });

  const [payouts, setPayouts] = useState<Record<PairSymbol, number>>({
    XAUUSD: 92,
    EURUSD: 88,
    AUDUSD: 86,
    GBPUSD: 88,
  });

  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [cooldownCountdown, setCooldownCountdown] = useState(0);

  const riskManagerRef = useRef<RiskManager>(new RiskManager(1000));
  const socketClientRef = useRef<PocketSocketClient | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const isBotRunningRef = useRef(isBotRunning);
  isBotRunningRef.current = isBotRunning;

  useEffect(() => {
    const initCandles: Record<PairSymbol, Candle[]> = { XAUUSD: [], EURUSD: [], AUDUSD: [], GBPUSD: [] };
    const initDiag: Record<PairSymbol, SignalDiagnostics | null> = { XAUUSD: null, EURUSD: null, AUDUSD: null, GBPUSD: null };
    const currentMinute = Math.floor(Date.now() / 60000) * 60;

    ALL_PAIRS.forEach((pair) => {
      let price = pair === 'XAUUSD' ? 2648.5 : pair === 'EURUSD' ? 1.0852 : pair === 'AUDUSD' ? 0.6584 : 1.2941;
      const step = pair === 'XAUUSD' ? 0.85 : 0.00035;
      const dec = pair === 'XAUUSD' ? 2 : 5;

      for (let i = 65; i >= 0; i--) {
        const time = currentMinute - i * 60;
        const open = price;
        const close = Number((open + (Math.random() - 0.495) * step).toFixed(dec));
        const high = Number((Math.max(open, close) + Math.random() * step * 0.6).toFixed(dec));
        const low = Number((Math.min(open, close) - Math.random() * step * 0.6).toFixed(dec));
        initCandles[pair].push({ time, open, high, low, close });
        price = close;
      }
      initDiag[pair] = StrategyEngine.evaluate(pair, initCandles[pair]);
    });

    setCandlesMap(initCandles);
    setDiagnosticsMap(initDiag);
  }, []);

  useEffect(() => {
    const socket = new PocketSocketClient(
      (pair, price, timestamp, livePayout) => handleIncomingTick(pair, price, timestamp, livePayout),
      (status) => setConnectionStatus(status)
    );
    socketClientRef.current = socket;
    socket.connect(config.ssid, config.useSimulator);
    return () => socket.disconnect();
  }, []);

  const handleIncomingTick = (pair: PairSymbol, price: number, timestamp: number, livePayout: number) => {
    setPayouts((prev) => ({ ...prev, [pair]: livePayout }));
    setCandlesMap((prev) => {
      const list = prev[pair] ?? [];
      if (list.length === 0) return prev;
      const last = list[list.length - 1];
      const candleMinute = Math.floor(timestamp / 60) * 60;

      const updatedList =
        candleMinute <= last.time
          ? [...list.slice(0, -1), { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }]
          : [...list.slice(-120), { time: candleMinute, open: last.close, high: price, low: price, close: price }];

      const diag = StrategyEngine.evaluate(pair, updatedList);
      setDiagnosticsMap((d) => ({ ...d, [pair]: diag }));

      if (diag.signal && isBotRunningRef.current && candleMinute > last.time) {
        executeSignal(pair, diag.signal, price, candleMinute, livePayout);
      }
      return { ...prev, [pair]: updatedList };
    });
  };

  const executeSignal = async (pair: PairSymbol, direction: TradeDirection, price: number, candleTime: number, payout: number) => {
    const riskCheck = riskManagerRef.current.canExecuteTrade(pair, payout, candleTime, configRef.current);
    if (!riskCheck.allowed) return;

    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}

    const tradeId = `trade_${Date.now()}`;
    const newTrade: TradeRecord = {
      id: tradeId,
      pair,
      direction,
      entryPrice: price,
      stake: riskCheck.stake,
      payoutPercent: payout,
      entryTime: Date.now(),
      expiryTime: Date.now() + configRef.current.expirySeconds * 1000,
      status: 'ACTIVE',
      profit: 0,
    };

    setTrades((prev) => [newTrade, ...prev]);
    riskManagerRef.current.registerExecution(pair, candleTime);
    setCooldownCountdown(configRef.current.cooldownCandles * 60);
    socketClientRef.current?.executeOrder(pair, direction, riskCheck.stake, configRef.current.expirySeconds);

    setTimeout(() => resolveTrade(tradeId, pair, direction, price, riskCheck.stake, payout), configRef.current.expirySeconds * 1000);
  };

  const handleManualExecute = (direction: TradeDirection) => {
    const pair = config.selectedPair;
    const list = candlesMap[pair];
    executeSignal(pair, direction, list[list.length - 1]?.close ?? 1.0, Math.floor(Date.now() / 60000) * 60, payouts[pair]);
  };

  const handleSimulateSweep = (direction: TradeDirection) => {
    const pair = config.selectedPair;
    const list = candlesMap[pair];
    if (list.length < 55) return;
    const last = list[list.length - 1];
    const step = pair === 'XAUUSD' ? 2.4 : 0.0012;
    const dec = pair === 'XAUUSD' ? 2 : 5;

    const swept: Candle =
      direction === 'CALL'
        ? { ...last, low: Number((last.close - step).toFixed(dec)), high: Number((last.close + step * 0.2).toFixed(dec)), close: Number((last.close + step * 0.05).toFixed(dec)) }
        : { ...last, high: Number((last.close + step).toFixed(dec)), low: Number((last.close - step * 0.2).toFixed(dec)), close: Number((last.close - step * 0.05).toFixed(dec)) };

    const updated = [...list.slice(0, -1), swept];
    setCandlesMap((prev) => ({ ...prev, [pair]: updated }));
    const diag = StrategyEngine.evaluate(pair, updated);
    setDiagnosticsMap((prev) => ({
      ...prev,
      [pair]: {
        ...diag,
        signal: direction,
        confluenceScore: 92,
        checklist: { trendAligned: true, liquiditySweep: true, fvgImbalance: true, oteFibZone: true, rsiExhaustion: true, atrRegimeClean: true },
        reason: `Institutional ${direction} Sweep Confirmed (92% Confluence)`,
      },
    }));
    executeSignal(pair, direction, swept.close, swept.time, payouts[pair]);
  };

  const resolveTrade = (id: string, pair: PairSymbol, dir: TradeDirection, entryPrice: number, stake: number, payout: number) => {
    setCandlesMap((latestMap) => {
      const candles = latestMap[pair];
      const currentPrice = candles[candles.length - 1]?.close ?? entryPrice;
      const isWin = (dir === 'CALL' && currentPrice > entryPrice) || (dir === 'PUT' && currentPrice < entryPrice);
      const finalStatus = isWin ? 'WIN' : currentPrice === entryPrice ? 'TIE' : 'LOSS';
      const outcome: TradeRecord = {
        id,
        pair,
        direction: dir,
        entryPrice,
        exitPrice: currentPrice,
        stake,
        payoutPercent: payout,
        entryTime: Date.now() - configRef.current.expirySeconds * 1000,
        expiryTime: Date.now(),
        status: finalStatus,
        profit: finalStatus === 'TIE' ? 0 : isWin ? stake * (payout / 100) : -stake,
      };
      riskManagerRef.current.recordOutcome(outcome);
      setTrades((prev) => prev.map((t) => (t.id === id ? outcome : t)));
      return latestMap;
    });
  };

  useEffect(() => {
    if (cooldownCountdown <= 0) return;
    const timer = setInterval(() => setCooldownCountdown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldownCountdown]);

  const handleExportCSV = async () => {
    const csv = 'ID,Pair,Direction,Stake,Payout%,Profit,Status,Timestamp\n' +
      trades.map((t) => `${t.id},${t.pair},${t.direction},${t.stake},${t.payoutPercent},${t.profit},${t.status},${new Date(t.entryTime).toISOString()}`).join('\n');
    try {
      await Filesystem.writeFile({ path: `trades_${Date.now()}.csv`, data: csv, directory: Directory.Documents, encoding: Encoding.UTF8 });
      alert('Trades CSV exported to Documents.');
    } catch {}
  };

  const activeTradeForPair = trades.find((t) => t.status === 'ACTIVE' && t.pair === config.selectedPair) ?? null;

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col px-3 pt-2.5 relative bg-obsidian-bg">
      <div className="flex-1">
        {activeTab === 'terminal' && (
          <TerminalTab
            selectedPair={config.selectedPair}
            onSelectPair={(p) => setConfig((prev) => ({ ...prev, selectedPair: p }))}
            connectionStatus={connectionStatus}
            isBotRunning={isBotRunning}
            onToggleBot={() => setIsBotRunning(!isBotRunning)}
            livePayout={payouts[config.selectedPair]}
            candles={candlesMap[config.selectedPair]}
            diagnostics={diagnosticsMap[config.selectedPair]}
            cooldownRemainingSeconds={cooldownCountdown}
            telemetry={riskManagerRef.current.getTelemetry()}
            activeTrade={activeTradeForPair}
            onManualExecute={handleManualExecute}
            onSimulateSweep={handleSimulateSweep}
          />
        )}
        {activeTab === 'risk' && (
          <RiskHUDTab
            telemetry={riskManagerRef.current.getTelemetry()}
            riskPercent={config.riskPercent}
            dailyStopLossPercent={config.dailyStopLossPercent}
            dailyTakeProfitPercent={config.dailyTakeProfitPercent}
          />
        )}
        {activeTab === 'history' && <TradeHistoryTab trades={trades} onExportCSV={handleExportCSV} />}
        {activeTab === 'settings' && (
          <SettingsTab
            config={config}
            onUpdateConfig={(c) => setConfig((prev) => ({ ...prev, ...c }))}


            onReconnect={() => socketClientRef.current?.connect(config.ssid, config.useSimulator)}
          />
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-obsidian-surface/95 backdrop-blur-2xl border-t border-obsidian-border px-6 py-2.5 flex justify-between items-center z-50">
        <button onClick={() => setActiveTab('terminal')} className={`flex flex-col items-center space-y-1 ${activeTab === 'terminal' ? 'text-neon-cyan' : 'text-slate-500'}`}>
          <Terminal className="w-5 h-5" />
          <span className="text-[10px] font-mono">TERMINAL</span>
        </button>
        <button onClick={() => setActiveTab('risk')} className={`flex flex-col items-center space-y-1 ${activeTab === 'risk' ? 'text-neon-cyan' : 'text-slate-500'}`}>
          <Shield className="w-5 h-5" />
          <span className="text-[10px] font-mono">RISK HUD</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center space-y-1 ${activeTab === 'history' ? 'text-neon-cyan' : 'text-slate-500'}`}>
          <History className="w-5 h-5" />
          <span className="text-[10px] font-mono">LEDGER</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center space-y-1 ${activeTab === 'settings' ? 'text-neon-cyan' : 'text-slate-500'}`}>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-mono">SETTINGS</span>
        </button>
      </nav>
    </main>
  );
}
