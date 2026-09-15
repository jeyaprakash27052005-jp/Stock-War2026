import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Candle, Stock, FnoUnderlying, Transaction, FnoTransaction } from '../types';
import { inr } from '../marketData';

interface CandleChartProps {
  stocks: Stock[];
  indices: FnoUnderlying[];
  commodities: FnoUnderlying[];
  equityTransactions: Transaction[];
  fnoTransactions: FnoTransaction[];
}

type Timeframe = '1m' | '5m' | '15m' | '1h';
type ChartType = 'candle' | 'line' | 'bar';

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60000,
  '5m': 5 * 60000,
  '15m': 15 * 60000,
  '1h': 60 * 60000
};

const HISTORY_LENGTH = 180; // candles kept in memory per symbol/timeframe
const MIN_VISIBLE = 15;
const MAX_VISIBLE = 150;
const DEFAULT_VISIBLE = 55;

function sma(values: number[], period: number, uptoIndex: number): number | null {
  if (uptoIndex + 1 < period) return null;
  let sum = 0;
  for (let i = uptoIndex - period + 1; i <= uptoIndex; i++) sum += values[i];
  return sum / period;
}

// Volume-weighted average price, computed cumulatively from the start of the
// loaded candle buffer (acts as the "session" VWAP resets on a real intraday chart).
function computeVWAP(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cumPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const typicalPrice = (c.h + c.l + c.c) / 3;
    cumPV += typicalPrice * c.v;
    cumVol += c.v;
    out.push(cumVol > 0 ? cumPV / cumVol : null);
  }
  return out;
}

export const CandleChart: React.FC<CandleChartProps> = ({
  stocks,
  indices,
  commodities,
  equityTransactions,
  fnoTransactions
}) => {
  const [selectedSym, setSelectedSym] = useState<string>('NIFTY');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [showMA, setShowMA] = useState<boolean>(true);
  const [showVWAP, setShowVWAP] = useState<boolean>(true);
  const scaleRef = useRef<{ pMin: number; pMax: number; marginT: number; marginB: number; priceH: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  // Viewport state: how many candles are shown (zoom) and how far back we've panned
  const [visibleCount, setVisibleCount] = useState<number>(DEFAULT_VISIBLE);
  const [viewOffset, setViewOffset] = useState<number>(0);
  const dragState = useRef<{ startX: number; startOffset: number; slotWidth: number } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; index: number } | null>(null);

  const allSymbols = [
    ...indices.map(i => ({ sym: i.sym, name: i.name, type: 'Index' })),
    ...commodities.map(c => ({ sym: c.sym, name: c.name, type: 'Commodity' })),
    ...stocks.map(s => ({ sym: s.sym, name: s.name, type: 'Equity' }))
  ];

  const getSpot = useCallback((sym: string): number => {
    const st = stocks.find(s => s.sym === sym);
    if (st) return st.ltp;
    const ind = indices.find(i => i.sym === sym);
    if (ind && typeof ind.spot === 'number') return ind.spot;
    const cmd = commodities.find(c => c.sym === sym);
    if (cmd && typeof cmd.spot === 'number') return cmd.spot;
    return 1000;
  }, [stocks, indices, commodities]);

  const getPrevClose = useCallback((sym: string): number | null => {
    const st = stocks.find(s => s.sym === sym);
    if (st && typeof st.prevClose === 'number') return st.prevClose;
    const ind = indices.find(i => i.sym === sym);
    if (ind && typeof ind.prevSpot === 'number') return ind.prevSpot;
    const cmd = commodities.find(c => c.sym === sym);
    if (cmd && typeof cmd.prevSpot === 'number') return cmd.prevSpot;
    return null;
  }, [stocks, indices, commodities]);

  const currentLivePrice = getSpot(selectedSym);
  const prevClose = getPrevClose(selectedSym);

  const currentTickDir = (() => {
    const st = stocks.find(s => s.sym === selectedSym);
    if (st) return st.tickDirection;
    const ind = indices.find(i => i.sym === selectedSym);
    if (ind) return ind.tickDirection;
    const cmd = commodities.find(c => c.sym === selectedSym);
    if (cmd) return cmd.tickDirection;
    return 'same';
  })();

  // Pixel Y for the live price overlay, derived from the price-axis scale that the
  // canvas last drew with. Recomputed every render so the HTML overlay (which has a
  // CSS transition on `top`) smoothly glides to the new position instead of jumping.
  const overlayY = (() => {
    const s = scaleRef.current;
    if (!s) return null;
    const plotPriceH = s.priceH - s.marginT - s.marginB;
    const clamped = Math.min(s.pMax, Math.max(s.pMin, currentLivePrice));
    return s.marginT + plotPriceH - ((clamped - s.pMin) / (s.pMax - s.pMin || 1)) * plotPriceH;
  })();
  const overlayColor = currentTickDir === 'down' ? '#E2564F' : '#2FBF71';

  // Seed a full history buffer whenever the symbol or timeframe changes
  useEffect(() => {
    const basePrice = getSpot(selectedSym);
    const bucketMs = TIMEFRAME_MS[timeframe];
    const now = Math.floor(Date.now() / bucketMs) * bucketMs;
    const generated: Candle[] = [];
    let p = basePrice * (0.94 + Math.random() * 0.03);
    const volScale = Math.sqrt(bucketMs / 60000); // bigger timeframe -> bigger swings & volume

    for (let i = HISTORY_LENGTH - 1; i >= 1; i--) {
      const t = now - i * bucketMs;
      const o = p;
      const drift = (Math.random() - 0.495) * (basePrice * 0.006) * volScale;
      const c = Number(Math.max(0.01, o + drift).toFixed(2));
      const h = Number((Math.max(o, c) + Math.random() * (basePrice * 0.003) * volScale).toFixed(2));
      const l = Number((Math.min(o, c) - Math.random() * (basePrice * 0.003) * volScale).toFixed(2));
      const v = Math.round((5000 + Math.random() * 45000) * volScale * (1 + Math.abs(drift) / (basePrice * 0.006 || 1)));
      generated.push({ t, o, h, l, c, v });
      p = c;
    }
    // Current live (still-forming) candle
    generated.push({
      t: now,
      o: p,
      h: Math.max(p, basePrice),
      l: Math.min(p, basePrice),
      c: basePrice,
      v: Math.round(3000 + Math.random() * 8000)
    });
    setCandles(generated);
    setViewOffset(0);
    setVisibleCount(DEFAULT_VISIBLE);
  }, [selectedSym, timeframe, getSpot]);

  // Live tick updates: roll into a new bucket once the timeframe interval elapses,
  // otherwise update the high/low/close/volume of the currently-forming candle.
  useEffect(() => {
    if (!currentLivePrice || candles.length === 0) return;
    const bucketMs = TIMEFRAME_MS[timeframe];

    setCandles(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const now = Date.now();

      if (now - last.t >= bucketMs) {
        const newCandle: Candle = {
          t: Math.floor(now / bucketMs) * bucketMs,
          o: currentLivePrice,
          h: currentLivePrice,
          l: currentLivePrice,
          c: currentLivePrice,
          v: Math.round(200 + Math.random() * 800)
        };
        return [...prev.slice(1), newCandle];
      }

      const updatedLast: Candle = {
        ...last,
        c: currentLivePrice,
        h: Math.max(last.h, currentLivePrice),
        l: Math.min(last.l, currentLivePrice),
        v: last.v + Math.round(50 + Math.random() * 300)
      };
      return [...prev.slice(0, -1), updatedLast];
    });
  }, [currentLivePrice, timeframe]);

  // Zoom with the mouse wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setVisibleCount(prev => {
      const next = prev + (e.deltaY > 0 ? 6 : -6);
      return Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, next));
    });
  };

  // Pan by dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const plotW = canvas.width - 65 - 70;
    dragState.current = {
      startX: e.clientX,
      startOffset: viewOffset,
      slotWidth: plotW / visibleCount
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (dragState.current) {
      const dx = e.clientX - dragState.current.startX;
      const candleDelta = Math.round(-dx / (dragState.current.slotWidth || 1));
      const maxOffset = Math.max(0, candles.length - visibleCount);
      setViewOffset(Math.max(0, Math.min(maxOffset, dragState.current.startOffset + candleDelta)));
    }

    const marginL = 65;
    const marginR = 70;
    const plotW = canvas.width - marginL - marginR;
    const total = candles.length;
    const start = Math.max(0, total - visibleCount - viewOffset);
    const end = Math.max(start, total - viewOffset);
    const visible = candles.slice(start, end);
    if (visible.length === 0) return;
    const slot = plotW / visible.length;
    const idxInView = Math.max(0, Math.min(visible.length - 1, Math.floor((x - marginL) / slot)));
    setCrosshair({ x, y, index: start + idxInView });
  };

  const handleMouseUp = () => {
    dragState.current = null;
  };

  const handleMouseLeave = () => {
    dragState.current = null;
    setCrosshair(null);
  };

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = containerRef.current?.clientWidth || 700;
    const priceH = 300;
    const volH = 80;
    const height = priceH + volH;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const total = candles.length;
    const start = Math.max(0, total - visibleCount - viewOffset);
    const end = Math.max(start, total - viewOffset);
    const visible = candles.slice(start, end);
    if (visible.length === 0) return;

    // Trade entries for this symbol
    const entries = [
      ...equityTransactions.filter(t => t.sym === selectedSym).map(t => ({ time: t.time, price: t.price, side: t.side })),
      ...fnoTransactions.filter(t => t.underlying === selectedSym).map(t => ({ time: t.time, price: t.spotAtEntry, side: t.side }))
    ];

    let pMin = Math.min(...visible.map(c => c.l));
    let pMax = Math.max(...visible.map(c => c.h));
    entries.forEach(e => {
      if (e.time >= visible[0].t) {
        pMin = Math.min(pMin, e.price);
        pMax = Math.max(pMax, e.price);
      }
    });
    const pad = (pMax - pMin) * 0.12 || pMax * 0.02;
    pMin -= pad;
    pMax += pad;

    const maxVol = Math.max(...visible.map(c => c.v), 1);

    const marginL = 65;
    const marginR = 70;
    const marginT = 16;
    const marginB = 18;
    const plotW = width - marginL - marginR;
    const plotPriceH = priceH - marginT - marginB;
    const volTop = priceH + 10;
    const plotVolH = volH - 20;

    const n = visible.length;
    const slot = plotW / n;
    const bodyW = Math.max(2, Math.min(14, slot * 0.62));

    const yOf = (val: number) => marginT + plotPriceH - ((val - pMin) / (pMax - pMin || 1)) * plotPriceH;
    const xOf = (i: number) => marginL + slot * i + slot / 2;

    // Expose the current price-axis scale so the HTML overlay (smoothly-animated
    // live price line/badge) can position itself in sync with the canvas.
    scaleRef.current = { pMin, pMax, marginT, marginB, priceH };

    // --- Price panel grid ---
    ctx.strokeStyle = '#1F2A33';
    ctx.fillStyle = '#6B7680';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const p = pMin + ((pMax - pMin) * i) / 4;
      const y = yOf(p);
      ctx.beginPath();
      ctx.moveTo(marginL, y);
      ctx.lineTo(width - marginR, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(p >= 1000 ? 0 : 2), 6, y + 3);
    }

    // Time axis labels (a handful across the visible window)
    const labelStep = Math.max(1, Math.round(n / 6));
    for (let i = 0; i < n; i += labelStep) {
      const c = visible[i];
      const d = new Date(c.t);
      const label = timeframe === '1h'
        ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
      ctx.fillStyle = '#6B7680';
      ctx.fillText(label, xOf(i) - 14, priceH - 3);
    }

    // --- Volume panel ---
    ctx.strokeStyle = '#1F2A33';
    ctx.beginPath();
    ctx.moveTo(marginL, priceH);
    ctx.lineTo(width - marginR, priceH);
    ctx.stroke();

    visible.forEach((c, i) => {
      const x = xOf(i);
      const isBull = c.c >= c.o;
      const vH = Math.max(1, (c.v / maxVol) * plotVolH);
      ctx.fillStyle = isBull ? 'rgba(47,191,113,0.45)' : 'rgba(226,86,79,0.45)';
      ctx.fillRect(x - bodyW / 2, volTop + plotVolH - vH, bodyW, vH);
    });

    // --- Price series: Candlestick, OHLC Bar, or Line, depending on chartType ---
    if (chartType === 'candle') {
      visible.forEach((c, i) => {
        const x = xOf(i);
        const isBull = c.c >= c.o;
        const color = isBull ? '#2FBF71' : '#E2564F';

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, yOf(c.h));
        ctx.lineTo(x, yOf(c.l));
        ctx.stroke();

        const yO = yOf(c.o);
        const yC = yOf(c.c);
        const top = Math.min(yO, yC);
        const h = Math.max(1.5, Math.abs(yC - yO));

        ctx.fillStyle = color;
        ctx.fillRect(x - bodyW / 2, top, bodyW, h);

        if (start + i === total - 1) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, yC, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    } else if (chartType === 'bar') {
      // Classic OHLC bar: vertical H-L line with open tick (left) and close tick (right)
      visible.forEach((c, i) => {
        const x = xOf(i);
        const isBull = c.c >= c.o;
        const color = isBull ? '#2FBF71' : '#E2564F';
        const tick = Math.max(3, bodyW * 0.55);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, yOf(c.h));
        ctx.lineTo(x, yOf(c.l));
        ctx.moveTo(x - tick, yOf(c.o));
        ctx.lineTo(x, yOf(c.o));
        ctx.moveTo(x, yOf(c.c));
        ctx.lineTo(x + tick, yOf(c.c));
        ctx.stroke();

        if (start + i === total - 1) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, yOf(c.c), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    } else {
      // Line/area chart on closing price - a common "clean view" toggle on real platforms
      const lastClose = visible[visible.length - 1].c;
      const firstOpen = visible[0].o;
      const lineColor = lastClose >= firstOpen ? '#2FBF71' : '#E2564F';

      ctx.beginPath();
      visible.forEach((c, i) => {
        const x = xOf(i);
        const y = yOf(c.c);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      const gradient = ctx.createLinearGradient(0, marginT, 0, priceH - marginB);
      gradient.addColorStop(0, lineColor === '#2FBF71' ? 'rgba(47,191,113,0.28)' : 'rgba(226,86,79,0.28)');
      gradient.addColorStop(1, 'rgba(10,14,20,0)');
      ctx.save();
      ctx.lineTo(xOf(visible.length - 1), priceH - marginB);
      ctx.lineTo(xOf(0), priceH - marginB);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      visible.forEach((c, i) => {
        const x = xOf(i);
        const y = yOf(c.c);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const lastX = xOf(visible.length - 1);
      const lastY = yOf(lastClose);
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }


    // --- Moving averages (computed off the FULL history so they're accurate at the left edge) ---
    if (showMA) {
      const closes = candles.map(c => c.c);
      const drawMA = (period: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < visible.length; i++) {
          const globalIdx = start + i;
          const val = sma(closes, period, globalIdx);
          if (val === null) continue;
          const x = xOf(i);
          const y = yOf(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };
      drawMA(9, '#D4A93F');
      drawMA(20, '#5B9DD9');
    }

    // --- VWAP (volume-weighted average price, session-cumulative) ---
    if (showVWAP) {
      const vwapSeries = computeVWAP(candles);
      ctx.strokeStyle = '#9B6BD6';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < visible.length; i++) {
        const globalIdx = start + i;
        const val = vwapSeries[globalIdx];
        if (val === null || val === undefined) continue;
        const x = xOf(i);
        const y = yOf(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- Previous close reference line (classic NSE/BSE terminal touch) ---
    if (prevClose !== null && prevClose >= pMin && prevClose <= pMax) {
      const y = yOf(prevClose);
      ctx.save();
      ctx.strokeStyle = '#6B7680';
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      ctx.beginPath();
      ctx.moveTo(marginL, y);
      ctx.lineTo(width - marginR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6B7680';
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillText(`Prev Close ${inr(prevClose)}`, marginL + 4, y - 3);
      ctx.restore();
    }

    // --- Live price line + badge ---
    // NOTE: the dashed live-price line + badge are rendered as a smoothly-animated
    // HTML overlay (see JSX below) instead of drawn directly on canvas, so the
    // marker visibly glides between price levels instead of jumping instantly.

    // --- Trade entry markers ---
    entries.forEach(e => {
      let closestIdx = -1;
      let minDiff = Infinity;
      visible.forEach((c, idx) => {
        const diff = Math.abs(c.t - e.time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      if (closestIdx === -1) return;
      const x = xOf(closestIdx);
      const y = yOf(e.price);
      const isBuy = e.side === 'buy';

      ctx.fillStyle = isBuy ? '#2FBF71' : '#E2564F';
      ctx.beginPath();
      if (isBuy) {
        ctx.moveTo(x - 5, y + 8);
        ctx.lineTo(x + 5, y + 8);
        ctx.lineTo(x, y - 2);
      } else {
        ctx.moveTo(x - 5, y - 8);
        ctx.lineTo(x + 5, y - 8);
        ctx.lineTo(x, y + 2);
      }
      ctx.closePath();
      ctx.fill();
    });

    // --- Crosshair + tooltip ---
    if (crosshair && crosshair.index >= start && crosshair.index < end) {
      const localIdx = crosshair.index - start;
      const c = visible[localIdx];
      const x = xOf(localIdx);

      ctx.save();
      ctx.strokeStyle = '#6B7680';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, marginT);
      ctx.lineTo(x, priceH - marginB);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(marginL, crosshair.y);
      ctx.lineTo(width - marginR, crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const isBull = c.c >= c.o;
      const boxLines = [
        `${new Date(c.t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
        `O ${inr(c.o)}  H ${inr(c.h)}`,
        `L ${inr(c.l)}  C ${inr(c.c)}`,
        `Vol ${c.v.toLocaleString('en-IN')}`
      ];
      const boxW = 150;
      const boxH = boxLines.length * 14 + 10;
      let boxX = x + 10;
      if (boxX + boxW > width - marginR) boxX = x - boxW - 10;
      const boxY = marginT + 4;

      ctx.fillStyle = 'rgba(10,14,20,0.92)';
      ctx.strokeStyle = isBull ? '#2FBF71' : '#E2564F';
      ctx.lineWidth = 1;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.fillStyle = '#F1F4F6';
      ctx.font = '10px "IBM Plex Mono", monospace';
      boxLines.forEach((line, i) => {
        ctx.fillText(line, boxX + 8, boxY + 14 + i * 14);
      });
    }
  }, [candles, currentLivePrice, selectedSym, equityTransactions, fnoTransactions, visibleCount, viewOffset, crosshair, showMA, showVWAP, chartType, prevClose, timeframe]);

  const lastCandle = candles[candles.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-['Big_Shoulders_Display',sans-serif] font-bold text-2xl uppercase tracking-wider text-[#F1F4F6]">
          Real-Time Technical Chart
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex border border-[#1F2A33]">
            {(['candle', 'bar', 'line'] as ChartType[]).map(ct => (
              <button
                key={ct}
                type="button"
                onClick={() => setChartType(ct)}
                title={ct === 'candle' ? 'Candlestick' : ct === 'bar' ? 'OHLC Bar' : 'Line / Area'}
                className={`px-2.5 py-2 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition ${
                  chartType === ct
                    ? 'bg-[#D4A93F] text-[#0A0E14]'
                    : 'bg-[#10161D] text-[#6B7680] hover:text-[#F1F4F6]'
                }`}
              >
                {ct === 'candle' ? 'Candle' : ct === 'bar' ? 'Bar' : 'Line'}
              </button>
            ))}
          </div>
          <div className="flex border border-[#1F2A33]">
            {(['1m', '5m', '15m', '1h'] as Timeframe[]).map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-2 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition ${
                  timeframe === tf
                    ? 'bg-[#D4A93F] text-[#0A0E14]'
                    : 'bg-[#10161D] text-[#6B7680] hover:text-[#F1F4F6]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowMA(v => !v)}
            className={`px-2.5 py-2 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer border transition ${
              showMA
                ? 'border-[#D4A93F] text-[#D4A93F]'
                : 'border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6]'
            }`}
            title="Toggle 9 & 20-period moving averages"
          >
            MA 9/20
          </button>
          <button
            type="button"
            onClick={() => setShowVWAP(v => !v)}
            className={`px-2.5 py-2 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer border transition ${
              showVWAP
                ? 'border-[#9B6BD6] text-[#9B6BD6]'
                : 'border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6]'
            }`}
            title="Toggle Volume Weighted Average Price"
          >
            VWAP
          </button>
          <div className="w-64">
            <select
              value={selectedSym}
              onChange={(e) => setSelectedSym(e.target.value)}
              className="w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-2 font-mono outline-none focus:border-[#D4A93F]"
            >
              {allSymbols.map(s => (
                <option key={s.sym} value={s.sym}>
                  {s.sym} — {s.name} ({s.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {lastCandle && (
        <div className="bg-[#10161D] border border-[#1F2A33] px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[#D4A93F] font-bold text-sm">{selectedSym}</span>
              <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                currentTickDir === 'up'
                  ? 'bg-[#2FBF71]/25 text-[#2FBF71]'
                  : currentTickDir === 'down'
                  ? 'bg-[#E2564F]/25 text-[#E2564F]'
                  : 'bg-[#141B23] text-[#F1F4F6]'
              }`}>
                {inr(currentLivePrice)} {currentTickDir === 'up' ? '▲' : currentTickDir === 'down' ? '▼' : ''}
              </span>
              {prevClose !== null && prevClose > 0 && (() => {
                const chg = currentLivePrice - prevClose;
                const chgPct = (chg / prevClose) * 100;
                const up = chg >= 0;
                return (
                  <span className={`text-[11px] font-semibold ${up ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                    {up ? '+' : ''}{inr(chg)} ({up ? '+' : ''}{chgPct.toFixed(2)}%)
                  </span>
                );
              })()}
            </div>
            <span className="text-[#6B7680]">O: <strong className="text-[#F1F4F6]">{inr(lastCandle.o)}</strong></span>
            <span className="text-[#6B7680]">H: <strong className="text-[#2FBF71]">{inr(lastCandle.h)}</strong></span>
            <span className="text-[#6B7680]">L: <strong className="text-[#E2564F]">{inr(lastCandle.l)}</strong></span>
            <span className="text-[#6B7680]">C: <strong className={lastCandle.c >= lastCandle.o ? 'text-[#2FBF71]' : 'text-[#E2564F]'}>{inr(lastCandle.c)}</strong></span>
            <span className="text-[#6B7680]">Vol: <strong className="text-[#C9D3D9]">{lastCandle.v.toLocaleString('en-IN')}</strong></span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-[#6B7680]">
            {showMA && (
              <>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-[#D4A93F] inline-block" /> MA9</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-[#5B9DD9] inline-block" /> MA20</span>
                <span className="hidden sm:inline">|</span>
              </>
            )}
            {showVWAP && (
              <>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-[#9B6BD6] inline-block" /> VWAP</span>
                <span className="hidden sm:inline">|</span>
              </>
            )}
            <span className="flex items-center gap-1.5 text-[#2FBF71]">
              <span className="w-2 h-2 rounded-full bg-[#2FBF71] animate-ping" />
              <span>{timeframe} Live Candle Active</span>
            </span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden lg:inline">Scroll to zoom, drag to pan</span>
          </div>
        </div>
      )}

      <div ref={containerRef} className="bg-[#10161D] border border-[#1F2A33] p-4">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full block cursor-crosshair"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />

          {/* Smoothly-animated live price line + badge, gliding to each new tick
              instead of jumping instantly - overlaid in sync with the canvas's own
              price-axis scale (see scaleRef). */}
          {overlayY !== null && (
            <>
              <div
                className="absolute pointer-events-none border-t border-dashed transition-[top] duration-[1300ms] ease-out"
                style={{ left: 65, right: 70, top: overlayY, borderColor: overlayColor }}
              />
              <div
                className="absolute pointer-events-none px-1.5 py-1 text-[10px] font-bold font-mono transition-[top] duration-[1300ms] ease-out"
                style={{
                  right: 2,
                  top: overlayY,
                  transform: 'translateY(-50%)',
                  backgroundColor: overlayColor,
                  color: '#05070A'
                }}
              >
                {inr(currentLivePrice)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
