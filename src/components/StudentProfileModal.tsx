import React, { useState } from 'react';
import { PersonDetails, StudentProfile } from '../types';
import { User, Users, Plus, Trash2, Building2 } from 'lucide-react';

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

  const inputClass = "w-full bg-[#10161D] border border-[#1F2A33] text-[#F1F4F6] text-sm px-3 py-2 font-mono outline-none focus:border-[#D4A93F] placeholder:text-[#3A4550]";
  const labelClass = "text-[10px] uppercase tracking-wider text-[#6B7680] mb-1 block";

  return (
    <div className="fixed inset-0 bg-[#05070A]/90 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#10161D] border border-[#1F2A33] shadow-2xl font-mono">
        {/* Header */}
        <div className="p-5 border-b border-[#1F2A33] border-dashed bg-[#0D1319] flex items-start justify-between">
          <div>
            <h3 className="font-['Big_Shoulders_Display',sans-serif] text-2xl font-bold text-[#F1F4F6] uppercase tracking-wide">
              {mandatory ? 'Complete Your Profile' : 'Edit Profile'}
            </h3>
            <p className="text-xs text-[#6B7680] mt-1">
              {mandatory
                ? 'Before you start trading, please tell us a bit about yourself.'
                : 'Update your details any time.'}
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

        <div className="p-5 space-y-6">
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
        </div>
      </div>
    </div>
  );
};
