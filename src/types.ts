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
  expiry?: number;
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
  side: 'buy' | 'sell';
  lots: number;
  price: number;
  spotAtEntry: number;
}

export interface Portfolio {
  roll: string;
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
}
