import React, { useState } from 'react';
import { Snowflake, Trash2, RotateCcw, Lock, AlertTriangle, CheckCircle2, CalendarClock, Printer, IdCard, Mail, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Portfolio, Stock, FnoUnderlying, Holding, FnoPosition, StudentProfile } from '../types';
import { inr, pct, STARTING_CASH, futPrice, bsPrice, daysToExpiry, formatExpiryDate, sortExpiries, RISK_FREE } from '../marketData';

interface TeacherDashboardProps {
  students: Portfolio[];
  studentProfiles: Record<string, StudentProfile>;
  allStocks: Stock[];
  underlyings: FnoUnderlying[];
  onResetStudent: (roll: string) => Promise<void>;
  onFreezeStudent: (roll: string, freeze: boolean) => Promise<void>;
  onDeleteStudent: (roll: string) => Promise<void>;
  onPurgeStudent?: (roll: string) => Promise<void>;
  onRestoreStudent: (roll: string) => Promise<void>;
  onUpdateCompany: (sym: string, updates: Partial<Stock>) => Promise<void>;
  onAddCompany: (stock: Partial<Stock>) => Promise<void>;
  onDeleteCompany: (sym: string) => Promise<void>;
  onUpdateUnderlyingExpiry: (sym: string, expiry: number) => Promise<void>;
  onRemoveUnderlyingExpiry: (sym: string, expiry: number) => Promise<void>;
}

interface ActionModalConfig {
  type: 'delete_student' | 'purge_student' | 'restore_student' | 'reset_student' | 'delete_company';
  targetId: string;
  title: string;
  description: string;
  warningNote?: string;
  confirmLabel: string;
  isDanger?: boolean;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  students,
  studentProfiles,
  allStocks,
  underlyings,
  onResetStudent,
  onFreezeStudent,
  onDeleteStudent,
  onPurgeStudent,
  onRestoreStudent,
  onUpdateCompany,
  onAddCompany,
  onDeleteCompany,
  onUpdateUnderlyingExpiry,
  onRemoveUnderlyingExpiry
}) => {
  const [activeTab, setActiveTab] = useState<'students' | 'companies' | 'expiry' | 'registrations'>('students');
  const [registrationSearch, setRegistrationSearch] = useState<string>('');
  const [selectedStudentRoll, setSelectedStudentRoll] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'ACTIVE' | 'FROZEN' | 'DELETED'>('ALL');
  const [companySearch, setCompanySearch] = useState<string>('');
  const [companySectorFilter, setCompanySectorFilter] = useState<string>('ALL');

  // Action Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<ActionModalConfig | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionToast, setActionToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Edit Company Modal State
  const [editingCompany, setEditingCompany] = useState<Stock | null>(null);
  const [editName, setEditName] = useState('');
  const [editSector, setEditSector] = useState('');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editFno, setEditFno] = useState(false);
  const [editLotSize, setEditLotSize] = useState<number>(100);
  const [editSigma, setEditSigma] = useState<number>(0.25);
  const [editStrikeStep, setEditStrikeStep] = useState<number>(20);
  const [isSaving, setIsSaving] = useState(false);
  const [companyMsg, setCompanyMsg] = useState<string | null>(null);

  // Add Company Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSym, setNewSym] = useState('');
  const [newName, setNewName] = useState('');
  const [newSector, setNewSector] = useState('IT');
  const [newCustomSector, setNewCustomSector] = useState('');
  const [newPrice, setNewPrice] = useState<number>(500);
  const [newFno, setNewFno] = useState(false);
  const [newLotSize, setNewLotSize] = useState<number>(100);
  const [newSigma, setNewSigma] = useState<number>(0.25);
  const [newStrikeStep, setNewStrikeStep] = useState<number>(20);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  // F&O Expiry Management State (per-instrument, editable for every stock, index & commodity)
  const [expirySearch, setExpirySearch] = useState<string>('');
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [savingExpirySym, setSavingExpirySym] = useState<string | null>(null);
  const [expiryToast, setExpiryToast] = useState<{ sym: string; message: string; type: 'success' | 'error' } | null>(null);

  const sectors = ['ALL', ...Array.from(new Set(allStocks.map(s => s.sector))).sort()];

  // Calculate Net Worth for each student
  const studentStats = students.map(st => {
    let eqValue = 0;
    (Object.entries(st.holdings || {}) as [string, Holding][]).forEach(([sym, h]) => {
      const stock = allStocks.find(s => s.sym === sym);
      const ltp = stock ? stock.ltp : h.avgCost;
      eqValue += ltp * h.qty;
    });

    let margin = 0;
    let unrealized = 0;
    (Object.values(st.fno?.positions || {}) as FnoPosition[]).forEach(pos => {
      margin += pos.margin || 0;
      const stock = allStocks.find(s => s.sym === pos.underlying);
      const und = underlyings.find(u => u.sym === pos.underlying);
      const spot = stock ? stock.ltp : (und && typeof und.spot === 'number' ? und.spot : 1000);
      const sigma = und?.sigma || 0.25;
      const cur = pos.kind === 'FUT'
        ? futPrice(spot, pos.expiry)
        : bsPrice(spot, pos.strike || spot, daysToExpiry(pos.expiry) / 365, RISK_FREE, sigma, pos.optType || 'CE');
      const pnl = pos.side === 'long'
        ? (cur - pos.avgPrice) * pos.lots * pos.lotSize
        : (pos.avgPrice - cur) * pos.lots * pos.lotSize;
      unrealized += pnl;
    });

    const netWorth = (st.cash || 0) + eqValue + margin + unrealized;
    const totalTrades = (st.transactions?.length || 0) + (st.fno?.transactions?.length || 0);
    return {
      portfolio: st,
      eqValue,
      margin,
      unrealized,
      netWorth,
      totalTrades
    };
  });

  const filteredStudents = studentStats.filter(s => {
    const q = studentSearch.trim().toUpperCase();
    const matchesQ = !q || s.portfolio.roll.includes(q) || (s.portfolio.studentName || '').toUpperCase().includes(q);
    if (!matchesQ) return false;
    if (studentStatusFilter === 'ACTIVE') return !s.portfolio.isFrozen && !s.portfolio.isDeleted;
    if (studentStatusFilter === 'FROZEN') return !!s.portfolio.isFrozen && !s.portfolio.isDeleted;
    if (studentStatusFilter === 'DELETED') return !!s.portfolio.isDeleted;
    return true;
  }).sort((a, b) => b.netWorth - a.netWorth);

  const totalCount = students.length;
  const activeCount = students.filter(s => !s.isFrozen && !s.isDeleted).length;
  const frozenCount = students.filter(s => !!s.isFrozen && !s.isDeleted).length;
  const deletedCount = students.filter(s => !!s.isDeleted).length;

  const activeTradersCount = studentStats.filter(s => s.totalTrades > 0 && !s.portfolio.isDeleted).length;
  // Non-deleted accounts for performance calculations
  const nonDeletedStats = studentStats.filter(s => !s.portfolio.isDeleted);
  const candidateStats = nonDeletedStats.length > 0 ? nonDeletedStats : studentStats;
  const topPerformer = candidateStats.slice().sort((a, b) => b.netWorth - a.netWorth)[0];
  const topPerformerNetWorth = topPerformer ? topPerformer.netWorth : STARTING_CASH;
  const topPerformerPnl = topPerformer ? topPerformer.netWorth - STARTING_CASH : 0;

  // Selected Student Drilldown
  const currentStudentData = studentStats.find(s => s.portfolio.roll === selectedStudentRoll);

  // Filtered Companies
  const filteredCompanies = allStocks.filter(s => {
    const matchesSector = companySectorFilter === 'ALL' || s.sector === companySectorFilter;
    const q = companySearch.trim().toLowerCase();
    const matchesQ = !q || s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    return matchesSector && matchesQ;
  });

  const handleOpenEdit = (stock: Stock) => {
    setEditingCompany(stock);
    setEditName(stock.name);
    setEditSector(stock.sector);
    setEditPrice(stock.ltp);
    const und = underlyings.find(u => u.sym === stock.sym);
    setEditFno(!!und || !!stock.fno);
    setEditLotSize(stock.lotSize || und?.lotSize || 100);
    setEditSigma(stock.sigma || und?.sigma || 0.25);
    setEditStrikeStep(stock.strikeStep || und?.strikeStep || Math.max(5, Math.round(stock.ltp * 0.02)));
    setCompanyMsg(null);
  };

  const handleSaveCompanyUpdates = async () => {
    if (!editingCompany) return;
    if (!editName.trim() || editPrice <= 0) {
      setCompanyMsg('Please provide a valid company name and positive price.');
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateCompany(editingCompany.sym, {
        name: editName.trim(),
        sector: editSector,
        price: editPrice,
        ltp: editPrice,
        fno: editFno,
        lotSize: editFno ? editLotSize : undefined,
        sigma: editFno ? editSigma : undefined,
        strikeStep: editFno ? editStrikeStep : undefined
      });
      setCompanyMsg('Company updated successfully in Cloud Firestore.');
      setTimeout(() => {
        setEditingCompany(null);
        setCompanyMsg(null);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      setCompanyMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newSym.trim().toUpperCase();
    const name = newName.trim();
    const sector = newSector === '__new__' ? newCustomSector.trim() : newSector;
    if (!sym || !name || !sector || newPrice <= 0) {
      setAddMsg('All fields are required and price must be greater than zero.');
      return;
    }

    setIsSaving(true);
    try {
      await onAddCompany({
        sym,
        name,
        sector,
        price: newPrice,
        ltp: newPrice,
        prevClose: newPrice,
        fno: newFno,
        lotSize: newFno ? newLotSize : undefined,
        sigma: newFno ? newSigma : undefined,
        strikeStep: newFno ? newStrikeStep : undefined,
        isCustom: true
      });
      setAddMsg(`Successfully added ${sym} to Cloud Firestore!`);
      setNewSym('');
      setNewName('');
      setNewPrice(500);
      setShowAddForm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Addition failed';
      setAddMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Print / export a full trading history report for a single student (all sections)
  const REPORT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; color: #111; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #111; padding-bottom: 4px; }
  .meta { color: #444; font-size: 11px; margin-bottom: 16px; line-height: 1.6; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 20px; }
  .summary-box { border: 1px solid #999; padding: 8px 10px; }
  .summary-box .label { font-size: 9px; text-transform: uppercase; color: #666; }
  .summary-box .value { font-size: 14px; font-weight: bold; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th, td { border: 1px solid #999; padding: 4px 6px; font-size: 10.5px; text-align: right; }
  th { background: #eee; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  .pos { color: #0a7a34; font-weight: bold; }
  .neg { color: #b3261e; font-weight: bold; }
  .empty-note { color: #777; font-style: italic; padding: 8px 0; }
  .badge { display: inline-block; padding: 2px 8px; border: 1px solid #111; font-size: 10px; font-weight: bold; margin-left: 8px; vertical-align: middle; }
  footer { margin-top: 30px; font-size: 9px; color: #777; border-top: 1px solid #ccc; padding-top: 8px; }
  .student-block + .student-block { page-break-before: always; }
  .cover-table td, .cover-table th { text-align: right; }
  .cover-table td:first-child, .cover-table th:first-child { text-align: left; }
  @media print {
    body { margin: 12mm; }
    h2 { page-break-after: avoid; }
    table { page-break-inside: avoid; }
  }`;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtTime = (t: number) => new Date(t).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Builds the inner HTML (everything inside one student's report block, no <html>/<head>/<body>)
  const buildStudentReportSection = (data: (typeof studentStats)[number]): string => {
    const st = data.portfolio;
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const equityRows = (Object.entries(st.holdings || {}) as [string, Holding][]).map(([sym, h]) => {
      const stock = allStocks.find(s => s.sym === sym);
      const ltp = stock ? stock.ltp : h.avgCost;
      const value = ltp * h.qty;
      const cost = h.avgCost * h.qty;
      return { sym, qty: h.qty, avgCost: h.avgCost, ltp, value, pnl: value - cost };
    });

    const equityTxns = [...(st.transactions || [])].sort((a, b) => b.time - a.time);

    const fnoPositions = (Object.entries(st.fno?.positions || {}) as [string, FnoPosition][])
      .filter(([, pos]) => pos.lots > 0)
      .map(([key, pos]) => {
        const stock = allStocks.find(s => s.sym === pos.underlying);
        const und = underlyings.find(u => u.sym === pos.underlying);
        const spot = stock ? stock.ltp : (und && typeof und.spot === 'number' ? und.spot : 1000);
        const sigma = und?.sigma || 0.25;
        const cur = pos.kind === 'FUT'
          ? futPrice(spot, pos.expiry)
          : bsPrice(spot, pos.strike || spot, daysToExpiry(pos.expiry) / 365, RISK_FREE, sigma, pos.optType || 'CE');
        const pnl = pos.side === 'long'
          ? (cur - pos.avgPrice) * pos.lots * pos.lotSize
          : (pos.avgPrice - cur) * pos.lots * pos.lotSize;
        const instrument = pos.kind === 'FUT' ? `${pos.underlying} FUT` : `${pos.underlying} ${pos.strike} ${pos.optType}`;
        return { key, instrument, side: pos.side, lots: pos.lots, avgPrice: pos.avgPrice, cur, expiry: pos.expiry, margin: pos.margin || 0, pnl };
      });

    const fnoTxns = [...(st.fno?.transactions || [])].sort((a, b) => b.time - a.time);

    const statusLabel = st.isDeleted ? 'DELETED / INVALID' : st.isFrozen ? 'FROZEN' : 'ACTIVE';
    const totalPnl = data.netWorth - STARTING_CASH;

    return `
  <div class="student-block">
  <h1>Stock War 2026 &mdash; Student Trading Report <span class="badge">${statusLabel}</span></h1>
  <div class="meta">
    Roll No: <strong>${esc(st.roll)}</strong> &nbsp;|&nbsp;
    Name: <strong>${esc(st.studentName || 'N/A')}</strong> &nbsp;|&nbsp;
    Email: ${esc(st.email || 'N/A')}<br/>
    Report generated: ${generatedAt}
  </div>

  <h2>Account Summary</h2>
  <div class="summary-grid">
    <div class="summary-box"><div class="label">Starting Cash</div><div class="value">${inr(STARTING_CASH)}</div></div>
    <div class="summary-box"><div class="label">Cash Balance</div><div class="value">${inr(st.cash || 0)}</div></div>
    <div class="summary-box"><div class="label">Equity Value</div><div class="value">${inr(data.eqValue)}</div></div>
    <div class="summary-box"><div class="label">F&amp;O Margin Blocked</div><div class="value">${inr(data.margin)}</div></div>
    <div class="summary-box"><div class="label">F&amp;O Unrealized P&amp;L</div><div class="value ${data.unrealized >= 0 ? 'pos' : 'neg'}">${data.unrealized >= 0 ? '+' : ''}${inr(data.unrealized)}</div></div>
    <div class="summary-box"><div class="label">Net Worth</div><div class="value">${inr(data.netWorth)}</div></div>
    <div class="summary-box"><div class="label">Total P&amp;L</div><div class="value ${totalPnl >= 0 ? 'pos' : 'neg'}">${totalPnl >= 0 ? '+' : ''}${inr(totalPnl)} (${pct((totalPnl / STARTING_CASH) * 100)})</div></div>
    <div class="summary-box"><div class="label">Total Trades</div><div class="value">${data.totalTrades}</div></div>
  </div>

  <h2>Equity Holdings (${equityRows.length})</h2>
  ${equityRows.length ? `
  <table>
    <thead><tr><th>Symbol</th><th>Qty</th><th>Avg Cost</th><th>LTP</th><th>Current Value</th><th>P&amp;L</th></tr></thead>
    <tbody>
      ${equityRows.map(r => `<tr>
        <td>${esc(r.sym)}</td><td>${r.qty}</td><td>${inr(r.avgCost)}</td><td>${inr(r.ltp)}</td><td>${inr(r.value)}</td>
        <td class="${r.pnl >= 0 ? 'pos' : 'neg'}">${r.pnl >= 0 ? '+' : ''}${inr(r.pnl)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : `<div class="empty-note">No equity holdings.</div>`}

  <h2>Equity Trade History (${equityTxns.length})</h2>
  ${equityTxns.length ? `
  <table>
    <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead>
    <tbody>
      ${equityTxns.map(t => `<tr>
        <td>${fmtTime(t.time)}</td><td>${esc(t.sym)}</td>
        <td class="${t.side === 'buy' ? 'pos' : 'neg'}">${t.side.toUpperCase()}</td>
        <td>${t.qty}</td><td>${inr(t.price)}</td><td>${inr(t.qty * t.price)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : `<div class="empty-note">No equity trades yet.</div>`}

  <h2>F&amp;O Open Positions (${fnoPositions.length})</h2>
  ${fnoPositions.length ? `
  <table>
    <thead><tr><th>Instrument</th><th>Side</th><th>Lots</th><th>Avg Price</th><th>LTP</th><th>Expiry</th><th>Margin</th><th>Unrealized P&amp;L</th></tr></thead>
    <tbody>
      ${fnoPositions.map(p => `<tr>
        <td>${esc(p.instrument)}</td>
        <td class="${p.side === 'long' ? 'pos' : 'neg'}">${p.side.toUpperCase()}</td>
        <td>${p.lots}</td><td>${inr(p.avgPrice)}</td><td>${inr(p.cur)}</td>
        <td>${formatExpiryDate(p.expiry)}</td><td>${inr(p.margin)}</td>
        <td class="${p.pnl >= 0 ? 'pos' : 'neg'}">${p.pnl >= 0 ? '+' : ''}${inr(p.pnl)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : `<div class="empty-note">No open F&amp;O positions.</div>`}

  <h2>F&amp;O Trade History (${fnoTxns.length})</h2>
  ${fnoTxns.length ? `
  <table>
    <thead><tr><th>Time</th><th>Instrument</th><th>Side</th><th>Lots</th><th>Price</th><th>Value</th></tr></thead>
    <tbody>
      ${fnoTxns.map(t => {
        const instrument = t.kind === 'FUT' ? `${t.underlying} FUT` : `${t.underlying} ${t.strike} ${t.optType}`;
        return `<tr>
          <td>${fmtTime(t.time)}</td><td>${esc(instrument)}</td>
          <td class="${t.side === 'buy' ? 'pos' : 'neg'}">${t.side.toUpperCase()}</td>
          <td>${t.lots}</td><td>${inr(t.price)}</td><td>${inr(t.lots * t.price)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : `<div class="empty-note">No F&amp;O trades yet.</div>`}

  <footer>
    Stock War 2026 Paper Trading Simulation &mdash; This report reflects simulated trading activity only and holds no real monetary value.
  </footer>
  </div>`;
  };

  // Opens a formatted HTML document in a new tab and triggers the print dialog
  const openPrintWindow = (title: string, bodyHtml: string) => {
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      setActionToast({ message: 'Unable to open the print window. Please allow pop-ups for this site and try again.', type: 'error' });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try { printWindow.print(); } catch { /* no-op */ }
    }, 350);
  };

  // Print a single student's full trading history report
  const handlePrintStudentReport = (data: (typeof studentStats)[number]) => {
    openPrintWindow(`Trading Report - ${data.portfolio.roll}`, buildStudentReportSection(data));
  };

  // Print a combined report for every (currently filtered) student, one after another,
  // each starting on a fresh page, with a cover page summary table up front.
  const handlePrintAllStudentsReport = (dataList: (typeof studentStats)) => {
    if (dataList.length === 0) {
      setActionToast({ message: 'No students match the current filters to print.', type: 'error' });
      return;
    }
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const coverRows = dataList.map(d => {
      const totalPnl = d.netWorth - STARTING_CASH;
      const statusLabel = d.portfolio.isDeleted ? 'DELETED' : d.portfolio.isFrozen ? 'FROZEN' : 'ACTIVE';
      return `<tr>
        <td>${esc(d.portfolio.roll)}</td>
        <td>${esc(d.portfolio.studentName || 'N/A')}</td>
        <td>${statusLabel}</td>
        <td>${inr(d.netWorth)}</td>
        <td class="${totalPnl >= 0 ? 'pos' : 'neg'}">${totalPnl >= 0 ? '+' : ''}${inr(totalPnl)}</td>
        <td>${d.totalTrades}</td>
      </tr>`;
    }).join('');

    const cover = `
  <div class="student-block">
  <h1>Stock War 2026 &mdash; Full Class Trading Report</h1>
  <div class="meta">
    Students included: <strong>${dataList.length}</strong> &nbsp;|&nbsp;
    Report generated: ${generatedAt}
  </div>
  <h2>Class Summary</h2>
  <table class="cover-table">
    <thead><tr><th>Roll No</th><th>Name</th><th>Status</th><th>Net Worth</th><th>Total P&amp;L</th><th>Trades</th></tr></thead>
    <tbody>${coverRows}</tbody>
  </table>
  </div>`;

    const sections = dataList.map(d => buildStudentReportSection(d)).join('\n');
    openPrintWindow('Full Class Trading Report', cover + sections);
  };

  // Toast auto-clear
  React.useEffect(() => {
    if (actionToast) {
      const timer = setTimeout(() => {
        setActionToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionToast]);

  // Expiry toast auto-clear
  React.useEffect(() => {
    if (expiryToast) {
      const timer = setTimeout(() => {
        setExpiryToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [expiryToast]);

  // Teacher adds a new expiry series for one F&O instrument (stock, index or commodity).
  // This only ADDS - it never removes or replaces any expiry series already set.
  const handleAddExpiry = async (sym: string, dateValue: string) => {
    if (!dateValue) {
      setExpiryToast({ sym, message: 'Pick a valid date first.', type: 'error' });
      return;
    }
    // Set expiry to end-of-day (23:59:59) on the chosen date, in local time.
    const chosen = new Date(dateValue + 'T23:59:59');
    if (isNaN(chosen.getTime())) {
      setExpiryToast({ sym, message: 'Invalid date.', type: 'error' });
      return;
    }
    setSavingExpirySym(sym);
    try {
      await onUpdateUnderlyingExpiry(sym, chosen.getTime());
      setExpiryToast({ sym, message: `Added ${chosen.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} as a new expiry series for ${sym}. Existing series were not changed.`, type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add expiry';
      setExpiryToast({ sym, message: msg, type: 'error' });
    } finally {
      setSavingExpirySym(null);
    }
  };

  // Teacher removes one specific expiry series, leaving every other one intact.
  const handleRemoveExpiry = async (sym: string, expiry: number) => {
    setSavingExpirySym(sym);
    try {
      await onRemoveUnderlyingExpiry(sym, expiry);
      setExpiryToast({ sym, message: `Removed the ${formatExpiryDate(expiry)} expiry series for ${sym}.`, type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove expiry';
      setExpiryToast({ sym, message: msg, type: 'error' });
    } finally {
      setSavingExpirySym(null);
    }
  };

  // Execute confirmed modal action
  const handleExecuteAction = async () => {
    if (!confirmModal) return;
    setIsActionPending(true);
    try {
      if (confirmModal.type === 'delete_student') {
        await onDeleteStudent(confirmModal.targetId);
        setActionToast({
          message: `Account ${confirmModal.targetId} is DELETED. Student cannot log in and will see "Invalid account".`,
          type: 'success'
        });
      } else if (confirmModal.type === 'purge_student') {
        if (onPurgeStudent) {
          await onPurgeStudent(confirmModal.targetId);
        } else {
          await onDeleteStudent(confirmModal.targetId);
        }
        setActionToast({
          message: `Student record ${confirmModal.targetId} permanently removed from Firestore database.`,
          type: 'info'
        });
      } else if (confirmModal.type === 'restore_student') {
        await onRestoreStudent(confirmModal.targetId);
        setActionToast({
          message: `Student account ${confirmModal.targetId} restored successfully to Active status.`,
          type: 'success'
        });
      } else if (confirmModal.type === 'reset_student') {
        await onResetStudent(confirmModal.targetId);
        setActionToast({
          message: `Portfolio for ${confirmModal.targetId} reset with fresh ₹10,00,000 cash balance.`,
          type: 'success'
        });
      } else if (confirmModal.type === 'delete_company') {
        await onDeleteCompany(confirmModal.targetId);
        setActionToast({
          message: `Company ${confirmModal.targetId} removed from market data.`,
          type: 'info'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed. Please check Firestore connection.';
      setActionToast({ message: `Error: ${msg}`, type: 'error' });
    } finally {
      setIsActionPending(false);
      setConfirmModal(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Notification Toast Banner */}
      {actionToast && (
        <div 
          className={`p-4 border flex items-center justify-between gap-3 text-xs font-mono transition-all animate-fadeIn ${
            actionToast.type === 'error'
              ? 'bg-[#E2564F]/15 border-[#E2564F] text-[#E2564F]'
              : actionToast.type === 'info'
              ? 'bg-[#D4A93F]/15 border-[#D4A93F] text-[#D4A93F]'
              : 'bg-[#2FBF71]/15 border-[#2FBF71] text-[#2FBF71]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionToast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : actionToast.type === 'info' ? (
              <Snowflake className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span className="font-semibold tracking-wide">{actionToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionToast(null)}
            className="text-xs uppercase tracking-wider underline hover:opacity-80 cursor-pointer ml-auto shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top switch tabs */}
      <div className="flex items-center justify-between border-b border-[#1F2A33] pb-4 flex-wrap gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('students'); setSelectedStudentRoll(null); }}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer border ${
              activeTab === 'students'
                ? 'bg-[#D4A93F] text-[#0A0E14] border-[#D4A93F]'
                : 'bg-transparent text-[#6B7680] border-[#1F2A33] hover:text-[#F1F4F6]'
            }`}
          >
            Class &amp; Student Portfolios ({students.length})
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('companies'); setSelectedStudentRoll(null); }}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer border ${
              activeTab === 'companies'
                ? 'bg-[#D4A93F] text-[#0A0E14] border-[#D4A93F]'
                : 'bg-transparent text-[#6B7680] border-[#1F2A33] hover:text-[#F1F4F6]'
            }`}
          >
            All Listed Companies &amp; Update Options ({allStocks.length})
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('expiry'); setSelectedStudentRoll(null); }}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer border flex items-center gap-1.5 ${
              activeTab === 'expiry'
                ? 'bg-[#D4A93F] text-[#0A0E14] border-[#D4A93F]'
                : 'bg-transparent text-[#6B7680] border-[#1F2A33] hover:text-[#F1F4F6]'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            F&amp;O Expiry Management ({underlyings.length})
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('registrations'); setSelectedStudentRoll(null); }}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer border flex items-center gap-1.5 ${
              activeTab === 'registrations'
                ? 'bg-[#D4A93F] text-[#0A0E14] border-[#D4A93F]'
                : 'bg-transparent text-[#6B7680] border-[#1F2A33] hover:text-[#F1F4F6]'
            }`}
          >
            <IdCard className="w-3.5 h-3.5" />
            Registered Users ({Object.keys(studentProfiles).length})
          </button>
        </div>
      </div>

      {/* ===================== TAB: STUDENTS ===================== */}
      {activeTab === 'students' && (
        <>
          {selectedStudentRoll && currentStudentData ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedStudentRoll(null)}
                className="text-xs font-mono text-[#D4A93F] hover:underline flex items-center gap-1 cursor-pointer"
              >
                &larr; Back to Class Roster
              </button>

              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#10161D] border border-[#1F2A33] p-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6]">
                      {currentStudentData.portfolio.roll}
                    </h3>
                    {currentStudentData.portfolio.isDeleted ? (
                      <span className="px-2 py-0.5 bg-[#E2564F]/20 border border-[#E2564F] text-[#E2564F] text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Deleted / Invalid Account
                      </span>
                    ) : currentStudentData.portfolio.isFrozen ? (
                      <span className="px-2 py-0.5 bg-[#D4A93F]/20 border border-[#D4A93F] text-[#D4A93F] text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                        <Snowflake className="w-3 h-3" /> Account Freezed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-[#2FBF71]/20 border border-[#2FBF71] text-[#2FBF71] text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Active Account
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#6B7680] mt-1">
                    {currentStudentData.portfolio.studentName || 'MBA Student'} • {currentStudentData.portfolio.email || 'Cloud Profile'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Print Full Trading Report Button */}
                  <button
                    type="button"
                    onClick={() => handlePrintStudentReport(currentStudentData)}
                    className="px-3 py-1.5 bg-[#1F2A33] border border-[#D4A93F] text-[#D4A93F] hover:bg-[#D4A93F] hover:text-[#0A0E14] text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                    title="Print or save a full trading history report for this student"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Full Report
                  </button>

                  {/* Freeze / Unfreeze Button */}
                  {currentStudentData.portfolio.isFrozen ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await onFreezeStudent(currentStudentData.portfolio.roll, false);
                          setActionToast({
                            message: `Student account ${currentStudentData.portfolio.roll} is UNFREEZED and active.`,
                            type: 'success'
                          });
                        } catch (err: unknown) {
                          setActionToast({ message: `Failed to unfreeze: ${err instanceof Error ? err.message : ''}`, type: 'error' });
                        }
                      }}
                      className="px-3 py-1.5 bg-[#D4A93F]/20 border border-[#D4A93F] text-[#D4A93F] hover:bg-[#D4A93F] hover:text-[#0A0E14] text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Snowflake className="w-3.5 h-3.5" />
                      Unfreeze Account
                    </button>
                  ) : !currentStudentData.portfolio.isDeleted ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await onFreezeStudent(currentStudentData.portfolio.roll, true);
                          setActionToast({
                            message: `Student account ${currentStudentData.portfolio.roll} is now FREEZED. Login attempts will say "Account is freezed".`,
                            type: 'info'
                          });
                        } catch (err: unknown) {
                          setActionToast({ message: `Failed to freeze: ${err instanceof Error ? err.message : ''}`, type: 'error' });
                        }
                      }}
                      className="px-3 py-1.5 bg-[#1F2A33] border border-[#D4A93F]/60 text-[#D4A93F] hover:bg-[#D4A93F] hover:text-[#0A0E14] text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Snowflake className="w-3.5 h-3.5" />
                      Freeze Account
                    </button>
                  ) : null}

                  {/* Delete / Restore Button */}
                  {!currentStudentData.portfolio.isDeleted ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModal({
                          type: 'delete_student',
                          targetId: currentStudentData.portfolio.roll,
                          title: 'Delete Student Account',
                          description: `Are you sure you want to delete student account ${currentStudentData.portfolio.roll}?`,
                          warningNote: 'When deleted, the student is permanently blocked from logging in. Any login attempt will respond with "Invalid account". You can restore this account anytime from the Deleted filter.',
                          confirmLabel: 'Delete Account',
                          isDanger: true
                        });
                      }}
                      className="px-3 py-1.5 bg-[#E2564F]/15 border border-[#E2564F] text-[#E2564F] hover:bg-[#E2564F] hover:text-white text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Account
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            type: 'restore_student',
                            targetId: currentStudentData.portfolio.roll,
                            title: 'Restore Student Account',
                            description: `Restore student account ${currentStudentData.portfolio.roll} back to active trading status?`,
                            warningNote: 'This will reactivate the account with a fresh ₹10,00,000 cash balance.',
                            confirmLabel: 'Restore Account',
                            isDanger: false
                          });
                        }}
                        className="px-3 py-1.5 bg-[#2FBF71]/20 border border-[#2FBF71] text-[#2FBF71] hover:bg-[#2FBF71] hover:text-white text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore Account
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            type: 'purge_student',
                            targetId: currentStudentData.portfolio.roll,
                            title: 'Purge Record From Database',
                            description: `Permanently delete document for ${currentStudentData.portfolio.roll} from Cloud Firestore?`,
                            warningNote: 'This completely wipes the student document from Firestore database.',
                            confirmLabel: 'Purge Completely',
                            isDanger: true
                          });
                        }}
                        className="px-3 py-1.5 bg-[#E2564F]/25 border border-[#E2564F] text-[#E2564F] hover:bg-[#E2564F] hover:text-white text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                        title="Permanently remove from database"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Purge
                      </button>
                    </>
                  )}

                  {/* Reset Account Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({
                        type: 'reset_student',
                        targetId: currentStudentData.portfolio.roll,
                        title: 'Reset Student Portfolio',
                        description: `Reset portfolio for student ${currentStudentData.portfolio.roll}?`,
                        warningNote: 'All cash will be restored to ₹10,00,000, and all open positions and trade history will be cleared.',
                        confirmLabel: 'Reset Portfolio',
                        isDanger: false
                      });
                    }}
                    className="px-3 py-1.5 bg-[#1F2A33] border border-[#6B7680] text-[#C9D3D9] hover:border-[#F1F4F6] hover:text-white text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>
              </div>

              {/* Student breakdown stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div className="bg-[#10161D] border border-[#1F2A33] p-3">
                  <div className="text-[10px] text-[#6B7680] uppercase">Cash Balance</div>
                  <div className="text-base font-bold text-[#F1F4F6]">{inr(currentStudentData.portfolio.cash)}</div>
                </div>
                <div className="bg-[#10161D] border border-[#1F2A33] p-3">
                  <div className="text-[10px] text-[#6B7680] uppercase">Equity Value</div>
                  <div className="text-base font-bold text-[#F1F4F6]">{inr(currentStudentData.eqValue)}</div>
                </div>
                <div className="bg-[#10161D] border border-[#1F2A33] p-3">
                  <div className="text-[10px] text-[#6B7680] uppercase">F&amp;O Margin</div>
                  <div className="text-base font-bold text-[#F1F4F6]">{inr(currentStudentData.margin)}</div>
                </div>
                <div className="bg-[#10161D] border border-[#1F2A33] p-3">
                  <div className="text-[10px] text-[#6B7680] uppercase">Net Worth</div>
                  <div className="text-base font-bold text-[#D4A93F]">{inr(currentStudentData.netWorth)}</div>
                </div>
              </div>

              {/* Holdings list */}
              <div className="bg-[#10161D] border border-[#1F2A33] p-4">
                <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] mb-3">
                  Open Holdings ({Object.keys(currentStudentData.portfolio.holdings || {}).length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#1F2A33] text-[#6B7680]">
                        <th className="p-2 text-left">Symbol</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Avg Cost</th>
                        <th className="p-2 text-right">LTP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F2A33]">
                      {(Object.entries(currentStudentData.portfolio.holdings || {}) as [string, Holding][]).filter(([, h]) => h.qty > 0).map(([sym, h]) => {
                        const stock = allStocks.find(s => s.sym === sym);
                        return (
                          <tr key={sym}>
                            <td className="p-2 font-bold text-[#F1F4F6]">{sym}</td>
                            <td className="p-2 text-right text-[#C9D3D9]">{h.qty}</td>
                            <td className="p-2 text-right text-[#C9D3D9]">{inr(h.avgCost)}</td>
                            <td className="p-2 text-right text-[#D4A93F]">{inr(stock?.ltp || h.avgCost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* F&O Open Positions */}
              <div className="bg-[#10161D] border border-[#1F2A33] p-4">
                <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] mb-3">
                  F&amp;O Open Positions ({Object.keys(currentStudentData.portfolio.fno?.positions || {}).length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#1F2A33] text-[#6B7680]">
                        <th className="p-2 text-left">Instrument</th>
                        <th className="p-2 text-left">Side</th>
                        <th className="p-2 text-right">Lots</th>
                        <th className="p-2 text-right">Avg Price</th>
                        <th className="p-2 text-right">LTP</th>
                        <th className="p-2 text-right">Expiry</th>
                        <th className="p-2 text-right">Margin</th>
                        <th className="p-2 text-right">Unrealized P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F2A33]">
                      {(Object.entries(currentStudentData.portfolio.fno?.positions || {}) as [string, FnoPosition][])
                        .filter(([, pos]) => pos.lots > 0)
                        .map(([key, pos]) => {
                          const stock = allStocks.find(s => s.sym === pos.underlying);
                          const und = underlyings.find(u => u.sym === pos.underlying);
                          const spot = stock ? stock.ltp : (und && typeof und.spot === 'number' ? und.spot : 1000);
                          const sigma = und?.sigma || 0.25;
                          const cur = pos.kind === 'FUT'
                            ? futPrice(spot, pos.expiry)
                            : bsPrice(spot, pos.strike || spot, daysToExpiry(pos.expiry) / 365, RISK_FREE, sigma, pos.optType || 'CE');
                          const pnl = pos.side === 'long'
                            ? (cur - pos.avgPrice) * pos.lots * pos.lotSize
                            : (pos.avgPrice - cur) * pos.lots * pos.lotSize;
                          const instrument = pos.kind === 'FUT'
                            ? `${pos.underlying} FUT`
                            : `${pos.underlying} ${pos.strike} ${pos.optType}`;
                          return (
                            <tr key={key}>
                              <td className="p-2 font-bold text-[#F1F4F6]">{instrument}</td>
                              <td className={`p-2 font-bold uppercase ${pos.side === 'long' ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                                {pos.side}
                              </td>
                              <td className="p-2 text-right text-[#C9D3D9]">{pos.lots}</td>
                              <td className="p-2 text-right text-[#C9D3D9]">{inr(pos.avgPrice)}</td>
                              <td className="p-2 text-right text-[#D4A93F]">{inr(cur)}</td>
                              <td className="p-2 text-right text-[10px] text-[#6B7680]">{formatExpiryDate(pos.expiry)}</td>
                              <td className="p-2 text-right text-[#C9D3D9]">{inr(pos.margin || 0)}</td>
                              <td className={`p-2 text-right font-semibold ${pnl >= 0 ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                                {pnl >= 0 ? '+' : ''}{inr(pnl)}
                              </td>
                            </tr>
                          );
                        })}
                      {Object.entries(currentStudentData.portfolio.fno?.positions || {}).filter(([, pos]) => (pos as FnoPosition).lots > 0).length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-4 text-center text-[#6B7680]">No open F&amp;O positions.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* F&O Trade History */}
              <div className="bg-[#10161D] border border-[#1F2A33] p-4">
                <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] mb-3">
                  F&amp;O Trade History ({(currentStudentData.portfolio.fno?.transactions || []).length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#1F2A33] text-[#6B7680]">
                        <th className="p-2 text-left">Time</th>
                        <th className="p-2 text-left">Instrument</th>
                        <th className="p-2 text-left">Side</th>
                        <th className="p-2 text-right">Lots</th>
                        <th className="p-2 text-right">Price</th>
                        <th className="p-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F2A33]">
                      {[...(currentStudentData.portfolio.fno?.transactions || [])]
                        .sort((a, b) => b.time - a.time)
                        .map((t, idx) => {
                          const instrument = t.kind === 'FUT'
                            ? `${t.underlying} FUT`
                            : `${t.underlying} ${t.strike} ${t.optType}`;
                          return (
                            <tr key={idx}>
                              <td className="p-2 text-[#6B7680]">
                                {new Date(t.time).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </td>
                              <td className="p-2 font-bold text-[#F1F4F6]">{instrument}</td>
                              <td className={`p-2 font-bold uppercase ${t.side === 'buy' ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                                {t.side}
                              </td>
                              <td className="p-2 text-right text-[#C9D3D9]">{t.lots}</td>
                              <td className="p-2 text-right text-[#C9D3D9]">{inr(t.price)}</td>
                              <td className="p-2 text-right text-[#F1F4F6] font-semibold">{inr(t.lots * t.price)}</td>
                            </tr>
                          );
                        })}
                      {(currentStudentData.portfolio.fno?.transactions || []).length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-[#6B7680]">No F&amp;O trades yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                <div className="bg-[#10161D] border border-[#1F2A33] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[#6B7680] mb-1">Registered Students</div>
                  <div className="text-xl font-bold text-[#F1F4F6]">{activeCount}</div>
                  <div className="text-[10px] text-[#6B7680] mt-0.5 font-sans">
                    {totalCount} total registered
                  </div>
                </div>
                <div className="bg-[#10161D] border border-[#1F2A33] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[#6B7680] mb-1">Active Traders</div>
                  <div className="text-xl font-bold text-[#2FBF71]">{activeTradersCount}</div>
                  <div className="text-[10px] text-[#6B7680] mt-0.5 font-sans">
                    With trade history
                  </div>
                </div>
                <div className="bg-[#10161D] border border-[#1F2A33] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[#6B7680] mb-1">Top Performer Net Worth</div>
                  <div className="text-xl font-bold text-[#D4A93F]">{inr(topPerformerNetWorth)}</div>
                  {topPerformer && (
                    <div className="text-[10px] text-[#6B7680] mt-0.5 font-sans truncate">
                      {topPerformer.portfolio.roll} ({topPerformer.portfolio.studentName || 'Student'})
                    </div>
                  )}
                </div>
                <div className="bg-[#10161D] border border-[#1F2A33] p-4">
                  <div className="text-[11px] uppercase tracking-wider text-[#6B7680] mb-1">Top Performer</div>
                  <div className="text-xl font-bold text-[#F1F4F6]">
                    {topPerformer ? topPerformer.portfolio.roll : '—'}
                  </div>
                  {topPerformer && (
                    <div className={`text-[10px] ${topPerformerPnl >= 0 ? 'text-[#2FBF71]' : 'text-[#E2564F]'} mt-0.5 font-sans`}>
                      {topPerformerPnl >= 0 ? '+' : ''}{inr(topPerformerPnl)} P&amp;L
                    </div>
                  )}
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search roll number or name..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-64 bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-2 font-mono outline-none focus:border-[#D4A93F]"
                  />

                  {/* Status quick filters */}
                  <div className="flex items-center border border-[#1F2A33] bg-[#10161D] p-0.5">
                    <button
                      type="button"
                      onClick={() => setStudentStatusFilter('ALL')}
                      className={`px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider cursor-pointer transition ${
                        studentStatusFilter === 'ALL'
                          ? 'bg-[#D4A93F] text-[#0A0E14]'
                          : 'text-[#6B7680] hover:text-[#F1F4F6]'
                      }`}
                    >
                      All ({totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentStatusFilter('ACTIVE')}
                      className={`px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider cursor-pointer transition ${
                        studentStatusFilter === 'ACTIVE'
                          ? 'bg-[#2FBF71] text-[#0A0E14]'
                          : 'text-[#6B7680] hover:text-[#F1F4F6]'
                      }`}
                    >
                      Active ({activeCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentStatusFilter('FROZEN')}
                      className={`px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider cursor-pointer transition ${
                        studentStatusFilter === 'FROZEN'
                          ? 'bg-[#D4A93F] text-[#0A0E14]'
                          : 'text-[#6B7680] hover:text-[#F1F4F6]'
                      }`}
                    >
                      Freezed ({frozenCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentStatusFilter('DELETED')}
                      className={`px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider cursor-pointer transition ${
                        studentStatusFilter === 'DELETED'
                          ? 'bg-[#E2564F] text-[#FFFFFF]'
                          : 'text-[#6B7680] hover:text-[#F1F4F6]'
                      }`}
                    >
                      Deleted ({deletedCount})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-xs text-[#6B7680] font-mono">
                    Showing {filteredStudents.length} of {totalCount} records
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrintAllStudentsReport(filteredStudents)}
                    className="px-3 py-1.5 bg-[#1F2A33] border border-[#D4A93F] text-[#D4A93F] hover:bg-[#D4A93F] hover:text-[#0A0E14] text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center gap-1.5"
                    title="Print a combined trading history report for every student currently shown"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print All ({filteredStudents.length})
                  </button>
                </div>
              </div>

              {/* Roster Table */}
              <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
                <table className="w-full border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-[#1F2A33]">
                      <th className="p-3 text-left text-[11px] uppercase tracking-wider text-[#6B7680]">Student / Status</th>
                      <th className="p-3 text-right text-[11px] uppercase tracking-wider text-[#6B7680]">Cash (₹)</th>
                      <th className="p-3 text-right text-[11px] uppercase tracking-wider text-[#6B7680]">Equity Value</th>
                      <th className="p-3 text-right text-[11px] uppercase tracking-wider text-[#6B7680]">Net Worth</th>
                      <th className="p-3 text-right text-[11px] uppercase tracking-wider text-[#6B7680]">Trades</th>
                      <th className="p-3 text-right text-[11px] uppercase tracking-wider text-[#6B7680]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2A33]">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-[#6B7680] text-sm">
                          No student records match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map(s => {
                        const pnl = s.netWorth - STARTING_CASH;
                        const isUp = pnl >= 0;

                        return (
                          <tr key={s.portfolio.roll} className="hover:bg-[#141B23]">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#F1F4F6]">{s.portfolio.roll}</span>
                                {s.portfolio.isDeleted ? (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#E2564F]/20 text-[#E2564F] border border-[#E2564F]/40 uppercase tracking-wider">
                                    Deleted
                                  </span>
                                ) : s.portfolio.isFrozen ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-[#D4A93F]/20 text-[#D4A93F] border border-[#D4A93F]/40 uppercase tracking-wider">
                                    <Snowflake className="w-2.5 h-2.5" /> Freezed
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-[#2FBF71]/20 text-[#2FBF71] border border-[#2FBF71]/40 uppercase tracking-wider">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#6B7680] font-sans mt-0.5">
                                {s.portfolio.studentName || 'Student'}
                              </div>
                            </td>
                            <td className="p-3 text-right text-[#C9D3D9]">{inr(s.portfolio.cash)}</td>
                            <td className="p-3 text-right text-[#C9D3D9]">{inr(s.eqValue)}</td>
                            <td className="p-3 text-right font-bold text-[#F1F4F6]">
                              {inr(s.netWorth)}
                              <div className={`text-[10px] ${isUp ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                                {isUp ? '+' : ''}{inr(pnl)}
                              </div>
                            </td>
                            <td className="p-3 text-right text-[#C9D3D9]">{s.totalTrades}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedStudentRoll(s.portfolio.roll)}
                                  className="px-2.5 py-1 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase hover:brightness-110 cursor-pointer"
                                  title="View portfolio breakdown"
                                >
                                  View
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintStudentReport(s)}
                                  className="px-2 py-1 bg-[#1F2A33] border border-[#D4A93F]/60 text-[#D4A93F] hover:bg-[#D4A93F] hover:text-[#0A0E14] font-bold text-xs uppercase cursor-pointer flex items-center gap-1"
                                  title="Print full trading report"
                                >
                                  <Printer className="w-3 h-3" />
                                </button>

                                {/* Freeze / Unfreeze Action */}
                                {s.portfolio.isFrozen ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await onFreezeStudent(s.portfolio.roll, false);
                                        setActionToast({
                                          message: `Student account ${s.portfolio.roll} is UNFREEZED and active.`,
                                          type: 'success'
                                        });
                                      } catch (err: unknown) {
                                        setActionToast({ message: `Failed to unfreeze: ${err instanceof Error ? err.message : ''}`, type: 'error' });
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-[#D4A93F]/20 text-[#D4A93F] border border-[#D4A93F] hover:bg-[#D4A93F] hover:text-[#0A0E14] font-bold text-xs uppercase cursor-pointer"
                                    title="Unfreeze student account"
                                  >
                                    Unfreeze
                                  </button>
                                ) : !s.portfolio.isDeleted ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await onFreezeStudent(s.portfolio.roll, true);
                                        setActionToast({
                                          message: `Student account ${s.portfolio.roll} is now FREEZED. Login attempts will say "Account is freezed".`,
                                          type: 'info'
                                        });
                                      } catch (err: unknown) {
                                        setActionToast({ message: `Failed to freeze: ${err instanceof Error ? err.message : ''}`, type: 'error' });
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-[#1F2A33] text-[#C9D3D9] border border-[#1F2A33] hover:border-[#D4A93F] hover:text-[#D4A93F] font-bold text-xs uppercase cursor-pointer"
                                    title="Freeze student account"
                                  >
                                    Freeze
                                  </button>
                                ) : null}

                                {/* Delete / Restore / Purge Action */}
                                {!s.portfolio.isDeleted ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmModal({
                                        type: 'delete_student',
                                        targetId: s.portfolio.roll,
                                        title: 'Delete Student Account',
                                        description: `Are you sure you want to delete student account ${s.portfolio.roll}?`,
                                        warningNote: 'When deleted, the student is permanently blocked from logging in. Any login attempt will respond with "Invalid account". You can restore this account anytime from the Deleted filter.',
                                        confirmLabel: 'Delete Account',
                                        isDanger: true
                                      });
                                    }}
                                    className="px-2.5 py-1 bg-[#E2564F]/15 text-[#E2564F] border border-[#E2564F]/40 hover:bg-[#E2564F] hover:text-white font-bold text-xs uppercase cursor-pointer"
                                    title="Delete student account"
                                  >
                                    Delete
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmModal({
                                          type: 'restore_student',
                                          targetId: s.portfolio.roll,
                                          title: 'Restore Student Account',
                                          description: `Restore student account ${s.portfolio.roll} back to active trading status?`,
                                          warningNote: 'This will reactivate the account with a fresh ₹10,00,000 cash balance.',
                                          confirmLabel: 'Restore Account',
                                          isDanger: false
                                        });
                                      }}
                                      className="px-2.5 py-1 bg-[#2FBF71]/20 text-[#2FBF71] border border-[#2FBF71] hover:bg-[#2FBF71] hover:text-white font-bold text-xs uppercase cursor-pointer"
                                      title="Restore student account"
                                    >
                                      Restore
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmModal({
                                          type: 'purge_student',
                                          targetId: s.portfolio.roll,
                                          title: 'Purge Record From Database',
                                          description: `Permanently delete document for ${s.portfolio.roll} from Cloud Firestore?`,
                                          warningNote: 'This completely wipes the student document from Firestore database.',
                                          confirmLabel: 'Purge',
                                          isDanger: true
                                        });
                                      }}
                                      className="px-2 py-1 bg-[#E2564F]/25 text-[#E2564F] border border-[#E2564F]/50 hover:bg-[#E2564F] hover:text-white font-bold text-xs uppercase cursor-pointer"
                                      title="Permanently delete from database"
                                    >
                                      Purge
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ===================== TAB: ALL COMPANIES (WITH UPDATE OPTION) ===================== */}
      {activeTab === 'companies' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold uppercase tracking-wider text-[#F1F4F6]">
                All Listed Companies &amp; Parameters
              </h3>
              <p className="text-xs text-[#6B7680]">
                Update any company&apos;s price, name, sector, or F&amp;O parameters directly in Cloud Firestore.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 transition cursor-pointer"
            >
              {showAddForm ? 'Close Add Form' : '+ Add New Company'}
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={handleCreateCompany} className="bg-[#10161D] border border-[#1F2A33] p-5 space-y-4 font-mono">
              <div className="font-bold text-sm text-[#D4A93F] uppercase tracking-wider">
                Add New Company to Market &amp; Firestore
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-[#6B7680] uppercase mb-1">Stock Symbol</label>
                  <input
                    type="text"
                    required
                    value={newSym}
                    onChange={(e) => setNewSym(e.target.value)}
                    placeholder="e.g. ZAGGLE"
                    className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                  />
                </div>
                <div>
                  <label className="block text-[#6B7680] uppercase mb-1">Company Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Zaggle Prepaid Ocean"
                    className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                  />
                </div>
                <div>
                  <label className="block text-[#6B7680] uppercase mb-1">Sector</label>
                  <select
                    value={newSector}
                    onChange={(e) => setNewSector(e.target.value)}
                    className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                  >
                    {sectors.filter(s => s !== 'ALL').map(sec => (
                      <option key={sec} value={sec}>{sec}</option>
                    ))}
                    <option value="__new__">+ New Sector</option>
                  </select>
                </div>
                {newSector === '__new__' && (
                  <div>
                    <label className="block text-[#6B7680] uppercase mb-1">New Sector Name</label>
                    <input
                      type="text"
                      value={newCustomSector}
                      onChange={(e) => setNewCustomSector(e.target.value)}
                      placeholder="e.g. Clean Energy"
                      className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[#6B7680] uppercase mb-1">Initial Price (₹)</label>
                  <input
                    type="number"
                    min="0.05"
                    step="0.05"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="enableNewFno"
                  checked={newFno}
                  onChange={(e) => setNewFno(e.target.checked)}
                  className="cursor-pointer"
                />
                <label htmlFor="enableNewFno" className="text-xs text-[#C9D3D9] cursor-pointer">
                  Also list in Futures &amp; Options Desk
                </label>
              </div>

              {newFno && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
                  <div>
                    <label className="block text-[#6B7680] uppercase mb-1">Lot Size</label>
                    <input
                      type="number"
                      min="1"
                      value={newLotSize}
                      onChange={(e) => setNewLotSize(parseInt(e.target.value) || 100)}
                      className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#6B7680] uppercase mb-1">Volatility (Sigma 0.05 - 1.0)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.05"
                      max="1.0"
                      value={newSigma}
                      onChange={(e) => setNewSigma(parseFloat(e.target.value) || 0.25)}
                      className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#6B7680] uppercase mb-1">Strike Step (₹)</label>
                    <input
                      type="number"
                      min="1"
                      value={newStrikeStep}
                      onChange={(e) => setNewStrikeStep(parseInt(e.target.value) || 20)}
                      className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                    />
                  </div>
                </div>
              )}

              {addMsg && (
                <div className="text-xs text-[#2FBF71] font-mono p-2 bg-[#2FBF71]/10 border border-[#2FBF71]/30">
                  {addMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Adding...' : 'Save to Cloud Database'}
              </button>
            </form>
          )}

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 font-mono">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search company symbol/name..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="w-64 bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-2 outline-none focus:border-[#D4A93F]"
              />
              <select
                value={companySectorFilter}
                onChange={(e) => setCompanySectorFilter(e.target.value)}
                className="bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-2 outline-none focus:border-[#D4A93F]"
              >
                {sectors.map(sec => (
                  <option key={sec} value={sec}>
                    {sec === 'ALL' ? `All Sectors (${allStocks.length})` : sec}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-[#6B7680]">
              Showing {filteredCompanies.length} companies
            </div>
          </div>

          {/* All Companies Table with UPDATE option */}
          <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
            <table className="w-full border-collapse font-mono">
              <thead>
                <tr className="border-b border-[#1F2A33]">
                  <th className="p-3 text-left text-[11px] uppercase tracking-wider text-[#6B7680]">Symbol</th>
                  <th className="p-3 text-left text-[11px] uppercase tracking-wider text-[#6B7680]">Company Name</th>
                  <th className="p-3 text-left text-[11px] uppercase tracking-wider text-[#6B7680]">Sector</th>
                  <th className="p-3 text-right text-[11px] uppercase tracking-wider text-[#6B7680]">Current Price (₹)</th>
                  <th className="p-3 text-center text-[11px] uppercase tracking-wider text-[#6B7680]">F&amp;O Listed</th>
                  <th className="p-3 text-right text-[11px] uppercase tracking-wider text-[#6B7680]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2A33]">
                {filteredCompanies.map(stock => {
                  const hasFno = underlyings.some(u => u.sym === stock.sym) || !!stock.fno;

                  return (
                    <tr key={stock.sym} className="hover:bg-[#141B23]">
                      <td className="p-3 font-bold text-[#F1F4F6] flex items-center gap-2">
                        {stock.sym}
                        {stock.isCustom && (
                          <span className="text-[9px] bg-[#D4A93F]/10 text-[#D4A93F] px-1 py-0.5 border border-[#D4A93F]/30 uppercase">
                            Added
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-[#C9D3D9] font-sans max-w-xs truncate">
                        {stock.name}
                      </td>
                      <td className="p-3 text-xs text-[#6B7680]">{stock.sector}</td>
                      <td className="p-3 text-right text-sm font-semibold text-[#D4A93F]">
                        {inr(stock.ltp)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 uppercase font-bold ${
                          hasFno
                            ? 'bg-[#2FBF71]/10 text-[#2FBF71] border border-[#2FBF71]/30'
                            : 'text-[#6B7680]'
                        }`}>
                          {hasFno ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(stock)}
                            className="px-3 py-1 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase hover:brightness-110 cursor-pointer"
                          >
                            Update
                          </button>
                          {stock.isCustom && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmModal({
                                  type: 'delete_company',
                                  targetId: stock.sym,
                                  title: 'Delete Company',
                                  description: `Remove company ${stock.sym} (${stock.name}) from market data?`,
                                  warningNote: 'This custom stock will be permanently removed from the trading floor.',
                                  confirmLabel: 'Delete Company',
                                  isDanger: true
                                });
                              }}
                              className="px-2 py-1 bg-[#E2564F]/20 text-[#E2564F] hover:bg-[#E2564F] hover:text-white text-xs uppercase font-bold cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Edit Company Modal */}
          {editingCompany && (
            <div className="fixed inset-0 bg-[#05070A]/80 z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-md bg-[#10161D] border border-[#1F2A33] relative shadow-2xl">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="absolute top-3 right-3 text-[#6B7680] hover:text-[#F1F4F6] text-xl leading-none cursor-pointer"
                >
                  &times;
                </button>

                <div className="p-5 border-b border-[#1F2A33] border-dashed">
                  <div className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6]">
                    Update {editingCompany.sym}
                  </div>
                  <div className="text-xs text-[#6B7680] mt-0.5">
                    Modifications will be immediately reflected in Cloud Firestore
                  </div>
                </div>

                <div className="p-5 space-y-4 font-mono text-xs">
                  <div>
                    <label className="block text-[#6B7680] uppercase mb-1">Company Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2.5 outline-none focus:border-[#D4A93F]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[#6B7680] uppercase mb-1">Sector</label>
                      <input
                        type="text"
                        value={editSector}
                        onChange={(e) => setEditSector(e.target.value)}
                        className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2.5 outline-none focus:border-[#D4A93F]"
                      />
                    </div>
                    <div>
                      <label className="block text-[#6B7680] uppercase mb-1">Market Price (₹)</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        value={editPrice}
                        onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2.5 outline-none focus:border-[#D4A93F]"
                      />
                    </div>
                  </div>

                  <div className="border-t border-[#1F2A33] pt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        id="modalFnoToggle"
                        checked={editFno}
                        onChange={(e) => setEditFno(e.target.checked)}
                        className="cursor-pointer"
                      />
                      <label htmlFor="modalFnoToggle" className="text-[#C9D3D9] cursor-pointer">
                        Enable in Futures &amp; Options (F&amp;O)
                      </label>
                    </div>

                    {editFno && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[#6B7680] uppercase text-[10px] mb-1">Lot Size</label>
                          <input
                            type="number"
                            min="1"
                            value={editLotSize}
                            onChange={(e) => setEditLotSize(parseInt(e.target.value) || 100)}
                            className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                          />
                        </div>
                        <div>
                          <label className="block text-[#6B7680] uppercase text-[10px] mb-1">Volatility</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.05"
                            max="1.0"
                            value={editSigma}
                            onChange={(e) => setEditSigma(parseFloat(e.target.value) || 0.25)}
                            className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                          />
                        </div>
                        <div>
                          <label className="block text-[#6B7680] uppercase text-[10px] mb-1">Strike Step</label>
                          <input
                            type="number"
                            min="1"
                            value={editStrikeStep}
                            onChange={(e) => setEditStrikeStep(parseInt(e.target.value) || 20)}
                            className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] p-2 outline-none focus:border-[#D4A93F]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {companyMsg && (
                    <div className="p-2.5 bg-[#2FBF71]/10 border border-[#2FBF71]/30 text-[#2FBF71] text-xs">
                      {companyMsg}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingCompany(null)}
                      className="flex-1 py-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCompanyUpdates}
                      disabled={isSaving}
                      className="flex-1 py-2.5 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? 'Updating...' : 'Save Updates'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB: F&O EXPIRY MANAGEMENT ===================== */}
      {activeTab === 'expiry' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider text-[#F1F4F6]">
                F&amp;O Expiry Management
              </h3>
              <p className="text-xs text-[#6B7680] mt-1">
                Add or remove expiry series for any stock, index, or commodity contract - just like weekly and
                monthly series coexist on a real exchange. Adding a new series never removes an existing one;
                only the ✕ on a specific series removes just that one.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search underlying..."
              value={expirySearch}
              onChange={(e) => setExpirySearch(e.target.value)}
              className="bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-1.5 font-mono outline-none focus:border-[#D4A93F]"
            />
          </div>

          {expiryToast && (
            <div className={`p-2.5 border text-xs font-mono ${
              expiryToast.type === 'success'
                ? 'bg-[#2FBF71]/10 border-[#2FBF71]/30 text-[#2FBF71]'
                : 'bg-[#E2564F]/10 border-[#E2564F]/30 text-[#E2564F]'
            }`}>
              [{expiryToast.sym}] {expiryToast.message}
            </div>
          )}

          <div className="bg-[#10161D] border border-[#1F2A33] overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-[#1F2A33] bg-[#141B23] text-[#6B7680]">
                  <th className="p-3 text-left uppercase tracking-wider">Symbol</th>
                  <th className="p-3 text-left uppercase tracking-wider">Name</th>
                  <th className="p-3 text-left uppercase tracking-wider">Type</th>
                  <th className="p-3 text-left uppercase tracking-wider">Active Expiry Series</th>
                  <th className="p-3 text-right uppercase tracking-wider">Add New Series</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2A33]">
                {underlyings
                  .filter(u => {
                    const q = expirySearch.trim().toLowerCase();
                    return !q || u.sym.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
                  })
                  .sort((a, b) => a.kind === b.kind ? a.sym.localeCompare(b.sym) : a.kind.localeCompare(b.kind))
                  .map(u => {
                    const draft = expiryDrafts[u.sym] ?? '';
                    const isSaving = savingExpirySym === u.sym;
                    const series = sortExpiries(u.expiries);
                    return (
                      <tr key={u.sym} className="hover:bg-[#141B23] transition-colors align-top">
                        <td className="p-3 font-bold text-[#F1F4F6]">{u.sym}</td>
                        <td className="p-3 text-[#C9D3D9] font-sans">{u.name}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 border border-[#1F2A33] text-[10px] uppercase tracking-wider text-[#6B7680]">
                            {u.kind}
                          </span>
                        </td>
                        <td className="p-3">
                          {series.length === 0 ? (
                            <span className="text-[#6B7680] italic">No expiry series set.</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {series.map(exp => (
                                <span
                                  key={exp}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 border border-[#1F2A33] bg-[#141B23] text-[10px]"
                                >
                                  <span className="text-[#D4A93F]">{formatExpiryDate(exp)}</span>
                                  <span className="text-[#6B7680]">({daysToExpiry(exp)}d)</span>
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => handleRemoveExpiry(u.sym, exp)}
                                    title={`Remove the ${formatExpiryDate(exp)} series - other series stay untouched`}
                                    className="text-[#E2564F] hover:text-[#ff8b85] font-bold cursor-pointer disabled:opacity-50 leading-none"
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <input
                              type="date"
                              value={draft}
                              onChange={(e) => setExpiryDrafts(prev => ({ ...prev, [u.sym]: e.target.value }))}
                              className="bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] text-xs px-2 py-1 outline-none focus:border-[#D4A93F]"
                            />
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => {
                                handleAddExpiry(u.sym, draft);
                                setExpiryDrafts(prev => ({ ...prev, [u.sym]: '' }));
                              }}
                              title="Adds a new expiry series - existing series are never removed or replaced"
                              className="px-3 py-1 bg-[#D4A93F] text-[#0A0E14] font-bold text-[10px] uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50"
                            >
                              {isSaving ? 'Saving...' : '+ Add'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {underlyings.filter(u => {
                  const q = expirySearch.trim().toLowerCase();
                  return !q || u.sym.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
                }).length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-[#6B7680]">No matching instruments.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== TAB: REGISTERED USERS ===================== */}
      {activeTab === 'registrations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider text-[#F1F4F6]">
                Registered Users
              </h3>
              <p className="text-xs text-[#6B7680] mt-1">
                Full KYC details collected at registration - Google account, verification status,
                head client and optional partner/team member details.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search name, roll, email..."
              value={registrationSearch}
              onChange={(e) => setRegistrationSearch(e.target.value)}
              className="bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-xs px-3 py-1.5 font-mono outline-none focus:border-[#D4A93F]"
            />
          </div>

          {(() => {
            const q = registrationSearch.trim().toLowerCase();
            const profiles: StudentProfile[] = (Object.values(studentProfiles) as StudentProfile[]).filter(p => {
              if (!q) return true;
              return (
                p.roll.toLowerCase().includes(q) ||
                (p.email || '').toLowerCase().includes(q) ||
                p.primary.name.toLowerCase().includes(q) ||
                p.primary.rollNumber.toLowerCase().includes(q) ||
                p.primary.department.toLowerCase().includes(q)
              );
            }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            if (profiles.length === 0) {
              return (
                <div className="bg-[#10161D] border border-[#1F2A33] p-8 text-center text-[#6B7680] text-sm">
                  No registered users {registrationSearch ? 'match your search.' : 'yet.'}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {profiles.map(p => (
                  <div key={p.roll} className="bg-[#10161D] border border-[#1F2A33] p-4 font-mono">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="text-sm font-bold text-[#D4A93F] tracking-wider">{p.roll}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#6B7680] mt-0.5">
                          <Mail className="w-3 h-3" /> {p.email || 'N/A'}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 uppercase tracking-wider font-bold flex items-center gap-1 ${
                        p.verified
                          ? 'bg-[#2FBF71]/10 border border-[#2FBF71]/40 text-[#2FBF71]'
                          : 'bg-[#D4A93F]/10 border border-[#D4A93F]/40 text-[#D4A93F]'
                      }`}>
                        {p.verified ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                        {p.verified ? 'Verified' : 'Pending'}
                      </span>
                    </div>

                    <div className="border-t border-[#1F2A33] border-dashed pt-3">
                      <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1.5">Head Client</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div><span className="text-[#6B7680]">Name: </span><span className="text-[#F1F4F6]">{p.primary.name || '—'}</span></div>
                        <div><span className="text-[#6B7680]">Dept: </span><span className="text-[#F1F4F6]">{p.primary.department || '—'}</span></div>
                        <div><span className="text-[#6B7680]">Roll No: </span><span className="text-[#F1F4F6]">{p.primary.rollNumber || '—'}</span></div>
                        <div><span className="text-[#6B7680]">Year: </span><span className="text-[#F1F4F6]">{p.primary.yearOfStudy || '—'}</span></div>
                      </div>
                    </div>

                    {p.partner && (p.partner.name || p.partner.department || p.partner.rollNumber || p.partner.yearOfStudy) && (
                      <div className="border-t border-[#1F2A33] border-dashed pt-3 mt-3">
                        <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1.5">Sub / Partner Client</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <div><span className="text-[#6B7680]">Name: </span><span className="text-[#C9D3D9]">{p.partner.name || '—'}</span></div>
                          <div><span className="text-[#6B7680]">Dept: </span><span className="text-[#C9D3D9]">{p.partner.department || '—'}</span></div>
                          <div><span className="text-[#6B7680]">Roll No: </span><span className="text-[#C9D3D9]">{p.partner.rollNumber || '—'}</span></div>
                          <div><span className="text-[#6B7680]">Year: </span><span className="text-[#C9D3D9]">{p.partner.yearOfStudy || '—'}</span></div>
                        </div>
                      </div>
                    )}

                    <div className="border-t border-[#1F2A33] border-dashed pt-2 mt-3 text-[10px] text-[#6B7680] flex justify-between">
                      <span>Registered: {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                      <span>Updated: {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* In-App Action Confirmation Modal (Replaces browser window.confirm) */}
      {confirmModal && (
        <div className="fixed inset-0 bg-[#05070A]/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className={`w-full max-w-md bg-[#10161D] border p-6 shadow-2xl space-y-4 font-mono ${
              confirmModal.isDanger ? 'border-[#E2564F]' : 'border-[#D4A93F]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div 
                className={`p-2 border ${
                  confirmModal.isDanger 
                    ? 'bg-[#E2564F]/15 border-[#E2564F] text-[#E2564F]' 
                    : 'bg-[#D4A93F]/15 border-[#D4A93F] text-[#D4A93F]'
                }`}
              >
                {confirmModal.isDanger ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-[#F1F4F6]">
                  {confirmModal.title}
                </h3>
                <span className="text-xs text-[#6B7680]">Target: {confirmModal.targetId}</span>
              </div>
            </div>

            <div className="text-xs text-[#C9D3D9] bg-[#141B23] p-3.5 border border-[#1F2A33] space-y-2.5 leading-relaxed">
              <p>{confirmModal.description}</p>
              {confirmModal.warningNote && (
                <div 
                  className={`p-2.5 border text-xs leading-normal ${
                    confirmModal.isDanger 
                      ? 'bg-[#E2564F]/10 border-[#E2564F]/40 text-[#E2564F]' 
                      : 'bg-[#D4A93F]/10 border-[#D4A93F]/40 text-[#D4A93F]'
                  }`}
                >
                  <p className="font-bold mb-1">
                    {confirmModal.isDanger ? '⚠️ System Warning:' : 'ℹ️ Note:'}
                  </p>
                  <p>{confirmModal.warningNote}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={isActionPending}
                className="flex-1 py-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={isActionPending}
                className={`flex-1 py-2.5 font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 ${
                  confirmModal.isDanger
                    ? 'bg-[#E2564F] text-white'
                    : 'bg-[#D4A93F] text-[#0A0E14]'
                }`}
              >
                {confirmModal.isDanger && <Trash2 className="w-3.5 h-3.5" />}
                {isActionPending ? 'Processing...' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
