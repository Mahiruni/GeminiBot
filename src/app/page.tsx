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
  TradeRecord,
} from '@/types/bot';
import { StrategyEngine } from '@/lib/strategy';
import { RiskManager } from '@/lib/riskManager';
import { PocketSocketClient } from '@/lib/pocketSocket';

import { TerminalTab } from '@/components/TerminalTab';
import { RiskHUDTab } from '@/components/RiskHUDTab';
import { TradeHistoryTab } from '@/components/TradeHistoryTab';
import { SettingsTab } from '@/components/SettingsTab';

export default function QuantTerminalPage() {
  const [activeTab, setActiveTab] = useState<'terminal' | 'risk' | 'history' | 'settings'>('terminal');
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>('DISCONNECTED');

  const [config, setConfig] = useState<BotConfig>({
    ssid: '',
    isDemo: true,
    useSimulator: true,
    activePairs: ['EURUSD', 'AUDUSD', 'GBPUSD'],
    selectedPair: 'EURUSD',
    expirySeconds: 180,
    riskPercent: 1.5,
    fixedStakeFallback: 10,
    minPayoutPercent: 82,
    cooldownCandles: 3,
    dailyStopLossPercent: 4.5,
    maxConsecutiveLosses: 3,
    dailyTakeProfitPercent: 6.0,
  });

  const [candlesMap, setCandlesMap] = useState<Record<PairSymbol, Candle[]>>({
    EURUSD: [],
    AUDUSD: [],
    GBPUSD: [],
  });

  const [diagnosticsMap, setDiagnosticsMap] = useState<Record<PairSymbol, SignalDiagnostics | null>>({
    EURUSD: null,
    AUDUSD: null,
    GBPUSD: null,
  });

  const [payouts, setPayouts] = useState<Record<PairSymbol, number>>({
    EURUSD: 86,
    AUDUSD: 86,
    GBPUSD: 86,
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
    const initCandles: Record<PairSymbol, Candle[]> = { EURUSD: [], AUDUSD: [], GBPUSD: [] };
    const now = Math.floor(Date.now() / 1000);

    (['EURUSD', 'AUDUSD', 'GBPUSD'] as PairSymbol[]).forEach((pair) => {
      let price = pair === 'EURUSD' ? 1.085 : pair === 'AUDUSD' ? 0.658 : 1.294;
      for (let i = 60; i >= 0; i--) {
        const time = now - i * 60;
        const open = price;
        const high = open + Math.random() * 0.0004;
        const low = open - Math.random() * 0.0004;
        const close = low + Math.random() * (high - low);
        initCandles[pair].push({ time, open, high, low, close });
        price = close;
      }
    });

    setCandlesMap(initCandles);
  }, []);

  useEffect(() => {
    const socket = new PocketSocketClient(
      (pair, price, timestamp, livePayout) => {
        handleIncomingTick(pair, price, timestamp, livePayout);
      },
      (status) => {
        setConnectionStatus(status);
      }
    );

    socketClientRef.current = socket;
    socket.connect(config.ssid, config.useSimulator);

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleIncomingTick = (
    pair: PairSymbol,
    price: number,
    timestamp: number,
    livePayout: number
  ) => {
    setPayouts((prev) => ({ ...prev, [pair]: livePayout }));

    setCandlesMap((prev) => {
      const currentList = prev[pair] ?? [];
      if (currentList.length === 0) return prev;

      const lastCandle = currentList[currentList.length - 1];
      const candleMinute = Math.floor(timestamp / 60) * 60;

      let updatedList: Candle[];

      if (lastCandle.time === candleMinute) {
        const updatedCandle: Candle = {
          ...lastCandle,
          high: Math.max(lastCandle.high, price),
          low: Math.min(lastCandle.low, price),
          close: price,
        };
        updatedList = [...currentList.slice(0, -1), updatedCandle];
      } else {
        const newCandle: Candle = {
          time: candleMinute,
          open: price,
          high: price,
          low: price,
          close: price,
        };
        updatedList = [...currentList, newCandle];

        const diag = StrategyEngine.evaluate(pair, currentList);
        setDiagnosticsMap((d) => ({ ...d, [pair]: diag }));

        if (diag.signal && isBotRunningRef.current) {
          executeSignal(pair, diag.signal, price, candleMinute, livePayout);
        }
      }

      return { ...prev, [pair]: updatedList };
    });
  };

  const executeSignal = async (
    pair: PairSymbol,
    direction: 'CALL' | 'PUT',
    price: number,
    candleTime: number,
    payout: number
  ) => {
    const riskCheck = riskManagerRef.current.canExecuteTrade(
      pair,
      payout,
      candleTime,
      configRef.current
    );

    if (!riskCheck.allowed) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {}

    const tradeId = `trade_${Date.now()}`;
    const expiryTime = Date.now() + configRef.current.expirySeconds * 1000;

    const newTrade: TradeRecord = {
      id: tradeId,
      pair,
      direction,
      entryPrice: price,
      stake: riskCheck.stake,
      payoutPercent: payout,
      entryTime: Date.now(),
      expiryTime,
      status: 'ACTIVE',
      profit: 0,
    };

    setTrades((prev) => [newTrade, ...prev]);
    riskManagerRef.current.registerExecution(pair, candleTime);
    setCooldownCountdown(configRef.current.cooldownCandles * 60);

    socketClientRef.current?.executeOrder(
      pair,
      direction,
      riskCheck.stake,
      configRef.current.expirySeconds
    );

    setTimeout(() => {
      resolveTrade(tradeId, pair, direction, price, riskCheck.stake, payout);
    }, configRef.current.expirySeconds * 1000);
  };

  const resolveTrade = (
    id: string,
    pair: PairSymbol,
    dir: 'CALL' | 'PUT',
    entryPrice: number,
    stake: number,
    payout: number
  ) => {
    setCandlesMap((latestMap) => {
      const candles = latestMap[pair];
      const currentPrice = candles[candles.length - 1]?.close ?? entryPrice;

      let isWin = false;
      if (dir === 'CALL' && currentPrice > entryPrice) isWin = true;
      if (dir === 'PUT' && currentPrice < entryPrice) isWin = true;

      const profit = isWin ? stake * (payout / 100) : -stake;
      const finalStatus = isWin ? 'WIN' : currentPrice === entryPrice ? 'TIE' : 'LOSS';

      const outcomeRecord: TradeRecord = {
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
        profit: finalStatus === 'TIE' ? 0 : profit,
      };

      riskManagerRef.current.recordOutcome(outcomeRecord);
      setTrades((prev) => prev.map((t) => (t.id === id ? outcomeRecord : t)));
      return latestMap;
    });
  };

  useEffect(() => {
    if (cooldownCountdown <= 0) return;
    const timer = setInterval(() => {
      setCooldownCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownCountdown]);

  const handleExportCSV = async () => {
    const headers = 'ID,Pair,Direction,Stake,Payout%,Profit,Status,Timestamp\n';
    const rows = trades
      .map(
        (t) =>
          `${t.id},${t.pair},${t.direction},${t.stake},${t.payoutPercent},${t.profit},${t.status},${new Date(t.entryTime).toISOString()}`
      )
      .join('\n');
    const csvContent = headers + rows;

    try {
      await Filesystem.writeFile({
        path: `trades_${Date.now()}.csv`,
        data: csvContent,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      alert('Trades CSV exported to Documents.');
    } catch {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trades_export_${Date.now()}.csv`;
      a.click();
    }
  };

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col px-3.5 pt-3 relative bg-obsidian-bg">
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

        {activeTab === 'history' && (
          <TradeHistoryTab trades={trades} onExportCSV={handleExportCSV} />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            config={config}
            onUpdateConfig={(c) => setConfig((prev) => ({ ...prev, ...c }))}
            onReconnect={() => socketClientRef.current?.connect(config.ssid, config.useSimulator)}
          />
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-obsidian-surface/95 backdrop-blur-2xl border-t border-obsidian-border px-6 py-2.5 flex justify-between items-center z-50">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex flex-col items-center space-y-1 ${
            activeTab === 'terminal' ? 'text-neon-cyan' : 'text-slate-500'
          }`}
        >
          <Terminal className="w-5 h-5" />
          <span className="text-[10px] font-mono">TERMINAL</span>
        </button>

        <button
          onClick={() => setActiveTab('risk')}
          className={`flex flex-col items-center space-y-1 ${
            activeTab === 'risk' ? 'text-neon-cyan' : 'text-slate-500'
          }`}
        >
          <Shield className="w-5 h-5" />
          <span className="text-[10px] font-mono">RISK HUD</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center space-y-1 ${
            activeTab === 'history' ? 'text-neon-cyan' : 'text-slate-500'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] font-mono">LEDGER</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center space-y-1 ${
            activeTab === 'settings' ? 'text-neon-cyan' : 'text-slate-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-mono">SETTINGS</span>
        </button>
      </nav>
    </main>
  );
}
