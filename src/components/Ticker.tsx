import React from 'react';
import { Stock, FnoUnderlying } from '../types';
import { inr, pct } from '../marketData';

interface TickerProps {
  stocks: Stock[];
  indices: FnoUnderlying[];
  commodities: FnoUnderlying[];
}

export const Ticker: React.FC<TickerProps> = ({ stocks, indices, commodities }) => {
  const allItems = [
    ...indices.map(i => ({
      sym: i.sym,
      ltp: i.spot || 0,
      prev: i.prevSpot || (i.spot || 0) * 0.998,
      tickDirection: i.tickDirection
    })),
    ...commodities.map(c => ({
      sym: c.sym,
      ltp: c.spot || 0,
      prev: c.prevSpot || (c.spot || 0) * 0.997,
      tickDirection: c.tickDirection
    })),
    ...stocks.slice(0, 40).map(s => ({
      sym: s.sym,
      ltp: s.ltp,
      prev: s.prevClose,
      tickDirection: s.tickDirection
    }))
  ];

  return (
    <div id="ticker-wrap" className="bg-[#05070A] border-b border-[#1F2A33] overflow-hidden whitespace-nowrap py-2 relative flex-shrink-0">
      <div className="absolute top-0 bottom-0 left-0 w-16 z-10 bg-gradient-to-r from-[#05070A] to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-16 z-10 bg-gradient-to-l from-[#05070A] to-transparent pointer-events-none" />
      <div className="animate-ticker">
        {[...allItems, ...allItems].map((item, idx) => {
          const chg = item.ltp - item.prev;
          const chgPct = item.prev > 0 ? (chg / item.prev) * 100 : 0;
          const isUp = chg >= 0;
          const isTickingUp = item.tickDirection === 'up';
          const isTickingDown = item.tickDirection === 'down';

          return (
            <span key={idx} className="font-['IBM_Plex_Mono',monospace] text-xs tracking-wider px-5 inline-flex items-center gap-1.5 text-[#6B7680]">
              <span className="text-[#D4A93F] font-semibold">{item.sym}</span>
              <span className={`transition-colors duration-300 ${
                isTickingUp
                  ? 'text-[#2FBF71] font-bold underline'
                  : isTickingDown
                  ? 'text-[#E2564F] font-bold underline'
                  : 'text-[#C9D3D9]'
              }`}>
                {inr(item.ltp)}
              </span>
              <span className={isUp ? 'text-[#2FBF71]' : 'text-[#E2564F]'}>
                {isUp ? '▲' : '▼'} {pct(chgPct)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
