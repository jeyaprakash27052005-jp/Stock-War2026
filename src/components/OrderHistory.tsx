import React from 'react';
import { Transaction, FnoTransaction } from '../types';
import { inr } from '../marketData';

interface OrderHistoryProps {
  equityTransactions: Transaction[];
  fnoTransactions: FnoTransaction[];
}

export const OrderHistory: React.FC<OrderHistoryProps> = ({
  equityTransactions,
  fnoTransactions
}) => {
  const allLogs = [
    ...equityTransactions.map(t => ({
      time: t.time,
      kind: 'EQUITY',
      instrument: t.sym,
      side: t.side,
      qty: `${t.qty} shares`,
      price: t.price,
      total: t.qty * t.price
    })),
    ...fnoTransactions.map(t => ({
      time: t.time,
      kind: t.kind,
      instrument: t.kind === 'FUT' ? `${t.underlying} FUT` : `${t.underlying} ${t.strike} ${t.optType}`,
      side: t.side,
      qty: `${t.lots} lots`,
      price: t.price,
      total: t.lots * t.price
    }))
  ].sort((a, b) => b.time - a.time);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-['Big_Shoulders_Display',sans-serif] font-bold text-2xl uppercase tracking-wider text-[#F1F4F6]">
          Order History Log
        </h2>
        <div className="text-xs font-mono text-[#6B7680]">
          Total Orders: <span className="text-[#D4A93F] font-bold">{allLogs.length}</span>
        </div>
      </div>

      <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
        {allLogs.length === 0 ? (
          <div className="text-center py-12 text-[#6B7680] text-sm font-mono">
            No executed orders yet.
          </div>
        ) : (
          <table className="w-full border-collapse font-mono">
            <thead>
              <tr className="border-b border-[#1F2A33]">
                <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Time</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Instrument</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Segment</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Side</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Qty / Lots</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Execution Price</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-[#6B7680] p-3">Order Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2A33]">
              {allLogs.map((log, idx) => {
                const isBuy = log.side === 'buy';
                return (
                  <tr key={idx} className="hover:bg-[#141B23]">
                    <td className="p-3 text-xs text-[#6B7680]">
                      {new Date(log.time).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="p-3 font-bold text-[#F1F4F6]">{log.instrument}</td>
                    <td className="p-3 text-xs text-[#D4A93F]">{log.kind}</td>
                    <td className={`p-3 text-xs font-bold uppercase ${isBuy ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                      {log.side}
                    </td>
                    <td className="p-3 text-right text-xs text-[#C9D3D9]">{log.qty}</td>
                    <td className="p-3 text-right text-xs text-[#C9D3D9]">{inr(log.price)}</td>
                    <td className="p-3 text-right text-sm font-semibold text-[#F1F4F6]">
                      {inr(log.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
