import React from 'react';
import { Portfolio, Stock, Holding } from '../types';
import { inr, pct } from '../marketData';

interface PortfolioViewProps {
  portfolio: Portfolio;
  stocks: Stock[];
  onSellHolding: (sym: string) => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  portfolio,
  stocks,
  onSellHolding
}) => {
  const holdingsEntries = (Object.entries(portfolio.holdings || {}) as [string, Holding][]).filter(([, h]) => h.qty > 0);

  let totalEquityCost = 0;
  let totalEquityValue = 0;

  holdingsEntries.forEach(([sym, h]) => {
    const st = stocks.find(s => s.sym === sym);
    const ltp = st ? st.ltp : h.avgCost;
    totalEquityCost += h.avgCost * h.qty;
    totalEquityValue += ltp * h.qty;
  });

  const totalEquityPnl = totalEquityValue - totalEquityCost;
  const equityPnlPct = totalEquityCost > 0 ? (totalEquityPnl / totalEquityCost) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-['Big_Shoulders_Display',sans-serif] font-bold text-2xl uppercase tracking-wider text-[#F1F4F6]">
          Equity Portfolio
        </h2>
        <div className="text-xs font-mono text-[#6B7680]">
          Total Holdings: <span className="text-[#D4A93F] font-bold">{holdingsEntries.length}</span>
        </div>
      </div>

      <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
        {holdingsEntries.length === 0 ? (
          <div className="text-center py-12 text-[#6B7680] text-sm font-mono">
            No open equity holdings. Go to Market Watch to place your first trade.
          </div>
        ) : (
          <table className="w-full border-collapse font-mono">
            <thead>
              <tr className="border-b border-[#1F2A33]">
                <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Symbol</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Qty</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Avg Cost (₹)</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">LTP (₹)</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Current Value (₹)</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">P&amp;L (₹)</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2A33]">
              {holdingsEntries.map(([sym, h]) => {
                const stock = stocks.find(s => s.sym === sym);
                const ltp = stock ? stock.ltp : h.avgCost;
                const value = ltp * h.qty;
                const pnl = (ltp - h.avgCost) * h.qty;
                const pnlPercent = h.avgCost > 0 ? ((ltp - h.avgCost) / h.avgCost) * 100 : 0;
                const isProfit = pnl >= 0;
                const tickDir = stock?.tickDirection;

                return (
                  <tr key={sym} className="hover:bg-[#141B23] transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-[#F1F4F6] flex items-center gap-1.5">
                        <span>{sym}</span>
                        {tickDir === 'up' && <span className="text-[#2FBF71] text-xs">▲</span>}
                        {tickDir === 'down' && <span className="text-[#E2564F] text-xs">▼</span>}
                      </div>
                      <div className="font-['IBM_Plex_Sans',sans-serif] text-xs text-[#6B7680]">
                        {stock?.name || 'Stock Asset'}
                      </div>
                    </td>
                    <td className="p-3 text-right text-sm font-semibold text-[#F1F4F6]">{h.qty}</td>
                    <td className="p-3 text-right text-sm text-[#C9D3D9]">{inr(h.avgCost)}</td>
                    <td className="p-3 text-right text-sm font-semibold">
                      <span className={`px-1.5 py-0.5 rounded transition-all duration-300 ${
                        tickDir === 'up'
                          ? 'text-[#2FBF71] bg-[#2FBF71]/15 font-bold'
                          : tickDir === 'down'
                          ? 'text-[#E2564F] bg-[#E2564F]/15 font-bold'
                          : 'text-[#D4A93F]'
                      }`}>
                        {inr(ltp)}
                      </span>
                    </td>
                    <td className="p-3 text-right text-sm font-semibold text-[#F1F4F6]">{inr(value)}</td>
                    <td className={`p-3 text-right text-sm font-semibold ${isProfit ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                      {isProfit ? '+' : ''}{inr(pnl)} ({pct(pnlPercent)})
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSellHolding(sym)}
                        className="px-3 py-1 bg-[#E2564F] text-[#FFFFFF] font-bold text-xs uppercase hover:brightness-110 active:translate-y-px transition cursor-pointer"
                      >
                        Sell
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#1F2A33] bg-[#141B23] font-semibold text-xs">
                <td className="p-3 uppercase text-[#6B7680]">Portfolio Total</td>
                <td className="p-3 text-right text-[#C9D3D9]">
                  {holdingsEntries.reduce((acc, [, h]) => acc + h.qty, 0)} Shares
                </td>
                <td className="p-3 text-right text-[#6B7680]">—</td>
                <td className="p-3 text-right text-[#6B7680]">—</td>
                <td className="p-3 text-right text-[#F1F4F6]">{inr(totalEquityValue)}</td>
                <td className={`p-3 text-right ${totalEquityPnl >= 0 ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                  {totalEquityPnl >= 0 ? '+' : ''}{inr(totalEquityPnl)} ({pct(equityPnlPct)})
                </td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
};
