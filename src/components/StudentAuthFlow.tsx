import React, { useEffect, useState } from 'react';
import { PersonDetails } from '../types';
import {
  signInWithGoogle,
  findStudentProfileByGoogleUid,
  generateUniqueStudentId,
  saveStudentProfileToFirestore
} from '../firebase';
import { User, Users, Mail, CheckCircle2, Copy, Chrome, Plus, X } from 'lucide-react';

interface StudentAuthFlowProps {
  onLoginComplete: (roll: string, name: string, email: string) => Promise<void>;
}

type Step = 'checking' | 'start' | 'kyc' | 'success' | 'error';

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Other'];
const emptyDetails: PersonDetails = { name: '', department: '', rollNumber: '', yearOfStudy: '' };
const MAX_NOMINEES = 4; // plus the primary registrant = 5 people on one team

const inputClass = "w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3 py-2 font-mono outline-none focus:border-[#D4A93F] placeholder:text-[#3A4550]";
const labelClass = "text-[10px] uppercase tracking-wider text-[#6B7680] mb-1 block";

export const StudentAuthFlow: React.FC<StudentAuthFlowProps> = ({ onLoginComplete }) => {
  const [step, setStep] = useState<Step>('checking');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [googleUid, setGoogleUid] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  const [primary, setPrimary] = useState<PersonDetails>(emptyDetails);
  const [nominees, setNominees] = useState<Partial<PersonDetails>[]>([]);

  const [generatedId, setGeneratedId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStep('start');
  }, []);

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
      if (existingProfile) {
        // Already registered on this Google account - log straight in, no KYC needed again
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

  const handleCompleteRegistration = async () => {
    if (!primary.name.trim() || !primary.department.trim() || !primary.rollNumber.trim() || !primary.yearOfStudy.trim()) {
      setError('Please fill in your name, department, roll number, and year of study.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const studentId = await generateUniqueStudentId();
      const cleanNominees = nominees
        .map(n => ({
          name: (n.name || '').trim(),
          department: (n.department || '').trim(),
          rollNumber: (n.rollNumber || '').trim(),
          yearOfStudy: (n.yearOfStudy || '').trim()
        }))
        .filter(n => n.name || n.department || n.rollNumber || n.yearOfStudy);

      await saveStudentProfileToFirestore(studentId, {
        roll: studentId,
        primary,
        nominees: cleanNominees,
        completed: true,
        googleUid,
        email,
        verified: true,
        verifiedAt: Date.now()
      });

      setGeneratedId(studentId);
      setStep('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not complete registration. Please try again.';
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
    }).catch(() => { /* clipboard unavailable - ignore */ });
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
    return <div className="text-center text-[#6B7680] text-xs uppercase tracking-wider py-8 animate-pulse">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-[rgba(226,86,79,0.12)] border border-[#E2564F] text-[#E2564F] text-xs p-3.5 font-mono leading-relaxed">
          {error}
        </div>
      )}

      {step === 'start' && (
        <div className="space-y-4">
          <div className="bg-[#141B23] border border-[#1F2A33] p-4 text-xs text-[#C9D3D9] leading-relaxed">
            Sign in with your Google account to register or log back in. First time here? You'll fill in a
            quick KYC form and get your Student ID right away - no password, no separate verification step.
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
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Team Members / Nominees
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
            <p className="text-[10px] text-[#6B7680] mb-3 italic">
              Optional - add up to {MAX_NOMINEES} teammates if you're trading as a group. Leave empty for a solo account.
            </p>

            {nominees.length === 0 && (
              <div className="text-[10px] text-[#3A4550] border border-dashed border-[#1F2A33] px-3 py-4 text-center">
                No team members added yet.
              </div>
            )}

            <div className="space-y-3">
              {nominees.map((nominee, index) => (
                <div key={index} className="border border-[#1F2A33] p-3 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#6B7680]">Member {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeNominee(index)}
                      title="Remove"
                      className="text-[#6B7680] hover:text-[#E2564F] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Full Name</label>
                      <input type="text" value={nominee.name || ''} onChange={(e) => updateNominee(index, 'name', e.target.value)} placeholder="Optional" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Department</label>
                      <input type="text" value={nominee.department || ''} onChange={(e) => updateNominee(index, 'department', e.target.value)} placeholder="Optional" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Roll Number</label>
                      <input type="text" value={nominee.rollNumber || ''} onChange={(e) => updateNominee(index, 'rollNumber', e.target.value)} placeholder="Optional" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Year of Study</label>
                      <select value={nominee.yearOfStudy || ''} onChange={(e) => updateNominee(index, 'yearOfStudy', e.target.value)} className={inputClass}>
                        <option value="">Select year</option>
                        {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCompleteRegistration}
            disabled={loading}
            className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:translate-y-px transition cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Registering...' : 'Complete Registration'}
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="text-center space-y-5 py-2">
          <CheckCircle2 className="w-10 h-10 text-[#2FBF71] mx-auto" />
          <div>
            <div className="text-sm font-bold text-[#F1F4F6]">Registration complete!</div>
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
          <div className="text-[#E2564F] text-sm font-bold">Something went wrong</div>
          <div className="text-xs text-[#6B7680]">{error}</div>
          <button
            type="button"
            onClick={() => { setError(null); setStep('start'); }}
            className="w-full py-3 bg-[#1F2A33] text-[#F1F4F6] font-bold text-xs uppercase tracking-wider hover:brightness-125 cursor-pointer"
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
};
