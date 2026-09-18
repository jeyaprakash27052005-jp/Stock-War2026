import React, { useState } from 'react';
import { inr } from '../marketData';
import { MoreVertical, X, User, BarChart2, Briefcase, Zap, History, LogOut, ChevronRight, TrendingUp, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  userRole: 'student' | 'teacher';
  roll: string;
  studentName?: string;
  teamName?: string;
  email?: string;
  cash?: number;
  isFrozen?: boolean;
  activeTab?: 'market' | 'portfolio' | 'fno' | 'chart' | 'orders' | 'profile';
  onLogout: () => void;
  onDeleteAccount?: () => void;
  onEditProfile?: () => void;
  onNavigateTab?: (tab: 'market' | 'portfolio' | 'fno' | 'chart' | 'orders' | 'profile') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  userRole,
  roll,
  studentName,
  teamName,
  cash,
  isFrozen,
  activeTab,
  onLogout,
  onEditProfile,
  onNavigateTab
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleProfileClick = () => {
    setMenuOpen(false);
    if (onEditProfile) {
      onEditProfile();
    } else if (onNavigateTab) {
      onNavigateTab('profile');
    }
  };

  const handleTabClick = (tab: 'market' | 'portfolio' | 'fno' | 'chart' | 'orders' | 'profile') => {
    setMenuOpen(false);
    if (tab === 'profile' && onEditProfile) {
      onEditProfile();
    } else if (onNavigateTab) {
      onNavigateTab(tab);
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-[#1F2A33] bg-[#10161D] flex-wrap gap-3">
        {/* Left Side Section: 3-Dot Navigation Menu Option, Brand, Profile & Details */}
        <div className="flex items-center gap-3">
          {userRole === 'student' && (
            <button
              type="button"
              id="left3DotMenuBtn"
              onClick={() => setMenuOpen(true)}
              className="flex items-center gap-1.5 border border-[#1F2A33] hover:border-[#D4A93F] bg-[#141B23] text-[#F1F4F6] px-2.5 py-1.5 text-xs uppercase font-mono tracking-wider transition cursor-pointer hover:text-[#D4A93F]"
              title="Open Navigation Menu (3-Dot Menu)"
            >
              <MoreVertical className="w-4 h-4 text-[#D4A93F]" />
              <span className="font-bold hidden xs:inline">Menu</span>
            </button>
          )}

          <div className="font-['Big_Shoulders_Display',sans-serif] font-extrabold text-2xl tracking-wide text-[#F1F4F6] uppercase">
            PAPER<span className="text-[#D4A93F]">FLOOR</span>
          </div>

          {userRole === 'student' && (
            <button
              type="button"
              id="leftProfileBtn"
              onClick={handleProfileClick}
              className="flex items-center gap-1.5 border border-[#1F2A33] hover:border-[#D4A93F] bg-[#141B23] text-[#F1F4F6] px-2.5 py-1 text-xs uppercase font-mono tracking-wider transition cursor-pointer hover:text-[#D4A93F]"
              title="View and Edit My Profile & Password"
            >
              <User className="w-3.5 h-3.5 text-[#D4A93F]" />
              <span className="font-bold">My Profile</span>
            </button>
          )}

          <div className="font-['IBM_Plex_Mono',monospace] text-xs text-[#6B7680] border border-[#1F2A33] px-2.5 py-1 tracking-wider hidden sm:inline">
            {userRole === 'teacher' ? 'INSTRUCTOR VIEW' : roll}
          </div>

          {teamName && (
            <span className="bg-[#D4A93F]/15 border border-[#D4A93F]/40 text-[#D4A93F] px-2 py-0.5 text-[11px] font-mono uppercase font-bold tracking-wider hidden md:inline">
              Team: {teamName}
            </span>
          )}

          {studentName && studentName !== roll && (
            <span className="text-xs text-[#6B7680] hidden lg:inline">
              ({studentName})
            </span>
          )}

          {isFrozen && (
            <span className="bg-[#D4A93F]/20 text-[#D4A93F] border border-[#D4A93F] px-2 py-0.5 text-[11px] font-mono uppercase font-bold tracking-wider animate-pulse">
              Account Freezed
            </span>
          )}
        </div>

        {/* Right Side Section: Live Stats, Balance, and Logout ONLY (My Profile removed from here) */}
        <div className="flex items-center gap-3">
          {userRole === 'student' && typeof cash === 'number' && (
            <div className="font-['IBM_Plex_Mono',monospace] text-sm text-[#F1F4F6] border-l-2 border-[#D4A93F] pl-2.5 hidden sm:block">
              <span className="block text-[10px] text-[#6B7680] uppercase tracking-wider mb-0.5">
                Cash Balance
              </span>
              <span className="font-semibold text-emerald-400">{inr(cash)}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-[#2FBF71] font-mono border border-[#1F2A33] px-2.5 py-1 bg-[#141B23]">
            <span className="w-2 h-2 rounded-full bg-[#2FBF71] animate-ping" />
            <span className="hidden xs:inline">Market Live</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-xs text-[#6B7680] font-mono border border-[#1F2A33] px-2.5 py-1 bg-[#141B23]">
            <span className="w-2 h-2 rounded-full bg-[#2FBF71]"></span>
            <span>Firestore Sync</span>
          </div>

          {/* Logout button - clean on the right with no My Profile button adjacent */}
          <button
            type="button"
            id="logoutBtn"
            onClick={onLogout}
            className="border border-[#1F2A33] text-[#6B7680] hover:border-[#E2564F] hover:text-[#E2564F] px-3.5 py-1.5 text-xs tracking-wider uppercase font-semibold transition cursor-pointer flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* Left Slide-Over Menu Drawer for Student */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#05070A]/80 backdrop-blur-xs transition-opacity"
            onClick={() => setMenuOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] bg-[#10161D] border-r border-[#1F2A33] shadow-2xl flex flex-col z-10 font-mono">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#1F2A33] bg-[#0D1319] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="font-['Big_Shoulders_Display',sans-serif] font-extrabold text-xl text-[#F1F4F6] uppercase tracking-wide">
                  PAPER<span className="text-[#D4A93F]">FLOOR</span>
                </div>
                <span className="text-[10px] text-[#6B7680] border border-[#1F2A33] px-1.5 py-0.5">MENU</span>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="text-[#6B7680] hover:text-[#F1F4F6] p-1 cursor-pointer"
                title="Close Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile Card inside Drawer */}
            <div className="p-4 bg-[#141B23] border-b border-[#1F2A33]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-[#6B7680]">Student Trader ID</span>
                <span className="text-[10px] uppercase font-bold text-[#2FBF71] bg-[#2FBF71]/15 px-1.5 py-0.5 border border-[#2FBF71]/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Active
                </span>
              </div>
              <div className="text-base font-bold text-[#D4A93F] mb-1">{roll}</div>
              {teamName && (
                <div className="text-xs text-[#F1F4F6] font-semibold mb-1">
                  Team: <span className="text-[#D4A93F]">{teamName}</span>
                </div>
              )}
              {studentName && studentName !== roll && (
                <div className="text-xs text-[#8E9CA8] mb-2">{studentName}</div>
              )}
              {typeof cash === 'number' && (
                <div className="mt-2 pt-2 border-t border-[#1F2A33] flex justify-between text-xs">
                  <span className="text-[#6B7680]">Cash Balance:</span>
                  <span className="text-emerald-400 font-bold">{inr(cash)}</span>
                </div>
              )}
            </div>

            {/* Menu Options List */}
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#6B7680]">
                Account &amp; Security
              </div>

              {/* Primary My Profile Option */}
              <button
                type="button"
                id="drawerMyProfileOption"
                onClick={handleProfileClick}
                className={`w-full text-left px-4 py-3 text-xs flex items-center justify-between transition border-l-2 cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-[#18222C] text-[#D4A93F] border-[#D4A93F] font-bold'
                    : 'text-[#F1F4F6] hover:bg-[#1A232E] hover:text-[#D4A93F] border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-[#D4A93F]" />
                  <div>
                    <div className="font-bold uppercase tracking-wider">My Profile</div>
                    <div className="text-[10px] text-[#6B7680]">Details &amp; Password Changes</div>
                  </div>
                </div>
                {activeTab === 'profile' ? (
                  <span className="text-[10px] bg-[#D4A93F]/20 text-[#D4A93F] px-1.5 py-0.5 border border-[#D4A93F]/40 font-bold">ACTIVE</span>
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#6B7680]" />
                )}
              </button>

              <div className="px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-[#6B7680]">
                Trading Terminal
              </div>

              {onNavigateTab && (
                <>
                  <button
                    type="button"
                    onClick={() => handleTabClick('chart')}
                    className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition cursor-pointer border-l-2 ${
                      activeTab === 'chart'
                        ? 'bg-[#18222C] text-[#00E676] border-[#00E676] font-bold'
                        : 'text-[#8E9CA8] hover:bg-[#1A232E] hover:text-[#F1F4F6] border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-[#00E676]" />
                      <span>Technical Chart (BSE / NSE)</span>
                    </div>
                    {activeTab === 'chart' ? (
                      <span className="text-[10px] text-[#00E676] font-bold">ACTIVE</span>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#3A4550]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabClick('market')}
                    className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition cursor-pointer border-l-2 ${
                      activeTab === 'market'
                        ? 'bg-[#18222C] text-[#5B9DD9] border-[#5B9DD9] font-bold'
                        : 'text-[#8E9CA8] hover:bg-[#1A232E] hover:text-[#F1F4F6] border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BarChart2 className="w-4 h-4 text-[#5B9DD9]" />
                      <span>Market Watch</span>
                    </div>
                    {activeTab === 'market' ? (
                      <span className="text-[10px] text-[#5B9DD9] font-bold">ACTIVE</span>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#3A4550]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabClick('portfolio')}
                    className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition cursor-pointer border-l-2 ${
                      activeTab === 'portfolio'
                        ? 'bg-[#18222C] text-[#D4A93F] border-[#D4A93F] font-bold'
                        : 'text-[#8E9CA8] hover:bg-[#1A232E] hover:text-[#F1F4F6] border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Briefcase className="w-4 h-4 text-[#D4A93F]" />
                      <span>Portfolio Holdings</span>
                    </div>
                    {activeTab === 'portfolio' ? (
                      <span className="text-[10px] text-[#D4A93F] font-bold">ACTIVE</span>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#3A4550]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabClick('fno')}
                    className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition cursor-pointer border-l-2 ${
                      activeTab === 'fno'
                        ? 'bg-[#18222C] text-[#9B6BD6] border-[#9B6BD6] font-bold'
                        : 'text-[#8E9CA8] hover:bg-[#1A232E] hover:text-[#F1F4F6] border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4 text-[#9B6BD6]" />
                      <span>F&amp;O Derivatives</span>
                    </div>
                    {activeTab === 'fno' ? (
                      <span className="text-[10px] text-[#9B6BD6] font-bold">ACTIVE</span>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#3A4550]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabClick('orders')}
                    className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition cursor-pointer border-l-2 ${
                      activeTab === 'orders'
                        ? 'bg-[#18222C] text-[#D4A93F] border-[#D4A93F] font-bold'
                        : 'text-[#8E9CA8] hover:bg-[#1A232E] hover:text-[#F1F4F6] border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <History className="w-4 h-4 text-[#6B7680]" />
                      <span>Order History</span>
                    </div>
                    {activeTab === 'orders' ? (
                      <span className="text-[10px] text-[#D4A93F] font-bold">ACTIVE</span>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#3A4550]" />
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-[#1F2A33] bg-[#0D1319]">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="w-full py-2.5 border border-[#E2564F]/40 text-[#E2564F] hover:bg-[#E2564F]/10 text-xs uppercase font-bold tracking-wider transition cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
