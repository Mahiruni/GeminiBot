import { BotConfig, PairSymbol, RiskTelemetry, TradeRecord } from '@/types/bot';

export interface RiskCheckResult {
  allowed: boolean;
  stake: number;
  reason: string;
}

export class RiskManager {
  private startingDailyBalance: number;
  private currentBalance: number;
  private consecutiveLosses = 0;
  private lastTradeExecutionTime: Record<string, number> = {};
  private isHalted = false;
  private haltReason: string | null = null;

  constructor(initialBalance = 1000) {
    this.startingDailyBalance = initialBalance;
    this.currentBalance = initialBalance;
  }

  public recordOutcome(trade: TradeRecord) {
    if (trade.status === 'WIN') {
      this.consecutiveLosses = 0;
      this.currentBalance += trade.profit;
    } else if (trade.status === 'LOSS') {
      this.consecutiveLosses += 1;
      this.currentBalance += trade.profit;
    }
  }

  public registerExecution(pair: PairSymbol, timestampSeconds: number) {
    this.lastTradeExecutionTime[pair] = timestampSeconds;
  }

  public canExecuteTrade(
    symbol: string,
    livePayoutPercent: number,
    currentTimestampSeconds: number,
    config: BotConfig
  ): RiskCheckResult {
    if (this.isHalted) {
      return { allowed: false, stake: 0, reason: `Terminal Halted: ${this.haltReason}` };
    }

    if (symbol.toLowerCase().includes('_otc') || symbol.toLowerCase().includes('otc')) {
      return { allowed: false, stake: 0, reason: `OTC Blocker: ${symbol} is synthetic` };
    }

    if (livePayoutPercent < config.minPayoutPercent) {
      return {
        allowed: false,
        stake: 0,
        reason: `Payout Guard: Live payout ${livePayoutPercent}% < minimum ${config.minPayoutPercent}%`,
      };
    }

    const netPnL = this.currentBalance - this.startingDailyBalance;
    const drawdownPercent = (-netPnL / this.startingDailyBalance) * 100;

    if (drawdownPercent >= config.dailyStopLossPercent) {
      this.isHalted = true;
      this.haltReason = `Daily Max Drawdown reached (-${drawdownPercent.toFixed(2)}%)`;
      return { allowed: false, stake: 0, reason: this.haltReason };
    }

    if (this.consecutiveLosses >= config.maxConsecutiveLosses) {
      this.isHalted = true;
      this.haltReason = `Max consecutive losses reached (${this.consecutiveLosses})`;
      return { allowed: false, stake: 0, reason: this.haltReason };
    }

    const profitPercent = (netPnL / this.startingDailyBalance) * 100;
    if (profitPercent >= config.dailyTakeProfitPercent) {
      this.isHalted = true;
      this.haltReason = `Daily Take-Profit reached (+${profitPercent.toFixed(2)}%)`;
      return { allowed: false, stake: 0, reason: this.haltReason };
    }

    const lastTime = this.lastTradeExecutionTime[symbol] ?? 0;
    const elapsedSeconds = currentTimestampSeconds - lastTime;
    const requiredCooldownSeconds = config.cooldownCandles * 60;

    if (lastTime > 0 && elapsedSeconds < requiredCooldownSeconds) {
      const remainingSeconds = requiredCooldownSeconds - elapsedSeconds;
      return {
        allowed: false,
        stake: 0,
        reason: `Cooldown active on ${symbol}: ${remainingSeconds}s remaining`,
      };
    }

    const calculatedStake =
      this.currentBalance > 0
        ? (this.currentBalance * config.riskPercent) / 100
        : config.fixedStakeFallback;
    const finalStake = Math.max(1, Number(calculatedStake.toFixed(2)));

    return {
      allowed: true,
      stake: finalStake,
      reason: `Trade Authorized: Flat ${config.riskPercent}% ($${finalStake})`,
    };
  }

  public getTelemetry(): RiskTelemetry {
    const netPnL = this.currentBalance - this.startingDailyBalance;
    const pnlPercent = (netPnL / this.startingDailyBalance) * 100;
    return {
      startingDailyBalance: this.startingDailyBalance,
      currentBalance: this.currentBalance,
      netPnL,
      pnlPercent,
      consecutiveLosses: this.consecutiveLosses,
      isHalted: this.isHalted,
      haltReason: this.haltReason,
    };
  }
}
