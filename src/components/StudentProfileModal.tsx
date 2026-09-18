import React, { useState } from 'react';
import { PersonDetails, StudentProfile } from '../types';
import { User, Users, Plus, Trash2, Building2, KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { changeStudentPassword } from '../firebase';

interface StudentProfileModalProps {
  roll: string;
  initialProfile: StudentProfile | null;
  mandatory: boolean; // true = first-login, blocking, no close/cancel
  onSave: (primary: PersonDetails, nominees: Partial<PersonDetails>[], teamName?: string) => Promise<void>;
  onClose?: () => void;
}

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG / Other'];

const emptyDetails: PersonDetails = { name: '', department: '', rollNumber: '', yearOfStudy: '' };
const emptyNominee: Partial<PersonDetails> = { name: '', department: '', rollNumber: '', yearOfStudy: '' };

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  roll,
  initialProfile,
  mandatory,
  onSave,
  onClose
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'password'>('profile');
  const [teamName, setTeamName] = useState<string>(initialProfile?.teamName || '');
  const [primary, setPrimary] = useState<PersonDetails>(
    initialProfile?.primary || { ...emptyDetails, rollNumber: roll }
  );
  const [nominees, setNominees] = useState<Partial<PersonDetails>[]>(
    initialProfile?.nominees && initialProfile.nominees.length > 0
      ? initialProfile.nominees
      : []
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const updatePrimary = (field: keyof PersonDetails, value: string) => {
    setPrimary(prev => ({ ...prev, [field]: value }));
  };
  const updateNominee = (index: number, field: keyof PersonDetails, value: string) => {
    setNominees(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n));
  };
  const addNominee = () => setNominees(prev => [...prev, { ...emptyNominee }]);
  const removeNominee = (index: number) => setNominees(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!primary.name.trim() || !primary.department.trim() || !primary.rollNumber.trim() || !primary.yearOfStudy.trim()) {
      setError('Please fill in all your details - name, department, roll number, and year of study are required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Drop any nominee rows the student left completely blank
      const cleanedNominees = nominees.filter(n =>
        (n.name || '').trim() || (n.department || '').trim() || (n.rollNumber || '').trim() || (n.yearOfStudy || '').trim()
      );
      await onSave(primary, cleanedNominees, teamName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
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
      setPassError('New password and confirm password do not match.');
      return;
    }
    if (cleanCurrent === cleanNew) {
      setPassError('New password must be different from current password.');
      return;
    }

    setPassSaving(true);
    try {
      const res = await changeStudentPassword(roll, cleanCurrent, cleanNew);
      if (!res.success) {
        setPassError(res.error || 'Failed to update password.');
      } else {
        setPassSuccess('Password changed successfully! Keep it safe for future logins.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setPassSaving(false);
    }
  };

  const inputClass = "w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3 py-2 font-mono outline-none focus:border-[#D4A93F] placeholder:text-[#3A4550]";
  const labelClass = "text-[10px] uppercase tracking-wider text-[#6B7680] mb-1 block";

  return (
    <div className="fixed inset-0 bg-[#05070A]/90 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#10161D] border border-[#1F2A33] shadow-2xl font-mono">
        {/* Header */}
        <div className="p-5 border-b border-[#1F2A33] border-dashed bg-[#0D1319] flex items-start justify-between">
          <div>
            <h3 className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6] uppercase tracking-wide">
              {mandatory ? 'Complete Your Profile' : 'My Profile & Account Settings'}
            </h3>
            <p className="text-xs text-[#6B7680] mt-1">
              {mandatory
                ? 'Before you start trading, please tell us a bit about yourself.'
                : `Student User ID: ${roll}`}
            </p>
          </div>
          {!mandatory && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[#6B7680] hover:text-[#F1F4F6] text-2xl leading-none cursor-pointer"
            >
              &times;
            </button>
          )}
        </div>

        {/* Modal Sub-Tabs if not mandatory */}
        {!mandatory && (
          <div className="flex border-b border-[#1F2A33] bg-[#0A0E14] px-5">
            <button
              type="button"
              onClick={() => setActiveSubTab('profile')}
              className={`py-3 px-4 text-xs uppercase font-bold tracking-wider border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'profile'
                  ? 'border-[#D4A93F] text-[#D4A93F]'
                  : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Profile Details</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('password')}
              className={`py-3 px-4 text-xs uppercase font-bold tracking-wider border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'password'
                  ? 'border-[#D4A93F] text-[#D4A93F]'
                  : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
          </div>
        )}

        <div className="p-5 space-y-6">
          {(!mandatory && activeSubTab === 'password') ? (
            /* Change Password Sub-Tab */
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="bg-[#141B23] border border-[#1F2A33] p-3 text-xs text-[#6B7680]">
                Update your login password for User ID <span className="text-[#D4A93F] font-bold">{roll}</span>.
              </div>

              <div>
                <label className={labelClass}>Current Password *</label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPassError(null); }}
                    placeholder="Enter current password"
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6]"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>New Password *</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPassError(null); }}
                    placeholder="Enter new password (min. 4 chars)"
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6]"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>Confirm New Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPassError(null); }}
                    placeholder="Re-enter new password"
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7680] hover:text-[#F1F4F6]"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {passError && (
                <div className="bg-[#E2564F]/10 border border-[#E2564F]/30 text-[#E2564F] text-xs p-2.5">
                  {passError}
                </div>
              )}

              {passSuccess && (
                <div className="bg-[#2FBF71]/10 border border-[#2FBF71]/30 text-[#2FBF71] text-xs p-2.5 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{passSuccess}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer"
                  >
                    Close
                  </button>
                )}
                <button
                  type="submit"
                  disabled={passSaving}
                  className="flex-1 py-2.5 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50"
                >
                  {passSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          ) : (
            /* Profile Details Sub-Tab */
            <>
              {/* Team / Desk Name */}
              <div className="bg-[#141B23] border border-[#1F2A33] p-3.5">
                <label className={`${labelClass} text-[#D4A93F] font-bold flex items-center gap-1.5`}>
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Team / Desk Name</span>
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Alpha Traders or Solo Desk"
                  className={inputClass}
                />
              </div>

              {/* Primary / Student details */}
              <div>
                <h4 className="text-xs uppercase font-bold tracking-wider text-[#D4A93F] mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Your Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Full Name *</label>
                    <input
                      type="text"
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
                      value={primary.department}
                      onChange={(e) => updatePrimary('department', e.target.value)}
                      placeholder="e.g. Computer Science"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Roll Number *</label>
                    <input
                      type="text"
                      value={primary.rollNumber}
                      onChange={(e) => updatePrimary('rollNumber', e.target.value)}
                      placeholder="e.g. CS2024001"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Year of Study *</label>
                    <select
                      value={primary.yearOfStudy}
                      onChange={(e) => updatePrimary('yearOfStudy', e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select year</option>
                      {YEAR_OPTIONS.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Nominees - optional, unlimited */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-[#6B7680] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Team Members / Nominees
                  </h4>
                  <button
                    type="button"
                    onClick={addNominee}
                    className="text-[10px] uppercase font-bold tracking-wider text-[#D4A93F] hover:brightness-110 cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Nominee
                  </button>
                </div>
                <p className="text-[10px] text-[#6B7680] mb-3 italic">
                  Optional - add as many teammates as your group actually has, or none at all.
                </p>

                {nominees.length === 0 && (
                  <div className="text-[11px] text-[#3A4550] italic border border-dashed border-[#1F2A33] p-3 text-center">
                    No nominees added yet.
                  </div>
                )}

                <div className="space-y-3">
                  {nominees.map((nominee, index) => (
                    <div key={index} className="border border-[#1F2A33] p-3 relative">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-wider text-[#6B7680]">Nominee {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeNominee(index)}
                          title="Remove this nominee"
                          className="text-[#E2564F] hover:brightness-110 cursor-pointer"
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
                            {YEAR_OPTIONS.map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-[#E2564F]/10 border border-[#E2564F]/30 text-[#E2564F] text-xs p-2.5">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                {!mandatory && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    className="flex-1 py-2.5 border border-[#1F2A33] text-[#6B7680] hover:text-[#F1F4F6] text-xs uppercase font-bold tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[#D4A93F] text-[#0A0E14] font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : mandatory ? 'Save & Continue' : 'Save Changes'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
