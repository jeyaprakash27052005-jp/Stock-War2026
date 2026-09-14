import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Stock, FnoUnderlying, Portfolio, Holding, FnoPosition } from './types';
import { INITIAL_STOCKS, FNO_UNDERLYINGS_BASE, inr, pct, STARTING_CASH, futPrice, bsPrice, daysToExpiry, DEFAULT_EXPIRY_MS, RISK_FREE } from './marketData';
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
  fetchCompaniesFromFirestore,
  fetchEquityCompaniesFromFirestore,
  subscribeToEquityCompanies,
  saveEquityCompanyToFirestore,
  deleteEquityCompanyFromFirestore,
  fetchFnoCompaniesFromFirestore,
  subscribeToFnoCompanies,
  saveFnoCompanyToFirestore,
  deleteFnoCompanyFromFirestore,
  addFnoExpiryToFirestore,
  removeFnoExpiryFromFirestore,
  defaultPortfolio,
  logOutUser,
  ensureAnonymousAuth,
  onAuthReady,
  saveSessionToFirestore,
  loadSessionFromFirestore,
  clearSessionFromFirestore,
  auth
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
  const [sessionRestored, setSessionRestored] = useState(false);
  
  // Student Portfolio State
  const [portfolio, setPortfolio] = useState<Portfolio>(defaultPortfolio(''));
  
  // Teacher State (Roster of all students in Firestore)
  const [allStudents, setAllStudents] = useState<Portfolio[]>([]);

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'market' | 'portfolio' | 'fno' | 'chart' | 'orders'>('market');

  // Guards the one-time catalog seed so it only runs once per app load, not on every snapshot
  const catalogSeededRef = useRef(false);

  // 0. Restore session (if any) on first load, via Firebase Auth + Firestore only.
  // No localStorage/sessionStorage is used: the browser keeps an anonymous Firebase Auth
  // identity across refreshes (Firebase's own mechanism), and that identity is used purely
  // as a lookup key into the 'sessions' collection in Firestore, which is the actual source
  // of truth for who is logged in.
  useEffect(() => {
    let cancelled = false;

    const restore = async (uid: string | null) => {
      try {
        const activeUid = uid || (await ensureAnonymousAuth());
        const session = await loadSessionFromFirestore(activeUid);
        if (cancelled) return;
        if (session) {
          setCurrentRoll(session.roll);
          setStudentName(session.studentName);
          setUserEmail(session.email);
          setUserRole(session.role);
          if (session.role === 'student') {
            setActiveTab('market');
          }
        }
      } catch (err) {
        console.warn('Session restore warning:', err);
      } finally {
        if (!cancelled) setSessionRestored(true);
      }
    };

    const unsubscribe = onAuthReady((uid) => {
      restore(uid);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // 1a. One-time catalog seed + legacy migration: make sure every default stock, index,
  // and commodity has an actual document in the new split collections, and pull in
  // anything that was previously written under the old single 'companies' collection.
  useEffect(() => {
    if (catalogSeededRef.current) return;
    catalogSeededRef.current = true;

    (async () => {
      try {
        const [legacy, equityDocs, fnoDocs] = await Promise.all([
          fetchCompaniesFromFirestore(),
          fetchEquityCompaniesFromFirestore(),
          fetchFnoCompaniesFromFirestore()
        ]);

        const equityTasks: { sym: string; payload: Partial<Stock> }[] = [];
        const fnoTasks: { sym: string; payload: Partial<FnoUnderlying> & { sym: string } }[] = [];

        // Migrate anything sitting in the old 'companies' collection that hasn't
        // already been copied into the new collections.
        Object.entries(legacy).forEach(([sym, data]) => {
          if (data.isDeleted) return;
          if (!equityDocs[sym] && data.name && data.sector && typeof data.price === 'number') {
            equityTasks.push({
              sym,
              payload: {
                sym, name: data.name, sector: data.sector, price: data.price,
                fno: !!data.fno, lotSize: data.lotSize, sigma: data.sigma,
                strikeStep: data.strikeStep, isCustom: data.isCustom ?? true
              }
            });
          }
          if (!fnoDocs[sym] && data.fno) {
            fnoTasks.push({
              sym,
              payload: {
                sym, name: data.name || sym, kind: 'STOCK',
                sigma: data.sigma ?? 0.25, lotSize: data.lotSize ?? 100,
                strikeStep: data.strikeStep ?? Math.max(5, Math.round((data.price || 1000) * 0.02)),
                expiries: typeof data.expiry === 'number' ? [data.expiry] : [DEFAULT_EXPIRY_MS], isCustom: true
              }
            });
          }
        });

        // Seed the built-in defaults for anything still missing after migration.
        INITIAL_STOCKS.forEach(s => {
          if (!equityDocs[s.sym] && !equityTasks.some(t => t.sym === s.sym)) {
            equityTasks.push({
              sym: s.sym,
              payload: {
                sym: s.sym, name: s.name, sector: s.sector, price: s.price,
                fno: !!s.fno, lotSize: s.lotSize, sigma: s.sigma,
                strikeStep: s.strikeStep, isCustom: false
              }
            });
          }
        });
        FNO_UNDERLYINGS_BASE.forEach(u => {
          if (!fnoDocs[u.sym] && !fnoTasks.some(t => t.sym === u.sym)) {
            fnoTasks.push({
              sym: u.sym,
              payload: {
                sym: u.sym, name: u.name, kind: u.kind,
                sigma: u.sigma, lotSize: u.lotSize, strikeStep: u.strikeStep,
                expiries: [DEFAULT_EXPIRY_MS], isCustom: false
              }
            });
          }
        });

        const allTasks = [
          ...equityTasks.map(t => ({ sym: t.sym, run: () => saveEquityCompanyToFirestore(t.payload) })),
          ...fnoTasks.map(t => ({ sym: t.sym, run: () => saveFnoCompanyToFirestore(t.payload) }))
        ];

        if (allTasks.length) {
          const results = await Promise.allSettled(allTasks.map(t => t.run()));
          const failed = results
            .map((r, i) => ({ r, sym: allTasks[i].sym }))
            .filter(({ r }) => r.status === 'rejected');
          if (failed.length) {
            console.warn(
              `Catalog seeding: ${failed.length}/${allTasks.length} instrument(s) failed to write to Firestore:`,
              failed.map(f => f.sym).join(', '),
              (failed[0].r as PromiseRejectedResult).reason
            );
            catalogSeededRef.current = false; // retry on next full page load
          }
        }
      } catch (err) {
        console.warn('Catalog seeding/migration warning:', err);
        catalogSeededRef.current = false;
      }
    })();
  }, []);

  // 1b. Subscribe to Firestore Equity Companies (cash market catalog, teacher-editable)
  useEffect(() => {
    const unsubscribe = subscribeToEquityCompanies((firestoreEquity) => {
      setStocks((prevStocks) => {
        const mergedMap = new Map<string, Stock>();
        prevStocks.forEach(s => mergedMap.set(s.sym, s));

        Object.entries(firestoreEquity).forEach(([sym, fsData]) => {
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
    });

    return () => unsubscribe();
  }, []);

  // 1c. Subscribe to Firestore F&O Companies (derivatives catalog: indices, commodities,
  // and any stock with F&O enabled - teacher-editable)
  useEffect(() => {
    const unsubscribe = subscribeToFnoCompanies((firestoreFno) => {
      setUnderlyings((prevUnd) => {
        const undMap = new Map<string, FnoUnderlying>();
        prevUnd.forEach(u => undMap.set(u.sym, u));

        // A custom/stock-linked instrument whose Firestore document has been physically
        // deleted (not just flagged) will simply be absent from the new snapshot map -
        // remove any such stale entries. Base indices/commodities are never removed here.
        undMap.forEach((u, sym) => {
          if (u.isCustom && !firestoreFno[sym] && !FNO_UNDERLYINGS_BASE.some(b => b.sym === sym)) {
            undMap.delete(sym);
          }
        });

        Object.entries(firestoreFno).forEach(([sym, fsData]) => {
          if (fsData.isDeleted) {
            undMap.delete(sym);
            return;
          }
          const existing = undMap.get(sym);
          if (existing) {
            undMap.set(sym, {
              ...existing,
              name: fsData.name || existing.name,
              spot: typeof fsData.spot === 'number' ? fsData.spot : existing.spot,
              sigma: fsData.sigma !== undefined ? fsData.sigma : existing.sigma,
              lotSize: fsData.lotSize !== undefined ? fsData.lotSize : existing.lotSize,
              strikeStep: fsData.strikeStep !== undefined ? fsData.strikeStep : existing.strikeStep,
              expiries: fsData.expiries !== undefined ? fsData.expiries : existing.expiries
            });
          } else if (fsData.kind) {
            undMap.set(sym, {
              sym,
              name: fsData.name || sym,
              kind: fsData.kind,
              sigma: fsData.sigma ?? 0.25,
              lotSize: fsData.lotSize ?? 100,
              strikeStep: fsData.strikeStep ?? 20,
              expiries: fsData.expiries,
              isCustom: true
            });
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
    // Best-effort: persist the session in Firestore so a page refresh restores it.
    // Login itself must never fail just because this secondary step fails.
    try {
      const uid = await ensureAnonymousAuth();
      await saveSessionToFirestore(uid, {
        role: 'student',
        roll: normalized,
        studentName: name || normalized,
        email: email || '',
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn('Could not persist session to Firestore (refresh will require re-login):', err);
    }
  };

  // Teacher Login Handler
  const handleTeacherLogin = async (name?: string, email?: string) => {
    setCurrentRoll('INSTRUCTOR');
    setStudentName(name || 'Course Instructor');
    setUserEmail(email || '');
    setUserRole('teacher');
    try {
      const uid = await ensureAnonymousAuth();
      await saveSessionToFirestore(uid, {
        role: 'teacher',
        roll: 'INSTRUCTOR',
        studentName: name || 'Course Instructor',
        email: email || '',
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn('Could not persist session to Firestore (refresh will require re-login):', err);
    }
  };

  // Logout Handler
  const handleLogout = async () => {
    try {
      if (auth.currentUser) {
        await clearSessionFromFirestore(auth.currentUser.uid);
      }
    } catch {
      // ignore - logging out should still proceed even if the Firestore cleanup fails
    }
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
    marginRequired: number,
    expiry: number
  ) => {
    if (!currentRoll) return;
    if (portfolio.isFrozen) {
      throw new Error('Account is freezed. Trading is disabled.');
    }
    const currentCash = portfolio.cash;
    if (marginRequired > currentCash) {
      throw new Error(`Insufficient cash margin! Required: ${inr(marginRequired)}, Available: ${inr(currentCash)}`);
    }

    // The expiry is part of the contract's identity - a NIFTY 24500 CE expiring this
    // week is a different contract from a NIFTY 24500 CE expiring next month, even
    // though everything else about them matches.
    const key = kind === 'FUT' ? `${underlying}_FUT_${expiry}` : `${underlying}_${strike}_${optType}_${expiry}`;
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
        expiry,
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
            expiry,
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
        ? futPrice(spot, pos.expiry)
        : bsPrice(spot, pos.strike || spot, daysToExpiry(pos.expiry) / 365, RISK_FREE, sigma, pos.optType || 'CE');

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
  // Teacher updates a company: equity-side fields go to 'equity_companies',
  // F&O-side fields go to 'fno_companies'. If F&O is switched off, its
  // derivatives-segment document is removed entirely.
  const handleUpdateCompany = async (sym: string, updates: Partial<Stock>) => {
    const normalized = sym.toUpperCase();
    const { lotSize, sigma, strikeStep, ...equityFields } = updates;

    await saveEquityCompanyToFirestore({ sym: normalized, ...equityFields });

    if (updates.fno === false) {
      await deleteFnoCompanyFromFirestore(normalized);
    } else if (updates.fno === true || lotSize !== undefined || sigma !== undefined || strikeStep !== undefined) {
      const existingUnderlying = underlyings.find(u => u.sym === normalized);
      if (updates.fno === true && (!existingUnderlying || !existingUnderlying.expiries?.length)) {
        // First time F&O is being enabled for this stock - give it a starter expiry
        // series (arrayUnion-based, so it's additive even if a doc already exists).
        await addFnoExpiryToFirestore(normalized, DEFAULT_EXPIRY_MS, {
          name: updates.name,
          kind: 'STOCK',
          lotSize,
          sigma,
          strikeStep
        });
      } else {
        await saveFnoCompanyToFirestore({
          sym: normalized,
          name: updates.name,
          kind: 'STOCK',
          lotSize,
          sigma,
          strikeStep,
          isCustom: true
        });
      }
    }

    setStocks(prev => prev.map(s => s.sym === normalized ? { ...s, ...updates } : s));
    if (updates.fno === false) {
      setUnderlyings(prev => prev.filter(u => !(u.sym === normalized && u.isCustom)));
    } else {
      setUnderlyings(prev => prev.map(u => {
        if (u.sym === normalized) {
          return {
            ...u,
            name: updates.name || u.name,
            spot: typeof updates.price === 'number' ? updates.price : (typeof updates.ltp === 'number' ? updates.ltp : u.spot),
            sigma: updates.sigma !== undefined ? updates.sigma : u.sigma,
            lotSize: updates.lotSize !== undefined ? updates.lotSize : u.lotSize,
            strikeStep: updates.strikeStep !== undefined ? updates.strikeStep : u.strikeStep
          };
        }
        return u;
      }));
    }
  };

  // Teacher adds a new expiry series for any F&O underlying (stock, index, or commodity).
  // This ONLY adds - existing expiry series for that instrument are never touched.
  const handleAddUnderlyingExpiry = async (sym: string, expiry: number) => {
    const normalized = sym.toUpperCase();
    const existing = underlyings.find(u => u.sym === normalized);
    await addFnoExpiryToFirestore(normalized, expiry, {
      name: existing?.name,
      kind: existing?.kind,
      sigma: existing?.sigma,
      lotSize: existing?.lotSize,
      strikeStep: existing?.strikeStep
    });
    setUnderlyings(prev => prev.map(u => u.sym === normalized
      ? { ...u, expiries: Array.from(new Set([...(u.expiries || []), expiry])).sort((a, b) => a - b) }
      : u
    ));
  };

  // Teacher removes exactly one expiry series from an instrument, leaving all others intact.
  const handleRemoveUnderlyingExpiry = async (sym: string, expiry: number) => {
    const normalized = sym.toUpperCase();
    await removeFnoExpiryFromFirestore(normalized, expiry);
    setUnderlyings(prev => prev.map(u => u.sym === normalized
      ? { ...u, expiries: (u.expiries || []).filter(e => e !== expiry) }
      : u
    ));
  };

  // Teacher adds a new company: always creates the equity-segment document;
  // also creates the derivatives-segment document (with one default expiry
  // series) if F&O is enabled for it.
  const handleAddCompany = async (stock: Partial<Stock>) => {
    const { lotSize, sigma, strikeStep, ...equityFields } = stock;
    await saveEquityCompanyToFirestore({ ...equityFields, fno: !!stock.fno });
    if (stock.fno && stock.sym) {
      await addFnoExpiryToFirestore(stock.sym, DEFAULT_EXPIRY_MS, {
        name: stock.name,
        kind: 'STOCK',
        lotSize,
        sigma,
        strikeStep
      });
    }
  };

  // Teacher deletes a company or instrument from both segments & local state
  const handleDeleteCompany = async (sym: string) => {
    const normalized = sym.toUpperCase();
    await deleteEquityCompanyFromFirestore(normalized);
    await deleteFnoCompanyFromFirestore(normalized);
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
      ? futPrice(spot, pos.expiry)
      : bsPrice(spot, pos.strike || spot, daysToExpiry(pos.expiry) / 365, RISK_FREE, cfg.sigma, pos.optType || 'CE');
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
      {!sessionRestored ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[#6B7680] text-xs uppercase tracking-wider font-mono animate-pulse">
            Restoring session...
          </div>
        </div>
      ) : !userRole ? (
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
                onUpdateUnderlyingExpiry={handleAddUnderlyingExpiry}
                onRemoveUnderlyingExpiry={handleRemoveUnderlyingExpiry}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
