'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, UTCTimestamp, SeriesMarker } from 'lightweight-charts';
import { Candle, SignalDiagnostics } from '@/types/bot';

interface ChartCanvasProps {
  candles: Candle[];
  diagnostics: SignalDiagnostics | null;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({ candles, diagnostics }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#07090E' },
        textColor: '#64748B',
        fontSize: 11,
        fontFamily: 'JetBrains Mono',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: { top: 0.15, bottom: 0.2 },
      },
    });

    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
    });

    emaSeriesRef.current = chart.addLineSeries({
      color: '#38BDF8',
      lineWidth: 2,
    });

    bbUpperSeriesRef.current = chart.addLineSeries({
      color: 'rgba(255, 255, 255, 0.25)',
      lineWidth: 1,
      lineStyle: 2,
    });

    bbLowerSeriesRef.current = chart.addLineSeries({
      color: 'rgba(255, 255, 255, 0.25)',
      lineWidth: 1,
      lineStyle: 2,
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const formattedCandles = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeriesRef.current.setData(formattedCandles);

    if (candles.length >= 50 && emaSeriesRef.current && bbUpperSeriesRef.current && bbLowerSeriesRef.current) {
      const k = 2 / 51;
      let ema = candles.slice(0, 50).reduce((a, b) => a + b.close, 0) / 50;
      const emaData = [{ time: candles[49].time as UTCTimestamp, value: ema }];

      for (let i = 50; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
        emaData.push({ time: candles[i].time as UTCTimestamp, value: ema });
      }
      emaSeriesRef.current.setData(emaData);

      const upperData: { time: UTCTimestamp; value: number }[] = [];
      const lowerData: { time: UTCTimestamp; value: number }[] = [];

      for (let i = 19; i < candles.length; i++) {
        const slice = candles.slice(i - 19, i + 1).map((c) => c.close);
        const mean = slice.reduce((a, b) => a + b, 0) / 20;
        const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / 20;
        const std = Math.sqrt(variance);
        upperData.push({ time: candles[i].time as UTCTimestamp, value: mean + 2 * std });
        lowerData.push({ time: candles[i].time as UTCTimestamp, value: mean - 2 * std });
      }

      bbUpperSeriesRef.current.setData(upperData);
      bbLowerSeriesRef.current.setData(lowerData);
    }

    if (diagnostics?.signal && candleSeriesRef.current) {
      const last = candles[candles.length - 1];
      const markers: SeriesMarker<UTCTimestamp>[] = [
        {
          time: last.time as UTCTimestamp,
          position: diagnostics.signal === 'CALL' ? 'belowBar' : 'aboveBar',
          color: diagnostics.signal === 'CALL' ? '#10B981' : '#F43F5E',
          shape: diagnostics.signal === 'CALL' ? 'arrowUp' : 'arrowDown',
          text: diagnostics.signal,
        },
      ];
      candleSeriesRef.current.setMarkers(markers);
    }
  }, [candles, diagnostics]);

  return <div ref={containerRef} className="w-full h-full relative" />;
};
