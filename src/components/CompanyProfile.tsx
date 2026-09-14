import React from 'react';
import { Stock } from '../types';
import { inr, pct } from '../marketData';
import { getCompanyFundamentals } from '../fundamentalsData';

interface CompanyProfileProps {
  stock: Stock;
  onClose: () => void;
}

const StatCard: React.FC<{ label: string; value: string; accent?: 'pos' | 'neg' | 'default' }> = ({ label, value, accent = 'default' }) => (
  <div className="bg-[#141B23] border border-[#1F2A33] p-3">
    <div className="text-[10px] uppercase tracking-wider text-[#6B7680]">{label}</div>
    <div className={`text-sm font-bold mt-1 ${
      accent === 'pos' ? 'text-[#2FBF71]' : accent === 'neg' ? 'text-[#E2564F]' : 'text-[#F1F4F6]'
    }`}>
      {value}
    </div>
  </div>
);

export const CompanyProfile: React.FC<CompanyProfileProps> = ({ stock, onClose }) => {
  const f = getCompanyFundamentals(stock);
  const chg = stock.ltp - stock.prevClose;
  const chgPercent = stock.prevClose > 0 ? (chg / stock.prevClose) * 100 : 0;
  const isUp = chg >= 0;

  const maxRevenue = Math.max(...f.yearly.map(y => y.revenue), 1);
  const maxProfit = Math.max(...f.yearly.map(y => Math.abs(y.netProfit)), 1);

  return (
    <div className="fixed inset-0 bg-[#05070A]/85 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#10161D] border border-[#1F2A33] relative shadow-2xl font-mono">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-[#6B7680] hover:text-[#F1F4F6] text-2xl leading-none cursor-pointer z-10"
        >
          &times;
        </button>

        {/* Header */}
        <div className="p-5 border-b border-[#1F2A33] border-dashed bg-[#0D1319]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-['Big_Shoulders_Display',sans-serif] text-3xl font-bold text-[#F1F4F6]">
              {stock.sym}
            </span>
            {stock.isCustom && (
              <span className="text-[9px] bg-[#D4A93F]/10 border border-[#D4A93F]/40 text-[#D4A93F] px-1.5 py-0.5 uppercase tracking-wider">
                Teacher Added
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 border border-[#1F2A33] text-[#6B7680] uppercase tracking-wider">
              {stock.sector}
            </span>
          </div>
          <div className="text-sm text-[#6B7680] mt-1">{stock.name}</div>

          <div className="flex items-center gap-4 mt-3">
            <div className="text-2xl font-bold text-[#F1F4F6]">{inr(stock.ltp)}</div>
            <div className={`text-sm font-semibold ${isUp ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
              {isUp ? '+' : ''}{inr(chg)} ({pct(chgPercent)})
            </div>
          </div>
        </div>

        {/* Key valuation stats */}
        <div className="p-5 border-b border-[#1F2A33] border-dashed">
          <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] mb-3">
            Key Valuation Metrics (TTM)
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <StatCard label="Market Cap" value={`₹${f.marketCap.toLocaleString('en-IN')} Cr`} />
            <StatCard label="P/E Ratio" value={f.peRatio.toString()} />
            <StatCard label="P/B Ratio" value={f.pbRatio.toString()} />
            <StatCard label="EPS (TTM)" value={inr(f.epsTTM)} />
            <StatCard label="Book Value / Share" value={inr(f.bookValue)} />
            <StatCard label="Debt / Equity" value={f.debtToEquity.toString()} />
            <StatCard label="Dividend Yield" value={`${f.dividendYield}%`} accent={f.dividendYield > 0 ? 'pos' : 'default'} />
            <StatCard label="Face Value" value={`₹${f.faceValue}`} />
            <StatCard label="Shares Outstanding" value={`${f.sharesOutstandingCr.toLocaleString('en-IN')} Cr`} />
            <StatCard label="Promoter Holding" value={`${f.promoterHolding}%`} />
            <StatCard label="Revenue CAGR (5Y)" value={`${f.revenueCagr > 0 ? '+' : ''}${f.revenueCagr}%`} accent={f.revenueCagr >= 0 ? 'pos' : 'neg'} />
            <StatCard label="Profit CAGR (5Y)" value={`${f.profitCagr > 0 ? '+' : ''}${f.profitCagr}%`} accent={f.profitCagr >= 0 ? 'pos' : 'neg'} />
          </div>
        </div>

        {/* Year-wise fundamentals */}
        <div className="p-5 border-b border-[#1F2A33] border-dashed">
          <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] mb-3">
            Year-wise Fundamentals (Standalone)
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1F2A33] text-[#6B7680]">
                  <th className="p-2 text-left">Financial Year</th>
                  <th className="p-2 text-right">Revenue (₹ Cr)</th>
                  <th className="p-2 text-right">Net Profit (₹ Cr)</th>
                  <th className="p-2 text-right">Net Margin</th>
                  <th className="p-2 text-right">EPS (₹)</th>
                  <th className="p-2 text-right">ROE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2A33]">
                {f.yearly.map(y => (
                  <tr key={y.year}>
                    <td className="p-2 font-bold text-[#F1F4F6]">{y.year}</td>
                    <td className="p-2 text-right text-[#C9D3D9]">{y.revenue.toLocaleString('en-IN')}</td>
                    <td className={`p-2 text-right font-semibold ${y.netProfit >= 0 ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                      {y.netProfit.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2 text-right text-[#C9D3D9]">{y.netMargin}%</td>
                    <td className="p-2 text-right text-[#C9D3D9]">{inr(y.eps)}</td>
                    <td className="p-2 text-right text-[#D4A93F]">{y.roe}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Simple visual trend bars */}
        <div className="p-5">
          <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] mb-3">
            Revenue &amp; Net Profit Trend
          </h4>
          <div className="flex items-end gap-3 h-32">
            {f.yearly.map(y => (
              <div key={y.year} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className="w-full flex items-end gap-1 h-full justify-center">
                  <div
                    className="w-1/2 bg-[#2FBF71]/60 border-t-2 border-[#2FBF71]"
                    style={{ height: `${Math.max(4, (y.revenue / maxRevenue) * 100)}%` }}
                    title={`Revenue: ₹${y.revenue.toLocaleString('en-IN')} Cr`}
                  />
                  <div
                    className={`w-1/2 border-t-2 ${y.netProfit >= 0 ? 'bg-[#D4A93F]/60 border-[#D4A93F]' : 'bg-[#E2564F]/60 border-[#E2564F]'}`}
                    style={{ height: `${Math.max(4, (Math.abs(y.netProfit) / maxProfit) * 100)}%` }}
                    title={`Net Profit: ₹${y.netProfit.toLocaleString('en-IN')} Cr`}
                  />
                </div>
                <div className="text-[9px] text-[#6B7680] whitespace-nowrap">{y.year.replace('FY', "'")}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[#6B7680]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#2FBF71]/60 border-t-2 border-[#2FBF71] inline-block" /> Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#D4A93F]/60 border-t-2 border-[#D4A93F] inline-block" /> Net Profit</span>
          </div>
          <p className="text-[10px] text-[#6B7680] italic mt-4 leading-relaxed">
            Simulated fundamentals for educational use only - generated for this paper-trading exercise and not
            sourced from any real company's financial filings.
          </p>
        </div>
      </div>
    </div>
  );
};
