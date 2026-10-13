export type PairSymbol = 'XAUUSD' | 'EURUSD' | 'AUDUSD' | 'GBPUSD';
export type TradeDirection = 'CALL' | 'PUT';
export type TradeStatus = 'ACTIVE' | 'WIN' | 'LOSS' | 'TIE';
export type SocketConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'SIMULATOR';

export interface Candle {
  time: number; // Strictly 60s-aligned Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ConfluenceChecklist {
  trendAligned: boolean;
  liquiditySweep: boolean;
  fvgImbalance: boolean;
  oteFibZone: boolean;
  rsiExhaustion: boolean;
  atrRegimeClean: boolean;
}

export interface SignalDiagnostics {
  pair: PairSymbol;
  timestamp: number;
  close: number;
  ema50: number;
  bbUpper: number;
  bbLower: number;
  rsi7: number;
  atr14: number;
  oteHigh: number;
  oteLow: number;
  candleRange: number;
  lowerWickRatio: number;
  upperWickRatio: number;
  confluenceScore: number; // 0 to 100
  checklist: ConfluenceChecklist;
  atrSpikeBlocked: boolean;
  signal: TradeDirection | null;
  reason: string;
}

export interface BotConfig {
  ssid: string;
  isDemo: boolean;
  useSimulator: boolean;
  activePairs: PairSymbol[];
  selectedPair: PairSymbol;
  expirySeconds: 60 | 120 | 180;
  riskPercent: number;
  fixedStakeFallback: number;
  minPayoutPercent: number;
  cooldownCandles: number;
  dailyStopLossPercent: number;
  maxConsecutiveLosses: number;
  dailyTakeProfitPercent: number;
}

export interface TradeRecord {
  id: string;
  pair: PairSymbol;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice?: number;
  stake: number;
  payoutPercent: number;
  entryTime: number;
  expiryTime: number;
  status: TradeStatus;
  profit: number;
}

export interface RiskTelemetry {
  startingDailyBalance: number;
  currentBalance: number;
  netPnL: number;
  pnlPercent: number;
  consecutiveLosses: number;
  isHalted: boolean;
  haltReason: string | null;
}
