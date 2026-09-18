import React, { useState } from 'react';
import { PersonDetails, StudentProfile } from '../types';
import { changeStudentPassword } from '../firebase';
import {
  User,
  Users,
  Building2,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Mail,
  Hash
} from 'lucide-react';

interface StudentProfileViewProps {
  roll: string;
  profile: StudentProfile | null;
  email?: string;
  teamName?: string;
  onSaveProfile: (primary: PersonDetails, nominees: Partial<PersonDetails>[], teamName?: string) => Promise<void>;
}

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Other'];

const emptyDetails: PersonDetails = { name: '', department: '', rollNumber: '', yearOfStudy: '' };
const emptyNominee: Partial<PersonDetails> = { name: '', department: '', rollNumber: '', yearOfStudy: '' };

export const StudentProfileView: React.FC<StudentProfileViewProps> = ({
  roll,
  profile,
  email,
  teamName: initialTeamName,
  onSaveProfile
}) => {
  // Profile editing state
  const [teamName, setTeamName] = useState<string>(profile?.teamName || initialTeamName || '');
  const [primary, setPrimary] = useState<PersonDetails>(
    profile?.primary || { ...emptyDetails, rollNumber: roll }
  );
  const [nominees, setNominees] = useState<Partial<PersonDetails>[]>(
    profile?.nominees && profile.nominees.length > 0 ? profile.nominees : []
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passSaving, setPassSaving] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  // Copied User ID tooltip
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(roll);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const updatePrimary = (field: keyof PersonDetails, value: string) => {
    setPrimary(prev => ({ ...prev, [field]: value }));
    setProfileSuccess(false);
  };

  const updateNominee = (index: number, field: keyof PersonDetails, value: string) => {
    setNominees(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n));
    setProfileSuccess(false);
  };

  const addNominee = () => {
    setNominees(prev => [...prev, { ...emptyNominee }]);
    setProfileSuccess(false);
  };

  const removeNominee = (index: number) => {
    setNominees(prev => prev.filter((_, i) => i !== index));
    setProfileSuccess(false);
  };

  const handleSaveProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primary.name.trim() || !primary.department.trim() || !primary.rollNumber.trim() || !primary.yearOfStudy.trim()) {
      setProfileError('All primary details (Name, Department, Roll Number, and Year of Study) are required.');
      return;
    }
    setProfileError(null);
    setProfileSaving(true);
    try {
      const cleanedNominees = nominees.filter(n =>
        (n.name || '').trim() || (n.department || '').trim() || (n.rollNumber || '').trim() || (n.yearOfStudy || '').trim()
      );
      await onSaveProfile(primary, cleanedNominees, teamName.trim());
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 4000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    const cleanCurrent = currentPassword.trim();
    const cleanNew = newPassword.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanCurrent) {
      setPassError('Please enter your current password.');
      return;
    }
    if (cleanNew.length < 4) {
      setPassError('New password must be at least 4 characters long.');
      return;
    }
    if (cleanNew !== cleanConfirm) {
      setPassError('New password and confirmation password do not match.');
      return;
    }
    if (cleanCurrent === cleanNew) {
      setPassError('New password must be different from your current password.');
      return;
    }

    setPassSaving(true);
    try {
      const res = await changeStudentPassword(roll, cleanCurrent, cleanNew);
      if (!res.success) {
        setPassError(res.error || 'Failed to change password. Please check your current password.');
      } else {
        setPassSuccess('Password updated successfully! You can use your new password next time you log in.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPassSuccess(null), 6000);
      }
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'An unexpected error occurred while changing password.');
    } finally {
      setPassSaving(false);
    }
  };

  const inputClass = "w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3.5 py-2.5 font-mono outline-none focus:border-[#D4A93F] placeholder:text-[#3A4550] transition-colors";
  const labelClass = "text-[11px] uppercase tracking-wider text-[#6B7680] font-mono mb-1.5 block font-semibold";

  return (
    <div className="space-y-6">
      {/* Account Overview Header Card */}
      <div className="bg-[#10161D] border border-[#1F2A33] p-6 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1F2A33] pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded bg-[#141B23] border border-[#D4A93F]/40 flex items-center justify-center text-[#D4A93F] font-bold text-xl font-['Big_Shoulders_Display',sans-serif]">
              {primary.name ? primary.name.charAt(0).toUpperCase() : roll.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-[#F1F4F6]">{primary.name || 'Student Profile'}</h2>
                <span className="bg-[#2FBF71]/15 text-[#2FBF71] border border-[#2FBF71]/40 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                  Verified Trader
                </span>
                {teamName && (
                  <span className="bg-[#D4A93F]/15 text-[#D4A93F] border border-[#D4A93F]/40 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                    Team: {teamName}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#6B7680] mt-0.5">{primary.department || 'Trading Floor Participant'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* User ID Pill */}
            <div className="flex items-center gap-2 bg-[#141B23] border border-[#1F2A33] px-3 py-1.5">
              <Hash className="w-3.5 h-3.5 text-[#D4A93F]" />
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[#6B7680]">Student User ID</div>
                <div className="text-sm font-bold text-[#D4A93F] font-mono tracking-wider">{roll}</div>
              </div>
              <button
                type="button"
                id="copyUserIdBtn"
                onClick={handleCopyId}
                title="Copy User ID"
                className="ml-1 text-[#6B7680] hover:text-[#F1F4F6] p-1 transition cursor-pointer"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Email Pill if available */}
            {email && (
              <div className="flex items-center gap-2 bg-[#141B23] border border-[#1F2A33] px-3 py-1.5">
                <Mail className="w-3.5 h-3.5 text-[#6B7680]" />
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-[#6B7680]">Google Email</div>
                  <div className="text-xs font-mono text-[#C9D3D9]">{email}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 text-xs text-[#6B7680] flex items-center justify-between flex-wrap gap-2">
          <span>Manage your student profile details, team desk name, and account password below.</span>
          <span className="text-[11px] font-mono text-[#3A4550]">
            Last Synced: {new Date(profile?.updatedAt || Date.now()).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Main 2-Column Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Profile & Team Details (7 Cols) */}
        <div className="lg:col-span-7 bg-[#10161D] border border-[#1F2A33] p-6 font-mono space-y-6">
          <div className="border-b border-[#1F2A33] pb-4">
            <h3 className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6] uppercase tracking-wide flex items-center gap-2">
              <User className="w-5 h-5 text-[#D4A93F]" />
              <span>Student Profile Information</span>
            </h3>
            <p className="text-xs text-[#6B7680] mt-1">
              Your registered student identity and optional team desk details.
            </p>
          </div>

          <form onSubmit={handleSaveProfileSubmit} className="space-y-6">
            {/* Team / Desk Name */}
            <div className="bg-[#141B23] border border-[#1F2A33] p-4">
              <label className={`${labelClass} text-[#D4A93F] flex items-center gap-1.5`}>
                <Building2 className="w-3.5 h-3.5" />
                <span>Team / Desk Name</span>
              </label>
              <input
                type="text"
                id="profileTeamNameInput"
                value={teamName}
                onChange={(e) => { setTeamName(e.target.value); setProfileSuccess(false); }}
                placeholder="e.g. Alpha Bull Traders, Matrix Desk, or Solo Desk"
                className={inputClass}
              />
              <span className="text-[10px] text-[#6B7680] mt-1.5 block">
                Shown on the trading desk and instructor leaderboard.
              </span>
            </div>

            {/* Primary Details */}
            <div>
              <h4 className="text-xs uppercase font-bold tracking-wider text-[#D4A93F] mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Primary Student Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <input
                    type="text"
                    id="primaryNameInput"
                    value={primary.name}
                    onChange={(e) => updatePrimary('name', e.target.value)}
                    placeholder="e.g. Arjun Kumar"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Department *</label>
                  <input
                    type="text"
                    id="primaryDeptInput"
                    value={primary.department}
                    onChange={(e) => updatePrimary('department', e.target.value)}
                    placeholder="e.g. MBA / Management Studies"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>College Roll Number *</label>
                  <input
                    type="text"
                    id="primaryRollInput"
                    value={primary.rollNumber}
                    onChange={(e) => updatePrimary('rollNumber', e.target.value)}
                    placeholder="e.g. 24MBA01"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Year of Study *</label>
                  <select
                    id="primaryYearSelect"
                    value={primary.yearOfStudy}
                    onChange={(e) => updatePrimary('yearOfStudy', e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">Select Year</option>
                    {YEAR_OPTIONS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Nominees / Team Members */}
            <div className="border-t border-[#1F2A33] pt-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Team Members / Nominees
                </h4>
                <button
                  type="button"
                  id="addNomineeBtn"
                  onClick={addNominee}
                  className="text-[11px] uppercase font-bold tracking-wider text-[#D4A93F] hover:brightness-110 cursor-pointer flex items-center gap-1 border border-[#D4A93F]/30 bg-[#D4A93F]/10 px-2.5 py-1"
                >
                  <Plus className="w-3 h-3" /> Add Member
                </button>
              </div>
              <p className="text-[10px] text-[#6B7680] mb-3">
                Optional: If trading as a team, enter additional team member names and roll numbers.
              </p>

              {nominees.length === 0 ? (
                <div className="text-[11px] text-[#3A4550] italic border border-dashed border-[#1F2A33] p-4 text-center">
                  Solo trader (no extra nominees registered). Click &quot;Add Member&quot; to add teammates.
                </div>
              ) : (
                <div className="space-y-3">
                  {nominees.map((nominee, idx) => (
                    <div key={idx} className="border border-[#1F2A33] bg-[#141B23] p-3.5 relative">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-[#D4A93F]">
                          Member #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeNominee(idx)}
                          title="Remove this team member"
                          className="text-[#E2564F] hover:brightness-125 cursor-pointer p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Full Name</label>
                          <input
                            type="text"
                            value={nominee.name || ''}
                            onChange={(e) => updateNominee(idx, 'name', e.target.value)}
                            placeholder="Teammate Name"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Department</label>
                          <input
                            type="text"
                            value={nominee.department || ''}
                            onChange={(e) => updateNominee(idx, 'department', e.target.value)}
                            placeholder="Teammate Dept"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Roll Number</label>
                          <input
                            type="text"
                            value={nominee.rollNumber || ''}
                            onChange={(e) => updateNominee(idx, 'rollNumber', e.target.value)}
                            placeholder="Teammate Roll No"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Year of Study</label>
                          <select
                            value={nominee.yearOfStudy || ''}
                            onChange={(e) => updateNominee(idx, 'yearOfStudy', e.target.value)}
                            className={inputClass}
                          >
                            <option value="">Select Year</option>
                            {YEAR_OPTIONS.map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {profileError && (
              <div className="bg-[#E2564F]/10 border border-[#E2564F]/30 text-[#E2564F] text-xs p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            {profileSuccess && (
              <div className="bg-[#2FBF71]/10 border border-[#2FBF71]/30 text-[#2FBF71] text-xs p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Profile and team details updated successfully!</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                id="saveProfileBtn"
                disabled={profileSaving}
                className="w-full sm:w-auto px-8 py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50 transition"
              >
                {profileSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Password Changes & Account Security (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#10161D] border border-[#1F2A33] p-6 font-mono space-y-5">
            <div className="border-b border-[#1F2A33] pb-4">
              <h3 className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6] uppercase tracking-wide flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#D4A93F]" />
                <span>Password Changes</span>
              </h3>
              <p className="text-xs text-[#6B7680] mt-1">
                Change your PaperFloor login password to keep your portfolio secure.
              </p>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              {/* Current Password */}
              <div>
                <label className={labelClass}>Current Password *</label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    id="currentPasswordInput"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPassError(null); }}
                    placeholder="Enter current password"
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
                    title={showCurrentPass ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className={labelClass}>New Password *</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    id="newPasswordInput"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPassError(null); }}
                    placeholder="Enter new password (min. 4 characters)"
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
                    title={showNewPass ? 'Hide password' : 'Show password'}
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="text-[10px] text-[#6B7680] mt-1">
                  Must be at least 4 characters long and different from current password.
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className={labelClass}>Confirm New Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    id="confirmPasswordInput"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPassError(null); }}
                    placeholder="Re-enter new password"
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6] cursor-pointer"
                    title={showConfirmPass ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {passError && (
                <div className="bg-[#E2564F]/10 border border-[#E2564F]/30 text-[#E2564F] text-xs p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{passError}</span>
                </div>
              )}

              {passSuccess && (
                <div className="bg-[#2FBF71]/10 border border-[#2FBF71]/30 text-[#2FBF71] text-xs p-3 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{passSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                id="updatePasswordBtn"
                disabled={passSaving}
                className="w-full py-3 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50 transition"
              >
                {passSaving ? 'Updating Password...' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Account Security Info Card */}
          <div className="bg-[#141B23] border border-[#1F2A33] p-5 font-mono space-y-3">
            <div className="flex items-center gap-2 text-[#D4A93F] text-xs uppercase font-bold tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Login Credentials Notice</span>
            </div>
            <p className="text-xs text-[#6B7680] leading-relaxed">
              You can log into PaperFloor from any device using your Student User ID (<span className="text-[#D4A93F] font-bold">{roll}</span>) or registered Google email together with your password.
            </p>
            <div className="text-[11px] text-[#C9D3D9] bg-[#10161D] border border-[#1F2A33] p-3 space-y-1">
              <div>• User ID: <span className="text-[#D4A93F] font-bold">{roll}</span></div>
              {email && <div>• Email: <span className="text-[#F1F4F6]">{email}</span></div>}
              <div>• Status: <span className="text-emerald-400 font-bold">Active &amp; Persistent</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
