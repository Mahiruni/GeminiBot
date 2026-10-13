'use client';

import React, { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  SeriesMarker,
  IPriceLine,
} from 'lightweight-charts';
import { Candle, PairSymbol, SignalDiagnostics, TradeRecord } from '@/types/bot';

interface ChartCanvasProps {
  pair: PairSymbol;
  candles: Candle[];
  diagnostics: SignalDiagnostics | null;
  activeTrade: TradeRecord | null;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({
  pair,
  candles,
  diagnostics,
  activeTrade,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const strikeLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth || 340;
    const height = el.clientHeight || 260;

    const chart = createChart(el, {
      width,
      height,
      layout: {
        background: { color: '#07090E' },
        textColor: '#64748B',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        rightOffset: 3,
        barSpacing: 7,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: { top: 0.12, bottom: 0.15 },
      },
      crosshair: {
        vertLine: { color: 'rgba(56, 189, 248, 0.35)', width: 1 },
        horzLine: { color: 'rgba(56, 189, 248, 0.35)', width: 1 },
      },
    });

    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
      priceFormat: {
        type: 'price',
        precision: pair === 'XAUUSD' ? 2 : 5,
        minMove: pair === 'XAUUSD' ? 0.01 : 0.00001,
      },
    });

    emaSeriesRef.current = chart.addLineSeries({
      color: '#38BDF8',
      lineWidth: 2,
      priceLineVisible: false,
    });

    bbUpperSeriesRef.current = chart.addLineSeries({
      color: 'rgba(148, 163, 184, 0.32)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
    });

    bbLowerSeriesRef.current = chart.addLineSeries({
      color: 'rgba(148, 163, 184, 0.32)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
    });

    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: w, height: h });
        }
      }
    });

    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [pair]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    // Deduplicate & strictly sort by ascending timestamp so lightweight-charts never crashes
    const mapByTime = new Map<number, Candle>();
    for (const c of candles) {
      mapByTime.set(Math.floor(c.time / 60) * 60, {
        ...c,
        time: Math.floor(c.time / 60) * 60,
      });
    }
    const sorted = Array.from(mapByTime.values()).sort((a, b) => a.time - b.time);

    const formatted = sorted.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeriesRef.current.setData(formatted);

    if (
      sorted.length >= 50 &&
      emaSeriesRef.current &&
      bbUpperSeriesRef.current &&
      bbLowerSeriesRef.current
    ) {
      const k = 2 / 51;
      let ema = 

