import React, { useState } from 'react';
import { inr } from '../marketData';
import { AlertTriangle, Trash2 } from 'lucide-react';

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
  onLogout,
  onDeleteAccount
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!onDeleteAccount) return;
    setIsDeleting(true);
    try {
      await onDeleteAccount();
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

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

          {userRole === 'student' && onDeleteAccount && (
            <button
              type="button"
              id="deleteAccountBtn"
              onClick={() => setShowDeleteModal(true)}
              className="border border-[#E2564F]/50 text-[#E2564F] hover:bg-[#E2564F] hover:text-white px-3 py-1.5 text-xs tracking-wider uppercase font-semibold transition cursor-pointer"
              title="Delete Account"
            >
              Delete Account
            </button>
          )}

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

      {/* In-App Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-[#05070A]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#10161D] border border-[#E2564F] p-6 shadow-2xl space-y-4 font-mono">
            <div className="flex items-center gap-3 text-[#E2564F]">
              <div className="p-2 bg-[#E2564F]/10 border border-[#E2564F]">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-[#F1F4F6]">
                  Delete Account Confirmation
                </h3>
                <span className="text-xs text-[#E2564F]">User ID: {roll}</span>
              </div>
            </div>

            <div className="text-xs text-[#C9D3D9] bg-[#141B23] p-3 border border-[#1F2A33] space-y-2 leading-relaxed">
              <p>
                Are you sure you want to delete your student account?
              </p>
              <p className="text-[#E2564F] font-bold">
                ⚠️ Once deleted, you will be logged out immediately. Any future login attempt with this User ID will show:
              </p>
              <div className="p-2 bg-[#E2564F]/10 border border-[#E2564F]/40 text-[#E2564F] font-bold text-center">
                "Invalid account"
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-[#E2564F] text-white font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? 'Deleting...' : 'Yes, Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
