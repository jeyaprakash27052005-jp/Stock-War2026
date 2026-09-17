import React, { useEffect, useState } from 'react';
import { PersonDetails } from '../types';
import {
  signInWithGoogle,
  findStudentProfileByGoogleUid,
  savePendingRegistration,
  loadPendingRegistration,
  deletePendingRegistration,
  sendStudentVerificationLink,
  isStudentVerificationLink,
  completeStudentVerificationLink,
  generateUniqueStudentId,
  saveStudentProfileToFirestore
} from '../firebase';
import { User, Users, Mail, CheckCircle2, Copy, Chrome } from 'lucide-react';

interface StudentAuthFlowProps {
  onLoginComplete: (roll: string, name: string, email: string) => Promise<void>;
}

type Step = 'checking' | 'start' | 'kyc' | 'awaiting' | 'confirmEmail' | 'success' | 'error';

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Other'];
const emptyDetails: PersonDetails = { name: '', department: '', rollNumber: '', yearOfStudy: '' };
const EMAIL_STORAGE_KEY = 'emailForSignIn'; // Firebase's own required key for email-link auth

const inputClass = "w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3 py-2 font-mono outline-none focus:border-[#D4A93F] placeholder:text-[#3A4550]";
const labelClass = "text-[10px] uppercase tracking-wider text-[#6B7680] mb-1 block";

export const StudentAuthFlow: React.FC<StudentAuthFlowProps> = ({ onLoginComplete }) => {
  const [step, setStep] = useState<Step>('checking');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [googleUid, setGoogleUid] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [confirmEmailInput, setConfirmEmailInput] = useState<string>('');

  const [primary, setPrimary] = useState<PersonDetails>(emptyDetails);
  const [partner, setPartner] = useState<Partial<PersonDetails>>({});

  const [generatedId, setGeneratedId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // On mount: if this page load IS the return trip from the emailed verification
  // link, complete it automatically. Otherwise show the normal "start" screen.
  useEffect(() => {
    const url = window.location.href;
    if (isStudentVerificationLink(url)) {
      const storedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);
      if (storedEmail) {
        void completeVerification(storedEmail, url);
      } else {
        // Opened on a different device/browser than the one that requested the link -
        // Firebase's documented fallback is to ask them to confirm their email.
        setStep('confirmEmail');
      }
    } else {
      setStep('start');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeVerification = async (verifyEmail: string, url: string) => {
    setLoading(true);
    setError(null);
    try {
      const user = await completeStudentVerificationLink(verifyEmail, url);
      const pending = await loadPendingRegistration(verifyEmail);
      if (!pending) {
        setError('This verification link has already been used or has expired. Please register again.');
        setStep('error');
        return;
      }
      const studentId = await generateUniqueStudentId();
      await saveStudentProfileToFirestore(studentId, {
        roll: studentId,
        primary: pending.primary,
        partner: pending.partner,
        completed: true,
        googleUid: user.uid,
        email: verifyEmail,
        verified: true,
        verifiedAt: Date.now()
      });
      await deletePendingRegistration(verifyEmail);
      window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      // Clean the verification params out of the URL so a refresh doesn't re-trigger this
      window.history.replaceState({}, document.title, window.location.pathname);

      setPrimary(pending.primary);
      setGeneratedId(studentId);
      setEmail(verifyEmail);
      setStep('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not complete verification. The link may have expired.';
      setError(msg);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      if (!user.email) {
        setError('Your Google account has no email address associated with it. Please try a different account.');
        setLoading(false);
        return;
      }
      const existingProfile = await findStudentProfileByGoogleUid(user.uid);
      if (existingProfile && existingProfile.verified) {
        // Returning, already-verified student - log straight in, no KYC needed again
        await onLoginComplete(existingProfile.roll, existingProfile.primary.name, existingProfile.email || user.email);
        return;
      }
      setGoogleUid(user.uid);
      setEmail(user.email);
      setPrimary(prev => ({ ...prev, name: prev.name || user.displayName || '' }));
      setStep('kyc');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerification = async () => {
    if (!primary.name.trim() || !primary.department.trim() || !primary.rollNumber.trim() || !primary.yearOfStudy.trim()) {
      setError('Please fill in your name, department, roll number, and year of study.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await savePendingRegistration({
        email,
        googleUid,
        primary,
        partner,
        createdAt: Date.now()
      });
      const continueUrl = window.location.origin + window.location.pathname;
      await sendStudentVerificationLink(email, continueUrl);
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
      setStep('awaiting');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send the verification email. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    try {
      const continueUrl = window.location.origin + window.location.pathname;
      await sendStudentVerificationLink(email, continueUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the email.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEmailSubmit = async () => {
    if (!confirmEmailInput.trim()) {
      setError('Please enter the email address you registered with.');
      return;
    }
    await completeVerification(confirmEmailInput.trim(), window.location.href);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(generatedId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable - ignore */ });
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await onLoginComplete(generatedId, primary.name, email);
    } finally {
      setLoading(false);
    }
  };

  const updatePrimary = (field: keyof PersonDetails, value: string) => setPrimary(prev => ({ ...prev, [field]: value }));
  const updatePartner = (field: keyof PersonDetails, value: string) => setPartner(prev => ({ ...prev, [field]: value }));

  if (step === 'checking') {
    return <div className="text-center text-[#6B7680] text-xs uppercase tracking-wider py-8 animate-pulse">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {error && step !== 'error' && (
        <div className="bg-[rgba(226,86,79,0.12)] border border-[#E2564F] text-[#E2564F] text-xs p-3.5 font-mono leading-relaxed">
          {error}
        </div>
      )}

      {step === 'start' && (
        <div className="space-y-4">
          <div className="bg-[#141B23] border border-[#1F2A33] p-4 text-xs text-[#C9D3D9] leading-relaxed">
            Sign in with your Google account to register or log back in. First time here? You'll fill in a
            quick KYC form and verify your email - no password to remember.
          </div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 bg-[#F1F4F6] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-95 active:translate-y-px transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2.5"
          >
            <Chrome className="w-4 h-4" />
            {loading ? 'Connecting...' : 'Continue with Google'}
          </button>
        </div>
      )}

      {step === 'kyc' && (
        <div className="space-y-5">
          <div className="bg-[#141B23] border border-[#1F2A33] p-3 text-xs text-[#C9D3D9] flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-[#D4A93F] shrink-0" />
            <span>Registering as <span className="text-[#F1F4F6] font-semibold">{email}</span></span>
          </div>

          <div>
            <h4 className="text-xs uppercase font-bold tracking-wider text-[#D4A93F] mb-3 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Your Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Full Name *</label>
                <input type="text" value={primary.name} onChange={(e) => updatePrimary('name', e.target.value)} placeholder="e.g. Arjun Kumar" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Department *</label>
                <input type="text" value={primary.department} onChange={(e) => updatePrimary('department', e.target.value)} placeholder="e.g. Computer Science" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Roll Number *</label>
                <input type="text" value={primary.rollNumber} onChange={(e) => updatePrimary('rollNumber', e.target.value)} placeholder="e.g. CS2024001" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Year of Study *</label>
                <select value={primary.yearOfStudy} onChange={(e) => updatePrimary('yearOfStudy', e.target.value)} className={inputClass}>
                  <option value="">Select year</option>
                  {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] mb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Partner / Team Member Details
            </h4>
            <p className="text-[10px] text-[#6B7680] mb-3 italic">Optional - fill in only if you're trading with a partner or team.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Full Name</label>
                <input type="text" value={partner.name || ''} onChange={(e) => updatePartner('name', e.target.value)} placeholder="Optional" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Department</label>
                <input type="text" value={partner.department || ''} onChange={(e) => updatePartner('department', e.target.value)} placeholder="Optional" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Roll Number</label>
                <input type="text" value={partner.rollNumber || ''} onChange={(e) => updatePartner('rollNumber', e.target.value)} placeholder="Optional" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Year of Study</label>
                <select value={partner.yearOfStudy || ''} onChange={(e) => updatePartner('yearOfStudy', e.target.value)} className={inputClass}>
                  <option value="">Select year</option>
                  {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSendVerification}
            disabled={loading}
            className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Verification Email'}
          </button>
        </div>
      )}

      {step === 'awaiting' && (
        <div className="text-center space-y-4 py-4">
          <Mail className="w-10 h-10 text-[#D4A93F] mx-auto" />
          <div>
            <div className="text-sm font-bold text-[#F1F4F6]">Check your inbox</div>
            <div className="text-xs text-[#6B7680] mt-1.5 leading-relaxed">
              We've sent a verification link to<br /><span className="text-[#D4A93F]">{email}</span>.<br />
              Open it on this device to finish registering.
            </div>
          </div>
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="text-xs text-[#6B7680] hover:text-[#F1F4F6] underline cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Resending...' : "Didn't get it? Resend email"}
          </button>
        </div>
      )}

      {step === 'confirmEmail' && (
        <div className="space-y-4">
          <div className="bg-[#141B23] border border-[#1F2A33] p-4 text-xs text-[#C9D3D9] leading-relaxed">
            To confirm it's really you, please re-enter the email address you registered with.
          </div>
          <div>
            <label className={labelClass}>Email Address</label>
            <input
              type="email"
              value={confirmEmailInput}
              onChange={(e) => setConfirmEmailInput(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={handleConfirmEmailSubmit}
            disabled={loading}
            className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Confirm & Continue'}
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="text-center space-y-5 py-2">
          <CheckCircle2 className="w-10 h-10 text-[#2FBF71] mx-auto" />
          <div>
            <div className="text-sm font-bold text-[#F1F4F6]">Email verified!</div>
            <div className="text-xs text-[#6B7680] mt-1">Your Student User ID has been generated:</div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="bg-[#141B23] border border-[#D4A93F] px-4 py-2.5 font-mono text-lg font-bold text-[#D4A93F] tracking-wider">
              {generatedId}
            </div>
            <button
              type="button"
              onClick={handleCopyId}
              title="Copy ID"
              className="p-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          {copied && <div className="text-[10px] text-[#2FBF71]">Copied to clipboard</div>}
          <div className="text-[11px] text-[#6B7680] leading-relaxed">
            Save this ID - it's how you'll be identified on the class roster. You'll sign in with the same
            Google account from now on, so you won't need to type it again.
          </div>
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Entering...' : 'Continue to Trading Floor'}
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="text-center space-y-4 py-2">
          <div className="text-[#E2564F] text-sm font-bold">Verification failed</div>
          <div className="text-xs text-[#6B7680]">{error}</div>
          <button
            type="button"
            onClick={() => { setError(null); setStep('start'); window.history.replaceState({}, document.title, window.location.pathname); }}
            className="w-full py-3 bg-[#1F2A33] text-[#F1F4F6] font-bold text-xs uppercase tracking-wider hover:brightness-125 cursor-pointer"
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
};
