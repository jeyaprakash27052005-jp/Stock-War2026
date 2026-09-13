import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  onSnapshot,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Portfolio, Stock, FnoUnderlying } from './types';

export const STARTING_CASH = 1000000;

export function defaultPortfolio(roll: string, studentName?: string, email?: string): Portfolio {
  return {
    roll,
    studentName: studentName || roll,
    email: email || '',
    cash: STARTING_CASH,
    holdings: {},
    transactions: [],
    fno: {
      positions: {},
      transactions: []
    },
    lastActive: Date.now()
  };
}

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID if provided
export const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logOutUser(): Promise<void> {
  await signOut(auth);
}

// =================== SESSION PERSISTENCE (Firestore-backed, no localStorage) ===================
// A page refresh keeps the same browser tied to an anonymous Firebase Auth identity
// (Firebase handles that hand-off internally). We use that identity purely as a lookup
// key into a Firestore 'sessions' collection, which is the actual source of truth for
// who is logged in - nothing about the session itself is kept in localStorage.

export interface SessionRecord {
  role: 'student' | 'teacher';
  roll: string;
  studentName: string;
  email: string;
  updatedAt: number;
}

// Ensures the current browser has a Firebase Auth identity, signing in anonymously if needed.
// Returns the uid to use as the session's Firestore document key.
export async function ensureAnonymousAuth(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

// Fires once Firebase Auth has resolved whether this browser already has an identity.
export function onAuthReady(callback: (uid: string | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    callback(user ? user.uid : null);
  });
}

export async function saveSessionToFirestore(uid: string, session: SessionRecord): Promise<void> {
  const docRef = doc(db, 'sessions', uid);
  await setDoc(docRef, session);
}

export async function loadSessionFromFirestore(uid: string): Promise<SessionRecord | null> {
  const docRef = doc(db, 'sessions', uid);
  const snap = await getDoc(docRef);
  return snap.exists() ? (snap.data() as SessionRecord) : null;
}

export async function clearSessionFromFirestore(uid: string): Promise<void> {
  const docRef = doc(db, 'sessions', uid);
  await deleteDoc(docRef);
}

// =================== FIRESTORE PORTFOLIO OPERATIONS ===================

export async function loadPortfolioFromFirestore(roll: string, studentName?: string, email?: string): Promise<Portfolio> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'portfolios', normalizedRoll);
  
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Portfolio;
      if (data.isDeleted) {
        throw new Error('Invalid account');
      }
      if (data.isFrozen) {
        throw new Error('Account is freezed');
      }
      return {
        ...defaultPortfolio(normalizedRoll, studentName, email),
        ...data,
        roll: normalizedRoll
      };
    } else {
      const initial = defaultPortfolio(normalizedRoll, studentName, email);
      await setDoc(docRef, initial);
      return initial;
    }
  } catch (error) {
    console.error('Error loading portfolio from Firestore:', error);
    throw error;
  }
}

export async function savePortfolioToFirestore(portfolio: Portfolio): Promise<void> {
  if (!portfolio || !portfolio.roll) return;
  const docRef = doc(db, 'portfolios', portfolio.roll);
  try {
    // We do NOT use { merge: true } here because when positions or holdings
    // are squared off / sold (deleted from object), merge: true causes Firestore
    // to retain the deleted keys in maps. Overwriting the document ensures deleted
    // contracts and holdings are permanently removed from Firestore.
    await setDoc(docRef, {
      roll: portfolio.roll,
      studentName: portfolio.studentName || portfolio.roll,
      email: portfolio.email || '',
      cash: Number((portfolio.cash || 0).toFixed(2)),
      holdings: portfolio.holdings || {},
      transactions: portfolio.transactions || [],
      fno: {
        positions: portfolio.fno?.positions || {},
        transactions: portfolio.fno?.transactions || []
      },
      lastActive: Date.now(),
      isFrozen: Boolean(portfolio.isFrozen),
      isDeleted: Boolean(portfolio.isDeleted),
      frozenAt: portfolio.frozenAt || null,
      deletedAt: portfolio.deletedAt || null
    });
  } catch (error) {
    console.error('Error saving portfolio to Firestore:', error);
    throw error;
  }
}

export function subscribeToStudentPortfolio(roll: string, onUpdate: (p: Portfolio) => void) {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'portfolios', normalizedRoll);
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      onUpdate(snap.data() as Portfolio);
    }
  }, (err) => {
    console.warn('Firestore portfolio subscription warning:', err);
  });
}

export async function fetchAllStudentsFromFirestore(): Promise<Portfolio[]> {
  try {
    const colRef = collection(db, 'portfolios');
    const snap = await getDocs(colRef);
    const list: Portfolio[] = [];
    snap.forEach((d) => {
      const data = d.data() as Portfolio;
      list.push(data);
    });
    return list;
  } catch (error) {
    console.error('Error fetching students from Firestore:', error);
    return [];
  }
}

export function subscribeToAllStudents(onUpdate: (students: Portfolio[]) => void) {
  const colRef = collection(db, 'portfolios');
  return onSnapshot(colRef, (snap) => {
    const list: Portfolio[] = [];
    snap.forEach((d) => {
      list.push(d.data() as Portfolio);
    });
    onUpdate(list);
  }, (err) => {
    console.warn('Firestore students subscription warning:', err);
  });
}

export async function resetStudentPortfolioInFirestore(roll: string): Promise<void> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'portfolios', normalizedRoll);
  const fresh = defaultPortfolio(normalizedRoll);
  await setDoc(docRef, {
    ...fresh,
    isFrozen: false,
    isDeleted: false
  });
}

export async function freezeStudentPortfolioInFirestore(roll: string, freeze: boolean): Promise<void> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'portfolios', normalizedRoll);
  await setDoc(docRef, {
    isFrozen: freeze,
    frozenAt: freeze ? Date.now() : null
  }, { merge: true });
}

export async function deleteStudentPortfolioInFirestore(roll: string): Promise<void> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'portfolios', normalizedRoll);
  await setDoc(docRef, {
    roll: normalizedRoll,
    isDeleted: true,
    isFrozen: false,
    deletedAt: Date.now(),
    cash: 0,
    holdings: {},
    transactions: [],
    fno: { positions: {}, transactions: [] }
  });
}

export async function purgeStudentPortfolioFromFirestore(roll: string): Promise<void> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'portfolios', normalizedRoll);
  await deleteDoc(docRef);
}

export async function restoreStudentPortfolioInFirestore(roll: string): Promise<void> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'portfolios', normalizedRoll);
  const fresh = defaultPortfolio(normalizedRoll);
  await setDoc(docRef, {
    ...fresh,
    isDeleted: false,
    isFrozen: false
  });
}

// =================== LEGACY: single 'companies' collection ===================
// Superseded by the separate 'equity_companies' and 'fno_companies' collections below,
// kept only so a one-time migration can pick up any data written under the old scheme.

export async function fetchCompaniesFromFirestore(): Promise<Record<string, Partial<Stock>>> {
  try {
    const colRef = collection(db, 'companies');
    const snap = await getDocs(colRef);
    const map: Record<string, Partial<Stock>> = {};
    snap.forEach((d) => {
      map[d.id] = d.data() as Partial<Stock>;
    });
    return map;
  } catch (error) {
    console.error('Error fetching legacy companies from Firestore:', error);
    return {};
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...obj };
  Object.keys(copy).forEach((key) => {
    if (copy[key] === undefined) delete copy[key];
  });
  return copy;
}

// =================== EQUITY COMPANIES (Cash Market segment) ===================
// One document per tradable stock: symbol, name, sector, price, and whether it
// also has F&O enabled. This is the full listed-company catalog.

export async function fetchEquityCompaniesFromFirestore(): Promise<Record<string, Partial<Stock>>> {
  try {
    const colRef = collection(db, 'equity_companies');
    const snap = await getDocs(colRef);
    const map: Record<string, Partial<Stock>> = {};
    snap.forEach((d) => { map[d.id] = d.data() as Partial<Stock>; });
    return map;
  } catch (error) {
    console.error('Error fetching equity companies from Firestore:', error);
    return {};
  }
}

export function subscribeToEquityCompanies(onUpdate: (map: Record<string, Partial<Stock>>) => void) {
  const colRef = collection(db, 'equity_companies');
  return onSnapshot(colRef, (snap) => {
    const map: Record<string, Partial<Stock>> = {};
    snap.forEach((d) => { map[d.id] = d.data() as Partial<Stock>; });
    onUpdate(map);
  }, (err) => {
    console.warn('Firestore equity_companies subscription warning:', err);
  });
}

export async function saveEquityCompanyToFirestore(stock: Partial<Stock>): Promise<void> {
  if (!stock.sym) return;
  const docRef = doc(db, 'equity_companies', stock.sym.toUpperCase());
  const payload = stripUndefined({
    ...stock,
    sym: stock.sym.toUpperCase(),
    updatedAt: Date.now()
  });
  await setDoc(docRef, payload, { merge: true });
}

export async function deleteEquityCompanyFromFirestore(sym: string): Promise<void> {
  const docRef = doc(db, 'equity_companies', sym.toUpperCase());
  await deleteDoc(docRef);
}

// =================== F&O COMPANIES (Derivatives segment) ===================
// One document per F&O-tradable instrument: indices, commodities, and any stock
// that has F&O enabled. A stock with F&O on will therefore have a document in
// BOTH 'equity_companies' (cash market) and 'fno_companies' (derivatives) - just
// like on a real exchange, where a stock is listed in both segments.

export async function fetchFnoCompaniesFromFirestore(): Promise<Record<string, Partial<FnoUnderlying>>> {
  try {
    const colRef = collection(db, 'fno_companies');
    const snap = await getDocs(colRef);
    const map: Record<string, Partial<FnoUnderlying>> = {};
    snap.forEach((d) => { map[d.id] = d.data() as Partial<FnoUnderlying>; });
    return map;
  } catch (error) {
    console.error('Error fetching F&O companies from Firestore:', error);
    return {};
  }
}

export function subscribeToFnoCompanies(onUpdate: (map: Record<string, Partial<FnoUnderlying>>) => void) {
  const colRef = collection(db, 'fno_companies');
  return onSnapshot(colRef, (snap) => {
    const map: Record<string, Partial<FnoUnderlying>> = {};
    snap.forEach((d) => { map[d.id] = d.data() as Partial<FnoUnderlying>; });
    onUpdate(map);
  }, (err) => {
    console.warn('Firestore fno_companies subscription warning:', err);
  });
}

export async function saveFnoCompanyToFirestore(data: Partial<FnoUnderlying> & { sym: string }): Promise<void> {
  const docRef = doc(db, 'fno_companies', data.sym.toUpperCase());
  const payload = stripUndefined({
    ...data,
    sym: data.sym.toUpperCase(),
    updatedAt: Date.now()
  });
  await setDoc(docRef, payload, { merge: true });
}

export async function deleteFnoCompanyFromFirestore(sym: string): Promise<void> {
  const docRef = doc(db, 'fno_companies', sym.toUpperCase());
  await deleteDoc(docRef);
}
