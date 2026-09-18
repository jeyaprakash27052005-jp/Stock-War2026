import React, { useEffect, useState, useRef } from 'react';
import { PersonDetails } from '../types';
import {
  findStudentProfileByGoogleUid,
  generateUniqueStudentId,
  generateAutoPassword,
  checkEmailRegistrationStatus,
  registerStudentWithKyc,
  verifyStudentCredentials,
  updateStudentPassword
} from '../firebase';
import {
  User,
  UserPlus,
  Users,
  Mail,
  CheckCircle2,
  Copy,
  Plus,
  X,
  AlertTriangle,
  Lock,
  ArrowRight,
  Sparkles,
  Check,
  KeyRound,
  Eye,
  EyeOff,
  Building2
} from 'lucide-react';

interface StudentAuthFlowProps {
  onLoginComplete: (roll: string, name: string, email: string) => Promise<void>;
}

type Step = 'checking' | 'start' | 'kyc' | 'success' | 'change-password' | 'error';
type AuthMode = 'login' | 'register';

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Other'];
const emptyDetails: PersonDetails = { name: '', department: '', rollNumber: '', yearOfStudy: '' };
const MAX_NOMINEES = 4; // up to 4 additional nominees + primary = 5 total members

const inputClass =
  'w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3 py-2.5 font-mono outline-none focus:border-[#D4A93F] placeholder:text-[#3A4550] transition-colors';
const labelClass = 'text-[10px] uppercase tracking-wider text-[#6B7680] mb-1.5 block font-semibold';

export const StudentAuthFlow: React.FC<StudentAuthFlowProps> = ({ onLoginComplete }) => {
  const [step, setStep] = useState<Step>('checking');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginToast, setLoginToast] = useState<string | null>(null);

  // Tab 1: Registered User Login (User ID / Email + Password)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Tab 2: New Registration Email state
  const [email, setEmail] = useState<string>('');
  const [directEmail, setDirectEmail] = useState<string>('');
  const [directName, setDirectName] = useState<string>('');
  const emailInputRef = useRef<HTMLInputElement>(null);

  // KYC Form State (including Team Name)
  const [teamName, setTeamName] = useState<string>('');
  const [primary, setPrimary] = useState<PersonDetails>(emptyDetails);
  const [nominees, setNominees] = useState<Partial<PersonDetails>[]>([]);

  // Generated Credentials State upon KYC completion (e.g. 26SW01)
  const [generatedId, setGeneratedId] = useState<string>('');
  const [generatedPassword, setGeneratedPassword] = useState<string>('');
  const [showGenPassword, setShowGenPassword] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  // Change Password State (for first login)
  const [targetRoll, setTargetRoll] = useState<string>('');
  const [targetName, setTargetName] = useState<string>('');
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    setStep('start');
  }, []);

  // Direct Registration Email submission
  const handleEmailRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = directEmail.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      setError('Please enter a valid email address (e.g. yourname@gmail.com).');
      return;
    }

    setLoading(true);
    try {
      // Check if this email is already registered
      const status = await checkEmailRegistrationStatus(normalized);

      if (status.registered && status.roll) {
        const profile = status.profile;
        if (profile?.mustChangePassword) {
          setTargetRoll(status.roll);
          setTargetName(status.studentName || directName || status.roll);
          setTargetEmail(normalized);
          setCurrentPassword(profile.password || '');
          setStep('change-password');
          return;
        }

        setLoginToast(`Existing registered account found (User ID: ${status.roll}). Logging you in...`);
        setTimeout(async () => {
          await onLoginComplete(
            status.roll!,
            status.studentName || directName || status.roll!,
            normalized
          );
        }, 700);
        return;
      }

      // New user -> Proceed to KYC form with team name & details
      setEmail(normalized);
      setPrimary(prev => ({
        ...prev,
        name: prev.name || directName || ''
      }));
      setStep('kyc');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj?.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Registered User Login with User ID (e.g. 26SW01) / Email + Password
  const handleUserIdLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      setError('Please enter both your User ID (or Email) and Password.');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyStudentCredentials(loginIdentifier, loginPassword);
      if (!result.success || !result.profile) {
        setError(result.error || 'Invalid credentials. Please check your User ID and Password.');
        return;
      }

      const p = result.profile;
      // If student is on first login and must change password
      if (result.mustChangePassword) {
        setTargetRoll(p.roll);
        setTargetName(p.primary?.name || p.roll);
        setTargetEmail(p.email || '');
        setCurrentPassword(loginPassword.trim());
        setStep('change-password');
        return;
      }

      // Normal login
      setLoginToast(`Welcome back, ${p.primary?.name || p.roll}! Accessing terminal...`);
      setTimeout(async () => {
        await onLoginComplete(p.roll, p.primary?.name || p.roll, p.email || '');
      }, 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // KYC submission & registration (generates User ID in form of 26SW01 + Password)
  const handleCompleteRegistration = async () => {
    if (!teamName.trim()) {
      setError('Please provide a Team / Desk Name (e.g. "Alpha Traders" or "Solo Desk").');
      return;
    }
    if (!primary.name.trim() || !primary.department.trim() || !primary.rollNumber.trim() || !primary.yearOfStudy.trim()) {
      setError('Please fill in all primary student details (Name, Department, Roll Number, Year of Study).');
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

      // Generates ID formatted like 26SW01, 26SW02, etc.
      const studentId = await generateUniqueStudentId();
      const initialPassword = generateAutoPassword();

      // Register with KYC, Team Name, and Auto-generated Password
      const reg = await registerStudentWithKyc(
        studentId,
        email,
        primary,
        cleanNominees,
        teamName.trim(),
        initialPassword
      );

      setGeneratedId(reg.studentId);
      setGeneratedPassword(reg.autoPassword);
      setTargetRoll(reg.studentId);
      setTargetName(primary.name);
      setTargetEmail(email);
      setCurrentPassword(reg.autoPassword);
      setStep('success');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const msg = errorObj?.message || 'Could not complete KYC registration. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // First Login Change Password Handler
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNew = newPassword.trim();
    const cleanConfirm = confirmPassword.trim();

    if (cleanNew.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (cleanNew !== cleanConfirm) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      await updateStudentPassword(targetRoll, cleanNew);
      setLoginToast('Password successfully updated! Launching terminal...');
      setTimeout(async () => {
        await onLoginComplete(targetRoll, targetName || targetRoll, targetEmail);
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password. Please try again.';
      setError(msg);
      setLoading(false);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(generatedId).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => {});
  };

  const handleCopyPass = () => {
    navigator.clipboard.writeText(generatedPassword).then(() => {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
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
    return (
      <div className="text-center text-[#6B7680] text-xs uppercase tracking-wider py-8 animate-pulse font-mono">
        Loading trading terminal...
      </div>
    );
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

      {/* ================= STEP: START / AUTHENTICATION (User ID & Password OR Registration) ================= */}
      {step === 'start' && (
        <div className="space-y-4">
          {/* Sub-tabs: User ID Login vs New Registration */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#141B23] border border-[#1F2A33]">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setError(null); }}
              className={`py-2 px-2 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'login'
                  ? 'bg-[#D4A93F] text-[#0A0E14]'
                  : 'text-[#6B7680] hover:text-[#F1F4F6]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>User ID &amp; Password</span>
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setError(null); }}
              className={`py-2 px-2 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'register'
                  ? 'bg-[#D4A93F] text-[#0A0E14]'
                  : 'text-[#6B7680] hover:text-[#F1F4F6]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>New Student KYC</span>
            </button>
          </div>

          {/* TAB 1: USER ID & PASSWORD LOGIN (For already registered students) */}
          {authMode === 'login' && (
            <form onSubmit={handleUserIdLogin} className="bg-[#141B23] border border-[#1F2A33] p-4 space-y-3.5">
              <div className="text-xs text-[#C9D3D9] font-sans pb-1 border-b border-[#1F2A33]/70">
                <span className="font-mono text-[#D4A93F] font-bold uppercase text-[11px] block mb-0.5">
                  Registered Student Login
                </span>
                Enter your generated Student User ID (e.g. <span className="font-mono text-[#F1F4F6] font-bold">26SW01</span>) or registered email.
              </div>

              <div>
                <label className={labelClass}>User ID or Registered Email *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. 26SW01 or name@gmail.com"
                    className={inputClass}
                  />
                  <User className="w-3.5 h-3.5 text-[#6B7680] absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className={labelClass}>Password *</label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="text-[10px] text-[#6B7680] font-sans mt-1">
                  On first login, you will automatically be guided to change your temporary password.
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !loginIdentifier.trim() || !loginPassword.trim()}
                className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
              >
                <Lock className="w-3.5 h-3.5 text-[#0A0E14]" />
                {loading ? 'Verifying...' : 'Sign In with User ID & Password'}
              </button>

              <div className="text-center pt-1 border-t border-[#1F2A33] border-dashed">
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className="text-[11px] text-[#D4A93F] hover:underline cursor-pointer font-sans"
                >
                  New student? Complete KYC to generate your User ID (e.g. 26SW01) &rarr;
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: NEW STUDENT EMAIL REGISTRATION & KYC */}
          {authMode === 'register' && (
            <form onSubmit={handleEmailRegistration} className="bg-[#141B23] border border-[#1F2A33] p-4 space-y-3.5">
              <div className="text-xs text-[#C9D3D9] font-sans pb-1 border-b border-[#1F2A33]/70">
                <span className="font-mono text-[#D4A93F] font-bold uppercase text-[11px] block mb-0.5">
                  New Student Registration
                </span>
                Enter your email address to register. Completing KYC will automatically generate your User ID in the sequence of <span className="font-mono text-[#F1F4F6] font-bold">26SW01</span>.
              </div>

              <div>
                <label className={labelClass}>Email Address *</label>
                <div className="relative">
                  <input
                    ref={emailInputRef}
                    type="email"
                    required
                    value={directEmail}
                    onChange={(e) => setDirectEmail(e.target.value)}
                    placeholder="e.g. student@gmail.com"
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
                    1 Email = 1 Student Registration
                  </span>
                </div>
              </div>

              <div>
                <label className={labelClass}>Full Name (Optional)</label>
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
                <ArrowRight className="w-3.5 h-3.5" />
                {loading ? 'Verifying...' : 'Proceed to KYC Form'}
              </button>

              <div className="text-center pt-1 border-t border-[#1F2A33] border-dashed">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="text-[11px] text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer font-sans"
                >
                  Already have a User ID? Sign in here &rarr;
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ================= STEP: KYC FORM (With Team Name!) ================= */}
      {step === 'kyc' && (
        <div className="space-y-4">
          <div className="bg-[#141B23] border border-[#2FBF71]/40 p-3 text-xs text-[#C9D3D9] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-4 h-4 text-[#2FBF71] shrink-0" />
              <div className="truncate">
                <span className="text-[#6B7680] text-[10px] uppercase block">Registered Email</span>
                <span className="text-[#F1F4F6] font-bold font-mono">{email}</span>
              </div>
            </div>
            <span className="bg-[#2FBF71]/15 border border-[#2FBF71]/40 text-[#2FBF71] text-[10px] uppercase tracking-wider px-2 py-0.5 shrink-0 font-bold">
              Ready
            </span>
          </div>

          <div className="bg-[#10161D] border border-[#1F2A33] p-4 space-y-4">
            {/* Team Name Section */}
            <div className="bg-[#141B23] border border-[#D4A93F]/40 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Building2 className="w-4 h-4 text-[#D4A93F]" />
                <label className="text-xs uppercase font-bold tracking-wider text-[#D4A93F]">
                  Team / Trading Desk Name *
                </label>
              </div>
              <input
                type="text"
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Alpha Bulls, Dalal Mavericks, or Solo Desk"
                className={inputClass}
              />
              <div className="text-[10px] text-[#6B7680] font-sans mt-1">
                Enter your syndicate team name or solo desk title.
              </div>
            </div>

            {/* Primary Student Details */}
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
                <div className="text-[10px] text-[#6B7680] border border-dashed border-[#1F2A33] px-3 py-2.5 text-center bg-[#141B23]/40">
                  Solo Account: No additional team members added.
                </div>
              )}

              <div className="space-y-3">
                {nominees.map((nominee, index) => (
                  <div key={index} className="border border-[#1F2A33] bg-[#141B23] p-3 relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-wider text-[#D4A93F]">Member {index + 1}</span>
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
                disabled={loading || !teamName.trim()}
                className="flex-1 py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loading ? 'Generating 26SW ID...' : 'Submit KYC & Generate User ID'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP: SUCCESS (Displays Auto-generated User ID like 26SW01 & Password) ================= */}
      {step === 'success' && (
        <div className="space-y-4 py-1">
          <div className="text-center space-y-1">
            <CheckCircle2 className="w-10 h-10 text-[#2FBF71] mx-auto" />
            <div className="text-base font-bold text-[#F1F4F6]">KYC Registration Complete!</div>
            <div className="text-xs text-[#6B7680] font-sans">
              Your trading credentials and separate User ID have been generated.
            </div>
          </div>

          <div className="bg-[#141B23] border border-[#D4A93F] p-4 space-y-3.5">
            <div className="text-xs text-[#D4A93F] uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Your Auto-Generated Credentials</span>
              <span className="text-[10px] bg-[#D4A93F]/20 text-[#D4A93F] px-2 py-0.5 font-mono font-bold">
                Team: {teamName}
              </span>
            </div>

            {/* Generated User ID (e.g. 26SW01) */}
            <div>
              <label className={labelClass}>Generated Student User ID</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#10161D] border border-[#1F2A33] px-3.5 py-2.5 font-mono text-xl font-bold text-[#D4A93F] tracking-widest">
                  {generatedId}
                </div>
                <button
                  type="button"
                  onClick={handleCopyId}
                  title="Copy User ID"
                  className="px-3 py-2.5 border border-[#1F2A33] bg-[#10161D] text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer flex items-center gap-1 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedId ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Generated Password */}
            <div>
              <label className={labelClass}>Auto-Generated Temporary Password</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#10161D] border border-[#1F2A33] px-3.5 py-2.5 font-mono text-base font-bold text-[#F1F4F6] tracking-wider flex items-center justify-between">
                  <span>{showGenPassword ? generatedPassword : '••••••••••••'}</span>
                  <button
                    type="button"
                    onClick={() => setShowGenPassword(!showGenPassword)}
                    className="text-[#6B7680] hover:text-[#F1F4F6] text-xs cursor-pointer ml-2"
                  >
                    {showGenPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPass}
                  title="Copy Password"
                  className="px-3 py-2.5 border border-[#1F2A33] bg-[#10161D] text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer flex items-center gap-1 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedPass ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="bg-[#10161D] border-l-2 border-[#D4A93F] p-2.5 text-[11px] text-[#C9D3D9] font-sans leading-relaxed">
              <span className="font-bold text-[#D4A93F]">First Login Requirement:</span> As this is your first time registering, you must set your permanent custom password now before entering the trading floor.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep('change-password')}
            className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer flex items-center justify-center gap-2 shadow-lg"
          >
            <span>Proceed to First Login: Change Password</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================= STEP: FIRST LOGIN CHANGE PASSWORD ================= */}
      {step === 'change-password' && (
        <form onSubmit={handleChangePasswordSubmit} className="bg-[#141B23] border border-[#D4A93F] p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1F2A33]">
            <KeyRound className="w-5 h-5 text-[#D4A93F]" />
            <div>
              <div className="text-sm font-bold text-[#F1F4F6] uppercase tracking-wide">
                First Login: Set New Password
              </div>
              <div className="text-[11px] text-[#6B7680] font-sans">
                Student: <span className="text-[#D4A93F] font-mono font-bold">{targetRoll}</span> ({targetName || targetEmail})
              </div>
            </div>
          </div>

          <div className="bg-[#10161D] border border-[#1F2A33] p-3 text-[11px] text-[#C9D3D9] font-sans leading-relaxed">
            Please create a secure custom password that you will use to log into PaperFloor in future sessions with your User ID <span className="font-mono text-[#D4A93F] font-bold">{targetRoll}</span>.
          </div>

          <div>
            <label className={labelClass}>Current / Auto-Generated Password</label>
            <input
              type="text"
              readOnly
              value={currentPassword || '••••••••'}
              className="w-full bg-[#0A0E14] border border-[#1F2A33] text-[#6B7680] text-sm px-3 py-2 font-mono outline-none"
            />
          </div>

          <div>
            <label className={labelClass}>New Custom Password * (min 6 characters)</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new custom password"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Confirm New Password *</label>
            <input
              type={showNewPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !newPassword.trim() || !confirmPassword.trim()}
            className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-[#0A0E14]" />
            {loading ? 'Saving Password...' : 'Save New Password & Enter Trading Floor'}
          </button>
        </form>
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
