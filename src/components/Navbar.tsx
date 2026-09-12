import React from 'react';
import { inr } from '../marketData';

interface NavbarProps {
  userRole: 'student' | 'teacher';
  roll: string;
  studentName?: string;
  email?: string;
  cash?: number;
  isFrozen?: boolean;
  onLogout: () => void;
  onDeleteAccount?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  userRole,
  roll,
  studentName,
  cash,
  isFrozen,
  onLogout
}) => {
  return (
    <>
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-[#1F2A33] bg-[#10161D] flex-wrap gap-3">
        <div className="flex items-center gap-3.5">
          <div className="font-['Big_Shoulders_Display',sans-serif] font-extrabold text-2xl tracking-wide text-[#F1F4F6] uppercase">
            PAPER<span className="text-[#D4A93F]">FLOOR</span>
          </div>
          <div className="font-['IBM_Plex_Mono',monospace] text-xs text-[#6B7680] border border-[#1F2A33] px-2.5 py-1 tracking-wider">
            {userRole === 'teacher' ? 'INSTRUCTOR VIEW' : roll}
          </div>
          {studentName && studentName !== roll && (
            <span className="text-xs text-[#6B7680] hidden sm:inline">
              ({studentName})
            </span>
          )}
          {isFrozen && (
            <span className="bg-[#D4A93F]/20 text-[#D4A93F] border border-[#D4A93F] px-2 py-0.5 text-[11px] font-mono uppercase font-bold tracking-wider animate-pulse">
              Account Freezed
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {userRole === 'student' && typeof cash === 'number' && (
            <div className="font-['IBM_Plex_Mono',monospace] text-sm text-[#F1F4F6] border-l-2 border-[#D4A93F] pl-2.5">
              <span className="block text-[10px] text-[#6B7680] uppercase tracking-wider mb-0.5">
                Cash Balance
              </span>
              <span className="font-semibold text-emerald-400">{inr(cash)}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-[#2FBF71] font-mono border border-[#1F2A33] px-2.5 py-1 bg-[#141B23]">
            <span className="w-2 h-2 rounded-full bg-[#2FBF71] animate-ping" />
            <span>Market Live</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#6B7680] font-mono border border-[#1F2A33] px-2.5 py-1 bg-[#141B23]">
            <span className="w-2 h-2 rounded-full bg-[#2FBF71]"></span>
            <span>Firestore Sync</span>
          </div>

          <button
            type="button"
            id="logoutBtn"
            onClick={onLogout}
            className="border border-[#1F2A33] text-[#6B7680] hover:border-[#E2564F] hover:text-[#E2564F] px-3.5 py-1.5 text-xs tracking-wider uppercase font-semibold transition cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </header>
    </>
  );
};
