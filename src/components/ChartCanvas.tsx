'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, UTCTimestamp, SeriesMarker, IPriceLine } from 'lightweight-charts';
import { Candle, PairSymbol, SignalDiagnostics, TradeRecord } from '@/types/bot';

interface Props {
  pair: PairSymbol;
  candles: Candle[];
  diagnostics: SignalDiagnostics | null;
  activeTrade: TradeRecord | null;
}

export const ChartCanvas: React.FC<Props> = ({ pair, candles, diagnostics, activeTrade }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const emaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowRef = useRef<ISeriesApi<'Line'> | null>(null);
  const strikeRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth || 340,
      height: el.clientHeight || 250,
      layout: { background: { color: '#07090E' }, textColor: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: 'rgba(255,255,255,0.08)', rightOffset: 3, barSpacing: 7 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)', scaleMargins: { top: 0.12, bottom: 0.15 } },
    });

    candleRef.current = chart.addCandlestickSeries({
      upColor: '#10B981', downColor: '#F43F5E', borderVisible: false, wickUpColor: '#10B981', wickDownColor: '#F43F5E',
      priceFormat: { type: 'price', precision: pair === 'XAUUSD' ? 2 : 5, minMove: pair === 'XAUUSD' ? 0.01 : 0.00001 },
    });
    emaRef.current = chart.addLineSeries({ color: '#38BDF8', lineWidth: 2, priceLineVisible: false });
    bbUpRef.current = chart.addLineSeries({ color: 'rgba(148,163,184,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false });
    bbLowRef.current = chart.addLineSeries({ color: 'rgba(148,163,184,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false });
    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width > 0 && e.contentRect.height > 0) {
          chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
        }
      }
    });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [pair]);

  useEffect(() => {
    if (!candleRef.current || !candles.length) return;
    const map = new Map<number, Candle>();
    candles.forEach((c) => { const t = Math.floor(c.time / 60) * 60; map.set(t, { ...c, time: t }); });
    const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);

    candleRef.current.setData(sorted.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));

    if (sorted.length >= 50 && emaRef.current && bbUpRef.current && bbLowRef.current) {
      const k = 2 / 51;
      let ema = sorted.slice(0, 50).reduce((a, b) => a + b.close, 0) / 50;
      const emaArr = [{ time: sorted[49].time as UTCTimestamp, value: ema }];
      for (let i = 50; i < sorted.length; i++) {
        ema = sorted[i].close * k + ema * (1 - k);
        emaArr.push({ time: sorted[i].time as UTCTimestamp, value: ema });
      }
      emaRef.current.setData(emaArr);

      const up: { time: UTCTimestamp; value: number }[] = [], low: { time: UTCTimestamp; value: number }[] = [];
      for (let i = 19; i < sorted.length; i++) {
        const sl = sorted.slice(i - 19, i + 1).map((c) => c.close);
        const m = sl.reduce((a, b) => a + b, 0) / 20;
        const std = Math.sqrt(sl.reduce((s, v) => s + Math.pow(v - m, 2), 0) / 20);
        up.push({ time: sorted[i].time as UTCTimestamp, value: m + 2 * std });
        low.push({ time: sorted[i].time as UTCTimestamp, value: m - 2 * std });
      }
      bbUpRef.current.setData(up);
      bbLowRef.current.setData(low);
    }

    if (strikeRef.current) { candleRef.current.removePriceLine(strikeRef.current); strikeRef.current = null; }
    if (activeTrade && activeTrade.pair === pair) {
      strikeRef.current = candleRef.current.createPriceLine({
        price: activeTrade.entryPrice, color: activeTrade.direction === 'CALL' ? '#10B981' : '#F43F5E',
        lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: `${activeTrade.direction} $${activeTrade.stake}`,
      });
    }

    if (diagnostics?.signal && sorted.length) {
      const last = sorted[sorted.length - 1];
      const markers: SeriesMarker<UTCTimestamp>[] = [{
        time: last.time as UTCTimestamp,
        position: diagnostics.signal === 'CALL' ? 'belowBar' : 'aboveBar',
        color: diagnostics.signal === 'CALL' ? '#10B981' : '#F43F5E',
        shape: diagnostics.signal === 'CALL' ? 'arrowUp' : 'arrowDown',
        text: `${diagnostics.signal} (${diagnostics.confluenceScore}%)`,
      }];
      candleRef.current.setMarkers(markers);
    }
  }, [candles, diagnostics, activeTrade, pair]);

  return <div ref={boxRef} className="w-full h-[250px] relative" />;
};
