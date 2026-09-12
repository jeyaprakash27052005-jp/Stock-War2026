import React, { useState } from 'react';
import { Snowflake, Trash2, RotateCcw, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Portfolio, Stock, FnoUnderlying, Holding, FnoPosition } from '../types';
import { inr, pct, STARTING_CASH, futPrice, bsPrice, daysToExpiry, RISK_FREE } from '../marketData';

interface TeacherDashboardProps {
  students: Portfolio[];
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
  allStocks,
  underlyings,
  onResetStudent,
  onFreezeStudent,
  onDeleteStudent,
  onPurgeStudent,
  onRestoreStudent,
  onUpdateCompany,
  onAddCompany,
  onDeleteCompany
}) => {
  const [activeTab, setActiveTab] = useState<'students' | 'companies'>('students');
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
        ? futPrice(spot)
        : bsPrice(spot, pos.strike || spot, daysToExpiry() / 365, RISK_FREE, sigma, pos.optType || 'CE');
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

  // Toast auto-clear
  React.useEffect(() => {
    if (actionToast) {
      const timer = setTimeout(() => {
        setActionToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionToast]);

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
                            ? futPrice(spot)
                            : bsPrice(spot, pos.strike || spot, daysToExpiry() / 365, RISK_FREE, sigma, pos.optType || 'CE');
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
                              <td className="p-2 text-right text-[#C9D3D9]">{inr(pos.margin || 0)}</td>
                              <td className={`p-2 text-right font-semibold ${pnl >= 0 ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                                {pnl >= 0 ? '+' : ''}{inr(pnl)}
                              </td>
                            </tr>
                          );
                        })}
                      {Object.entries(currentStudentData.portfolio.fno?.positions || {}).filter(([, pos]) => (pos as FnoPosition).lots > 0).length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-4 text-center text-[#6B7680]">No open F&amp;O positions.</td>
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

                <div className="text-xs text-[#6B7680] font-mono">
                  Showing {filteredStudents.length} of {totalCount} records
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
