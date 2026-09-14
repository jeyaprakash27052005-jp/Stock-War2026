import { Stock } from './types';

// ============================================================================
// Simulated fundamental analysis data.
//
// This is a paper-trading game with fictional/teacher-added companies, so
// there is no real financial-statement data to show. Instead we generate
// plausible, INTERNALLY CONSISTENT fundamentals per stock (revenue, profit,
// EPS, ROE, valuation ratios) seeded deterministically off the stock's own
// symbol - so the same stock always shows the same "history" every time a
// student looks it up, rather than re-randomizing on every render/reload.
// ============================================================================

export interface YearlyFundamental {
  year: string;
  revenue: number;    // Rs Cr
  netProfit: number;  // Rs Cr
  netMargin: number;  // %
  eps: number;        // Rs per share
  roe: number;        // %
}

export interface CompanyFundamentals {
  marketCap: number;         // Rs Cr
  peRatio: number;           // TTM, based on current price
  pbRatio: number;           // TTM
  epsTTM: number;            // Rs per share
  bookValue: number;         // Rs per share
  debtToEquity: number;
  dividendYield: number;     // %
  faceValue: number;         // Rs
  sharesOutstandingCr: number;
  promoterHolding: number;   // %
  revenueCagr: number;       // % over the shown period
  profitCagr: number;        // % over the shown period
  yearly: YearlyFundamental[]; // oldest -> newest (5 financial years)
}

interface SectorProfile {
  peRange: [number, number];
  marginRange: [number, number];
  deRange: [number, number];
  growthRange: [number, number]; // typical YoY revenue growth
}

const SECTOR_PROFILES: Record<string, SectorProfile> = {
  'IT': { peRange: [20, 32], marginRange: [0.16, 0.25], deRange: [0.0, 0.15], growthRange: [0.06, 0.18] },
  'Banking': { peRange: [9, 17], marginRange: [0.18, 0.30], deRange: [0.6, 1.4], growthRange: [0.08, 0.20] },
  'NBFC & Financial Services': { peRange: [14, 24], marginRange: [0.14, 0.24], deRange: [0.7, 1.7], growthRange: [0.10, 0.24] },
  'FMCG': { peRange: [35, 58], marginRange: [0.10, 0.18], deRange: [0.0, 0.20], growthRange: [0.05, 0.13] },
  'Auto & Ancillaries': { peRange: [14, 26], marginRange: [0.05, 0.12], deRange: [0.2, 0.6], growthRange: [0.02, 0.16] },
  'Pharma & Healthcare': { peRange: [22, 34], marginRange: [0.12, 0.21], deRange: [0.05, 0.30], growthRange: [0.06, 0.15] },
  'Energy & Power': { peRange: [10, 20], marginRange: [0.06, 0.13], deRange: [0.4, 1.0], growthRange: [0.03, 0.12] },
  'Metals & Mining': { peRange: [7, 15], marginRange: [0.08, 0.17], deRange: [0.3, 0.9], growthRange: [-0.05, 0.20] },
  'Cement': { peRange: [16, 26], marginRange: [0.10, 0.18], deRange: [0.2, 0.6], growthRange: [0.03, 0.14] },
  'Capital Goods & Infra': { peRange: [18, 30], marginRange: [0.06, 0.12], deRange: [0.4, 1.0], growthRange: [0.05, 0.18] },
  'Realty': { peRange: [20, 38], marginRange: [0.10, 0.20], deRange: [0.5, 1.3], growthRange: [0.0, 0.22] },
  'Telecom & Media': { peRange: [15, 40], marginRange: [0.04, 0.14], deRange: [0.8, 1.8], growthRange: [0.02, 0.14] },
  'Chemicals & Consumer': { peRange: [18, 30], marginRange: [0.09, 0.17], deRange: [0.1, 0.5], growthRange: [0.04, 0.16] },
  DEFAULT: { peRange: [16, 26], marginRange: [0.08, 0.18], deRange: [0.1, 0.6], growthRange: [0.02, 0.15] }
};

// Small deterministic PRNG (mulberry32) seeded from a string, so results are
// stable across reloads for the same symbol but differ between symbols.
function makeSeededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return function next() {
    state = Math.imul(state ^ (state >>> 16), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function randBetween(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

const FINANCIAL_YEARS = ['FY2021-22', 'FY2022-23', 'FY2023-24', 'FY2024-25', 'FY2025-26'];

export function getCompanyFundamentals(stock: Stock): CompanyFundamentals {
  const rand = makeSeededRandom(stock.sym);
  const profile = SECTOR_PROFILES[stock.sector] || SECTOR_PROFILES.DEFAULT;

  // Shares outstanding (Cr) - deterministic, roughly scaled so market cap feels sane
  const sharesOutstandingCr = Number(randBetween(rand, 8, 620).toFixed(2));
  const price = stock.ltp || stock.price;
  const marketCap = Number((price * sharesOutstandingCr).toFixed(0));

  const peRatio = Number(randBetween(rand, profile.peRange[0], profile.peRange[1]).toFixed(1));
  const epsTTM = Number((price / peRatio).toFixed(2));
  const netProfitTTM = Number((epsTTM * sharesOutstandingCr).toFixed(0));

  const netMarginTTM = randBetween(rand, profile.marginRange[0], profile.marginRange[1]);
  const revenueTTM = Number((netProfitTTM / netMarginTTM).toFixed(0));

  const bookValue = Number(randBetween(rand, price * 0.18, price * 0.65).toFixed(2));
  const equity = Number((bookValue * sharesOutstandingCr).toFixed(0));
  const roeTTM = equity > 0 ? Number(((netProfitTTM / equity) * 100).toFixed(1)) : 0;
  const pbRatio = bookValue > 0 ? Number((price / bookValue).toFixed(1)) : 0;

  const debtToEquity = Number(randBetween(rand, profile.deRange[0], profile.deRange[1]).toFixed(2));
  const dividendYield = Number(randBetween(rand, 0, 3.2).toFixed(2));
  const faceValue = [1, 2, 5, 10][Math.floor(rand() * 4)];
  const promoterHolding = Number(randBetween(rand, 32, 74).toFixed(1));

  // Walk revenue/profit backward from TTM to build a 5-year history with
  // plausible (mostly positive, occasionally negative) YoY growth.
  const revByYear: number[] = new Array(FINANCIAL_YEARS.length);
  const profitByYear: number[] = new Array(FINANCIAL_YEARS.length);
  revByYear[FINANCIAL_YEARS.length - 1] = revenueTTM;
  profitByYear[FINANCIAL_YEARS.length - 1] = netProfitTTM;

  for (let i = FINANCIAL_YEARS.length - 2; i >= 0; i--) {
    const growth = randBetween(rand, profile.growthRange[0], profile.growthRange[1]);
    // Occasional rough year (recession/one-off), ~15% chance per step
    const shock = rand() < 0.15 ? randBetween(rand, -0.18, -0.02) : 0;
    const effectiveGrowth = growth + shock;
    revByYear[i] = revByYear[i + 1] / (1 + effectiveGrowth);
    const marginDrift = randBetween(rand, -0.02, 0.02);
    const impliedMargin = Math.min(0.42, Math.max(0.02, netMarginTTM + marginDrift * (FINANCIAL_YEARS.length - 1 - i)));
    profitByYear[i] = revByYear[i] * impliedMargin;
  }

  const yearly: YearlyFundamental[] = [];
  let roeWalk = Math.max(2, roeTTM - randBetween(rand, 2, 9));
  for (let i = 0; i < FINANCIAL_YEARS.length; i++) {
    const revenue = Number(revByYear[i].toFixed(0));
    const netProfit = Number(profitByYear[i].toFixed(0));
    const netMargin = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;
    const eps = sharesOutstandingCr > 0 ? Number((netProfit / sharesOutstandingCr).toFixed(2)) : 0;
    let roe: number;
    if (i === FINANCIAL_YEARS.length - 1) {
      roe = roeTTM;
    } else {
      roeWalk = Math.max(1, roeWalk + randBetween(rand, -1.5, 2.5));
      roe = Number(roeWalk.toFixed(1));
    }
    yearly.push({ year: FINANCIAL_YEARS[i], revenue, netProfit, netMargin, eps, roe });
  }

  const firstRev = yearly[0].revenue;
  const lastRev = yearly[yearly.length - 1].revenue;
  const firstProfit = Math.max(1, yearly[0].netProfit);
  const lastProfit = yearly[yearly.length - 1].netProfit;
  const periods = yearly.length - 1;
  const revenueCagr = firstRev > 0 ? Number((((lastRev / firstRev) ** (1 / periods) - 1) * 100).toFixed(1)) : 0;
  const profitCagr = firstProfit > 0 ? Number((((Math.max(1, lastProfit) / firstProfit) ** (1 / periods) - 1) * 100).toFixed(1)) : 0;

  return {
    marketCap,
    peRatio,
    pbRatio,
    epsTTM,
    bookValue,
    debtToEquity,
    dividendYield,
    faceValue,
    sharesOutstandingCr,
    promoterHolding,
    revenueCagr,
    profitCagr,
    yearly
  };
}
