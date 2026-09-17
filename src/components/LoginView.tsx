import React, { useState } from 'react';
import { Shield, Eye, EyeOff, User } from 'lucide-react';
import { StudentAuthFlow } from './StudentAuthFlow';

interface LoginViewProps {
  onStudentLogin: (roll: string, studentName?: string, email?: string) => Promise<void>;
  onTeacherLogin: (teacherName?: string, email?: string) => Promise<void>;
}

export const LoginView: React.FC<LoginViewProps> = ({ onStudentLogin, onTeacherLogin }) => {
  const [activeTab, setActiveTab] = useState<'student' | 'teacher'>('student');

  // Teacher form state (unchanged - password-gated instructor access)
  const [teacherPassword, setTeacherPassword] = useState('');
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);

  // Common UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pass = teacherPassword.trim();

    if (!pass) {
      setError('Please enter the Instructor Password.');
      return;
    }

    // Validation: Teacher password is "Mepco MBA Staff"
    if (pass !== 'Mepco MBA Staff') {
      setError('Invalid password. Please enter the correct Instructor Password.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onTeacherLogin('Mepco MBA Staff');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Instructor login failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_900px_500px_at_50%_-10%,rgba(212,169,63,0.08),transparent)]">
      <div className="w-full max-w-md bg-[#10161D] border border-[#1F2A33] relative shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#D4A93F] via-[#8A7233] to-[#D4A93F]" />
        
        {/* Header */}
        <div className="p-8 pb-5 border-b border-[#1F2A33] border-dashed text-center">
          <div className="font-['Big_Shoulders_Display',sans-serif] font-extrabold text-3xl tracking-wide text-[#F1F4F6] uppercase">
            PAPER<span className="text-[#D4A93F]">FLOOR</span>
          </div>
          <div className="text-[11px] tracking-[0.18em] uppercase text-[#6B7680] mt-1.5 font-medium">
            F&amp;O Trading Floor Terminal
          </div>

          <div className="flex gap-2 mt-5">
            <button
              type="button"
              id="studentTabBtn"
              onClick={() => { setActiveTab('student'); setError(null); }}
              className={`flex-1 py-2.5 px-3 text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'student'
                  ? 'bg-[#D4A93F] text-[#0A0E14] border-[#D4A93F]'
                  : 'bg-transparent text-[#6B7680] border-[#1F2A33] hover:text-[#F1F4F6]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Student</span>
            </button>
            <button
              type="button"
              id="teacherTabBtn"
              onClick={() => { setActiveTab('teacher'); setError(null); }}
              className={`flex-1 py-2.5 px-3 text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'teacher'
                  ? 'bg-[#D4A93F] text-[#0A0E14] border-[#D4A93F]'
                  : 'bg-transparent text-[#6B7680] border-[#1F2A33] hover:text-[#F1F4F6]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Teacher / Instructor</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-8">
          {activeTab === 'student' ? (
            <StudentAuthFlow onLoginComplete={onStudentLogin} />
          ) : (
            <>
              {error && (
                <div className="bg-[rgba(226,86,79,0.12)] border border-[#E2564F] text-[#E2564F] text-xs p-3.5 mb-5 font-mono leading-relaxed">
                  {error}
                </div>
              )}
              <form onSubmit={handleTeacherSubmit} className="space-y-4">
                <div className="bg-[#141B23] border border-[#1F2A33] p-4 text-xs text-[#C9D3D9] leading-relaxed">
                  <div className="font-semibold text-[#D4A93F] mb-1 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Instructor Security Gate</span>
                  </div>
                  Faculty access to monitor student trades, manage portfolios, and configure live company parameters.
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-[#6B7680] mb-2 font-medium">
                    Instructor Password
                  </label>
                  <div className="relative">
                    <input
                      type={showTeacherPassword ? 'text' : 'password'}
                      id="teacherPasswordInput"
                      value={teacherPassword}
                      onChange={(e) => setTeacherPassword(e.target.value)}
                      placeholder="Enter instructor password"
                      autoComplete="current-password"
                      className="w-full bg-[#141B23] border border-[#1F2A33] text-[#F1F4F6] pl-3.5 pr-10 py-2.5 font-['IBM_Plex_Mono',monospace] text-sm tracking-wider outline-none focus:border-[#D4A93F] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTeacherPassword(!showTeacherPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
                      aria-label={showTeacherPassword ? 'Hide password' : 'Show password'}
                    >
                      {showTeacherPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-[#6B7680] mt-1.5">
                    Authorized Mepco MBA faculty credentials required.
                  </div>
                </div>

                <button
                  type="submit"
                  id="enterTeacherBtn"
                  disabled={loading}
                  className="w-full py-3 mt-2 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Access Class Dashboard'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Note Footer */}
        <div className="text-center text-[11px] text-[#6B7680] p-4 border-t border-[#1F2A33] border-dashed">
          {activeTab === 'student'
            ? 'Sign in with Google. Your identity is verified once by email link, then remembered.'
            : 'Instructor mode enables real-time class inspection and market controls.'}
        </div>
      </div>
    </div>
  );
};
