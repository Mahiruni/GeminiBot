export type PairSymbol = 'EURUSD' | 'AUDUSD' | 'GBPUSD';
export type TradeDirection = 'CALL' | 'PUT';
export type TradeStatus = 'ACTIVE' | 'WIN' | 'LOSS' | 'TIE';
export type SocketConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'SIMULATOR';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
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
  candleRange: number;
  lowerWickRatio: number;
  upperWickRatio: number;
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
  expirySeconds: 120 | 180;
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
