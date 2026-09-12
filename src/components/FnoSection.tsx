import React, { useState } from 'react';
import { FnoUnderlying, FnoPosition, Stock } from '../types';
import { inr, futPrice, bsPrice, daysToExpiry, RISK_FREE } from '../marketData';

interface FnoSectionProps {
  underlyings: FnoUnderlying[];
  stocks: Stock[];
  positions: Record<string, FnoPosition>;
  cash: number;
  onFnoTrade: (
    kind: 'FUT' | 'OPT',
    underlying: string,
    strike: number | null,
    optType: 'CE' | 'PE' | null,
    lotSize: number,
    side: 'buy' | 'sell',
    lots: number,
    price: number,
    marginRequired: number
  ) => Promise<void>;
  onSquareOff: (key: string, exitPrice?: number, pnl?: number) => Promise<void>;
}

export const FnoSection: React.FC<FnoSectionProps> = ({
  underlyings,
  stocks,
  positions,
  cash,
  onFnoTrade,
  onSquareOff
}) => {
  const [fnoTab, setFnoTab] = useState<'futures' | 'options' | 'positions'>('futures');
  const [selectedUnderlying, setSelectedUnderlying] = useState<string>('NIFTY');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [squaringOffKey, setSquaringOffKey] = useState<string | null>(null);
  const [squareOffNotice, setSquareOffNotice] = useState<string | null>(null);

  // Modal State
  const [fnoModal, setFnoModal] = useState<{
    kind: 'FUT' | 'OPT';
    underlying: string;
    strike: number | null;
    optType: 'CE' | 'PE' | null;
    lotSize: number;
    side: 'buy' | 'sell';
    price: number;
    label: string;
  } | null>(null);

  const [lotsInput, setLotsInput] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const getSpot = (sym: string): number => {
    const st = stocks.find(s => s.sym === sym);
    if (st) return st.ltp;
    const und = underlyings.find(u => u.sym === sym);
    if (und && typeof und.spot === 'number') return und.spot;
    return 1000;
  };

  const filteredUnderlyings = underlyings.filter(u => {
    const q = searchQuery.trim().toLowerCase();
    return !q || u.sym.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
  });

  const openTradeModal = (
    kind: 'FUT' | 'OPT',
    sym: string,
    strike: number | null,
    optType: 'CE' | 'PE' | null,
    lotSize: number,
    side: 'buy' | 'sell'
  ) => {
    const spot = getSpot(sym);
    const cfg = underlyings.find(u => u.sym === sym) || { sigma: 0.25 };
    const price = kind === 'FUT'
      ? futPrice(spot)
      : bsPrice(spot, strike || spot, daysToExpiry() / 365, RISK_FREE, cfg.sigma, optType || 'CE');

    const label = kind === 'FUT'
      ? `${sym} FUTURES`
      : `${sym} ${strike} ${optType}`;

    setFnoModal({
      kind,
      underlying: sym,
      strike,
      optType,
      lotSize,
      side,
      price,
      label
    });
    setLotsInput(1);
    setErrorMsg(null);
  };

  const handleConfirmFno = async () => {
    if (!fnoModal) return;
    const lots = Math.floor(Number(lotsInput));
    if (lots <= 0 || isNaN(lots)) {
      setErrorMsg('Enter at least 1 lot.');
      return;
    }

    const { kind, underlying, strike, optType, lotSize, side, price } = fnoModal;
    const notional = lots * lotSize * price;
    const margin = kind === 'FUT' ? notional * 0.12 : (side === 'buy' ? notional : notional * 0.15);

    if (margin > cash) {
      setErrorMsg(`Insufficient cash margin! Required: ${inr(margin)}, Available: ${inr(cash)}`);
      return;
    }

    setSubmitting(true);
    try {
      await onFnoTrade(kind, underlying, strike, optType, lotSize, side, lots, price, margin);
      setFnoModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'F&O trade failed';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Build Option Chain
  const activeCfg = underlyings.find(u => u.sym === selectedUnderlying) || underlyings[0];
  const activeSpot = getSpot(activeCfg.sym);
  const activeUnd = underlyings.find(u => u.sym === activeCfg.sym);
  const activeStock = stocks.find(s => s.sym === activeCfg.sym);
  const activeTickDir = activeUnd?.tickDirection || activeStock?.tickDirection || 'same';

  const atm = Math.round(activeSpot / activeCfg.strikeStep) * activeCfg.strikeStep;
  const strikes: number[] = [];
  for (let i = -5; i <= 5; i++) {
    strikes.push(atm + i * activeCfg.strikeStep);
  }
  const tYears = daysToExpiry() / 365;
  const optionRows = strikes.map(k => ({
    strike: k,
    ce: bsPrice(activeSpot, k, tYears, RISK_FREE, activeCfg.sigma, 'CE'),
    pe: bsPrice(activeSpot, k, tYears, RISK_FREE, activeCfg.sigma, 'PE')
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="font-['Big_Shoulders_Display',sans-serif] font-bold text-2xl uppercase tracking-wider text-[#F1F4F6]">
          Futures &amp; Options Desk
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search F&O contracts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-1.5 font-mono outline-none focus:border-[#D4A93F]"
          />
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex border-b border-[#1F2A33] mb-5 gap-2">
        <button
          type="button"
          onClick={() => setFnoTab('futures')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
            fnoTab === 'futures'
              ? 'border-[#D4A93F] text-[#D4A93F]'
              : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
          }`}
        >
          Futures Contracts
        </button>
        <button
          type="button"
          onClick={() => setFnoTab('options')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
            fnoTab === 'options'
              ? 'border-[#D4A93F] text-[#D4A93F]'
              : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
          }`}
        >
          Options Chain
        </button>
        <button
          type="button"
          onClick={() => setFnoTab('positions')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 relative ${
            fnoTab === 'positions'
              ? 'border-[#D4A93F] text-[#D4A93F]'
              : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
          }`}
        >
          Open Positions ({Object.keys(positions).length})
        </button>
      </div>

      {/* FUTURES TAB */}
      {fnoTab === 'futures' && (
        <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
          <table className="w-full border-collapse font-mono">
            <thead>
              <tr className="border-b border-[#1F2A33]">
                <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Contract</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Spot (₹)</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Futures Price (₹)</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Lot Size</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Margin / Lot</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2A33]">
              {filteredUnderlyings.map(u => {
                const spot = getSpot(u.sym);
                const fp = futPrice(spot);
                const marginPerLot = fp * u.lotSize * 0.12;
                const stockMatch = stocks.find(s => s.sym === u.sym);
                const undTick = stockMatch ? stockMatch.tickDirection : u.tickDirection;
                const spotTickClass = undTick === 'up'
                  ? 'text-[#2FBF71] font-bold bg-[#2FBF71]/15 px-1.5 py-0.5 rounded transition-all duration-300'
                  : undTick === 'down'
                  ? 'text-[#E2564F] font-bold bg-[#E2564F]/15 px-1.5 py-0.5 rounded transition-all duration-300'
                  : 'text-[#C9D3D9]';

                return (
                  <tr key={u.sym} className="hover:bg-[#141B23] transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-[#F1F4F6] flex items-center gap-1.5">
                        <span>{u.sym} FUT</span>
                        {undTick === 'up' && <span className="text-[#2FBF71] text-xs">▲</span>}
                        {undTick === 'down' && <span className="text-[#E2564F] text-xs">▼</span>}
                      </div>
                      <div className="text-xs text-[#6B7680] font-sans">{u.name} ({u.kind})</div>
                    </td>
                    <td className="p-3 text-right text-xs">
                      <span className={spotTickClass}>{inr(spot)}</span>
                    </td>
                    <td className="p-3 text-right text-sm font-semibold text-[#D4A93F]">{inr(fp)}</td>
                    <td className="p-3 text-right text-xs text-[#C9D3D9]">{u.lotSize}</td>
                    <td className="p-3 text-right text-xs text-[#6B7680]">{inr(marginPerLot)}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => openTradeModal('FUT', u.sym, null, null, u.lotSize, 'buy')}
                          className="px-2.5 py-1 bg-[#2FBF71] text-[#06170F] font-bold text-xs uppercase hover:brightness-110 cursor-pointer"
                        >
                          Long
                        </button>
                        <button
                          type="button"
                          onClick={() => openTradeModal('FUT', u.sym, null, null, u.lotSize, 'sell')}
                          className="px-2.5 py-1 bg-[#E2564F] text-[#FFFFFF] font-bold text-xs uppercase hover:brightness-110 cursor-pointer"
                        >
                          Short
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* OPTIONS CHAIN TAB */}
      {fnoTab === 'options' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#10161D] border border-[#1F2A33] p-4 font-mono">
            <div>
              <label className="block text-[10px] text-[#6B7680] uppercase tracking-wider mb-1">Select Underlying</label>
              <select
                value={selectedUnderlying}
                onChange={(e) => setSelectedUnderlying(e.target.value)}
                className="bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3 py-1.5 outline-none focus:border-[#D4A93F]"
              >
                {underlyings.map(u => (
                  <option key={u.sym} value={u.sym}>
                    {u.sym} ({u.name})
                  </option>
                ))}
              </select>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#6B7680] uppercase tracking-wider flex items-center justify-end gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#2FBF71] animate-ping" />
                <span>Live Spot</span>
              </div>
              <div className={`text-lg font-bold transition-all duration-300 px-2 py-0.5 rounded ${
                activeTickDir === 'up'
                  ? 'text-[#2FBF71] bg-[#2FBF71]/15'
                  : activeTickDir === 'down'
                  ? 'text-[#E2564F] bg-[#E2564F]/15'
                  : 'text-[#D4A93F]'
              }`}>
                {inr(activeSpot)} {activeTickDir === 'up' ? '▲' : activeTickDir === 'down' ? '▼' : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#6B7680] uppercase tracking-wider">Lot Size</div>
              <div className="text-sm font-semibold text-[#F1F4F6]">{activeCfg.lotSize} shares</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#6B7680] uppercase tracking-wider">Days to Expiry</div>
              <div className="text-sm font-semibold text-[#F1F4F6]">{daysToExpiry()} Days</div>
            </div>
          </div>

          <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
            <table className="w-full border-collapse font-mono text-center">
              <thead>
                <tr className="border-b border-[#1F2A33] bg-[#141B23]">
                  <th colSpan={2} className="text-[#2FBF71] py-2 uppercase text-xs tracking-wider border-r border-[#1F2A33]">
                    Call Options (CE)
                  </th>
                  <th className="py-2 text-[#D4A93F] uppercase text-xs tracking-wider border-r border-[#1F2A33]">
                    Strike Price
                  </th>
                  <th colSpan={2} className="text-[#E2564F] py-2 uppercase text-xs tracking-wider">
                    Put Options (PE)
                  </th>
                </tr>
                <tr className="border-b border-[#1F2A33] text-[10px] text-[#6B7680] uppercase">
                  <th className="p-2 text-right">Premium (₹)</th>
                  <th className="p-2 text-center border-r border-[#1F2A33]">Action</th>
                  <th className="p-2 border-r border-[#1F2A33]">Strike</th>
                  <th className="p-2 text-left">Premium (₹)</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2A33]">
                {optionRows.map(row => {
                  const isAtm = row.strike === atm;
                  return (
                    <tr key={row.strike} className={isAtm ? 'bg-[#D4A93F]/5' : 'hover:bg-[#141B23]'}>
                      <td className="p-2 text-right text-sm font-semibold text-[#F1F4F6]">
                        {inr(row.ce)}
                      </td>
                      <td className="p-2 text-center border-r border-[#1F2A33]">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => openTradeModal('OPT', activeCfg.sym, row.strike, 'CE', activeCfg.lotSize, 'buy')}
                            className="px-2 py-0.5 bg-[#2FBF71] text-[#06170F] font-bold text-[10px] uppercase hover:brightness-110 cursor-pointer"
                          >
                            Long CE
                          </button>
                          <button
                            type="button"
                            onClick={() => openTradeModal('OPT', activeCfg.sym, row.strike, 'CE', activeCfg.lotSize, 'sell')}
                            className="px-2 py-0.5 bg-[#E2564F] text-[#FFFFFF] font-bold text-[10px] uppercase hover:brightness-110 cursor-pointer"
                          >
                            Short CE
                          </button>
                        </div>
                      </td>

                      <td className="p-2 font-bold text-[#F1F4F6] border-r border-[#1F2A33] text-sm">
                        {row.strike}
                        {isAtm && (
                          <span className="ml-1 text-[9px] bg-[#D4A93F]/20 text-[#D4A93F] px-1 py-0.2 border border-[#D4A93F]/40 font-mono">
                            ATM
                          </span>
                        )}
                      </td>

                      <td className="p-2 text-left text-sm font-semibold text-[#F1F4F6]">
                        {inr(row.pe)}
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => openTradeModal('OPT', activeCfg.sym, row.strike, 'PE', activeCfg.lotSize, 'buy')}
                            className="px-2 py-0.5 bg-[#2FBF71] text-[#06170F] font-bold text-[10px] uppercase hover:brightness-110 cursor-pointer"
                          >
                            Long PE
                          </button>
                          <button
                            type="button"
                            onClick={() => openTradeModal('OPT', activeCfg.sym, row.strike, 'PE', activeCfg.lotSize, 'sell')}
                            className="px-2 py-0.5 bg-[#E2564F] text-[#FFFFFF] font-bold text-[10px] uppercase hover:brightness-110 cursor-pointer"
                          >
                            Short PE
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* POSITIONS TAB */}
      {fnoTab === 'positions' && (
        <div className="space-y-3">
          {squareOffNotice && (
            <div className="bg-[#2FBF71]/15 border border-[#2FBF71] text-[#2FBF71] p-3 text-xs font-mono flex items-center justify-between">
              <span>{squareOffNotice}</span>
              <button
                type="button"
                onClick={() => setSquareOffNotice(null)}
                className="text-[#6B7680] hover:text-white cursor-pointer ml-4 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
            {Object.keys(positions).length === 0 ? (
              <div className="text-center py-12 text-[#6B7680] text-sm font-mono">
                No open F&amp;O positions. Enter Futures or Options tabs to take a position.
              </div>
            ) : (
              <table className="w-full border-collapse font-mono">
                <thead>
                  <tr className="border-b border-[#1F2A33]">
                    <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Instrument</th>
                    <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Side</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Lots</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Avg Price (₹)</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Current LTP (₹)</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Margin (₹)</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Unrealized P&amp;L</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2A33]">
                  {(Object.entries(positions) as [string, FnoPosition][]).map(([key, pos]) => {
                    const spot = getSpot(pos.underlying);
                    const cfg = underlyings.find(u => u.sym === pos.underlying) || { sigma: 0.25 };
                    const curPrice = pos.kind === 'FUT'
                      ? futPrice(spot)
                      : bsPrice(spot, pos.strike || spot, daysToExpiry() / 365, RISK_FREE, cfg.sigma, pos.optType || 'CE');

                    const pnl = pos.side === 'long'
                      ? (curPrice - pos.avgPrice) * pos.lots * pos.lotSize
                      : (pos.avgPrice - curPrice) * pos.lots * pos.lotSize;

                    const isProfit = pnl >= 0;
                    const instrumentName = pos.kind === 'FUT' ? `${pos.underlying} FUT` : `${pos.underlying} ${pos.strike} ${pos.optType}`;

                    return (
                      <tr key={key} className="hover:bg-[#141B23]">
                        <td className="p-3 font-bold text-[#F1F4F6]">
                          {instrumentName}
                        </td>
                        <td className={`p-3 text-xs font-bold uppercase ${pos.side === 'long' ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                          {pos.side}
                        </td>
                        <td className="p-3 text-right text-[#F1F4F6]">{pos.lots}</td>
                        <td className="p-3 text-right text-[#C9D3D9]">{inr(pos.avgPrice)}</td>
                        <td className="p-3 text-right text-[#C9D3D9]">{inr(curPrice)}</td>
                        <td className="p-3 text-right text-[#6B7680]">{inr(pos.margin)}</td>
                        <td className={`p-3 text-right font-semibold ${isProfit ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                          {isProfit ? '+' : ''}{inr(pnl)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            disabled={squaringOffKey === key}
                            onClick={async () => {
                              setSquaringOffKey(key);
                              try {
                                await onSquareOff(key, curPrice, pnl);
                                setSquareOffNotice(`Position ${instrumentName} squared off successfully. Realized P&L: ${isProfit ? '+' : ''}${inr(pnl)}`);
                                setTimeout(() => setSquareOffNotice(null), 5000);
                              } catch (err: unknown) {
                                const msg = err instanceof Error ? err.message : 'Failed to square off position';
                                alert(msg);
                              } finally {
                                setSquaringOffKey(null);
                              }
                            }}
                            className="px-3 py-1 bg-[#E2564F]/20 border border-[#E2564F] text-[#E2564F] hover:bg-[#E2564F] hover:text-white disabled:opacity-50 text-xs uppercase font-bold tracking-wider transition cursor-pointer inline-flex items-center gap-1.5"
                          >
                            {squaringOffKey === key ? (
                              <>
                                <span className="w-2.5 h-2.5 border-2 border-[#E2564F] border-t-transparent rounded-full animate-spin" />
                                <span>Closing...</span>
                              </>
                            ) : (
                              <span>Square Off</span>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* F&O Order Modal */}
      {fnoModal && (
        <div className="fixed inset-0 bg-[#05070A]/80 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#10161D] border border-[#1F2A33] relative shadow-2xl">
            <button
              type="button"
              onClick={() => setFnoModal(null)}
              className="absolute top-3 right-3 text-[#6B7680] hover:text-[#F1F4F6] text-xl leading-none cursor-pointer"
            >
              &times;
            </button>

            <div className="p-5 border-b border-[#1F2A33] border-dashed">
              <div className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6]">
                {fnoModal.label}
              </div>
              <div className="text-xs text-[#D4A93F] font-mono mt-1">
                Contract Price: {inr(fnoModal.price)} | Lot Size: {fnoModal.lotSize}
              </div>
            </div>

            <div className="p-5 space-y-4 font-mono">
              <div>
                <label className="block text-xs uppercase text-[#6B7680] tracking-wider mb-1.5 font-sans font-medium">
                  Number of Lots
                </label>
                <input
                  type="number"
                  min="1"
                  value={lotsInput}
                  onChange={(e) => setLotsInput(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] px-3 py-2 text-sm outline-none focus:border-[#D4A93F]"
                />
              </div>

              <div className="bg-[#141B23] border border-[#1F2A33] p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6B7680]">Total Quantity:</span>
                  <span className="text-[#F1F4F6]">{lotsInput * fnoModal.lotSize} shares</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7680]">Estimated Notional:</span>
                  <span className="text-[#F1F4F6]">{inr(lotsInput * fnoModal.lotSize * fnoModal.price)}</span>
                </div>
                <div className="flex justify-between border-t border-[#1F2A33] pt-1.5">
                  <span className="text-[#D4A93F]">Estimated Margin Required:</span>
                  <span className="font-bold text-[#D4A93F]">
                    {inr(
                      fnoModal.kind === 'FUT'
                        ? lotsInput * fnoModal.lotSize * fnoModal.price * 0.12
                        : fnoModal.side === 'buy'
                        ? lotsInput * fnoModal.lotSize * fnoModal.price
                        : lotsInput * fnoModal.lotSize * fnoModal.price * 0.15
                    )}
                  </span>
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-[rgba(226,86,79,0.12)] border border-[#E2564F] text-[#E2564F] text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFnoModal(null)}
                  className="flex-1 py-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFno}
                  disabled={submitting}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 ${
                    fnoModal.side === 'buy'
                      ? 'bg-[#2FBF71] text-[#06170F] hover:brightness-110'
                      : 'bg-[#E2564F] text-[#FFFFFF] hover:brightness-110'
                  }`}
                >
                  {submitting ? 'Placing...' : `Confirm ${fnoModal.side === 'buy' ? 'LONG' : 'SHORT'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
