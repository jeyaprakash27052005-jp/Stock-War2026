import React, { useState } from 'react';
import { Stock } from '../types';
import { inr, pct } from '../marketData';

interface MarketWatchProps {
  stocks: Stock[];
  cash: number;
  onTrade: (sym: string, side: 'buy' | 'sell', qty: number, price: number) => Promise<void>;
}

export const MarketWatch: React.FC<MarketWatchProps> = ({ stocks, cash, onTrade }) => {
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderModal, setOrderModal] = useState<{
    stock: Stock;
    side: 'buy' | 'sell';
  } | null>(null);
  const [orderQty, setOrderQty] = useState<number>(1);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const sectors = ['ALL', ...Array.from(new Set(stocks.map(s => s.sector))).sort()];

  const filteredStocks = stocks.filter(s => {
    const matchesSector = selectedSector === 'ALL' || s.sector === selectedSector;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q || s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    return matchesSector && matchesQuery;
  });

  const handleOpenOrder = (stock: Stock, side: 'buy' | 'sell') => {
    setOrderModal({ stock, side });
    setOrderQty(1);
    setOrderError(null);
  };

  const handleConfirmOrder = async () => {
    if (!orderModal) return;
    const { stock, side } = orderModal;
    const qty = Math.floor(Number(orderQty));
    if (qty <= 0 || isNaN(qty)) {
      setOrderError('Please enter a valid quantity of 1 or more shares.');
      return;
    }

    const totalCost = stock.ltp * qty;
    if (side === 'buy' && totalCost > cash) {
      setOrderError(`Insufficient cash! Required: ${inr(totalCost)}, Available: ${inr(cash)}`);
      return;
    }

    setSubmitting(true);
    try {
      await onTrade(stock.sym, side, qty, stock.ltp);
      setOrderModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Trade execution failed';
      setOrderError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const advances = stocks.filter(s => s.ltp >= s.prevClose).length;
  const declines = stocks.filter(s => s.ltp < s.prevClose).length;

  return (
    <div>
      {/* Live Market Status Bar */}
      <div className="bg-[#10161D] border border-[#1F2A33] p-3 mb-4 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-[#141B23] border border-[#2FBF71]/40">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2FBF71] animate-ping" />
            <span className="font-bold text-[#2FBF71] uppercase tracking-wider">
              Market Open • Live Ticks Active
            </span>
          </div>
          <span className="text-[#6B7680] hidden md:inline">
            Tick Size: <span className="text-[#C9D3D9]">₹0.05 (NSE Order Book)</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#6B7680]">Market Breadth:</span>
            <span className="px-2 py-0.5 bg-[#2FBF71]/15 text-[#2FBF71] font-bold border border-[#2FBF71]/30">
              ▲ {advances} Advances
            </span>
            <span className="px-2 py-0.5 bg-[#E2564F]/15 text-[#E2564F] font-bold border border-[#E2564F]/30">
              ▼ {declines} Declines
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="font-['Big_Shoulders_Display',sans-serif] font-bold text-2xl uppercase tracking-wider text-[#F1F4F6]">
          Market Watch
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <input
              type="text"
              placeholder="Search symbol/name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-2 font-mono outline-none focus:border-[#D4A93F]"
            />
          </div>
          <div className="w-56">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-2 font-mono outline-none focus:border-[#D4A93F]"
            >
              {sectors.map(sec => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? `All Sectors (${stocks.length})` : sec}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#1F2A33]">
              <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Symbol &amp; Company</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Sector</th>
              <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">LTP (₹)</th>
              <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Change (₹ / %)</th>
              <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold hidden md:table-cell">Day High / Low</th>
              <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1F2A33]">
            {filteredStocks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-[#6B7680] text-sm font-mono">
                  No stocks found matching the criteria.
                </td>
              </tr>
            ) : (
              filteredStocks.map(stock => {
                const chg = stock.ltp - stock.prevClose;
                const chgPercent = stock.prevClose > 0 ? (chg / stock.prevClose) * 100 : 0;
                const isUp = chg >= 0;
                const dayHigh = stock.high || Math.max(stock.ltp, stock.prevClose * 1.01);
                const dayLow = stock.low || Math.min(stock.ltp, stock.prevClose * 0.99);

                // Dynamic Flash Color based on active tick direction
                const tickFlashClass =
                  stock.tickDirection === 'up'
                    ? 'bg-[#2FBF71]/25 text-[#2FBF71] font-bold transition-all duration-300'
                    : stock.tickDirection === 'down'
                    ? 'bg-[#E2564F]/25 text-[#E2564F] font-bold transition-all duration-300'
                    : 'text-[#F1F4F6] transition-colors duration-500';

                return (
                  <tr key={stock.sym} className="hover:bg-[#141B23] transition-colors font-mono">
                    <td className="p-3">
                      <div className="font-bold text-[#F1F4F6] flex items-center gap-2">
                        {stock.sym}
                        {stock.isCustom && (
                          <span className="text-[9px] bg-[#D4A93F]/10 border border-[#D4A93F]/40 text-[#D4A93F] px-1.5 py-0.5 uppercase tracking-wider">
                            Teacher Added
                          </span>
                        )}
                        {stock.tickDirection === 'up' && (
                          <span className="text-[#2FBF71] text-xs animate-bounce">▲</span>
                        )}
                        {stock.tickDirection === 'down' && (
                          <span className="text-[#E2564F] text-xs animate-bounce">▼</span>
                        )}
                      </div>
                      <div className="font-['IBM_Plex_Sans',sans-serif] text-xs text-[#6B7680] truncate max-w-xs">
                        {stock.name}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-[#6B7680] font-['IBM_Plex_Sans',sans-serif]">
                      {stock.sector}
                    </td>
                    <td className="p-3 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-sm ${tickFlashClass}`}>
                        {inr(stock.ltp)}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className={`text-xs font-semibold ${isUp ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                        {isUp ? '+' : ''}{inr(chg)}
                      </div>
                      <div className={`text-[10px] ${isUp ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                        ({pct(chgPercent)})
                      </div>
                    </td>
                    <td className="p-3 text-right text-xs text-[#6B7680] hidden md:table-cell">
                      <div>H: <span className="text-[#2FBF71]">{inr(dayHigh)}</span></div>
                      <div>L: <span className="text-[#E2564F]">{inr(dayLow)}</span></div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenOrder(stock, 'buy')}
                          className="px-3 py-1 bg-[#2FBF71] text-[#06170F] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer"
                        >
                          Buy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenOrder(stock, 'sell')}
                          className="px-3 py-1 bg-[#E2564F] text-[#FFFFFF] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer"
                        >
                          Sell
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Order Modal */}
      {orderModal && (
        <div className="fixed inset-0 bg-[#05070A]/80 z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-sm bg-[#10161D] border border-[#1F2A33] relative shadow-2xl ${
            orderModal.side === 'buy' ? 'border-t-4 border-t-[#2FBF71]' : 'border-t-4 border-t-[#E2564F]'
          }`}>
            <button
              type="button"
              onClick={() => setOrderModal(null)}
              className="absolute top-3 right-3 text-[#6B7680] hover:text-[#F1F4F6] text-xl leading-none cursor-pointer"
            >
              &times;
            </button>

            <div className="p-5 border-b border-[#1F2A33] border-dashed">
              <div className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6]">
                {orderModal.stock.sym}
              </div>
              <div className="text-xs text-[#6B7680] mt-0.5">{orderModal.stock.name}</div>
              <div className="text-sm font-mono text-[#D4A93F] mt-2">
                Current LTP: {inr(orderModal.stock.ltp)}
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs uppercase text-[#6B7680] tracking-wider mb-1.5 font-medium">
                  {orderModal.side === 'buy' ? 'Quantity to Buy (Shares)' : 'Quantity to Sell (Shares)'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={orderQty}
                  onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] px-3 py-2 font-mono text-sm outline-none focus:border-[#D4A93F]"
                />
              </div>

              <div className="bg-[#141B23] border border-[#1F2A33] p-3 flex justify-between items-center text-xs font-mono">
                <span className="text-[#6B7680]">Estimated Order Value:</span>
                <span className="text-sm font-bold text-[#F1F4F6]">
                  {inr(orderModal.stock.ltp * orderQty)}
                </span>
              </div>

              {orderError && (
                <div className="p-2.5 bg-[rgba(226,86,79,0.12)] border border-[#E2564F] text-[#E2564F] text-xs font-mono">
                  {orderError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOrderModal(null)}
                  className="flex-1 py-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOrder}
                  disabled={submitting}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 ${
                    orderModal.side === 'buy'
                      ? 'bg-[#2FBF71] text-[#06170F] hover:brightness-110'
                      : 'bg-[#E2564F] text-[#FFFFFF] hover:brightness-110'
                  }`}
                >
                  {submitting
                    ? 'Executing...'
                    : orderModal.side === 'buy'
                    ? 'Confirm Buy'
                    : 'Confirm Sell'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
