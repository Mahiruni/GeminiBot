import { Candle, ConfluenceChecklist, PairSymbol, SignalDiagnostics } from '@/types/bot';

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
    const emptyChecklist: ConfluenceChecklist = {
      trendAligned: false,
      liquiditySweep: false,
      fvgImbalance: false,
      oteFibZone: false,
      rsiExhaustion: false,
      atrRegimeClean: true,
    };

    if (candles.length < 55) {
      const last = candles[candles.length - 1];
      return {
        pair,
        timestamp: last?.time ?? Math.floor(Date.now() / 1000),
        close: last?.close ?? 0,
        ema50: 0,
        bbUpper: 0,
        bbLower: 0,
        rsi7: 50,
        atr14: 0,
        oteHigh: 0,
        oteLow: 0,
        candleRange: 0,
        lowerWickRatio: 0,
        upperWickRatio: 0,
        confluenceScore: 0,
        checklist: emptyChecklist,
        atrSpikeBlocked: false,
        signal: null,
        reason: `Calibrating institutional microstructure (${candles.length}/55)`,
      };
    }

    const closes = candles.map((c) => c.close);
    const current = candles[candles.length - 1];
    const prev1 = candles[candles.length - 2];
    const prev3 = candles[candles.length - 4];
    const prior10 = candles.slice(-11, -1);
    const prior20 = candles.slice(-21, -1);

    const ema50 = this.calcEMA(closes, 50);
    const bb = this.calcBollingerBands(closes, 20, 2.0);
    const rsi7 = this.calcRSI(closes, 7);
    const atr14 = this.calcATR(candles, 14);

    const swingLow10 = Math.min(...prior10.map((c) => c.low));
    const swingHigh10 = Math.max(...prior10.map((c) => c.high));

    // 20-bar Dealing Range for OTE Fibonacci (0.618 - 0.786)
    const rangeLow20 = Math.min(...prior20.map((c) => c.low));
    const rangeHigh20 = Math.max(...prior20.map((c) => c.high));
    const dealingRange = Math.max(rangeHigh20 - rangeLow20, 1e-6);

    const bullOteTop = rangeHigh20 - dealingRange * 0.618;
    const bullOteBottom = rangeHigh20 - dealingRange * 0.85;
    const bearOteBottom = rangeLow20 + dealingRange * 0.618;
    const bearOteTop = rangeLow20 + dealingRange * 0.85;

    const candleRange = Math.max(current.high - current.low, 1e-6);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWickRatio = lowerWick / candleRange;
    const upperWickRatio = upperWick / candleRange;

    // 1. ATR Volatility Regime Filter
    const atrSpikeBlocked = candleRange > atr14 * 2.6 || candleRange < atr14 * 0.35;
    const atrRegimeClean = !atrSpikeBlocked;

    // 2. Fair Value Gap (FVG) / Displacement Imbalance
    const bullishFvg = prev3 ? current.low > prev3.high || prev1.low < bb.lower : false;
    const bearishFvg = prev3 ? current.high < prev3.low || prev1.high > bb.upper : false;

    // 3. OTE Fibonacci Pocket Check
    const inBullOte = current.low <= bullOteTop && current.close >= bullOteBottom;
    const inBearOte = current.high >= bearOteBottom && current.close <= bearOteTop;

    // 4. Liquidity Sweep & Wick Rejection
    const bullSweep =
      (current.low < bb.lower || current.low <= swingLow10) &&
      current.close > bb.lower &&
      lowerWickRatio >= 0.38;

    const bearSweep =
      (current.high > bb.upper || current.high >= swingHigh10) &&
      current.close < bb.upper &&
      upperWickRatio >= 0.38;

    // 5. Trend & RSI Exhaustion
    const bullTrend = current.close >= ema50 * 0.998;
    const bearTrend = current.close <= ema50 * 1.002;
    const bullRsi = rsi7 < 30;
    const bearRsi = rsi7 > 70;

    // Score Calculation (Bullish vs Bearish)
    const bullScore =
      (bullSweep ? 35 : 0) +
      (bullRsi ? 25 : 0) +
      (bullTrend ? 15 : 0) +
      (inBullOte ? 15 : 0) +
      (bullishFvg ? 10 : 0);

    const bearScore =
      (bearSweep ? 35 : 0) +
      (bearRsi ? 25 : 0) +
      (bearTrend ? 15 : 0) +
      (inBearOte ? 15 : 0) +
      (bearishFvg ? 10 : 0);

    const isBullDominant = bullScore >= bearScore;
    const rawScore = isBullDominant ? bullScore : bearScore;
    const confluenceScore = atrRegimeClean ? rawScore : Math.min(rawScore, 40);

    const checklist: ConfluenceChecklist = {
      trendAligned: isBullDominant ? bullTrend : bearTrend,
      liquiditySweep: isBullDominant ? bullSweep : bearSweep,
      fvgImbalance: isBullDominant ? bullishFvg : bearishFvg,
      oteFibZone: isBullDominant ? inBullOte : inBearOte,
      rsiExhaustion: isBullDominant ? bullRsi : bearRsi,
      atrRegimeClean,
    };

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
        oteHigh: bullOteTop,
        oteLow: bullOteBottom,
        candleRange,
        lowerWickRatio,
        upperWickRatio,
        confluenceScore,
        checklist,
        atrSpikeBlocked: true,
        signal: null,
        reason: 'ATR Guard: Volatility outside institutional bounds (0.35x - 2.6x)',
      };
    }

    if (bullSweep && bullRsi && bullTrend) {
      return {
        pair,
        timestamp: current.time,
        close: current.close,
        ema50,
        bbUpper: bb.upper,
        bbLower: bb.lower,
        rsi7,
        atr14,
        oteHigh: bullOteTop,
        oteLow: bullOteBottom,
        candleRange,
        lowerWickRatio,
        upperWickRatio,
        confluenceScore: Math.max(82, confluenceScore),
        checklist,
        atrSpikeBlocked: false,
        signal: 'CALL',
        reason: `CALL Executed: Sell-Side Liquidity Sweep + ${(lowerWickRatio * 100).toFixed(0)}% Wick + RSI ${rsi7.toFixed(1)}`,
      };
    }

    if (bearSweep && bearRsi && bearTrend) {
      return {
        pair,
        timestamp: current.time,
        close: current.close,
        ema50,
        bbUpper: bb.upper,
        bbLower: bb.lower,
        rsi7,
        atr14,
        oteHigh: bearOteTop,
        oteLow: bearOteBottom,
        candleRange,
        lowerWickRatio,
        upperWickRatio,
        confluenceScore: Math.max(82, confluenceScore),
        checklist,
        atrSpikeBlocked: false,
        signal: 'PUT',
        reason: `PUT Executed: Buy-Side Liquidity Sweep + ${(upperWickRatio * 100).toFixed(0)}% Wick + RSI ${rsi7.toFixed(1)}`,
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
      oteHigh: bullOteTop,
      oteLow: bullOteBottom,
      candleRange,
      lowerWickRatio,
      upperWickRatio,
      confluenceScore,
      checklist,
      atrSpikeBlocked: false,
      signal: null,
      reason: `Confluence ${confluenceScore}% — Scanning for stop-hunt & BB rejection`,
    };
  }
}
