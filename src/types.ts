export interface Stock {
  sym: string;
  name: string;
  sector: string;
  price: number;
  prevClose: number;
  ltp: number;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
  tickDirection?: 'up' | 'down' | 'same';
  fno?: boolean;
  lotSize?: number;
  sigma?: number;
  strikeStep?: number;
  expiry?: number;
  isCustom?: boolean;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface FnoUnderlying {
  sym: string;
  name: string;
  kind: 'INDEX' | 'STOCK' | 'COMMODITY';
  spot?: number;
  prevSpot?: number;
  high?: number;
  low?: number;
  tickDirection?: 'up' | 'down' | 'same';
  sigma: number;
  lotSize: number;
  strikeStep: number;
  // Multiple simultaneous expiry series (e.g. weekly + monthly), same as a real exchange.
  // Adding a new one never removes an existing one - only an explicit remove does that.
  expiries?: number[];
  isCustom?: boolean;
  isDeleted?: boolean;
  updatedAt?: number;
}

export interface Holding {
  qty: number;
  avgCost: number;
}

export interface FnoPosition {
  kind: 'FUT' | 'OPT';
  underlying: string;
  strike?: number | null;
  optType?: 'CE' | 'PE' | null;
  expiry: number;
  lotSize: number;
  side: 'long' | 'short';
  lots: number;
  avgPrice: number;
  margin: number;
}

export interface Transaction {
  time: number;
  sym: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
}

export interface FnoTransaction {
  time: number;
  kind: 'FUT' | 'OPT';
  underlying: string;
  strike?: number | null;
  optType?: 'CE' | 'PE' | null;
  expiry: number;
  side: 'buy' | 'sell';
  lots: number;
  price: number;
  spotAtEntry: number;
}

export interface Portfolio {
  roll: string;
  teamName?: string;
  studentName?: string;
  email?: string;
  cash: number;
  holdings: Record<string, Holding>;
  transactions: Transaction[];
  fno: {
    positions: Record<string, FnoPosition>;
    transactions: FnoTransaction[];
  };
  lastActive?: number;
  isFrozen?: boolean;
  isDeleted?: boolean;
  frozenAt?: number;
  deletedAt?: number;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ==================== STUDENT PROFILE ====================
// Collected on first login (and again after a teacher resets the account),
// and editable any time afterward from the student's own header.

export interface PersonDetails {
  name: string;
  department: string;
  rollNumber: string;
  yearOfStudy: string;
}

export interface StudentProfile {
  roll: string;
  teamName?: string;
  primary: PersonDetails;
  // Additional team members / nominees - same fields as primary, every one of
  // them optional and there's no cap at 2: a team can list as many nominees
  // as they actually have. Leave the array empty for a solo registration.
  nominees?: Partial<PersonDetails>[];
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  // Google + email-link registration
  googleUid?: string;
  email?: string;
  password?: string;
  mustChangePassword?: boolean;
  verified?: boolean;
  verifiedAt?: number;
}

// ==================== NAVIGATION ====================
// Shared tab-key type so the Navbar's drawer menu, App.tsx's routing state, and
// TeacherDashboard's own tab state all agree on the same set of destinations.
export type StudentTabKey = 'market' | 'portfolio' | 'fno' | 'chart' | 'orders' | 'profile';
export type TeacherTabKey = 'students' | 'companies' | 'expiry' | 'registrations';
export type AppTabKey = StudentTabKey | TeacherTabKey;

