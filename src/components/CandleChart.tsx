import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Candle, Stock, FnoUnderlying, Transaction, FnoTransaction } from '../types';
import { inr } from '../marketData';
import { 
  Trash2, 
  HelpCircle, 
  ChevronDown, 
  Search, 
  X, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight 
} from 'lucide-react';

interface CandleChartProps {
  stocks: Stock[];
  indices: FnoUnderlying[];
  commodities: FnoUnderlying[];
  equityTransactions: Transaction[];
  fnoTransactions: FnoTransaction[];
}

type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '1D';
type ChartType = 'candle' | 'bar' | 'hlc' | 'line' | 'mountain';

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': 'Intraday-1',
  '5m': 'Intraday-5',
  '15m': 'Intraday-15',
  '30m': 'Intraday-30',
  '1h': 'Intraday-60',
  '1D': 'Daily'
};

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60000,
  '5m': 5 * 60000,
  '15m': 15 * 60000,
  '30m': 30 * 60000,
  '1h': 60 * 60000,
  '1D': 24 * 60 * 60000
};

const HISTORY_LENGTH = 160;
const MIN_VISIBLE = 20;
const MAX_VISIBLE = 160;
const DEFAULT_VISIBLE = 65;

// ---- Technical indicator calculations (operate over the FULL candle history so
// values are accurate even at the left edge of whatever window is currently visible) ----

function computeEMASeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) continue;
    if (ema === null) {
      // Seed with a simple average of the first `period` closes
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      ema = sum / period;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    out[i] = ema;
  }
  return out;
}

function computeRSISeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function computeMACD(closes: number[]): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const ema12 = computeEMASeries(closes, 12);
  const ema26 = computeEMASeries(closes, 26);
  const macd: (number | null)[] = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? (ema12[i] as number) - (ema26[i] as number) : null
  );
  // Signal = 9-period EMA of the MACD line (over the non-null tail)
  const macdValues = macd.map(v => v ?? 0);
  const firstValidIdx = macd.findIndex(v => v !== null);
  const signalRaw = computeEMASeries(macdValues, 9);
  const signal: (number | null)[] = signalRaw.map((v, i) => (firstValidIdx >= 0 && i >= firstValidIdx + 8 ? v : null));
  const hist: (number | null)[] = macd.map((v, i) => (v !== null && signal[i] !== null ? v - (signal[i] as number) : null));
  return { macd, signal, hist };
}

function computeBollinger(closes: number[], period = 20, mult = 2): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid: (number | null)[] = new Array(closes.length).fill(null);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) continue;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const avg = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - avg) ** 2;
    const stdDev = Math.sqrt(variance / period);
    mid[i] = avg;
    upper[i] = avg + mult * stdDev;
    lower[i] = avg - mult * stdDev;
  }
  return { mid, upper, lower };
}

export const CandleChart: React.FC<CandleChartProps> = ({
  stocks,
  indices,
  commodities,
  equityTransactions,
  fnoTransactions
}) => {
  // Category state for BSE dropdown: Indices, Equities, Commodities
  const [selectedCategory, setSelectedCategory] = useState<'Indices' | 'Equities' | 'Commodities'>('Indices');
  const [selectedSym, setSelectedSym] = useState<string>('SENSEX');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [chartType, setChartType] = useState<ChartType>('candle');
  
  // Studies toggles
  const [showSMA9, setShowSMA9] = useState<boolean>(false);
  const [showSMA20, setShowSMA20] = useState<boolean>(false);
  const [showEMA, setShowEMA] = useState<boolean>(false);
  const [showVWAP, setShowVWAP] = useState<boolean>(false);
  const [showBollinger, setShowBollinger] = useState<boolean>(false);
  const [showRSI, setShowRSI] = useState<boolean>(false);
  const [showMACD, setShowMACD] = useState<boolean>(false);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showTradeMarkers, setShowTradeMarkers] = useState<boolean>(true);

  // Tools
  const [toolMode, setToolMode] = useState<'crosshair' | 'none' | 'horizRay'>('crosshair');
  const [showDataWindow, setShowDataWindow] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<'category' | 'symbol' | 'studies' | 'tools' | 'candle' | 'intraday' | null>(null);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');

  // Canvas and viewport refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(DEFAULT_VISIBLE);
  const [viewOffset, setViewOffset] = useState<number>(0);
  const dragState = useRef<{ startX: number; startOffset: number; slotWidth: number } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; index: number; price: number } | null>(null);
  const currentCandleSymRef = useRef<string>(selectedSym);

  // Gather symbols by category
  const allSymbols = [
    ...indices.map(i => ({ sym: i.sym, name: i.name, type: 'Indices' as const })),
    ...stocks.map(s => ({ sym: s.sym, name: s.name, type: 'Equities' as const })),
    ...commodities.map(c => ({ sym: c.sym, name: c.name, type: 'Commodities' as const }))
  ];

  const filteredSymbolsByCategory = allSymbols.filter(s => s.type === selectedCategory);
  const searchableSymbols = allSymbols.filter(s => 
    s.sym.toLowerCase().includes(symbolSearchQuery.toLowerCase()) || 
    s.name.toLowerCase().includes(symbolSearchQuery.toLowerCase())
  );

  const getSpot = useCallback((sym: string): number => {
    const ind = indices.find(i => i.sym === sym);
    if (ind && typeof ind.spot === 'number') return ind.spot;
    const st = stocks.find(s => s.sym === sym);
    if (st) return st.ltp;
    const cmd = commodities.find(c => c.sym === sym);
    if (cmd && typeof cmd.spot === 'number') return cmd.spot;
    if (sym === 'SENSEX') return 74294.96;
    return 1000;
  }, [stocks, indices, commodities]);

  const getPrevClose = useCallback((sym: string): number | null => {
    const ind = indices.find(i => i.sym === sym);
    if (ind && typeof ind.prevSpot === 'number') return ind.prevSpot;
    const st = stocks.find(s => s.sym === sym);
    if (st && typeof st.prevClose === 'number') return st.prevClose;
    const cmd = commodities.find(c => c.sym === sym);
    if (cmd && typeof cmd.prevSpot === 'number') return cmd.prevSpot;
    if (sym === 'SENSEX') return 74589.10;
    return null;
  }, [stocks, indices, commodities]);

  const currentLivePrice = getSpot(selectedSym);
  const prevClose = getPrevClose(selectedSym);

  // Seed realistic historical candles matching BSE SENSEX movement pattern (or stock pattern)
  useEffect(() => {
    currentCandleSymRef.current = selectedSym;
    const basePrice = getSpot(selectedSym);
    const bucketMs = TIMEFRAME_MS[timeframe];
    const now = Math.floor(Date.now() / bucketMs) * bucketMs;
    const generated: Candle[] = [];

    // For BSE SENSEX or standard symbols, model realistic multi-phase intraday trend:
    // Session phases:
    // 1. Morning open (approx 9:15 - 10:30): volatile initial dip & rebound
    // 2. Midday rally (10:30 - 13:30): steady climb to peak high
    // 3. Afternoon distribution (13:30 - 15:00): test of highs (74,700+)
    // 4. Late drop (15:00 - 15:30): sharp pull-back to close at 74,294.96 (exact BSE curve from image)
    const totalCount = HISTORY_LENGTH;
    const isSensex = selectedSym === 'SENSEX';
    
    // Wave targets if Sensex
    const startPrice = isSensex ? 74420 : basePrice * 0.995;
    const peakPrice = isSensex ? 74744.82 : basePrice * 1.015;
    const dipPrice = isSensex ? 74340 : basePrice * 0.99;
    
    let curPrice = startPrice;

    for (let i = totalCount - 1; i >= 1; i--) {
      const progress = (totalCount - i) / totalCount; // 0 to 1
      const t = now - i * bucketMs;
      const o = curPrice;

      let target = basePrice;
      if (isSensex) {
        if (progress < 0.25) {
          // Morning dip & consolidation
          target = dipPrice + (startPrice - dipPrice) * Math.sin(progress * Math.PI * 4);
        } else if (progress < 0.75) {
          // Sustained bull run to peak
          const subP = (progress - 0.25) / 0.5;
          target = dipPrice + (peakPrice - dipPrice) * Math.pow(subP, 0.9);
        } else if (progress < 0.92) {
          // Testing peak
          target = peakPrice - (peakPrice - basePrice) * 0.25 * ((progress - 0.75) / 0.17);
        } else {
          // Sharp final afternoon drop
          const subP = (progress - 0.92) / 0.08;
          target = peakPrice * 0.998 - (peakPrice * 0.998 - basePrice) * subP;
        }
      } else {
        // Realistic random walk with momentum and mean reversion
        const wave = Math.sin(progress * Math.PI * 3) * (basePrice * 0.012);
        target = basePrice * 0.99 + wave;
      }

      const noise = (Math.random() - 0.49) * (basePrice * 0.0018);
      const c = Number((target + noise).toFixed(2));
      const range = Math.abs(c - o) + (basePrice * 0.0012) * Math.random();
      const h = Number((Math.max(o, c) + range * Math.random() * 0.6).toFixed(2));
      const l = Number((Math.max(0.01, Math.min(o, c) - range * Math.random() * 0.6)).toFixed(2));
      const v = Math.round(15000 + Math.random() * 65000);

      generated.push({ t, o, h, l, c, v });
      curPrice = c;
    }

    // Active live candle
    generated.push({
      t: now,
      o: curPrice,
      h: Math.max(curPrice, basePrice),
      l: Math.min(curPrice, basePrice),
      c: basePrice,
      v: Math.round(5000 + Math.random() * 12000)
    });

    setCandles(generated);
    setViewOffset(0);
    setVisibleCount(DEFAULT_VISIBLE);
  }, [selectedSym, timeframe, getSpot]);

  // Live tick updates in real time
  useEffect(() => {
    if (!currentLivePrice || candles.length === 0 || currentCandleSymRef.current !== selectedSym) return;
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
          v: Math.round(400 + Math.random() * 1200)
        };
        return [...prev.slice(1), newCandle];
      }

      const updatedLast: Candle = {
        ...last,
        c: currentLivePrice,
        h: Math.max(last.h, currentLivePrice),
        l: Math.min(last.l, currentLivePrice),
        v: last.v + Math.round(40 + Math.random() * 200)
      };
      return [...prev.slice(0, -1), updatedLast];
    });
  }, [currentLivePrice, timeframe, selectedSym]);

  // Zoom with wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setVisibleCount(prev => {
      const next = prev + (e.deltaY > 0 ? 5 : -5);
      return Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, next));
    });
  };

  // Pan by dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const plotW = canvas.width - 15 - 85;
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

    const marginL = 15;
    const marginR = 85;
    const plotW = canvas.width - marginL - marginR;
    const total = candles.length;
    const start = Math.max(0, total - visibleCount - viewOffset);
    const end = Math.max(start, total - viewOffset);
    const visible = candles.slice(start, end);
    if (visible.length === 0) return;
    const slot = plotW / visible.length;
    const idxInView = Math.max(0, Math.min(visible.length - 1, Math.floor((x - marginL) / slot)));
    
    // Price estimation for crosshair
    const pMin = Math.min(...visible.map(c => c.l));
    const pMax = Math.max(...visible.map(c => c.h));
    const priceH = canvas.height - 35;
    const marginT = 32;
    const marginB = 10;
    const plotPriceH = priceH - marginT - marginB;
    const priceAtY = pMax - ((y - marginT) / plotPriceH) * (pMax - pMin);

    setCrosshair({ x, y, index: start + idxInView, price: priceAtY });
  };

  const handleMouseUp = () => { dragState.current = null; };
  const handleMouseLeave = () => { dragState.current = null; setCrosshair(null); };

  // Bottom toolbar buttons
  const zoomIn = () => setVisibleCount(c => Math.max(MIN_VISIBLE, c - 8));
  const zoomOut = () => setVisibleCount(c => Math.min(MAX_VISIBLE, c + 8));
  const panLeft = () => setViewOffset(o => Math.min(Math.max(0, candles.length - visibleCount), o + 10));
  const panRight = () => setViewOffset(o => Math.max(0, o - 10));
  const jumpToFirst = () => setViewOffset(Math.max(0, candles.length - visibleCount));
  const jumpToLatest = () => setViewOffset(0);

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = containerRef.current?.clientWidth || 900;
    const mainHeight = 520;
    const subPanelH = 110;
    const subPanelGap = 4;
    const rsiOn = showRSI;
    const macdOn = showMACD;
    const height = mainHeight
      + (rsiOn ? subPanelH + subPanelGap : 0)
      + (macdOn ? subPanelH + subPanelGap : 0);
    canvas.width = width;
    canvas.height = height;

    // Pitch Black background like BSE Technical Charting in 1.png
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const total = candles.length;
    const start = Math.max(0, total - visibleCount - viewOffset);
    const end = Math.max(start, total - viewOffset);
    const visible = candles.slice(start, end);
    if (visible.length === 0) return;

    let pMin = Math.min(...visible.map(c => c.l));
    let pMax = Math.max(...visible.map(c => c.h));
    const pad = (pMax - pMin) * 0.08 || pMax * 0.01;
    pMin -= pad;
    pMax += pad;

    const marginL = 15; // wide layout
    const marginR = 85; // price axis on the right side exactly as in 1.png
    const marginT = 32;
    const marginB = 30; // bottom time axis
    const plotW = width - marginL - marginR;
    const plotH = mainHeight - marginT - marginB;

    const n = visible.length;
    const slot = plotW / n;
    const bodyW = Math.max(2, Math.min(18, slot * 0.72));

    const yOf = (val: number) => marginT + plotH - ((val - pMin) / (pMax - pMin || 1)) * plotH;
    const xOf = (i: number) => marginL + slot * i + slot / 2;

    // --- Subtle Grid lines ---
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 1;

    // Horizontal price grid lines & Right Price Axis Labels
    const steps = 8;
    ctx.font = '11px "Consolas", "Courier New", monospace';
    ctx.textAlign = 'left';

    for (let i = 0; i <= steps; i++) {
      const price = pMin + ((pMax - pMin) * i) / steps;
      const y = yOf(price);

      ctx.beginPath();
      ctx.strokeStyle = '#141414';
      ctx.moveTo(marginL, y);
      ctx.lineTo(width - marginR, y);
      ctx.stroke();

      // Right-side Y-axis price label exactly as in image 1.png
      ctx.fillStyle = '#9E9E9E';
      ctx.fillText(price.toFixed(2), width - marginR + 6, y + 4);
    }

    // Vertical time grid lines & Bottom Time Axis Labels
    const timeStep = Math.max(1, Math.round(n / 7));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9E9E9E';

    for (let i = 0; i < n; i += timeStep) {
      const c = visible[i];
      const x = xOf(i);
      const d = new Date(c.t);

      ctx.beginPath();
      ctx.strokeStyle = '#141414';
      ctx.moveTo(x, marginT);
      ctx.lineTo(x, mainHeight - marginB);
      ctx.stroke();

      // Label format: "Sep/18 9:39" or "10:36" matching 1.png
      const monthStr = d.toLocaleDateString('en-US', { month: 'short' });
      const dayStr = d.getDate();
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
      const label = i === 0 ? `${monthStr}/${dayStr} ${timeStr}` : timeStr;

      ctx.fillText(label, x, mainHeight - 10);
    }

    // --- Volume Bars (if enabled) ---
    if (showVolume) {
      const maxVol = Math.max(...visible.map(c => c.v), 1);
      const volAreaH = plotH * 0.20;
      const volBaseY = marginT + plotH;

      visible.forEach((c, i) => {
        const x = xOf(i);
        const isBull = c.c >= c.o;
        const vH = (c.v / maxVol) * volAreaH;
        ctx.fillStyle = isBull ? 'rgba(0, 230, 118, 0.25)' : 'rgba(255, 23, 68, 0.25)';
        ctx.fillRect(x - bodyW / 2, volBaseY - vH, bodyW, vH);
      });
    }

    // --- Indicators / Studies (SMA 9, SMA 20, EMA) ---
    if (showSMA9 || showSMA20 || showEMA) {
      const allCandleCloses = candles.map(c => c.c);
      
      const drawSMA = (period: number, strokeColor: string) => {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;

        visible.forEach((_, i) => {
          const globalIdx = start + i;
          if (globalIdx + 1 >= period) {
            let sum = 0;
            for (let k = globalIdx - period + 1; k <= globalIdx; k++) sum += allCandleCloses[k];
            const avg = sum / period;
            const x = xOf(i);
            const y = yOf(avg);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else { ctx.lineTo(x, y); }
          }
        });
        if (started) ctx.stroke();
      };

      if (showSMA9) drawSMA(9, '#29B6F6'); // light blue
      if (showSMA20) drawSMA(20, '#FFCA28'); // amber yellow

      if (showEMA) {
        const emaSeries = computeEMASeries(allCandleCloses, 21);
        ctx.strokeStyle = '#EC407A';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        visible.forEach((_, i) => {
          const globalIdx = start + i;
          const val = emaSeries[globalIdx];
          if (val === null || val === undefined) return;
          const x = xOf(i);
          const y = yOf(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        });
        if (started) ctx.stroke();
      }
    }

    // --- VWAP (volume-weighted average price, cumulative across the loaded history) ---
    if (showVWAP) {
      let cumPV = 0;
      let cumVol = 0;
      const vwapSeries: number[] = candles.map(c => {
        const typicalPrice = (c.h + c.l + c.c) / 3;
        cumPV += typicalPrice * c.v;
        cumVol += c.v;
        return cumVol > 0 ? cumPV / cumVol : typicalPrice;
      });

      ctx.strokeStyle = '#AB47BC';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      let started = false;
      visible.forEach((_, i) => {
        const globalIdx = start + i;
        const val = vwapSeries[globalIdx];
        if (val === undefined) return;
        const x = xOf(i);
        const y = yOf(val);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else { ctx.lineTo(x, y); }
      });
      if (started) ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- Candlesticks / Bars / Line ---
    if (chartType === 'candle' || chartType === 'hlc') {
      visible.forEach((c, i) => {
        const x = xOf(i);
        const isBull = c.c >= c.o;
        // Exact BSE electric green & bright crimson red
        const color = isBull ? '#00E676' : '#FF1744';

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
      });
    } else if (chartType === 'line' || chartType === 'mountain') {
      ctx.strokeStyle = '#00E676';
      ctx.lineWidth = 2;
      ctx.beginPath();
      visible.forEach((c, i) => {
        const x = xOf(i);
        const y = yOf(c.c);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (chartType === 'mountain') {
        ctx.lineTo(xOf(visible.length - 1), marginT + plotH);
        ctx.lineTo(xOf(0), marginT + plotH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, marginT, 0, marginT + plotH);
        grad.addColorStop(0, 'rgba(0, 230, 118, 0.35)');
        grad.addColorStop(1, 'rgba(0, 230, 118, 0.02)');
        ctx.fillStyle = grad;
        ctx.fill();
      }
    } else if (chartType === 'bar') {
      visible.forEach((c, i) => {
        const x = xOf(i);
        const isBull = c.c >= c.o;
        const color = isBull ? '#00E676' : '#FF1744';

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        // Central bar
        ctx.beginPath();
        ctx.moveTo(x, yOf(c.h));
        ctx.lineTo(x, yOf(c.l));
        ctx.stroke();
        // Left tick (Open)
        ctx.beginPath();
        ctx.moveTo(x - bodyW / 2, yOf(c.o));
        ctx.lineTo(x, yOf(c.o));
        ctx.stroke();
        // Right tick (Close)
        ctx.beginPath();
        ctx.moveTo(x, yOf(c.c));
        ctx.lineTo(x + bodyW / 2, yOf(c.c));
        ctx.stroke();
      });
    }

    // --- Active Live Price Guideline & Right-Axis Badge (Exact match to 1.png) ---
    const lastVisibleCandle = visible[visible.length - 1];
    const liveY = yOf(currentLivePrice);

    if (liveY >= marginT && liveY <= marginT + plotH) {
      const isUp = currentLivePrice >= (prevClose || lastVisibleCandle.o);
      const lineColor = isUp ? '#00E676' : '#FF1744';

      // Horizontal dashed price guideline extending from active candle to the right axis
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xOf(visible.length - 1), liveY);
      ctx.lineTo(width - marginR, liveY);
      ctx.stroke();
      ctx.restore();

      // Right Y-axis high-contrast badge (White solid background with black bold text, exactly like 1.png!)
      const badgeW = 74;
      const badgeH = 18;
      const badgeX = width - marginR + 4;
      const badgeY = liveY - badgeH / 2;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11px "Consolas", "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(currentLivePrice.toFixed(2), badgeX + badgeW / 2, liveY + 4);
    }

    // --- Crosshair (if active) ---
    if (toolMode === 'crosshair' && crosshair) {
      ctx.save();
      ctx.strokeStyle = '#757575';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      // Vertical line extends through the whole canvas (main panel + any sub-panels)
      ctx.beginPath();
      ctx.moveTo(crosshair.x, marginT);
      ctx.lineTo(crosshair.x, height);
      ctx.stroke();

      // Horizontal line (scoped to the main price panel only)
      ctx.beginPath();
      ctx.moveTo(marginL, crosshair.y);
      ctx.lineTo(width - marginR, crosshair.y);
      ctx.stroke();
      ctx.restore();

      // Crosshair right price badge
      if (crosshair.price && crosshair.y >= marginT && crosshair.y <= mainHeight - marginB) {
        ctx.fillStyle = '#212121';
        ctx.fillRect(width - marginR + 4, crosshair.y - 8, 70, 16);
        ctx.strokeStyle = '#757575';
        ctx.strokeRect(width - marginR + 4, crosshair.y - 8, 70, 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px "Consolas", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(crosshair.price.toFixed(2), width - marginR + 39, crosshair.y + 4);
      }
    }

    // --- Bollinger Bands (overlay on the main price panel, same units as price) ---
    if (showBollinger) {
      const allCloses = candles.map(c => c.c);
      const { mid, upper, lower } = computeBollinger(allCloses, 20, 2);

      const drawBandLine = (series: (number | null)[], color: string, dashed: boolean) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        if (dashed) ctx.setLineDash([3, 2]); else ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        visible.forEach((_, i) => {
          const globalIdx = start + i;
          const val = series[globalIdx];
          if (val === null || val === undefined) return;
          const x = xOf(i);
          const y = yOf(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        });
        if (started) ctx.stroke();
        ctx.setLineDash([]);
      };

      drawBandLine(upper, 'rgba(41, 182, 246, 0.7)', true);
      drawBandLine(mid, 'rgba(255, 202, 40, 0.6)', false);
      drawBandLine(lower, 'rgba(41, 182, 246, 0.7)', true);
    }

    // --- Buy/Sell trade markers for the currently selected symbol (equity + F&O) ---
    if (showTradeMarkers) {
      const relevantEquity = equityTransactions.filter(t => t.sym === selectedSym);
      const relevantFno = fnoTransactions.filter(t => t.underlying === selectedSym);

      const findNearestVisibleIndex = (time: number): number | null => {
        // Find the visible candle whose time bucket contains this trade
        for (let i = 0; i < visible.length; i++) {
          const bucketStart = visible[i].t;
          const bucketEnd = bucketStart + TIMEFRAME_MS[timeframe];
          if (time >= bucketStart && time < bucketEnd) return i;
        }
        // Fall back to nearest by absolute distance if not exactly in range
        if (visible.length === 0) return null;
        let nearest = 0;
        let bestDiff = Math.abs(visible[0].t - time);
        for (let i = 1; i < visible.length; i++) {
          const diff = Math.abs(visible[i].t - time);
          if (diff < bestDiff) { bestDiff = diff; nearest = i; }
        }
        return nearest;
      };

      relevantEquity.forEach(t => {
        const idx = findNearestVisibleIndex(t.time);
        if (idx === null) return;
        const x = xOf(idx);
        const y = yOf(t.price);
        const isBuy = t.side === 'buy';
        ctx.fillStyle = isBuy ? '#00E676' : '#FF1744';
        ctx.beginPath();
        if (isBuy) {
          // Upward triangle below the price point
          ctx.moveTo(x, y + 14);
          ctx.lineTo(x - 5, y + 22);
          ctx.lineTo(x + 5, y + 22);
        } else {
          // Downward triangle above the price point
          ctx.moveTo(x, y - 14);
          ctx.lineTo(x - 5, y - 22);
          ctx.lineTo(x + 5, y - 22);
        }
        ctx.closePath();
        ctx.fill();
      });

      relevantFno.forEach(t => {
        const idx = findNearestVisibleIndex(t.time);
        if (idx === null) return;
        const x = xOf(idx);
        const y = yOf(currentLivePrice); // F&O trades are priced on the derivative, not the underlying's candle scale - anchor near the live line
        const isBuy = t.side === 'buy';
        ctx.save();
        ctx.translate(x, isBuy ? y + 30 : y - 30);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = isBuy ? '#00E676' : '#FF1744';
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();

        const label = t.kind === 'FUT' ? `${t.underlying} FUT` : `${t.strike}${t.optType}`;
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '9px "Consolas", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, isBuy ? y + 48 : y - 38);
      });
    }

    // --- RSI Sub-panel ---
    if (rsiOn) {
      const panelTop = mainHeight + subPanelGap;
      const panelBottom = panelTop + subPanelH;
      const rsiMarginT = 14;
      const rsiPlotH = subPanelH - rsiMarginT - 8;

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, panelTop, width, subPanelH);
      ctx.strokeStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(0, panelTop);
      ctx.lineTo(width, panelTop);
      ctx.stroke();

      ctx.fillStyle = '#9E9E9E';
      ctx.font = '10px "Consolas", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('RSI (14)', marginL, panelTop + 11);

      const rsiY = (val: number) => panelTop + rsiMarginT + rsiPlotH - (val / 100) * rsiPlotH;

      // 30 / 70 reference lines
      [30, 50, 70].forEach(level => {
        const y = rsiY(level);
        ctx.strokeStyle = level === 50 ? '#222' : 'rgba(255,202,40,0.25)';
        ctx.setLineDash(level === 50 ? [] : [2, 2]);
        ctx.beginPath();
        ctx.moveTo(marginL, y);
        ctx.lineTo(width - marginR, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#757575';
        ctx.textAlign = 'left';
        ctx.fillText(String(level), width - marginR + 6, y + 3);
      });

      const rsiSeries = computeRSISeries(candles.map(c => c.c), 14);
      ctx.strokeStyle = '#BA68C8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      let lastRsiVal: number | null = null;
      visible.forEach((_, i) => {
        const globalIdx = start + i;
        const val = rsiSeries[globalIdx];
        if (val === null || val === undefined) return;
        lastRsiVal = val;
        const x = xOf(i);
        const y = rsiY(val);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else { ctx.lineTo(x, y); }
      });
      if (started) ctx.stroke();

      if (lastRsiVal !== null) {
        ctx.fillStyle = '#BA68C8';
        ctx.font = 'bold 10px "Consolas", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${(lastRsiVal as number).toFixed(1)}`, marginL + 60, panelTop + 11);
      }
    }

    // --- MACD Sub-panel ---
    if (macdOn) {
      const panelTop = mainHeight + subPanelGap + (rsiOn ? subPanelH + subPanelGap : 0);
      const macdMarginT = 14;
      const macdPlotH = subPanelH - macdMarginT - 8;

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, panelTop, width, subPanelH);
      ctx.strokeStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(0, panelTop);
      ctx.lineTo(width, panelTop);
      ctx.stroke();

      ctx.fillStyle = '#9E9E9E';
      ctx.font = '10px "Consolas", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('MACD (12, 26, 9)', marginL, panelTop + 11);

      const allCloses = candles.map(c => c.c);
      const { macd, signal, hist } = computeMACD(allCloses);

      const visibleVals: number[] = [];
      visible.forEach((_, i) => {
        const g = start + i;
        if (macd[g] !== null) visibleVals.push(macd[g] as number);
        if (signal[g] !== null) visibleVals.push(signal[g] as number);
        if (hist[g] !== null) visibleVals.push(hist[g] as number);
      });
      const maxAbs = Math.max(...visibleVals.map(v => Math.abs(v)), 0.01);
      const macdY = (val: number) => panelTop + macdMarginT + macdPlotH / 2 - (val / maxAbs) * (macdPlotH / 2);

      // Zero line
      ctx.strokeStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(marginL, macdY(0));
      ctx.lineTo(width - marginR, macdY(0));
      ctx.stroke();

      // Histogram
      visible.forEach((_, i) => {
        const g = start + i;
        const h = hist[g];
        if (h === null || h === undefined) return;
        const x = xOf(i);
        const y0 = macdY(0);
        const y1 = macdY(h);
        ctx.fillStyle = h >= 0 ? 'rgba(0, 230, 118, 0.55)' : 'rgba(255, 23, 68, 0.55)';
        ctx.fillRect(x - bodyW / 2.5, Math.min(y0, y1), bodyW / 1.25, Math.max(1, Math.abs(y1 - y0)));
      });

      // MACD & Signal lines
      const drawMacdLine = (series: (number | null)[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        let started = false;
        visible.forEach((_, i) => {
          const g = start + i;
          const val = series[g];
          if (val === null || val === undefined) return;
          const x = xOf(i);
          const y = macdY(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        });
        if (started) ctx.stroke();
      };
      drawMacdLine(macd, '#29B6F6');
      drawMacdLine(signal, '#FF7043');
    }
  }, [candles, currentLivePrice, selectedSym, visibleCount, viewOffset, crosshair, showSMA9, showSMA20, showEMA, showVWAP, showVolume, showBollinger, showRSI, showMACD, showTradeMarkers, equityTransactions, fnoTransactions, chartType, prevClose, timeframe, toolMode]);

  // Active or hovered candle for OHLC legend
  const displayedCandle = (() => {
    if (crosshair && crosshair.index >= 0 && crosshair.index < candles.length) {
      return candles[crosshair.index];
    }
    return candles[candles.length - 1] || null;
  })();

  return (
    <div className="space-y-2 select-none font-mono">
      {/* Outer Technical Chart Shell matching BSE India Interface */}
      <div className="bg-[#000000] border border-[#222222] shadow-2xl relative">
        
        {/* Top BSE Navigation Toolbar (Direct replication of 1.png) */}
        <div className="flex flex-wrap items-center justify-between border-b border-[#222222] bg-[#000000] px-3 py-1.5 gap-2 text-xs text-white">
          {/* Left Toolbar Items: BSE Logo + Category Dropdown + Search Box */}
          <div className="flex items-center gap-2">
            {/* BSE Flame Logo */}
            <div className="flex items-center gap-1.5 mr-1 cursor-pointer" onClick={() => setSelectedSym('SENSEX')}>
              <div className="w-5 h-5 flex items-center justify-center">
                {/* BSE Flame icon */}
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-[#E53935]" aria-hidden="true">
                  <path d="M12 2C6.5 2 2 6.5 2 12c0 3.5 1.8 6.6 4.6 8.4-.2-1.3-.2-2.7.2-4 1.2-4.1 4.5-6.7 5.7-9.9.5 2.1 1.7 3.8 3.5 4.9 2.2 1.4 3.6 3.8 3.8 6.4 2.6-1.8 4.2-4.8 4.2-8.2 0-5.5-4.5-9.6-12-9.6z" />
                </svg>
              </div>
              <span className="font-extrabold text-sm tracking-wider lowercase text-white">bse</span>
            </div>

            {/* Category Dropdown (Indices ▾, Equities ▾, Commodities ▾) */}
            <div className="relative">
              <button
                type="button"
                id="bseCategoryDropdownBtn"
                onClick={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
                className="flex items-center gap-1 border border-[#333333] hover:border-[#666666] bg-[#111111] px-2 py-1 text-xs text-[#E0E0E0] cursor-pointer"
              >
                <span>{selectedCategory}</span>
                <ChevronDown className="w-3 h-3 text-[#9E9E9E]" />
              </button>

              {openDropdown === 'category' && (
                <div className="absolute left-0 top-full mt-1 w-36 bg-[#111111] border border-[#333333] shadow-xl z-30 py-1">
                  {(['Indices', 'Equities', 'Commodities'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        setOpenDropdown(null);
                        const firstInCat = allSymbols.find(s => s.type === cat);
                        if (firstInCat) setSelectedSym(firstInCat.sym);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-[#E0E0E0] hover:bg-[#222222] hover:text-white flex items-center justify-between"
                    >
                      <span>{cat}</span>
                      {selectedCategory === cat && <Check className="w-3 h-3 text-[#00E676]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Symbol Box (Crisp white box with black text as in 1.png, click opens quick symbol search) */}
            <div className="relative">
              <div
                id="bseSymbolInputBox"
                onClick={() => setOpenDropdown(openDropdown === 'symbol' ? null : 'symbol')}
                className="bg-[#FFFFFF] text-[#000000] font-bold text-xs px-3 py-1 min-w-[130px] sm:min-w-[170px] flex items-center justify-between cursor-pointer border border-[#FFFFFF] shadow-inner select-none"
                title="Click to search and change stock / index"
              >
                <span className="truncate">
                  {selectedSym === 'SENSEX' ? 'BSE SENSEX' : selectedSym}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#424242] shrink-0 ml-2" />
              </div>

              {openDropdown === 'symbol' && (
                <div className="absolute left-0 top-full mt-1 w-72 sm:w-80 bg-[#111111] border border-[#333333] shadow-2xl z-40 p-2 font-mono">
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-[#757575] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus
                      value={symbolSearchQuery}
                      onChange={(e) => setSymbolSearchQuery(e.target.value)}
                      placeholder="Search BSE / NSE Symbol..."
                      className="w-full bg-[#1A1A1A] border border-[#333333] text-white text-xs pl-8 pr-2.5 py-1.5 outline-none focus:border-[#00E676]"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    {(symbolSearchQuery ? searchableSymbols : filteredSymbolsByCategory).map(s => (
                      <button
                        key={s.sym}
                        type="button"
                        onClick={() => {
                          setSelectedSym(s.sym);
                          setOpenDropdown(null);
                          setSymbolSearchQuery('');
                        }}
                        className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between transition ${
                          selectedSym === s.sym
                            ? 'bg-[#222222] text-[#00E676] font-bold'
                            : 'text-[#BDBDBD] hover:bg-[#1A1A1A] hover:text-white'
                        }`}
                      >
                        <div>
                          <span className="font-bold">{s.sym}</span>
                          <span className="text-[10px] text-[#757575] ml-2 truncate max-w-[140px] inline-block align-bottom">{s.name}</span>
                        </div>
                        <span className="text-[9px] uppercase px-1 py-0.2 bg-[#222222] text-[#9E9E9E]">{s.type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Toolbar Items: Trash, Data, Studies, Tools, Candle, Intraday, Help */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Trash icon (Resets studies/zoom) */}
            <button
              type="button"
              onClick={() => {
                setShowSMA9(false);
                setShowSMA20(false);
                setShowEMA(false);
                setViewOffset(0);
                setVisibleCount(DEFAULT_VISIBLE);
              }}
              title="Clear / Reset Chart Views"
              className="p-1 text-[#9E9E9E] hover:text-white hover:bg-[#222222] transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Data button with checkbox */}
            <button
              type="button"
              onClick={() => setShowDataWindow(prev => !prev)}
              className={`flex items-center gap-1 border px-2 py-1 text-xs cursor-pointer transition ${
                showDataWindow
                  ? 'border-[#00E676] text-[#00E676] bg-[#00E676]/10'
                  : 'border-[#333333] text-[#CCCCCC] hover:bg-[#222222]'
              }`}
              title="Toggle OHLC Data Panel"
            >
              <span className={`w-2.5 h-2.5 border flex items-center justify-center text-[8px] ${showDataWindow ? 'border-[#00E676] bg-[#00E676] text-black font-bold' : 'border-[#666666]'}`}>
                {showDataWindow ? '✓' : ''}
              </span>
              <span>Data</span>
            </button>

            {/* Studies Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'studies' ? null : 'studies')}
                className="flex items-center gap-1 border border-[#333333] hover:border-[#666666] bg-[#111111] px-2 py-1 text-xs text-[#E0E0E0] cursor-pointer"
              >
                <span>Studies</span>
                <ChevronDown className="w-3 h-3 text-[#9E9E9E]" />
              </button>

              {openDropdown === 'studies' && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-[#111111] border border-[#333333] shadow-2xl z-40 py-1.5 text-xs">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#757575] font-bold">Technical Studies</div>
                  <button
                    type="button"
                    onClick={() => setShowSMA9(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>Simple Moving Avg (9)</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#29B6F6]">
                      {showSMA9 ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSMA20(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>Simple Moving Avg (20)</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#FFCA28]">
                      {showSMA20 ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEMA(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>Exponential MA (21)</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#EC407A]">
                      {showEMA ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVWAP(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>VWAP</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#AB47BC]">
                      {showVWAP ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBollinger(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>Bollinger Bands (20, 2)</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#29B6F6]">
                      {showBollinger ? '✓' : ''}
                    </span>
                  </button>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[#757575] font-bold border-t border-[#222] mt-1">Sub-Panels</div>
                  <button
                    type="button"
                    onClick={() => setShowRSI(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>RSI (14)</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#BA68C8]">
                      {showRSI ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMACD(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>MACD (12, 26, 9)</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#29B6F6]">
                      {showMACD ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVolume(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>Volume Sub-Panel</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#00E676]">
                      {showVolume ? '✓' : ''}
                    </span>
                  </button>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[#757575] font-bold border-t border-[#222] mt-1">Trading Activity</div>
                  <button
                    type="button"
                    onClick={() => setShowTradeMarkers(v => !v)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between text-[#CCCCCC]"
                  >
                    <span>My Buy/Sell &amp; F&amp;O Markers</span>
                    <span className="w-3 h-3 border border-[#444] flex items-center justify-center text-[9px] text-[#00E676]">
                      {showTradeMarkers ? '✓' : ''}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Tools Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'tools' ? null : 'tools')}
                className="flex items-center gap-1 border border-[#333333] hover:border-[#666666] bg-[#111111] px-2 py-1 text-xs text-[#E0E0E0] cursor-pointer"
              >
                <span>Tools</span>
                <ChevronDown className="w-3 h-3 text-[#9E9E9E]" />
              </button>

              {openDropdown === 'tools' && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-[#111111] border border-[#333333] shadow-2xl z-40 py-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => { setToolMode('crosshair'); setOpenDropdown(null); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between ${toolMode === 'crosshair' ? 'text-[#00E676] font-bold' : 'text-[#CCCCCC]'}`}
                  >
                    <span>Crosshair</span>
                    {toolMode === 'crosshair' && <Check className="w-3 h-3 text-[#00E676]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolMode('none'); setOpenDropdown(null); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between ${toolMode === 'none' ? 'text-[#00E676] font-bold' : 'text-[#CCCCCC]'}`}
                  >
                    <span>Pointer</span>
                    {toolMode === 'none' && <Check className="w-3 h-3 text-[#00E676]" />}
                  </button>
                </div>
              )}
            </div>

            {/* Candle Type Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'candle' ? null : 'candle')}
                className="flex items-center gap-1 border border-[#333333] hover:border-[#666666] bg-[#111111] px-2 py-1 text-xs text-[#E0E0E0] cursor-pointer"
              >
                <span className="capitalize">{chartType === 'hlc' ? 'Colored HLC' : chartType === 'mountain' ? 'Mountain' : chartType}</span>
                <ChevronDown className="w-3 h-3 text-[#9E9E9E]" />
              </button>

              {openDropdown === 'candle' && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-[#111111] border border-[#333333] shadow-2xl z-40 py-1 text-xs">
                  {[
                    { id: 'candle', label: 'Candle' },
                    { id: 'bar', label: 'Bar' },
                    { id: 'hlc', label: 'Colored HLC' },
                    { id: 'line', label: 'Line' },
                    { id: 'mountain', label: 'Mountain' }
                  ].map(ct => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => { setChartType(ct.id as ChartType); setOpenDropdown(null); }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between ${chartType === ct.id ? 'text-[#00E676] font-bold' : 'text-[#CCCCCC]'}`}
                    >
                      <span>{ct.label}</span>
                      {chartType === ct.id && <Check className="w-3 h-3 text-[#00E676]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Intraday Interval Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'intraday' ? null : 'intraday')}
                className="flex items-center gap-1 border border-[#333333] hover:border-[#666666] bg-[#111111] px-2 py-1 text-xs text-[#E0E0E0] cursor-pointer"
              >
                <span>{TIMEFRAME_LABELS[timeframe]}</span>
                <ChevronDown className="w-3 h-3 text-[#9E9E9E]" />
              </button>

              {openDropdown === 'intraday' && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-[#111111] border border-[#333333] shadow-2xl z-40 py-1 text-xs">
                  {(['1m', '5m', '15m', '30m', '1h', '1D'] as Timeframe[]).map(tf => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => { setTimeframe(tf); setOpenDropdown(null); }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-[#222222] flex items-center justify-between ${timeframe === tf ? 'text-[#00E676] font-bold' : 'text-[#CCCCCC]'}`}
                    >
                      <span>{TIMEFRAME_LABELS[tf]}</span>
                      {timeframe === tf && <Check className="w-3 h-3 text-[#00E676]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Help (?) Button */}
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="p-1 text-[#9E9E9E] hover:text-white hover:bg-[#222222] transition cursor-pointer"
              title="BSE Chart Help &amp; Controls"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-header Price Legend Bar (Exact string format from image 1.png: Price O: 74294.96 , H: 74294.96 , L: 74294.96 , C: 74294.96) */}
        <div className="bg-[#000000] px-4 pt-2 pb-1 flex flex-wrap items-center justify-between text-xs text-white border-b border-[#141414]">
          <div className="flex items-center gap-3 tracking-wide">
            <span className="text-[#AAAAAA] font-bold">Price</span>
            {displayedCandle ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <span>
                  O: <strong className="text-[#00E676] font-mono">{displayedCandle.o.toFixed(2)}</strong> ,
                </span>
                <span>
                  H: <strong className="text-[#00E676] font-mono">{displayedCandle.h.toFixed(2)}</strong> ,
                </span>
                <span>
                  L: <strong className="text-[#FF1744] font-mono">{displayedCandle.l.toFixed(2)}</strong> ,
                </span>
                <span>
                  C: <strong className={`font-mono ${displayedCandle.c >= displayedCandle.o ? 'text-[#00E676]' : 'text-[#FF1744]'}`}>{displayedCandle.c.toFixed(2)}</strong>
                </span>
              </div>
            ) : (
              <span>Loading price feed...</span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-[#757575] font-mono">
            {showSMA9 && <span className="text-[#29B6F6]">● SMA(9)</span>}
            {showSMA20 && <span className="text-[#FFCA28]">● SMA(20)</span>}
            <span className="flex items-center gap-1 text-[#00E676]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
              <span>Live Tick</span>
            </span>
          </div>
        </div>

        {/* Chart Canvas Area */}
        <div ref={containerRef} className="relative w-full bg-[#000000] overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full block cursor-crosshair"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />

          {/* Bottom Center Navigation Controls (Direct match to 1.png: |<< < 🔍- 🔍+ > >>) */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#111111]/80 border border-[#333333] px-2 py-1 rounded shadow-lg backdrop-blur-xs z-20">
            <button
              type="button"
              onClick={jumpToFirst}
              title="First Historical Candle (|<<)"
              className="px-1.5 py-0.5 text-xs text-[#CCCCCC] hover:text-white hover:bg-[#222222] cursor-pointer transition font-mono"
            >
              |&lt;&lt;
            </button>
            <button
              type="button"
              onClick={panLeft}
              title="Pan Left (<)"
              className="px-1.5 py-0.5 text-xs text-[#CCCCCC] hover:text-white hover:bg-[#222222] cursor-pointer transition font-mono"
            >
              &lt;
            </button>
            <button
              type="button"
              onClick={zoomOut}
              title="Zoom Out (🔍-)"
              className="px-1.5 py-0.5 text-xs text-[#CCCCCC] hover:text-white hover:bg-[#222222] cursor-pointer transition font-mono flex items-center"
            >
              🔍-
            </button>
            <button
              type="button"
              onClick={zoomIn}
              title="Zoom In (🔍+)"
              className="px-1.5 py-0.5 text-xs text-[#CCCCCC] hover:text-white hover:bg-[#222222] cursor-pointer transition font-mono flex items-center"
            >
              🔍+
            </button>
            <button
              type="button"
              onClick={panRight}
              title="Pan Right (>)"
              className="px-1.5 py-0.5 text-xs text-[#CCCCCC] hover:text-white hover:bg-[#222222] cursor-pointer transition font-mono"
            >
              &gt;
            </button>
            <button
              type="button"
              onClick={jumpToLatest}
              title="Jump to Live Candle (>>)"
              className="px-1.5 py-0.5 text-xs text-[#CCCCCC] hover:text-white hover:bg-[#222222] cursor-pointer transition font-mono"
            >
              &gt;&gt;
            </button>
          </div>

          {/* Optional Data Table Window (when 'Data' toggle is active) */}
          {showDataWindow && displayedCandle && (
            <div className="absolute top-2 right-24 bg-[#111111]/95 border border-[#333333] p-3 text-xs shadow-2xl z-20 w-52 font-mono">
              <div className="flex items-center justify-between border-b border-[#222222] pb-1.5 mb-2 font-bold text-white">
                <span>{selectedSym} Data</span>
                <button type="button" onClick={() => setShowDataWindow(false)} className="text-[#757575] hover:text-white">
                  &times;
                </button>
              </div>
              <div className="space-y-1 text-[#CCCCCC]">
                <div className="flex justify-between">
                  <span className="text-[#757575]">Time:</span>
                  <span>{new Date(displayedCandle.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#757575]">Open:</span>
                  <span className="text-[#00E676]">{displayedCandle.o.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#757575]">High:</span>
                  <span className="text-[#00E676]">{displayedCandle.h.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#757575]">Low:</span>
                  <span className="text-[#FF1744]">{displayedCandle.l.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#757575]">Close:</span>
                  <span className={displayedCandle.c >= displayedCandle.o ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                    {displayedCandle.c.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#757575]">Volume:</span>
                  <span>{displayedCandle.v.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#111111] border border-[#333333] p-5 max-w-md w-full shadow-2xl font-mono text-xs text-[#E0E0E0]">
            <div className="flex justify-between items-center border-b border-[#222222] pb-2 mb-3">
              <h3 className="font-bold text-sm text-white uppercase">BSE Technical Charting Help</h3>
              <button type="button" onClick={() => setShowHelpModal(false)} className="text-[#757575] hover:text-white text-lg">
                &times;
              </button>
            </div>
            <div className="space-y-2.5">
              <p><strong className="text-[#00E676]">Navigation:</strong> Drag anywhere on the chart canvas to pan left/right.</p>
              <p><strong className="text-[#00E676]">Zooming:</strong> Scroll with your mouse wheel or use the <code className="bg-[#222222] px-1">🔍-</code> / <code className="bg-[#222222] px-1">🔍+</code> buttons.</p>
              <p><strong className="text-[#00E676]">Symbol Switch:</strong> Click the symbol box (e.g. <code className="bg-white text-black px-1 font-bold">BSE SENSEX</code>) to select any BSE/NSE stock or index.</p>
              <p><strong className="text-[#00E676]">Studies &amp; Candle types:</strong> Use the top dropdowns to toggle moving averages or switch between Candlestick, Bar, Line, and Mountain views.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#222222] text-right">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="bg-[#333333] text-white px-3 py-1 text-xs hover:bg-[#444444]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
