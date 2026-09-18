import React, { useEffect, useState, useRef } from 'react';
import { PersonDetails } from '../types';
import {
  signInWithGoogle,
  findStudentProfileByGoogleUid,
  generateUniqueStudentId,
  checkEmailRegistrationStatus,
  registerStudentWithKyc
} from '../firebase';
import {
  User,
  Users,
  Mail,
  CheckCircle2,
  Copy,
  Chrome,
  Plus,
  X,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Info,
  Check
} from 'lucide-react';

interface StudentAuthFlowProps {
  onLoginComplete: (roll: string, name: string, email: string) => Promise<void>;
}

type Step = 'checking' | 'start' | 'kyc' | 'success' | 'error';

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Other'];
const emptyDetails: PersonDetails = { name: '', department: '', rollNumber: '', yearOfStudy: '' };
const MAX_NOMINEES = 4; // plus the primary registrant = 5 people on one team

const inputClass = "w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3 py-2.5 font-mono outline-none focus:border-[#D4A93F] placeholder:text-[#3A4550] transition-colors";
const labelClass = "text-[10px] uppercase tracking-wider text-[#6B7680] mb-1.5 block font-semibold";

export const StudentAuthFlow: React.FC<StudentAuthFlowProps> = ({ onLoginComplete }) => {
  const [step, setStep] = useState<Step>('checking');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginToast, setLoginToast] = useState<string | null>(null);

  // Authentication State
  const [googleUid, setGoogleUid] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  // Google Email input state
  const [directEmail, setDirectEmail] = useState<string>('');
  const [directName, setDirectName] = useState<string>('');
  const emailInputRef = useRef<HTMLInputElement>(null);

  // KYC Form State
  const [primary, setPrimary] = useState<PersonDetails>(emptyDetails);
  const [nominees, setNominees] = useState<Partial<PersonDetails>[]>([]);

  // Generated ID state
  const [generatedId, setGeneratedId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStep('start');
  }, []);

  // One-click Google Popup (if browser/domain supports it, otherwise smoothly falls back to email form)
  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      if (!user.email) {
        setError('Your Google account has no email address associated with it. Please enter your email below.');
        setLoading(false);
        return;
      }
      await processGoogleUser(user.email, user.uid, user.displayName || '');
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      const code = errorObj?.code || '';
      const message = errorObj?.message || '';
      const isDomainOrPopupIssue =
        code === 'auth/unauthorized-domain' ||
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-closed-by-user' ||
        message.includes('unauthorized-domain') ||
        message.includes('unauthorized domain') ||
        message.includes('popup-blocked');

      if (isDomainOrPopupIssue) {
        // Silently and gracefully direct user to the direct Google sign-in form without any error banner
        if (emailInputRef.current) {
          emailInputRef.current.focus();
        }
      } else {
        setError(message || 'Unable to sign in with Google popup. Please enter your Google email below.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Direct Google Account submission
  const handleDirectEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = directEmail.trim().toLowerCase();

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      setError('Please enter a valid Google email address (e.g. yourname@gmail.com).');
      return;
    }

    setLoading(true);
    try {
      await processGoogleUser(normalized, `google-${Date.now()}`, directName.trim());
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Shared processor for Google credentials
  const processGoogleUser = async (userEmail: string, uid: string, displayName: string) => {
    const normalizedEmail = userEmail.trim().toLowerCase();

    // 1. Strict duplicate check: enforce ONE EMAIL REGISTER ONE TIME ONLY
    const status = await checkEmailRegistrationStatus(normalizedEmail);

    if (status.registered && status.roll) {
      // User is already registered! Immediately sign in to existing account - NO second KYC allowed
      setLoginToast(`Existing account found for ${normalizedEmail} (Student ID: ${status.roll}). Signing you in...`);
      setTimeout(async () => {
        await onLoginComplete(
          status.roll!,
          status.studentName || displayName || status.roll!,
          normalizedEmail
        );
      }, 700);
      return;
    }

    // 2. Fallback check by Google UID
    const profileByUid = await findStudentProfileByGoogleUid(uid);
    if (profileByUid) {
      setLoginToast(`Existing profile found (Student ID: ${profileByUid.roll}). Signing you in...`);
      setTimeout(async () => {
        await onLoginComplete(
          profileByUid.roll,
          profileByUid.primary.name,
          profileByUid.email || normalizedEmail
        );
      }, 700);
      return;
    }

    // 3. New user! Direct instant verification, proceed to KYC form
    setGoogleUid(uid);
    setEmail(normalizedEmail);
    setPrimary(prev => ({
      ...prev,
      name: prev.name || displayName || directName || ''
    }));
    setStep('kyc');
  };

  // KYC submission & registration
  const handleCompleteRegistration = async () => {
    if (!primary.name.trim() || !primary.department.trim() || !primary.rollNumber.trim() || !primary.yearOfStudy.trim()) {
      setError('Please fill in your name, department, roll number, and year of study.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const cleanNominees = nominees
        .map(n => ({
          name: (n.name || '').trim(),
          department: (n.department || '').trim(),
          rollNumber: (n.rollNumber || '').trim(),
          yearOfStudy: (n.yearOfStudy || '').trim()
        }))
        .filter(n => n.name || n.department || n.rollNumber || n.yearOfStudy);

      const studentId = await generateUniqueStudentId();

      // Atomic registration enforcing one email = one account only
      await registerStudentWithKyc(
        studentId,
        email,
        primary,
        cleanNominees,
        googleUid
      );

      setGeneratedId(studentId);
      setStep('success');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const msg = errorObj?.message || 'Could not complete registration. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await onLoginComplete(generatedId, primary.name, email);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(generatedId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const updatePrimary = (field: keyof PersonDetails, value: string) => setPrimary(prev => ({ ...prev, [field]: value }));

  const updateNominee = (index: number, field: keyof PersonDetails, value: string) => {
    setNominees(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n));
  };

  const addNominee = () => {
    if (nominees.length >= MAX_NOMINEES) return;
    setNominees(prev => [...prev, { ...emptyDetails }]);
  };

  const removeNominee = (index: number) => {
    setNominees(prev => prev.filter((_, i) => i !== index));
  };

  if (step === 'checking') {
    return <div className="text-center text-[#6B7680] text-xs uppercase tracking-wider py-8 animate-pulse">Loading trading terminal...</div>;
  }

  return (
    <div className="space-y-4 font-mono">
      {loginToast && (
        <div className="bg-[#2FBF71]/15 border border-[#2FBF71] text-[#2FBF71] text-xs p-3.5 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 animate-spin" />
          <span>{loginToast}</span>
        </div>
      )}

      {error && (
        <div className="bg-[rgba(226,86,79,0.12)] border border-[#E2564F] text-[#E2564F] text-xs p-3.5 leading-relaxed">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        </div>
      )}

      {/* ================= STEP: START / GOOGLE AUTHENTICATION ================= */}
      {step === 'start' && (
        <div className="space-y-4">
          {/* Direct In-App Clarification Notice (Fixes confusion about waiting for verification links or mails) */}
          <div className="bg-[#141B23] border border-[#2FBF71]/40 p-3.5 text-xs text-[#C9D3D9] leading-relaxed font-sans space-y-1.5">
            <div className="text-[#2FBF71] font-bold uppercase tracking-wider font-mono text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Instant In-App Sign-In</span>
            </div>
            <p className="text-[11px] text-[#C9D3D9]">
              Enter your Google account email below. <strong>No email link or verification mail will be sent to your Gmail inbox</strong> — your account is authenticated directly here in real-time.
            </p>
            <div className="text-[#6B7680] text-[10px] font-mono pt-0.5">
              Policy: <strong>1 Email = 1 Student Registration</strong>. Existing users are logged straight in.
            </div>
          </div>

          {/* Primary Google Email Sign-In Form */}
          <form onSubmit={handleDirectEmailSignIn} className="bg-[#141B23] border border-[#1F2A33] p-4 space-y-3.5">
            <div>
              <label className={labelClass}>Google Email Address *</label>
              <div className="relative">
                <input
                  ref={emailInputRef}
                  type="email"
                  required
                  value={directEmail}
                  onChange={(e) => setDirectEmail(e.target.value)}
                  placeholder="e.g. yourname@gmail.com"
                  className={inputClass}
                />
                <Mail className="w-3.5 h-3.5 text-[#6B7680] absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setDirectEmail(prev => prev ? (prev.includes('@') ? prev : `${prev}@gmail.com`) : '@gmail.com')}
                  className="text-[10px] text-[#D4A93F] hover:underline border border-[#D4A93F]/40 bg-[#D4A93F]/10 px-2 py-0.5 cursor-pointer font-mono"
                >
                  + @gmail.com
                </button>
                <span className="text-[10px] text-[#6B7680] font-sans">
                  Direct instant access
                </span>
              </div>
            </div>

            <div>
              <label className={labelClass}>Student Full Name (Optional)</label>
              <input
                type="text"
                value={directName}
                onChange={(e) => setDirectName(e.target.value)}
                placeholder="e.g. Arjun Kumar"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !directEmail.trim()}
              className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
            >
              <Chrome className="w-4 h-4 text-[#0A0E14]" />
              {loading ? 'Authenticating...' : 'Continue with Google Account'}
            </button>
          </form>

          {/* Secondary 1-Click Popup Option */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="text-[11px] text-[#6B7680] hover:text-[#C9D3D9] underline transition cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
            >
              <Chrome className="w-3.5 h-3.5 text-[#6B7680]" />
              <span>Or try 1-click Google popup</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP: KYC WEB APP FORM ================= */}
      {step === 'kyc' && (
        <div className="space-y-5">
          {/* Confirmed Account Banner */}
          <div className="bg-[#141B23] border border-[#2FBF71]/40 p-3.5 text-xs text-[#C9D3D9] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-4 h-4 text-[#2FBF71] shrink-0" />
              <div className="truncate">
                <span className="text-[#6B7680] text-[10px] uppercase block">Authenticated Account</span>
                <span className="text-[#F1F4F6] font-bold font-mono">{email}</span>
              </div>
            </div>
            <span className="bg-[#2FBF71]/15 border border-[#2FBF71]/40 text-[#2FBF71] text-[10px] uppercase tracking-wider px-2 py-0.5 shrink-0 font-bold">
              Instant Verified
            </span>
          </div>

          <div className="bg-[#10161D] border border-[#1F2A33] p-4 space-y-4">
            <div>
              <h4 className="text-xs uppercase font-bold tracking-wider text-[#D4A93F] mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Primary Student KYC Details</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <input
                    type="text"
                    required
                    value={primary.name}
                    onChange={(e) => updatePrimary('name', e.target.value)}
                    placeholder="e.g. Arjun Kumar"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Department *</label>
                  <input
                    type="text"
                    required
                    value={primary.department}
                    onChange={(e) => updatePrimary('department', e.target.value)}
                    placeholder="e.g. MBA / Finance"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Institute Roll Number *</label>
                  <input
                    type="text"
                    required
                    value={primary.rollNumber}
                    onChange={(e) => updatePrimary('rollNumber', e.target.value)}
                    placeholder="e.g. 24MBA102"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Year of Study *</label>
                  <select
                    required
                    value={primary.yearOfStudy}
                    onChange={(e) => updatePrimary('yearOfStudy', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select year</option>
                    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Team Members / Nominees Section */}
            <div className="border-t border-[#1F2A33] pt-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Team Members / Nominees</span>
                </h4>
                {nominees.length < MAX_NOMINEES && (
                  <button
                    type="button"
                    onClick={addNominee}
                    className="text-[10px] uppercase tracking-wider text-[#D4A93F] hover:brightness-110 cursor-pointer flex items-center gap-1 border border-[#D4A93F]/50 px-2 py-1"
                  >
                    <Plus className="w-3 h-3" /> Add Member
                  </button>
                )}
              </div>
              <p className="text-[10px] text-[#6B7680] mb-3 italic font-sans">
                Optional — add up to {MAX_NOMINEES} teammates if trading as a group. Leave empty for solo trading.
              </p>

              {nominees.length === 0 && (
                <div className="text-[10px] text-[#6B7680] border border-dashed border-[#1F2A33] px-3 py-3 text-center bg-[#141B23]/40">
                  Solo Account: No additional team members added.
                </div>
              )}

              <div className="space-y-3">
                {nominees.map((nominee, index) => (
                  <div key={index} className="border border-[#1F2A33] bg-[#141B23] p-3 relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-wider text-[#D4A93F]">Nominee {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeNominee(index)}
                        title="Remove member"
                        className="text-[#6B7680] hover:text-[#E2564F] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className={labelClass}>Full Name</label>
                        <input
                          type="text"
                          value={nominee.name || ''}
                          onChange={(e) => updateNominee(index, 'name', e.target.value)}
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Department</label>
                        <input
                          type="text"
                          value={nominee.department || ''}
                          onChange={(e) => updateNominee(index, 'department', e.target.value)}
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Roll Number</label>
                        <input
                          type="text"
                          value={nominee.rollNumber || ''}
                          onChange={(e) => updateNominee(index, 'rollNumber', e.target.value)}
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Year of Study</label>
                        <select
                          value={nominee.yearOfStudy || ''}
                          onChange={(e) => updateNominee(index, 'yearOfStudy', e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select year</option>
                          {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* In-app Guarantee Notice */}
            <div className="bg-[#141B23] border-l-2 border-[#2FBF71] p-3 text-[11px] text-[#C9D3D9] font-sans">
              Notice: Each email address can register only once. Your trading profile is activated immediately upon submission — no external email or link is required.
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setStep('start'); setError(null); }}
                className="px-4 py-3 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCompleteRegistration}
                disabled={loading}
                className="flex-1 py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loading ? 'Creating Account...' : 'Submit KYC & Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP: REGISTRATION SUCCESS ================= */}
      {step === 'success' && (
        <div className="text-center space-y-5 py-2">
          <CheckCircle2 className="w-12 h-12 text-[#2FBF71] mx-auto" />
          <div>
            <div className="text-base font-bold text-[#F1F4F6]">Account Created &amp; Active!</div>
            <div className="text-xs text-[#6B7680] mt-1 font-sans">
              Your registered Google email <span className="text-[#F1F4F6] font-mono">{email}</span> is now active with Student ID:
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className="bg-[#141B23] border-2 border-[#D4A93F] px-5 py-3 font-mono text-xl font-bold text-[#D4A93F] tracking-widest shadow-lg">
              {generatedId}
            </div>
            <button
              type="button"
              onClick={handleCopyId}
              title="Copy ID"
              className="p-3 border border-[#1F2A33] bg-[#141B23] text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          {copied && <div className="text-[11px] text-[#2FBF71]">Copied Student ID to clipboard</div>}

          <div className="bg-[#141B23] border border-[#1F2A33] p-3 text-[11px] text-[#6B7680] leading-relaxed font-sans text-left">
            <div className="text-[#F1F4F6] font-semibold mb-1 flex items-center gap-1 font-mono text-[11px]">
              <Info className="w-3.5 h-3.5 text-[#D4A93F]" />
              <span>Direct Activation Completed</span>
            </div>
            Your registration is 100% complete and active. No email link or confirmation message is needed. When you return in the future, simply enter <strong className="text-[#F1F4F6]">{email}</strong> to access your portfolio directly.
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            {loading ? 'Entering Trading Floor...' : 'Enter Trading Floor'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================= STEP: ERROR RECOVERY ================= */}
      {step === 'error' && (
        <div className="text-center space-y-4 py-2">
          <div className="text-[#E2564F] text-sm font-bold">Authentication Issue</div>
          <div className="text-xs text-[#6B7680]">{error}</div>
          <button
            type="button"
            onClick={() => { setError(null); setStep('start'); }}
            className="w-full py-3 bg-[#1F2A33] text-[#F1F4F6] font-bold text-xs uppercase tracking-wider hover:brightness-125 cursor-pointer"
          >
            Back to Sign In
          </button>
        </div>
      )}
    </div>
  );
};
