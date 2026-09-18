import { Stock, FnoUnderlying } from './types';

function tag(sector: string, arr: [string, string, number][]): Stock[] {
  return arr.map(([sym, name, price]) => {
    // Generate realistic, consistent trading day initial data
    let seed = 0;
    for (let i = 0; i < sym.length; i++) seed = (seed * 37 + sym.charCodeAt(i)) % 10000;
    // Dispersion between -2.2% and +2.4%
    const factor = ((seed % 100) - 46) / 2100;
    const prevClose = Number((price / (1 + factor)).toFixed(2));
    const open = Number((prevClose * (1 + factor * 0.35)).toFixed(2));
    const range = price * (0.012 + ((seed % 50) / 5000));
    const high = Number((Math.max(price, open, prevClose) + range * 0.75).toFixed(2));
    const low = Number((Math.max(0.5, Math.min(price, open, prevClose) - range * 0.75)).toFixed(2));
    const volume = 12000 + (seed % 65000);

    return {
      sym,
      name,
      sector,
      price,
      prevClose,
      open,
      high,
      low,
      volume,
      ltp: price,
      tickDirection: factor >= 0 ? 'up' : 'down'
    };
  });
}

const IT_STOCKS: [string, string, number][] = [
  ['TCS', 'Tata Consultancy Services', 3850],
  ['INFY', 'Infosys Ltd', 1620],
  ['WIPRO', 'Wipro Ltd', 480],
  ['HCLTECH', 'HCL Technologies', 1750],
  ['TECHM', 'Tech Mahindra', 1680],
  ['LTIM', 'LTIMindtree', 6200],
  ['MPHASIS', 'Mphasis Ltd', 2850],
  ['PERSISTENT', 'Persistent Systems', 5400],
  ['COFORGE', 'Coforge Ltd', 8200],
  ['LTTS', 'L&T Technology Services', 5600],
  ['OFSS', 'Oracle Financial Services', 9800],
  ['KPITTECH', 'KPIT Technologies', 1450],
  ['ZENSARTECH', 'Zensar Technologies', 780],
  ['INTELLECT', 'Intellect Design Arena', 950],
  ['NEWGEN', 'Newgen Software', 1150],
  ['ROUTE', 'Route Mobile', 1600],
  ['HAPPSTMNDS', 'Happiest Minds Tech', 750],
  ['RATEGAIN', 'RateGain Travel Tech', 620]
];

const BANKING_STOCKS: [string, string, number][] = [
  ['HDFCBANK', 'HDFC Bank', 1680],
  ['ICICIBANK', 'ICICI Bank', 1150],
  ['SBIN', 'State Bank of India', 810],
  ['KOTAKBANK', 'Kotak Mahindra Bank', 1780],
  ['AXISBANK', 'Axis Bank', 1150],
  ['INDUSINDBK', 'IndusInd Bank', 1450],
  ['BANKBARODA', 'Bank of Baroda', 245],
  ['PNB', 'Punjab National Bank', 105],
  ['CANBK', 'Canara Bank', 105],
  ['IDFCFIRSTB', 'IDFC First Bank', 78],
  ['FEDERALBNK', 'Federal Bank', 195],
  ['AUBANK', 'AU Small Finance Bank', 650],
  ['BANDHANBNK', 'Bandhan Bank', 195],
  ['RBLBANK', 'RBL Bank', 220],
  ['YESBANK', 'Yes Bank', 22],
  ['IOB', 'Indian Overseas Bank', 55],
  ['UNIONBANK', 'Union Bank of India', 130],
  ['INDIANB', 'Indian Bank', 550],
  ['UCOBANK', 'UCO Bank', 48],
  ['CENTRALBK', 'Central Bank of India', 55],
  ['J&KBANK', 'J&K Bank', 110],
  ['KARURVYSYA', 'Karur Vysya Bank', 220],
  ['CUB', 'City Union Bank', 165],
  ['DCBBANK', 'DCB Bank', 140]
];

const NBFC_STOCKS: [string, string, number][] = [
  ['BAJFINANCE', 'Bajaj Finance', 7200],
  ['BAJAJFINSV', 'Bajaj Finserv', 1750],
  ['HDFCLIFE', 'HDFC Life Insurance', 640],
  ['SBILIFE', 'SBI Life Insurance', 1550],
  ['ICICIPRULI', 'ICICI Prudential Life', 700],
  ['ICICIGI', 'ICICI Lombard GI', 1950],
  ['SBICARD', 'SBI Cards', 780],
  ['MUTHOOTFIN', 'Muthoot Finance', 2100],
  ['CHOLAFIN', 'Cholamandalam Investment', 1350],
  ['LICHSGFIN', 'LIC Housing Finance', 620],
  ['PFC', 'Power Finance Corp', 480],
  ['RECLTD', 'REC Ltd', 520],
  ['IRFC', 'Indian Railway Finance Corp', 165],
  ['SHRIRAMFIN', 'Shriram Finance', 3100],
  ['MANAPPURAM', 'Manappuram Finance', 190],
  ['PNBHOUSING', 'PNB Housing Finance', 950],
  ['CDSL', 'Central Depository Services', 1500],
  ['BSE', 'BSE Ltd', 4800],
  ['MCX', 'Multi Commodity Exchange', 6200],
  ['IEX', 'Indian Energy Exchange', 175]
];

const FMCG_STOCKS: [string, string, number][] = [
  ['HUL', 'Hindustan Unilever', 2450],
  ['ITC', 'ITC Ltd', 460],
  ['NESTLEIND', 'Nestle India', 2380],
  ['BRITANNIA', 'Britannia Industries', 5600],
  ['DABUR', 'Dabur India', 550],
  ['GODREJCP', 'Godrej Consumer', 1250],
  ['MARICO', 'Marico Ltd', 650],
  ['COLPAL', 'Colgate-Palmolive India', 2850],
  ['TATACONSUM', 'Tata Consumer Products', 1080],
  ['VBL', 'Varun Beverages', 550],
  ['UBL', 'United Breweries', 2100],
  ['MCDOWELL-N', 'United Spirits', 1700],
  ['EMAMILTD', 'Emami Ltd', 780],
  ['JYOTHYLAB', 'Jyothy Labs', 420],
  ['GILLETTE', 'Gillette India', 9200],
  ['PGHH', 'Procter & Gamble Hygiene', 15500],
  ['BAJAJCON', 'Bajaj Consumer Care', 260],
  ['RADICO', 'Radico Khaitan', 1850]
];

const AUTO_STOCKS: [string, string, number][] = [
  ['MARUTI', 'Maruti Suzuki', 11200],
  ['TATAMOTORS', 'Tata Motors', 920],
  ['M&M', 'Mahindra & Mahindra', 2650],
  ['BAJAJ-AUTO', 'Bajaj Auto', 9200],
  ['EICHERMOT', 'Eicher Motors', 4800],
  ['HEROMOTOCO', 'Hero MotoCorp', 4700],
  ['TVSMOTOR', 'TVS Motor Company', 2600],
  ['ASHOKLEY', 'Ashok Leyland', 220],
  ['ESCORTS', 'Escorts Kubota', 3400],
  ['FORCEMOT', 'Force Motors', 8500],
  ['MRF', 'MRF Ltd', 128000],
  ['APOLLOTYRE', 'Apollo Tyres', 480],
  ['CEATLTD', 'CEAT Ltd', 3100],
  ['BALKRISIND', 'Balkrishna Industries', 2900],
  ['BOSCHLTD', 'Bosch Ltd', 34000],
  ['MOTHERSON', 'Samvardhana Motherson', 145],
  ['BHARATFORG', 'Bharat Forge', 1250],
  ['EXIDEIND', 'Exide Industries', 450],
  ['AMARAJABAT', 'Amara Raja Energy', 950],
  ['SUNDRMFAST', 'Sundram Fasteners', 1050],
  ['SONACOMS', 'Sona BLW Precision', 620],
  ['UNOMINDA', 'UNO Minda', 950],
  ['SCHAEFFLER', 'Schaeffler India', 3900],
  ['TIINDIA', 'Tube Investments', 3500]
];

const PHARMA_STOCKS: [string, string, number][] = [
  ['SUNPHARMA', 'Sun Pharma', 1780],
  ['DRREDDY', "Dr. Reddy's Labs", 6200],
  ['CIPLA', 'Cipla Ltd', 1490],
  ['DIVISLAB', "Divi's Laboratories", 4200],
  ['LUPIN', 'Lupin Ltd', 2150],
  ['AUROPHARMA', 'Aurobindo Pharma', 1350],
  ['TORNTPHARM', 'Torrent Pharmaceuticals', 3200],
  ['ALKEM', 'Alkem Laboratories', 5100],
  ['ZYDUSLIFE', 'Zydus Lifesciences', 1050],
  ['MANKIND', 'Mankind Pharma', 2500],
  ['ABBOTINDIA', 'Abbott India', 29000],
  ['PFIZER', 'Pfizer Ltd', 5200],
  ['GLAXO', 'GSK Pharma India', 2900],
  ['IPCALAB', 'IPCA Laboratories', 1450],
  ['BIOCON', 'Biocon Ltd', 380],
  ['LAURUSLABS', 'Laurus Labs', 620],
  ['GLENMARK', 'Glenmark Pharmaceuticals', 1450],
  ['AJANTPHARM', 'Ajanta Pharma', 3100],
  ['NATCOPHARM', 'Natco Pharma', 1150],
  ['GRANULES', 'Granules India', 620],
  ['SANOFI', 'Sanofi India', 8200],
  ['JBCHEPHARM', 'JB Chemicals', 1900]
];

const ENERGY_STOCKS: [string, string, number][] = [
  ['RELIANCE', 'Reliance Industries', 2890],
  ['ONGC', 'Oil & Natural Gas Corp', 260],
  ['NTPC', 'NTPC Ltd', 380],
  ['POWERGRID', 'Power Grid Corp', 340],
  ['COALINDIA', 'Coal India', 460],
  ['BPCL', 'Bharat Petroleum', 340],
  ['IOC', 'Indian Oil Corp', 175],
  ['HINDPETRO', 'Hindustan Petroleum', 420],
  ['GAIL', 'GAIL India', 220],
  ['OIL', 'Oil India', 480],
  ['PETRONET', 'Petronet LNG', 350],
  ['ADANIGREEN', 'Adani Green Energy', 1150],
  ['ADANIPOWER', 'Adani Power', 620],
  ['TATAPOWER', 'Tata Power', 460],
  ['NHPC', 'NHPC Ltd', 105],
  ['SJVN', 'SJVN Ltd', 130],
  ['TORNTPOWER', 'Torrent Power', 1650],
  ['CESC', 'CESC Ltd', 200],
  ['JSWENERGY', 'JSW Energy', 720],
  ['ADANIENSOL', 'Adani Energy Solutions', 950]
];

const METALS_STOCKS: [string, string, number][] = [
  ['TATASTEEL', 'Tata Steel', 165],
  ['JSWSTEEL', 'JSW Steel', 1050],
  ['HINDALCO', 'Hindalco Industries', 720],
  ['VEDL', 'Vedanta Ltd', 480],
  ['JINDALSTEL', 'Jindal Steel & Power', 980],
  ['SAIL', 'Steel Authority of India', 145],
  ['NMDC', 'NMDC Ltd', 250],
  ['NATIONALUM', 'National Aluminium', 220],
  ['HINDZINC', 'Hindustan Zinc', 620],
  ['RATNAMANI', 'Ratnamani Metals', 3500],
  ['APLAPOLLO', 'APL Apollo Tubes', 1650],
  ['JSL', 'Jindal Stainless', 720],
  ['WELCORP', 'Welspun Corp', 720],
  ['MOIL', 'MOIL Ltd', 420],
  ['HINDCOPPER', 'Hindustan Copper', 380],
  ['LLOYDSME', 'Lloyds Metals & Energy', 1050]
];

const CEMENT_STOCKS: [string, string, number][] = [
  ['ULTRACEMCO', 'UltraTech Cement', 11500],
  ['SHREECEM', 'Shree Cement', 27500],
  ['AMBUJACEM', 'Ambuja Cements', 620],
  ['ACC', 'ACC Ltd', 2200],
  ['DALBHARAT', 'Dalmia Bharat', 2050],
  ['JKCEMENT', 'JK Cement', 4800],
  ['RAMCOCEM', 'The Ramco Cements', 1050],
  ['HEIDELBERG', 'HeidelbergCement India', 220],
  ['INDIACEM', 'India Cements', 320],
  ['JKLAKSHMI', 'JK Lakshmi Cement', 850]
];

const CAPGOODS_STOCKS: [string, string, number][] = [
  ['LT', 'Larsen & Toubro', 3650],
  ['SIEMENS', 'Siemens Ltd', 6800],
  ['ABB', 'ABB India', 7200],
  ['BHEL', 'Bharat Heavy Electricals', 260],
  ['CUMMINSIND', 'Cummins India', 3600],
  ['THERMAX', 'Thermax Ltd', 5200],
  ['HAVELLS', 'Havells India', 1750],
  ['POLYCAB', 'Polycab India', 6800],
  ['KEI', 'KEI Industries', 4200],
  ['CGPOWER', 'CG Power & Industrial', 780],
  ['SUZLON', 'Suzlon Energy', 78],
  ['KALPATPOWR', 'Kalpataru Projects', 1450],
  ['KEC', 'KEC International', 950],
  ['GRINDWELL', 'Grindwell Norton', 1650],
  ['ELGIEQUIP', 'Elgi Equipments', 650],
  ['TIMKEN', 'Timken India', 3600]
];

const REALTY_STOCKS: [string, string, number][] = [
  ['DLF', 'DLF Ltd', 850],
  ['GODREJPROP', 'Godrej Properties', 2650],
  ['OBEROIRLTY', 'Oberoi Realty', 1950],
  ['PRESTIGE', 'Prestige Estates', 1750],
  ['PHOENIXLTD', 'Phoenix Mills', 1850],
  ['BRIGADE', 'Brigade Enterprises', 1250],
  ['SOBHA', 'Sobha Ltd', 1850],
  ['SUNTECK', 'Sunteck Realty', 620],
  ['MAHLIFE', 'Mahindra Lifespace', 480],
  ['LODHA', 'Macrotech Developers', 1450]
];

const TELECOM_MEDIA: [string, string, number][] = [
  ['BHARTIARTL', 'Bharti Airtel', 1590],
  ['IDEA', 'Vodafone Idea', 12],
  ['INDUSTOWER', 'Indus Towers', 380],
  ['TATACOMM', 'Tata Communications', 1850],
  ['RAILTEL', 'RailTel Corp', 420],
  ['ZEEL', 'Zee Entertainment', 145],
  ['SUNTV', 'Sun TV Network', 620],
  ['PVRINOX', 'PVR Inox', 1450]
];

const CHEMICALS_CONSUMER: [string, string, number][] = [
  ['PIDILITIND', 'Pidilite Industries', 3100],
  ['SRF', 'SRF Ltd', 2650],
  ['AARTIIND', 'Aarti Industries', 720],
  ['DEEPAKNTR', 'Deepak Nitrite', 2450],
  ['ATUL', 'Atul Ltd', 8200],
  ['NAVINFLUOR', 'Navin Fluorine', 4800],
  ['TITAN', 'Titan Company', 3650],
  ['DIXON', 'Dixon Technologies', 15000],
  ['DMART', 'Avenue Supermarts', 4200],
  ['TRENT', 'Trent Ltd', 6800],
  ['PAGEIND', 'Page Industries', 42000],
  ['INDIGO', 'InterGlobe Aviation', 4200],
  ['ASIANPAINT', 'Asian Paints', 2950],
  ['HAL', 'Hindustan Aeronautics', 4800],
  ['BEL', 'Bharat Electronics', 320],
  ['ZOMATO', 'Eternal (Zomato)', 280],
  ['ADANIENT', 'Adani Enterprises', 2950]
];

export const INITIAL_STOCKS: Stock[] = [
  ...tag('IT', IT_STOCKS),
  ...tag('Banking', BANKING_STOCKS),
  ...tag('NBFC & Financial Services', NBFC_STOCKS),
  ...tag('FMCG', FMCG_STOCKS),
  ...tag('Auto & Ancillaries', AUTO_STOCKS),
  ...tag('Pharma & Healthcare', PHARMA_STOCKS),
  ...tag('Energy & Power', ENERGY_STOCKS),
  ...tag('Metals & Mining', METALS_STOCKS),
  ...tag('Cement', CEMENT_STOCKS),
  ...tag('Capital Goods & Infra', CAPGOODS_STOCKS),
  ...tag('Realty', REALTY_STOCKS),
  ...tag('Telecom & Media', TELECOM_MEDIA),
  ...tag('Chemicals & Consumer', CHEMICALS_CONSUMER)
];

export const FNO_UNDERLYINGS_BASE: FnoUnderlying[] = [
  { sym: 'NIFTY', name: 'Nifty 50 Index', kind: 'INDEX', spot: 24500, prevSpot: 24420, high: 24580, low: 24390, sigma: 0.13, lotSize: 75, strikeStep: 100 },
  { sym: 'BANKNIFTY', name: 'Bank Nifty Index', kind: 'INDEX', spot: 51500, prevSpot: 51320, high: 51680, low: 51210, sigma: 0.15, lotSize: 30, strikeStep: 100 },
  { sym: 'FINNIFTY', name: 'Nifty Financial Services', kind: 'INDEX', spot: 23500, prevSpot: 23410, high: 23590, low: 23370, sigma: 0.14, lotSize: 65, strikeStep: 50 },

  { sym: 'RELIANCE', name: 'Reliance Industries', kind: 'STOCK', spot: 2890, prevSpot: 2872, high: 2915, low: 2862, sigma: 0.24, lotSize: 250, strikeStep: 20 },
  { sym: 'TCS', name: 'Tata Consultancy Services', kind: 'STOCK', spot: 3850, prevSpot: 3835, high: 3880, low: 3820, sigma: 0.20, lotSize: 150, strikeStep: 50 },
  { sym: 'HDFCBANK', name: 'HDFC Bank', kind: 'STOCK', spot: 1680, prevSpot: 1672, high: 1695, low: 1665, sigma: 0.19, lotSize: 550, strikeStep: 20 },
  { sym: 'INFY', name: 'Infosys Ltd', kind: 'STOCK', spot: 1620, prevSpot: 1608, high: 1638, low: 1602, sigma: 0.22, lotSize: 400, strikeStep: 20 },
  { sym: 'SBIN', name: 'State Bank of India', kind: 'STOCK', spot: 810, prevSpot: 804, high: 818, low: 801, sigma: 0.25, lotSize: 1500, strikeStep: 10 },
  { sym: 'ICICIBANK', name: 'ICICI Bank', kind: 'STOCK', spot: 1150, prevSpot: 1142, high: 1162, low: 1138, sigma: 0.22, lotSize: 700, strikeStep: 20 },
  { sym: 'AXISBANK', name: 'Axis Bank', kind: 'STOCK', spot: 1150, prevSpot: 1145, high: 1160, low: 1140, sigma: 0.24, lotSize: 625, strikeStep: 20 },
  { sym: 'TATAMOTORS', name: 'Tata Motors', kind: 'STOCK', spot: 920, prevSpot: 912, high: 932, low: 908, sigma: 0.30, lotSize: 1400, strikeStep: 20 },
  { sym: 'MARUTI', name: 'Maruti Suzuki', kind: 'STOCK', spot: 11200, prevSpot: 11120, high: 11310, low: 11080, sigma: 0.22, lotSize: 50, strikeStep: 200 },
  { sym: 'BAJFINANCE', name: 'Bajaj Finance', kind: 'STOCK', spot: 7200, prevSpot: 7150, high: 7280, low: 7120, sigma: 0.28, lotSize: 125, strikeStep: 100 },
  { sym: 'ITC', name: 'ITC Ltd', kind: 'STOCK', spot: 460, prevSpot: 457, high: 465, low: 455, sigma: 0.18, lotSize: 3200, strikeStep: 10 },
  { sym: 'SUNPHARMA', name: 'Sun Pharma', kind: 'STOCK', spot: 1780, prevSpot: 1765, high: 1798, low: 1758, sigma: 0.22, lotSize: 700, strikeStep: 20 },
  { sym: 'HUL', name: 'Hindustan Unilever', kind: 'STOCK', spot: 2450, prevSpot: 2435, high: 2472, low: 2428, sigma: 0.16, lotSize: 300, strikeStep: 50 },
  { sym: 'LT', name: 'Larsen & Toubro', kind: 'STOCK', spot: 3600, prevSpot: 3575, high: 3635, low: 3560, sigma: 0.22, lotSize: 150, strikeStep: 50 },
  { sym: 'TITAN', name: 'Titan Company', kind: 'STOCK', spot: 3650, prevSpot: 3625, high: 3685, low: 3610, sigma: 0.21, lotSize: 175, strikeStep: 50 },

  { sym: 'GOLD', name: 'Gold (per 10g)', kind: 'COMMODITY', spot: 78000, prevSpot: 77600, high: 78350, low: 77500, sigma: 0.14, lotSize: 10, strikeStep: 500 },
  { sym: 'SILVER', name: 'Silver (per kg)', kind: 'COMMODITY', spot: 92000, prevSpot: 91400, high: 92600, low: 91200, sigma: 0.20, lotSize: 5, strikeStep: 1000 },
  { sym: 'CRUDEOIL', name: 'Crude Oil (per bbl)', kind: 'COMMODITY', spot: 6200, prevSpot: 6160, high: 6265, low: 6140, sigma: 0.30, lotSize: 10, strikeStep: 100 },
  { sym: 'NATURALGAS', name: 'Natural Gas (per mmBtu)', kind: 'COMMODITY', spot: 245, prevSpot: 242, high: 249, low: 241, sigma: 0.35, lotSize: 250, strikeStep: 5 },
  { sym: 'COPPER', name: 'Copper (per kg)', kind: 'COMMODITY', spot: 820, prevSpot: 815, high: 827, low: 812, sigma: 0.22, lotSize: 250, strikeStep: 10 },
  { sym: 'ZINC', name: 'Zinc (per kg)', kind: 'COMMODITY', spot: 265, prevSpot: 263, high: 268, low: 261, sigma: 0.24, lotSize: 500, strikeStep: 5 },
  { sym: 'ALUMINIUM', name: 'Aluminium (per kg)', kind: 'COMMODITY', spot: 245, prevSpot: 243, high: 248, low: 241, sigma: 0.20, lotSize: 500, strikeStep: 5 }
];

export const EXPIRY_DATE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
export const DEFAULT_EXPIRY_MS = EXPIRY_DATE.getTime();
export const RISK_FREE = 0.065;
export const STARTING_CASH = 1000000;

// Pass a specific instrument's expiry (epoch ms) to price it against its own
// expiry date. Falls back to the global default expiry when omitted, so
// existing call sites keep working unchanged.
export function daysToExpiry(expiryMs?: number): number {
  const target = typeof expiryMs === 'number' ? expiryMs : DEFAULT_EXPIRY_MS;
  return Math.max(1, Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function formatExpiryDate(expiryMs?: number): string {
  const target = typeof expiryMs === 'number' ? expiryMs : DEFAULT_EXPIRY_MS;
  return new Date(target).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Converts an expiry timestamp into a yyyy-mm-dd string for <input type="date">
export function expiryToDateInputValue(expiryMs?: number): string {
  const target = typeof expiryMs === 'number' ? expiryMs : DEFAULT_EXPIRY_MS;
  const d = new Date(target);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Given an instrument's list of simultaneous expiry series (weekly + monthly, etc.),
// returns the soonest one that hasn't passed yet - or the earliest of all of them if
// every one has already passed - or the global default if the list is empty/missing.
export function getNearestExpiry(expiries?: number[]): number {
  if (!expiries || expiries.length === 0) return DEFAULT_EXPIRY_MS;
  const now = Date.now();
  const future = expiries.filter(e => e >= now).sort((a, b) => a - b);
  if (future.length > 0) return future[0];
  return [...expiries].sort((a, b) => a - b)[0];
}

// Sorted ascending, de-duplicated
export function sortExpiries(expiries?: number[]): number[] {
  if (!expiries || expiries.length === 0) return [];
  return Array.from(new Set(expiries)).sort((a, b) => a - b);
}

export function futPrice(spot: number, expiryMs?: number): number {
  return Number((spot * (1 + (RISK_FREE * daysToExpiry(expiryMs)) / 365)).toFixed(2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function normCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

export function bsPrice(spot: number, strike: number, tYears: number, r: number, sigma: number, type: 'CE' | 'PE'): number {
  if (tYears <= 0) tYears = 0.0007;
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * tYears) / (sigma * Math.sqrt(tYears));
  const d2 = d1 - sigma * Math.sqrt(tYears);
  const val = type === 'CE'
    ? spot * normCDF(d1) - strike * Math.exp(-r * tYears) * normCDF(d2)
    : strike * Math.exp(-r * tYears) * normCDF(-d2) - spot * normCDF(-d1);
  return Math.max(0.05, Number(val.toFixed(2)));
}

export function inr(n: number): string {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
