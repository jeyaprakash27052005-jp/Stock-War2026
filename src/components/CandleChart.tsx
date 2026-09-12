import React, { useState, useEffect, useRef } from 'react';
import { Candle, Stock, FnoUnderlying, Transaction, FnoTransaction } from '../types';
import { inr } from '../marketData';

interface CandleChartProps {
  stocks: Stock[];
  indices: FnoUnderlying[];
  commodities: FnoUnderlying[];
  equityTransactions: Transaction[];
  fnoTransactions: FnoTransaction[];
}

export const CandleChart: React.FC<CandleChartProps> = ({
  stocks,
  indices,
  commodities,
  equityTransactions,
  fnoTransactions
}) => {
  const [selectedSym, setSelectedSym] = useState<string>('NIFTY');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  const allSymbols = [
    ...indices.map(i => ({ sym: i.sym, name: i.name, type: 'Index' })),
    ...commodities.map(c => ({ sym: c.sym, name: c.name, type: 'Commodity' })),
    ...stocks.map(s => ({ sym: s.sym, name: s.name, type: 'Equity' }))
  ];

  const activeInstrument = allSymbols.find(s => s.sym === selectedSym) || allSymbols[0];

  // Seed candle data ONLY when selected symbol changes
  useEffect(() => {
    const st = stocks.find(s => s.sym === selectedSym);
    const ind = indices.find(i => i.sym === selectedSym);
    const cmd = commodities.find(c => c.sym === selectedSym);
    const basePrice = (st?.ltp || ind?.spot || cmd?.spot || 1000);

    const now = Math.floor(Date.now() / 60000) * 60000;
    const generated: Candle[] = [];
    let p = basePrice * 0.985;

    for (let i = 40; i >= 1; i--) {
      const t = now - i * 60000;
      const o = p;
      const drift = (Math.random() - 0.49) * (basePrice * 0.005);
      const c = Number((o + drift).toFixed(2));
      const h = Number((Math.max(o, c) + Math.random() * (basePrice * 0.003)).toFixed(2));
      const l = Number((Math.min(o, c) - Math.random() * (basePrice * 0.003)).toFixed(2));
      generated.push({ t, o, h, l, c });
      p = c;
    }
    // Current live active candle
    generated.push({
      t: now,
      o: p,
      h: Math.max(p, basePrice),
      l: Math.min(p, basePrice),
      c: basePrice
    });
    setCandles(generated);
  }, [selectedSym]);

  // Live real-time tick listener: Updates the active current candle smoothly
  const currentLivePrice = (() => {
    const st = stocks.find(s => s.sym === selectedSym);
    if (st) return st.ltp;
    const ind = indices.find(i => i.sym === selectedSym);
    if (ind && typeof ind.spot === 'number') return ind.spot;
    const cmd = commodities.find(c => c.sym === selectedSym);
    if (cmd && typeof cmd.spot === 'number') return cmd.spot;
    return 1000;
  })();

  const currentTickDir = (() => {
    const st = stocks.find(s => s.sym === selectedSym);
    if (st) return st.tickDirection;
    const ind = indices.find(i => i.sym === selectedSym);
    if (ind) return ind.tickDirection;
    const cmd = commodities.find(c => c.sym === selectedSym);
    if (cmd) return cmd.tickDirection;
    return 'same';
  })();

  // Update current live candle whenever currentLivePrice changes
  useEffect(() => {
    if (!currentLivePrice || candles.length === 0) return;

    setCandles(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const now = Date.now();

      // If 60 seconds have passed for 1m candle, roll into a new candle
      if (now - last.t >= 60000) {
        const newCandle: Candle = {
          t: Math.floor(now / 60000) * 60000,
          o: currentLivePrice,
          h: currentLivePrice,
          l: currentLivePrice,
          c: currentLivePrice
        };
        return [...prev.slice(1), newCandle];
      }

      // Otherwise, update high, low, close of the current active candle
      const updatedLast: Candle = {
        ...last,
        c: currentLivePrice,
        h: Math.max(last.h, currentLivePrice),
        l: Math.min(last.l, currentLivePrice)
      };
      return [...prev.slice(0, -1), updatedLast];
    });
  }, [currentLivePrice]);

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = containerRef.current?.clientWidth || 700;
    const height = 340;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // Trade entries for this symbol
    const entries = [
      ...equityTransactions.filter(t => t.sym === selectedSym).map(t => ({
        time: t.time,
        price: t.price,
        side: t.side
      })),
      ...fnoTransactions.filter(t => t.underlying === selectedSym).map(t => ({
        time: t.time,
        price: t.spotAtEntry,
        side: t.side
      }))
    ];

    let pMin = Math.min(...candles.map(c => c.l));
    let pMax = Math.max(...candles.map(c => c.h));
    entries.forEach(e => {
      pMin = Math.min(pMin, e.price);
      pMax = Math.max(pMax, e.price);
    });

    const pad = (pMax - pMin) * 0.12 || pMax * 0.02;
    pMin -= pad;
    pMax += pad;

    const marginL = 65;
    const marginR = 70; // extra space for live price tag
    const marginT = 20;
    const marginB = 25;
    const plotW = width - marginL - marginR;
    const plotH = height - marginT - marginB;

    const n = candles.length;
    const slot = plotW / n;
    const bodyW = Math.max(3, Math.min(14, slot * 0.65));

    const yOf = (val: number) => marginT + plotH - ((val - pMin) / (pMax - pMin || 1)) * plotH;
    const xOf = (i: number) => marginL + slot * i + slot / 2;

    // Grid lines
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

    // Candlesticks
    candles.forEach((c, i) => {
      const x = xOf(i);
      const isBull = c.c >= c.o;
      const color = isBull ? '#2FBF71' : '#E2564F';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();

      // Body
      const yO = yOf(c.o);
      const yC = yOf(c.c);
      const top = Math.min(yO, yC);
      const h = Math.max(1.5, Math.abs(yC - yO));

      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, top, bodyW, h);

      // If active latest candle, draw pulsating price circle
      if (i === candles.length - 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, yC, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Live Horizontal Price Line across the chart
    const currentY = yOf(currentLivePrice);
    const isUp = candles.length > 0 ? currentLivePrice >= candles[0].o : true;
    const lineColor = isUp ? '#2FBF71' : '#E2564F';

    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(marginL, currentY);
    ctx.lineTo(width - marginR, currentY);
    ctx.stroke();

    // Right-hand live price badge
    ctx.setLineDash([]);
    ctx.fillStyle = lineColor;
    ctx.fillRect(width - marginR + 2, currentY - 9, marginR - 6, 18);
    ctx.fillStyle = '#05070A';
    ctx.font = 'bold 10px "IBM Plex Mono", monospace';
    ctx.fillText(inr(currentLivePrice), width - marginR + 6, currentY + 3.5);
    ctx.restore();

    // Entries overlay
    entries.forEach(e => {
      let closestIdx = 0;
      let minDiff = Infinity;
      candles.forEach((c, idx) => {
        const diff = Math.abs(c.t - e.time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });

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
  }, [candles, currentLivePrice, selectedSym, equityTransactions, fnoTransactions]);

  const lastCandle = candles[candles.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-['Big_Shoulders_Display',sans-serif] font-bold text-2xl uppercase tracking-wider text-[#F1F4F6]">
          Real-Time Technical Chart
        </h2>
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
            </div>
            <span className="text-[#6B7680]">O: <strong className="text-[#F1F4F6]">{inr(lastCandle.o)}</strong></span>
            <span className="text-[#6B7680]">H: <strong className="text-[#2FBF71]">{inr(lastCandle.h)}</strong></span>
            <span className="text-[#6B7680]">L: <strong className="text-[#E2564F]">{inr(lastCandle.l)}</strong></span>
            <span className="text-[#6B7680]">C: <strong className={lastCandle.c >= lastCandle.o ? 'text-[#2FBF71]' : 'text-[#E2564F]'}>{inr(lastCandle.c)}</strong></span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-[#6B7680]">
            <span className="flex items-center gap-1.5 text-[#2FBF71]">
              <span className="w-2 h-2 rounded-full bg-[#2FBF71] animate-ping" />
              <span>1m Live Candle Active</span>
            </span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">▲ / ▼ Pins indicate trade entries</span>
          </div>
        </div>
      )}

      <div ref={containerRef} className="bg-[#10161D] border border-[#1F2A33] p-4">
        <canvas ref={canvasRef} className="w-full block" />
      </div>
    </div>
  );
};
