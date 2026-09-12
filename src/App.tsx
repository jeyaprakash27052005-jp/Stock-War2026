import { useState, useEffect, useCallback, useMemo } from 'react';
import { Stock, FnoUnderlying, Portfolio, Holding, FnoPosition } from './types';
import { INITIAL_STOCKS, FNO_UNDERLYINGS_BASE, inr, pct, STARTING_CASH, futPrice, bsPrice, daysToExpiry, RISK_FREE } from './marketData';
import { 
  loadPortfolioFromFirestore, 
  savePortfolioToFirestore, 
  subscribeToStudentPortfolio,
  subscribeToAllStudents,
  resetStudentPortfolioInFirestore,
  freezeStudentPortfolioInFirestore,
  deleteStudentPortfolioInFirestore,
  purgeStudentPortfolioFromFirestore,
  restoreStudentPortfolioInFirestore,
  subscribeToCompanies,
  saveCompanyToFirestore,
  deleteCompanyFromFirestore,
  defaultPortfolio,
  logOutUser
} from './firebase';

import { Ticker } from './components/Ticker';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { MarketWatch } from './components/MarketWatch';
import { PortfolioView } from './components/PortfolioView';
import { FnoSection } from './components/FnoSection';
import { CandleChart } from './components/CandleChart';
import { OrderHistory } from './components/OrderHistory';
import { TeacherDashboard } from './components/TeacherDashboard';

export default function App() {
  // Market State
  const [stocks, setStocks] = useState<Stock[]>(INITIAL_STOCKS);
  const [underlyings, setUnderlyings] = useState<FnoUnderlying[]>(FNO_UNDERLYINGS_BASE);
  const indices = useMemo(() => underlyings.filter(u => u.kind === 'INDEX'), [underlyings]);
  const commodities = useMemo(() => underlyings.filter(u => u.kind === 'COMMODITY'), [underlyings]);

  // Authentication & Session State
  const [userRole, setUserRole] = useState<'student' | 'teacher' | null>(null);
  const [currentRoll, setCurrentRoll] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  
  // Student Portfolio State
  const [portfolio, setPortfolio] = useState<Portfolio>(defaultPortfolio(''));
  
  // Teacher State (Roster of all students in Firestore)
  const [allStudents, setAllStudents] = useState<Portfolio[]>([]);

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'market' | 'portfolio' | 'fno' | 'chart' | 'orders'>('market');

  // 1. Subscribe to Firestore Companies (Overrides / Custom Stocks added by Teacher)
  useEffect(() => {
    const unsubscribe = subscribeToCompanies((firestoreCompanies) => {
      setStocks((prevStocks) => {
        const mergedMap = new Map<string, Stock>();
        
        // Base seed stocks
        prevStocks.forEach(s => mergedMap.set(s.sym, s));

        // Apply firestore updates or add new stocks
        Object.entries(firestoreCompanies).forEach(([sym, fsData]) => {
          if (fsData.isDeleted) {
            mergedMap.delete(sym);
            return;
          }
          const existing = mergedMap.get(sym);
          if (existing) {
            mergedMap.set(sym, {
              ...existing,
              name: fsData.name || existing.name,
              sector: fsData.sector || existing.sector,
              price: typeof fsData.price === 'number' ? fsData.price : existing.price,
              ltp: typeof fsData.price === 'number' ? fsData.price : existing.ltp,
              fno: fsData.fno !== undefined ? fsData.fno : existing.fno,
              lotSize: fsData.lotSize || existing.lotSize,
              sigma: fsData.sigma || existing.sigma,
              strikeStep: fsData.strikeStep || existing.strikeStep,
              isCustom: fsData.isCustom !== undefined ? fsData.isCustom : existing.isCustom
            });
          } else if (fsData.name && fsData.sector && fsData.price) {
            mergedMap.set(sym, {
              sym,
              name: fsData.name,
              sector: fsData.sector,
              price: fsData.price,
              prevClose: fsData.price,
              ltp: fsData.price,
              fno: fsData.fno,
              lotSize: fsData.lotSize,
              sigma: fsData.sigma,
              strikeStep: fsData.strikeStep,
              isCustom: true
            });
          }
        });

        return Array.from(mergedMap.values());
      });

      // Update F&O Underlyings
      setUnderlyings((prevUnd) => {
        const undMap = new Map<string, FnoUnderlying>();
        prevUnd.forEach(u => undMap.set(u.sym, u));

        Object.entries(firestoreCompanies).forEach(([sym, fsData]) => {
          if (fsData.isDeleted) {
            undMap.delete(sym);
            return;
          }
          if (undMap.has(sym)) {
            const existing = undMap.get(sym)!;
            undMap.set(sym, {
              ...existing,
              name: fsData.name || existing.name,
              spot: typeof fsData.price === 'number' ? fsData.price : (typeof fsData.ltp === 'number' ? fsData.ltp : existing.spot),
              sigma: fsData.sigma !== undefined ? fsData.sigma : existing.sigma,
              lotSize: fsData.lotSize !== undefined ? fsData.lotSize : existing.lotSize,
              strikeStep: fsData.strikeStep !== undefined ? fsData.strikeStep : existing.strikeStep,
              expiry: fsData.expiry !== undefined ? fsData.expiry : existing.expiry
            });
          } else if (fsData.fno) {
            undMap.set(sym, {
              sym,
              name: fsData.name || sym,
              kind: 'STOCK',
              sigma: fsData.sigma || 0.25,
              lotSize: fsData.lotSize || 100,
              strikeStep: fsData.strikeStep || Math.max(5, Math.round((fsData.price || 1000) * 0.02)),
              expiry: fsData.expiry,
              isCustom: true
            });
          } else if (fsData.fno === false && undMap.has(sym) && undMap.get(sym)?.isCustom) {
            undMap.delete(sym);
          }
        });

        return Array.from(undMap.values());
      });
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time Live Price Ticker Simulation (Authentic high-velocity exchange feed)
  useEffect(() => {
    // 700ms fast tick cadence for active real-market feel
    const interval = setInterval(() => {
      let updatedStockMap = new Map<string, Stock>();

      setStocks(prev => {
        const nextStocks = prev.map(s => {
          // 88% probability of a tick per cycle so the whole market moves dynamically
          if (Math.random() > 0.88) {
            return s.tickDirection !== 'same' ? { ...s, tickDirection: 'same' } : s;
          }

          // Increased price scale for prominent, lively movements across all tiers
          const priceScale = s.ltp > 10000 ? 32 : s.ltp > 3000 ? 12 : s.ltp > 1000 ? 5.5 : s.ltp > 300 ? 2.4 : s.ltp > 50 ? 0.95 : 0.35;
          const rawDelta = (Math.random() - 0.495) * priceScale;
          // Quantize to nearest 0.05 tick size
          let tickSteps = Math.round(rawDelta / 0.05);
          if (tickSteps === 0) {
            tickSteps = Math.random() > 0.5 ? 1 : -1;
          }
          const tickAmount = tickSteps * 0.05;

          const newLtp = Math.max(0.5, Number((s.ltp + tickAmount).toFixed(2)));
          const direction: 'up' | 'down' = newLtp > s.ltp ? 'up' : 'down';
          const high = Math.max(s.high || s.ltp, newLtp);
          const low = Math.min(s.low || s.ltp, newLtp);
          const volumeIncrement = Math.floor(Math.random() * 450) + 20;
          const volume = (s.volume || 15000) + volumeIncrement;

          const updatedStock = {
            ...s,
            ltp: newLtp,
            high,
            low,
            volume,
            tickDirection: direction
          };
          updatedStockMap.set(s.sym, updatedStock);
          return updatedStock;
        });

        return nextStocks;
      });

      // Underlyings live ticks (NIFTY, BANKNIFTY, FINNIFTY, Commodities, and F&O Stocks)
      setUnderlyings(prev => {
        return prev.map(u => {
          if (u.kind === 'INDEX') {
            const spot = u.spot || (u.sym === 'BANKNIFTY' ? 51500 : u.sym === 'FINNIFTY' ? 23500 : 24500);
            // Heightened market volatility for F&O indices:
            // NIFTY: ~ ₹2 to ₹25 (scale 28)
            // BANKNIFTY: ~ ₹8 to ₹60 (scale 65)
            // FINNIFTY: ~ ₹3 to ₹30 (scale 32)
            const scale = u.sym === 'BANKNIFTY' ? 65 : u.sym === 'FINNIFTY' ? 32 : 28;
            const rawStep = (Math.random() - 0.495) * scale;
            let tickSteps = Math.round(rawStep / 0.05);
            if (tickSteps === 0) {
              tickSteps = Math.random() > 0.5 ? 2 : -2;
            }
            const tickAmount = tickSteps * 0.05;
            const newSpot = Math.max(100, Number((spot + tickAmount).toFixed(2)));
            const direction: 'up' | 'down' = newSpot >= spot ? 'up' : 'down';

            return {
              ...u,
              prevSpot: spot,
              spot: newSpot,
              high: Math.max(u.high || spot, newSpot),
              low: Math.min(u.low || spot, newSpot),
              tickDirection: direction
            };
          } else if (u.kind === 'COMMODITY') {
            const spot = u.spot || 5000;
            const scale = u.sym === 'GOLD' ? 50 : u.sym === 'SILVER' ? 40 : u.sym === 'CRUDEOIL' ? 12 : 3.5;
            const rawStep = (Math.random() - 0.496) * scale;
            let tickSteps = Math.round(rawStep / 0.05);
            if (tickSteps === 0) {
              tickSteps = Math.random() > 0.5 ? 1 : -1;
            }
            const tickAmount = tickSteps * 0.05;
            const newSpot = Math.max(1, Number((spot + tickAmount).toFixed(2)));
            const direction: 'up' | 'down' = newSpot >= spot ? 'up' : 'down';

            return {
              ...u,
              prevSpot: spot,
              spot: newSpot,
              high: Math.max(u.high || spot, newSpot),
              low: Math.min(u.low || spot, newSpot),
              tickDirection: direction
            };
          } else if (u.kind === 'STOCK') {
            // F&O Stock contracts track underlying stock price with active order-flow
            const matchingStock = updatedStockMap.get(u.sym);
            if (matchingStock) {
              return {
                ...u,
                prevSpot: u.spot || matchingStock.ltp,
                spot: matchingStock.ltp,
                high: Math.max(u.high || matchingStock.ltp, matchingStock.ltp),
                low: Math.min(u.low || matchingStock.ltp, matchingStock.ltp),
                tickDirection: matchingStock.tickDirection
              };
            }
            return u;
          } else {
            return u;
          }
        });
      });
    }, 700);

    return () => clearInterval(interval);
  }, []);

  // 3. Subscribe to Student's Live Portfolio when logged in
  useEffect(() => {
    if (userRole === 'student' && currentRoll) {
      const unsubscribe = subscribeToStudentPortfolio(currentRoll, (updated) => {
        if (updated) {
          if (updated.isDeleted) {
            handleLogout();
            return;
          }
          setPortfolio(updated);
        }
      });
      return () => unsubscribe();
    }
  }, [userRole, currentRoll]);

  // 4. Subscribe to All Students when Teacher is logged in
  useEffect(() => {
    if (userRole === 'teacher') {
      const unsubscribe = subscribeToAllStudents((studentsList) => {
        setAllStudents(studentsList);
      });
      return () => unsubscribe();
    }
  }, [userRole]);

  // Student Login Handler
  const handleStudentLogin = async (roll: string, name?: string, email?: string) => {
    const normalized = roll.trim().toUpperCase();
    const loaded = await loadPortfolioFromFirestore(normalized, name, email);
    setCurrentRoll(normalized);
    setStudentName(name || normalized);
    setUserEmail(email || '');
    setPortfolio(loaded);
    setUserRole('student');
    setActiveTab('market');
  };

  // Teacher Login Handler
  const handleTeacherLogin = async (name?: string, email?: string) => {
    setCurrentRoll('INSTRUCTOR');
    setStudentName(name || 'Course Instructor');
    setUserEmail(email || '');
    setUserRole('teacher');
  };

  // Logout Handler
  const handleLogout = async () => {
    try {
      await logOutUser();
    } catch {
      // ignore
    }
    setUserRole(null);
    setCurrentRoll('');
    setStudentName('');
    setUserEmail('');
    setPortfolio(defaultPortfolio(''));
  };

  // Student Equity Trade Execution (Saved directly to Cloud Firestore)
  const handleEquityTrade = useCallback(async (sym: string, side: 'buy' | 'sell', qty: number, price: number) => {
    if (!currentRoll) return;
    if (portfolio.isFrozen) {
      throw new Error('Account is freezed. Trading is disabled.');
    }
    const cost = price * qty;
    const currentCash = portfolio.cash;

    if (side === 'buy' && cost > currentCash) {
      throw new Error(`Insufficient cash! Required: ${inr(cost)}, Available: ${inr(currentCash)}`);
    }

    const currentHoldings = { ...portfolio.holdings };
    const existing = currentHoldings[sym] || { qty: 0, avgCost: 0 };

    if (side === 'sell' && qty > existing.qty) {
      throw new Error(`You only hold ${existing.qty} shares of ${sym}.`);
    }

    let updatedCash = currentCash;
    if (side === 'buy') {
      const newQty = existing.qty + qty;
      const newAvg = ((existing.avgCost * existing.qty) + cost) / newQty;
      currentHoldings[sym] = { qty: newQty, avgCost: Number(newAvg.toFixed(2)) };
      updatedCash = Number((currentCash - cost).toFixed(2));
    } else {
      const remainingQty = existing.qty - qty;
      if (remainingQty === 0) {
        delete currentHoldings[sym];
      } else {
        currentHoldings[sym] = { ...existing, qty: remainingQty };
      }
      updatedCash = Number((currentCash + cost).toFixed(2));
    }

    const updatedPortfolio: Portfolio = {
      ...portfolio,
      cash: updatedCash,
      holdings: currentHoldings,
      transactions: [
        { time: Date.now(), sym, side, qty, price },
        ...(portfolio.transactions || [])
      ]
    };

    setPortfolio(updatedPortfolio);
    await savePortfolioToFirestore(updatedPortfolio);
  }, [currentRoll, portfolio]);

  // Student F&O Trade Execution (Saved directly to Cloud Firestore)
  const handleFnoTrade = useCallback(async (
    kind: 'FUT' | 'OPT',
    underlying: string,
    strike: number | null,
    optType: 'CE' | 'PE' | null,
    lotSize: number,
    side: 'buy' | 'sell',
    lots: number,
    price: number,
    marginRequired: number
  ) => {
    if (!currentRoll) return;
    if (portfolio.isFrozen) {
      throw new Error('Account is freezed. Trading is disabled.');
    }
    const currentCash = portfolio.cash;
    if (marginRequired > currentCash) {
      throw new Error(`Insufficient cash margin! Required: ${inr(marginRequired)}, Available: ${inr(currentCash)}`);
    }

    const key = kind === 'FUT' ? `${underlying}_FUT` : `${underlying}_${strike}_${optType}`;
    const positions = { ...(portfolio.fno?.positions || {}) };
    const pos = positions[key];
    const actionSide = side === 'buy' ? 'long' : 'short';

    let updatedCash = currentCash;

    if (!pos || pos.lots === 0) {
      updatedCash = Number((currentCash - marginRequired).toFixed(2));
      positions[key] = {
        kind,
        underlying,
        strike,
        optType,
        lotSize,
        side: actionSide,
        lots,
        avgPrice: price,
        margin: marginRequired
      };
    } else if (pos.side === actionSide) {
      updatedCash = Number((currentCash - marginRequired).toFixed(2));
      const totalLots = pos.lots + lots;
      pos.avgPrice = Number((((pos.avgPrice * pos.lots) + (price * lots)) / totalLots).toFixed(2));
      pos.lots = totalLots;
      pos.margin += marginRequired;
    } else {
      // Opposite side: reduce or square off
      if (lots > pos.lots) {
        throw new Error(`Only ${pos.lots} lots are open. Use Square Off in positions.`);
      }
      const fraction = lots / pos.lots;
      const releasedMargin = pos.margin * fraction;
      const totalQty = lots * pos.lotSize;
      const realizedPnl = pos.side === 'long'
        ? (price - pos.avgPrice) * totalQty
        : (pos.avgPrice - price) * totalQty;

      updatedCash = Math.max(0, Number((currentCash + releasedMargin + realizedPnl).toFixed(2)));
      pos.lots -= lots;
      pos.margin = Math.max(0, pos.margin - releasedMargin);
      if (pos.lots <= 0) {
        delete positions[key];
      }
    }

    const updatedPortfolio: Portfolio = {
      ...portfolio,
      cash: updatedCash,
      fno: {
        positions,
        transactions: [
          {
            time: Date.now(),
            kind,
            underlying,
            strike,
            optType,
            side,
            lots,
            price,
            spotAtEntry: price
          },
          ...(portfolio.fno?.transactions || [])
        ]
      }
    };

    setPortfolio(updatedPortfolio);
    await savePortfolioToFirestore(updatedPortfolio);
  }, [currentRoll, portfolio]);

  // Student Square Off F&O Position
  const handleSquareOff = useCallback(async (key: string, exitPrice?: number, realizedPnl?: number) => {
    if (portfolio.isFrozen) {
      throw new Error('Account is freezed. Position modifications are disabled.');
    }
    const pos = portfolio.fno?.positions?.[key];
    if (!pos) return;

    let calculatedExitPrice = exitPrice;
    let calculatedPnl = realizedPnl;

    if (calculatedExitPrice === undefined || calculatedPnl === undefined) {
      const st = stocks.find(s => s.sym === pos.underlying);
      const und = underlyings.find(u => u.sym === pos.underlying);
      const spot = st ? st.ltp : (und && typeof und.spot === 'number' ? und.spot : 1000);
      const sigma = und?.sigma || 0.25;

      calculatedExitPrice = pos.kind === 'FUT'
        ? futPrice(spot, und?.expiry)
        : bsPrice(spot, pos.strike || spot, daysToExpiry(und?.expiry) / 365, RISK_FREE, sigma, pos.optType || 'CE');

      const totalQty = pos.lots * pos.lotSize;
      calculatedPnl = pos.side === 'long'
        ? (calculatedExitPrice - pos.avgPrice) * totalQty
        : (pos.avgPrice - calculatedExitPrice) * totalQty;
    }

    const positions = { ...(portfolio.fno?.positions || {}) };
    delete positions[key];

    const releasedMargin = pos.margin || 0;
    const netCredit = releasedMargin + calculatedPnl;
    const updatedCash = Math.max(0, Number((portfolio.cash + netCredit).toFixed(2)));

    const updatedPortfolio: Portfolio = {
      ...portfolio,
      cash: updatedCash,
      fno: {
        positions,
        transactions: [
          {
            time: Date.now(),
            kind: pos.kind,
            underlying: pos.underlying,
            strike: pos.strike,
            optType: pos.optType,
            side: pos.side === 'long' ? 'sell' : 'buy',
            lots: pos.lots,
            price: Number(calculatedExitPrice.toFixed(2)),
            spotAtEntry: Number(calculatedExitPrice.toFixed(2))
          },
          ...(portfolio.fno?.transactions || [])
        ]
      }
    };

    setPortfolio(updatedPortfolio);
    await savePortfolioToFirestore(updatedPortfolio);
  }, [portfolio, underlyings, stocks]);

  // Teacher resets student account in Firestore
  const handleResetStudent = async (roll: string) => {
    await resetStudentPortfolioInFirestore(roll);
  };

  // Teacher freezes/unfreezes student account in Firestore
  const handleFreezeStudent = async (roll: string, freeze: boolean) => {
    await freezeStudentPortfolioInFirestore(roll, freeze);
  };

  // Teacher deletes student account in Firestore
  const handleDeleteStudent = async (roll: string) => {
    await deleteStudentPortfolioInFirestore(roll);
  };

  // Teacher purges student record completely from Firestore
  const handlePurgeStudent = async (roll: string) => {
    await purgeStudentPortfolioFromFirestore(roll);
  };

  // Teacher restores student account in Firestore
  const handleRestoreStudent = async (roll: string) => {
    await restoreStudentPortfolioInFirestore(roll);
  };

  // Student self-deletes own account
  const handleDeleteOwnAccount = async () => {
    if (!currentRoll) return;
    await deleteStudentPortfolioInFirestore(currentRoll);
    await handleLogout();
  };

  // Teacher updates company or instrument in Firestore & local state
  const handleUpdateCompany = async (sym: string, updates: Partial<Stock>) => {
    const normalized = sym.toUpperCase();
    await saveCompanyToFirestore({ sym: normalized, ...updates });
    setStocks(prev => prev.map(s => s.sym === normalized ? { ...s, ...updates } : s));
    setUnderlyings(prev => prev.map(u => {
      if (u.sym === normalized) {
        return {
          ...u,
          name: updates.name || u.name,
          spot: typeof updates.price === 'number' ? updates.price : (typeof updates.ltp === 'number' ? updates.ltp : u.spot),
          sigma: updates.sigma !== undefined ? updates.sigma : u.sigma,
          lotSize: updates.lotSize !== undefined ? updates.lotSize : u.lotSize,
          strikeStep: updates.strikeStep !== undefined ? updates.strikeStep : u.strikeStep,
          expiry: updates.expiry !== undefined ? updates.expiry : u.expiry
        };
      }
      return u;
    }));
  };

  // Teacher sets/edits the expiry date for any F&O underlying (stock, index, or commodity)
  const handleUpdateUnderlyingExpiry = async (sym: string, expiry: number) => {
    const normalized = sym.toUpperCase();
    await saveCompanyToFirestore({ sym: normalized, expiry });
    setUnderlyings(prev => prev.map(u => u.sym === normalized ? { ...u, expiry } : u));
  };

  // Teacher adds new company to Firestore
  const handleAddCompany = async (stock: Partial<Stock>) => {
    await saveCompanyToFirestore(stock);
  };

  // Teacher deletes company or instrument from Firestore & local state
  const handleDeleteCompany = async (sym: string) => {
    const normalized = sym.toUpperCase();
    await saveCompanyToFirestore({ sym: normalized, isDeleted: true });
    await deleteCompanyFromFirestore(normalized);
    setStocks(prev => prev.filter(s => s.sym !== normalized));
    setUnderlyings(prev => prev.filter(u => u.sym !== normalized));
  };

  // Compute student summary statistics
  let equityVal = 0;
  let equityCost = 0;
  (Object.entries(portfolio.holdings || {}) as [string, Holding][]).forEach(([sym, h]) => {
    const stock = stocks.find(s => s.sym === sym);
    const ltp = stock ? stock.ltp : h.avgCost;
    equityVal += ltp * h.qty;
    equityCost += h.avgCost * h.qty;
  });
  const equityPnl = equityVal - equityCost;
  const equityPnlPct = equityCost > 0 ? (equityPnl / equityCost) * 100 : 0;

  let fnoMarginBlocked = 0;
  let fnoUnrealized = 0;
  (Object.values(portfolio.fno?.positions || {}) as FnoPosition[]).forEach(pos => {
    fnoMarginBlocked += pos.margin;
    const st = stocks.find(s => s.sym === pos.underlying);
    const und = underlyings.find(u => u.sym === pos.underlying);
    const spot = st ? st.ltp : (und && typeof und.spot === 'number' ? und.spot : 1000);
    const cfg = und || { sigma: 0.25 };
    const cur = pos.kind === 'FUT'
      ? futPrice(spot, und?.expiry)
      : bsPrice(spot, pos.strike || spot, daysToExpiry(und?.expiry) / 365, RISK_FREE, cfg.sigma, pos.optType || 'CE');
    const pnl = pos.side === 'long'
      ? (cur - pos.avgPrice) * pos.lots * pos.lotSize
      : (pos.avgPrice - cur) * pos.lots * pos.lotSize;
    fnoUnrealized += pnl;
  });

  const netWorth = portfolio.cash + equityVal + fnoMarginBlocked + fnoUnrealized;

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0E14] text-[#C9D3D9]">
      {/* Ticker Bar */}
      <Ticker stocks={stocks} indices={indices} commodities={commodities} />

      {/* Main View */}
      {!userRole ? (
        <LoginView
          onStudentLogin={handleStudentLogin}
          onTeacherLogin={handleTeacherLogin}
        />
      ) : (
        <>
          <Navbar
            userRole={userRole}
            roll={currentRoll}
            studentName={studentName}
            email={userEmail}
            cash={userRole === 'student' ? portfolio.cash : undefined}
            isFrozen={userRole === 'student' ? portfolio.isFrozen : false}
            onLogout={handleLogout}
            onDeleteAccount={userRole === 'student' ? handleDeleteOwnAccount : undefined}
          />

          {userRole === 'student' && portfolio.isFrozen && (
            <div className="bg-[#D4A93F]/15 border-b border-[#D4A93F] px-6 py-2.5 text-[#D4A93F] text-xs font-mono flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-wider">Account is freezed.</span>
                <span className="text-[#C9D3D9]">Trading and squaring off positions are disabled. Please contact your instructor.</span>
              </div>
            </div>
          )}

          {userRole === 'student' && (
            <div className="border-b border-[#1F2A33] bg-[#10161D] px-6 flex gap-2 overflow-x-auto">
              <button
                type="button"
                id="marketTabBtn"
                onClick={() => setActiveTab('market')}
                className={`py-3.5 px-4 text-xs uppercase font-bold tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'market'
                    ? 'border-[#D4A93F] text-[#D4A93F]'
                    : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
                }`}
              >
                Market Watch
              </button>
              <button
                type="button"
                id="portfolioTabBtn"
                onClick={() => setActiveTab('portfolio')}
                className={`py-3.5 px-4 text-xs uppercase font-bold tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'portfolio'
                    ? 'border-[#D4A93F] text-[#D4A93F]'
                    : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
                }`}
              >
                Portfolio
              </button>
              <button
                type="button"
                id="fnoTabBtn"
                onClick={() => setActiveTab('fno')}
                className={`py-3.5 px-4 text-xs uppercase font-bold tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'fno'
                    ? 'border-[#D4A93F] text-[#D4A93F]'
                    : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
                }`}
              >
                F&amp;O
              </button>
              <button
                type="button"
                id="chartTabBtn"
                onClick={() => setActiveTab('chart')}
                className={`py-3.5 px-4 text-xs uppercase font-bold tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'chart'
                    ? 'border-[#D4A93F] text-[#D4A93F]'
                    : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
                }`}
              >
                Chart
              </button>
              <button
                type="button"
                id="ordersTabBtn"
                onClick={() => setActiveTab('orders')}
                className={`py-3.5 px-4 text-xs uppercase font-bold tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'orders'
                    ? 'border-[#D4A93F] text-[#D4A93F]'
                    : 'border-transparent text-[#6B7680] hover:text-[#F1F4F6]'
                }`}
              >
                Order History
              </button>
            </div>
          )}

          <main className="flex-1 max-w-7xl w-full mx-auto p-6">
            {userRole === 'student' ? (
              <div className="space-y-6">
                {/* Summary Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
                  <div className="bg-[#10161D] border border-[#1F2A33] p-3.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1">Net Worth</div>
                    <div className="text-base font-bold text-[#F1F4F6]">{inr(netWorth)}</div>
                  </div>
                  <div className="bg-[#10161D] border border-[#1F2A33] p-3.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1">Cash Available</div>
                    <div className="text-base font-bold text-emerald-400">{inr(portfolio.cash)}</div>
                  </div>
                  <div className="bg-[#10161D] border border-[#1F2A33] p-3.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1">Equity Holdings</div>
                    <div className="text-base font-bold text-[#F1F4F6]">{inr(equityVal)}</div>
                  </div>
                  <div className="bg-[#10161D] border border-[#1F2A33] p-3.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1">Equity P&amp;L</div>
                    <div className={`text-base font-bold ${equityPnl >= 0 ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                      {equityPnl >= 0 ? '+' : ''}{inr(equityPnl)} ({pct(equityPnlPct)})
                    </div>
                  </div>
                  <div className="bg-[#10161D] border border-[#1F2A33] p-3.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1">F&amp;O Margin</div>
                    <div className="text-base font-bold text-[#D4A93F]">{inr(fnoMarginBlocked)}</div>
                  </div>
                  <div className="bg-[#10161D] border border-[#1F2A33] p-3.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#6B7680] mb-1">F&amp;O Unrealized P&amp;L</div>
                    <div className={`text-base font-bold ${fnoUnrealized >= 0 ? 'text-[#2FBF71]' : 'text-[#E2564F]'}`}>
                      {fnoUnrealized >= 0 ? '+' : ''}{inr(fnoUnrealized)}
                    </div>
                  </div>
                </div>

                {activeTab === 'market' && (
                  <MarketWatch
                    stocks={stocks}
                    cash={portfolio.cash}
                    onTrade={handleEquityTrade}
                  />
                )}

                {activeTab === 'portfolio' && (
                  <PortfolioView
                    portfolio={portfolio}
                    stocks={stocks}
                    onSellHolding={(sym) => {
                      const holding = portfolio.holdings[sym];
                      if (holding && holding.qty > 0) {
                        const st = stocks.find(s => s.sym === sym);
                        handleEquityTrade(sym, 'sell', holding.qty, st?.ltp || holding.avgCost);
                      }
                    }}
                  />
                )}

                {activeTab === 'fno' && (
                  <FnoSection
                    underlyings={underlyings}
                    stocks={stocks}
                    positions={portfolio.fno?.positions || {}}
                    cash={portfolio.cash}
                    onFnoTrade={handleFnoTrade}
                    onSquareOff={handleSquareOff}
                  />
                )}

                {activeTab === 'chart' && (
                  <CandleChart
                    stocks={stocks}
                    indices={indices}
                    commodities={commodities}
                    equityTransactions={portfolio.transactions || []}
                    fnoTransactions={portfolio.fno?.transactions || []}
                  />
                )}

                {activeTab === 'orders' && (
                  <OrderHistory
                    equityTransactions={portfolio.transactions || []}
                    fnoTransactions={portfolio.fno?.transactions || []}
                  />
                )}
              </div>
            ) : (
              <TeacherDashboard
                students={allStudents}
                allStocks={stocks}
                underlyings={underlyings}
                onResetStudent={handleResetStudent}
                onFreezeStudent={handleFreezeStudent}
                onDeleteStudent={handleDeleteStudent}
                onPurgeStudent={handlePurgeStudent}
                onRestoreStudent={handleRestoreStudent}
                onUpdateCompany={handleUpdateCompany}
                onAddCompany={handleAddCompany}
                onDeleteCompany={handleDeleteCompany}
                onUpdateUnderlyingExpiry={handleUpdateUnderlyingExpiry}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
