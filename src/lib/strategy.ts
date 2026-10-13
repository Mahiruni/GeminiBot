import { Candle, PairSymbol, SignalDiagnostics } from '@/types/bot';

export class StrategyEngine {
  private static calcEMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] ?? 0;
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private static calcBollingerBands(closes: number[], period = 20, stdDevMult = 2.0) {
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / slice.length;
    const stdDev = Math.sqrt(variance);
    return {
      middle: mean,
      upper: mean + stdDevMult * stdDev,
      lower: mean - stdDevMult * stdDev,
    };
  }

  private static calcRSI(closes: number[], period = 7): number {
    if (closes.length <= period) return 50;
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private static calcATR(candles: Candle[], period = 14): number {
    if (candles.length <= period) return 0.0005;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - prevClose),
        Math.abs(current.low - prevClose)
      );
      trs.push(tr);
    }
    const recentTRs = trs.slice(-period);
    return recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
  }

  public static evaluate(pair: PairSymbol, candles: Candle[]): SignalDiagnostics {
    if (candles.length < 55) {
      const last = candles[candles.length - 1];
      return {
        pair,
        timestamp: last?.time ?? Date.now(),
        close: last?.close ?? 0,
        ema50: 0,
        bbUpper: 0,
        bbLower: 0,
        rsi7: 50,
        atr14: 0,
        candleRange: 0,
        lowerWickRatio: 0,
        upperWickRatio: 0,
        atrSpikeBlocked: false,
        signal: null,
        reason: `Gathering candles (${candles.length}/55)`,
      };
    }

    const closes = candles.map((c) => c.close);
    const current = candles[candles.length - 1];
    const prior10 = candles.slice(-11, -1);

    const ema50 = this.calcEMA(closes, 50);
    const bb = this.calcBollingerBands(closes, 20, 2.0);
    const rsi7 = this.calcRSI(closes, 7);
    const atr14 = this.calcATR(candles, 14);

    const swingLow10 = Math.min(...prior10.map((c) => c.low));
    const swingHigh10 = Math.max(...prior10.map((c) => c.high));

    const candleRange = Math.max(current.high - current.low, 1e-6);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWickRatio = lowerWick / candleRange;
    const upperWickRatio = upperWick / candleRange;

    const atrSpikeBlocked = candleRange > atr14 * 2.5 || candleRange < atr14 * 0.4;
    if (atrSpikeBlocked) {
      return {
        pair,
        timestamp: current.time,
        close: current.close,
        ema50,
        bbUpper: bb.upper,
        bbLower: bb.lower,
        rsi7,
        atr14,
        candleRange,
        lowerWickRatio,
        upperWickRatio,
        atrSpikeBlocked: true,
        signal: null,
        reason: 'Blocked: Candle range outside volatility filter (0.4x - 2.5x ATR)',
      };
    }

    const callTrend = current.close >= ema50 * 0.9985;
    const callSweep =
      current.low < bb.lower &&
      current.low < swingLow10 &&
      current.close > bb.lower &&
      lowerWickRatio >= 0.4;
    const callRsi = rsi7 < 28;

    if (callTrend && callSweep && callRsi) {
      return {
        pair,
        timestamp: current.time,
        close: current.close,
        ema50,
        bbUpper: bb.upper,
        bbLower: bb.lower,
        rsi7,
        atr14,
        candleRange,
        lowerWickRatio,
        upperWickRatio,
        atrSpikeBlocked: false,
        signal: 'CALL',
        reason: 'Bullish Liquidity Sweep + Lower BB Rejection + RSI Exhaustion',
      };
    }

    const putTrend = current.close <= ema50 * 1.0015;
    const putSweep =
      current.high > bb.upper &&
      current.high > swingHigh10 &&
      current.close < bb.upper &&
      upperWickRatio >= 0.4;
    const putRsi = rsi7 > 72;

    if (putTrend && putSweep && putRsi) {
      return {
        pair,
        timestamp: current.time,
        close: current.close,
        ema50,
        bbUpper: bb.upper,
        bbLower: bb.lower,
        rsi7,
        atr14,
        candleRange,
        lowerWickRatio,
        upperWickRatio,
        atrSpikeBlocked: false,
        signal: 'PUT',
        reason: 'Bearish Liquidity Sweep + Upper BB Rejection + RSI Exhaustion',
      };
    }

    return {
      pair,
      timestamp: current.time,
      close: current.close,
      ema50,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      rsi7,
      atr14,
      candleRange,
      lowerWickRatio,
      upperWickRatio,
      atrSpikeBlocked: false,
      signal: null,
      reason: 'Monitoring price action for liquidity extremes',
    };
  }
}
