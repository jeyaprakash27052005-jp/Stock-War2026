import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { 
  initializeFirestore,
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Portfolio, Stock, FnoUnderlying, StudentProfile, PersonDetails } from './types';

export const STARTING_CASH = 1000000;

export function defaultPortfolio(roll: string, studentName?: string, email?: string, teamName?: string): Portfolio {
  return {
    roll,
    teamName: teamName || '',
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

// Initialize Firestore with specific database ID if provided and force long-polling
// to prevent "Could not reach Cloud Firestore backend. Backend didn't respond within 10 seconds"
// errors caused by proxies/iframes buffering WebChannel streaming connections.
const dbId = firebaseConfig.firestoreDatabaseId || undefined;
export const db: Firestore = (() => {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false
    }, dbId);
  } catch {
    return dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
})();

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const provider = new GoogleAuthProvider();
  // Forces Google account selection dialog to display all available accounts
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
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

// Adds one expiry date to an instrument's expiry series WITHOUT touching any existing
// ones (Firestore's arrayUnion is atomic and additive-only - the opposite of merge:true
// on a plain array field, which would silently replace the whole array). Creates the
// document (with sensible defaults for any missing base fields) if it doesn't exist yet.
export async function addFnoExpiryToFirestore(
  sym: string,
  expiryMs: number,
  base?: { name?: string; kind?: 'INDEX' | 'STOCK' | 'COMMODITY'; sigma?: number; lotSize?: number; strikeStep?: number }
): Promise<void> {
  const normalized = sym.toUpperCase();
  const docRef = doc(db, 'fno_companies', normalized);
  const existing = await getDoc(docRef);
  if (!existing.exists()) {
    // First expiry ever set for this instrument - create the document with base info.
    const payload = stripUndefined({
      sym: normalized,
      name: base?.name || normalized,
      kind: base?.kind || 'STOCK',
      sigma: base?.sigma,
      lotSize: base?.lotSize,
      strikeStep: base?.strikeStep,
      expiries: [expiryMs],
      isCustom: true,
      updatedAt: Date.now()
    });
    await setDoc(docRef, payload);
    return;
  }
  await updateDoc(docRef, {
    expiries: arrayUnion(expiryMs),
    updatedAt: Date.now()
  });
}

// Removes exactly one expiry date from an instrument's expiry series, leaving every
// other expiry untouched.
export async function removeFnoExpiryFromFirestore(sym: string, expiryMs: number): Promise<void> {
  const normalized = sym.toUpperCase();
  const docRef = doc(db, 'fno_companies', normalized);
  await updateDoc(docRef, {
    expiries: arrayRemove(expiryMs),
    updatedAt: Date.now()
  });
}

// =================== STUDENT PROFILE (separate collection) ===================
// Kept apart from 'portfolios' so profile/identity details (name, department,
// roll number, optional nominee list) are managed and
// queried independently of trading data.

export async function saveStudentProfileToFirestore(roll: string, profile: Partial<StudentProfile>): Promise<void> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'student_profiles', normalizedRoll);
  const existing = await getDoc(docRef);
  const payload = stripUndefined({
    ...profile,
    roll: normalizedRoll,
    createdAt: existing.exists() ? existing.data().createdAt : Date.now(),
    updatedAt: Date.now()
  });
  await setDoc(docRef, payload, { merge: true });
}

export async function loadStudentProfileFromFirestore(roll: string): Promise<StudentProfile | null> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'student_profiles', normalizedRoll);
  const snap = await getDoc(docRef);
  return snap.exists() ? (snap.data() as StudentProfile) : null;
}

export async function deleteStudentProfileFromFirestore(roll: string): Promise<void> {
  const normalizedRoll = roll.trim().toUpperCase();
  const docRef = doc(db, 'student_profiles', normalizedRoll);
  await deleteDoc(docRef);
}

export function subscribeToAllStudentProfiles(onUpdate: (profiles: Record<string, StudentProfile>) => void) {
  const colRef = collection(db, 'student_profiles');
  return onSnapshot(colRef, (snap) => {
    const map: Record<string, StudentProfile> = {};
    snap.forEach((d) => { map[d.id] = d.data() as StudentProfile; });
    onUpdate(map);
  }, (err) => {
    console.warn('Firestore student_profiles subscription warning:', err);
  });
}

// =================== STUDENT REGISTRATION: GOOGLE + EMAIL-LINK VERIFICATION ===================
// Replaces the old roll-number/password student login. A student signs in with
// their Google account, fills in their KYC details once, and verifies ownership
// of that Google account's email via a Firebase-sent sign-in link (no OTP/SMTP
// setup required - Firebase sends this email itself). Their generated Student ID
// becomes their trading account key ("roll") going forward.

// Generates a sequential Student ID in the format "26SW01", "26SW02", etc.
export function generateStudentId(): string {
  return '26SW01';
}

// Generates a Student ID in the format "26SW01", "26SW02", etc. and confirms it isn't already in use.
export async function generateUniqueStudentId(): Promise<string> {
  const prefix = '26SW';
  try {
    const snap = await getDocs(collection(db, 'student_profiles'));
    const usedNumbers = new Set<number>();
    snap.forEach((d) => {
      const id = d.id.toUpperCase();
      if (id.startsWith(prefix)) {
        const numPart = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(numPart)) {
          usedNumbers.add(numPart);
        }
      }
    });

    const portSnap = await getDocs(collection(db, 'portfolios'));
    portSnap.forEach((d) => {
      const id = d.id.toUpperCase();
      if (id.startsWith(prefix)) {
        const numPart = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(numPart)) {
          usedNumbers.add(numPart);
        }
      }
    });

    for (let i = 1; i <= 9999; i++) {
      if (!usedNumbers.has(i)) {
        const numStr = i < 10 ? `0${i}` : `${i}`;
        return `${prefix}${numStr}`;
      }
    }
  } catch (err) {
    console.warn('Error querying student profiles for sequence:', err);
  }

  // Fallback sequential check
  for (let i = 1; i <= 999; i++) {
    const numStr = i < 10 ? `0${i}` : `${i}`;
    const candidate = `${prefix}${numStr}`;
    const existing = await getDoc(doc(db, 'student_profiles', candidate));
    if (!existing.exists()) return candidate;
  }
  return `${prefix}01`;
}

export async function findStudentProfileByGoogleUid(uid: string): Promise<StudentProfile | null> {
  const q = query(collection(db, 'student_profiles'), where('googleUid', '==', uid));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as StudentProfile;
}

export async function findStudentProfileByEmail(email: string): Promise<StudentProfile | null> {
  const normalized = email.trim().toLowerCase();
  const q = query(collection(db, 'student_profiles'), where('email', '==', normalized));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].data() as StudentProfile;
  }
  // Case-insensitive fallback check across docs
  const allProfiles = await getDocs(collection(db, 'student_profiles'));
  for (const d of allProfiles.docs) {
    const data = d.data() as StudentProfile;
    if (data.email && data.email.trim().toLowerCase() === normalized) {
      return data;
    }
  }
  return null;
}

// =================== STRICT 1 EMAIL = 1 REGISTRATION ENFORCEMENT ===================

export interface EmailRegistrationRecord {
  email: string;
  roll: string;
  studentName?: string;
  registeredAt: number;
}

// Checks if an email is already registered anywhere in the system.
export async function checkEmailRegistrationStatus(email: string): Promise<{
  registered: boolean;
  roll?: string;
  studentName?: string;
  profile?: StudentProfile;
}> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { registered: false };

  try {
    // 1. Check dedicated registered_emails lookup collection
    const regDocRef = doc(db, 'registered_emails', encodeURIComponent(normalized));
    const regSnap = await getDoc(regDocRef);
    if (regSnap.exists()) {
      const data = regSnap.data() as EmailRegistrationRecord;
      let profile: StudentProfile | null = null;
      if (data.roll) {
        profile = await loadStudentProfileFromFirestore(data.roll);
      }
      return {
        registered: true,
        roll: data.roll,
        studentName: data.studentName || profile?.primary?.name,
        profile: profile || undefined
      };
    }

    // 2. Fallback check across student_profiles collection
    const profile = await findStudentProfileByEmail(normalized);
    if (profile) {
      // Sync into registered_emails collection for fast future lookups
      await setDoc(regDocRef, {
        email: normalized,
        roll: profile.roll,
        studentName: profile.primary?.name || profile.roll,
        registeredAt: profile.createdAt || Date.now()
      });
      return {
        registered: true,
        roll: profile.roll,
        studentName: profile.primary?.name,
        profile
      };
    }

    // 3. Fallback check across portfolios collection
    const portSnap = await getDocs(query(collection(db, 'portfolios'), where('email', '==', normalized)));
    if (!portSnap.empty) {
      const portData = portSnap.docs[0].data() as Portfolio;
      await setDoc(regDocRef, {
        email: normalized,
        roll: portData.roll,
        studentName: portData.studentName || portData.roll,
        registeredAt: Date.now()
      });
      return {
        registered: true,
        roll: portData.roll,
        studentName: portData.studentName
      };
    }

    return { registered: false };
  } catch (err) {
    console.warn('Error checking email registration status:', err);
    // Secondary fallback
    const fallbackProfile = await findStudentProfileByEmail(normalized);
    if (fallbackProfile) {
      return {
        registered: true,
        roll: fallbackProfile.roll,
        studentName: fallbackProfile.primary?.name,
        profile: fallbackProfile
      };
    }
    return { registered: false };
  }
}

// Generates a secure, readable auto-generated temporary password, e.g. "TRD#8492"
export function generateAutoPassword(): string {
  const prefixes = ['TRD', 'BULL', 'FOLIO', 'ALPHA', 'MKT', 'APEX'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const symbols = ['#', '@', '$', '!'];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  return `${prefix}${symbol}${randomNum}`;
}

// Atomically registers a student and reserves their email (enforces one email = one account only)
export async function registerStudentWithKyc(
  studentId: string,
  email: string,
  primary: PersonDetails,
  nominees: Partial<PersonDetails>[],
  teamName: string,
  autoPassword?: string,
  googleUid?: string
): Promise<{ studentId: string; autoPassword: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedId = studentId.trim().toUpperCase();
  const cleanTeamName = (teamName || '').trim();
  const pass = autoPassword || generateAutoPassword();

  // 1. Strict duplicate check before writing
  const check = await checkEmailRegistrationStatus(normalizedEmail);
  if (check.registered && check.roll && check.roll !== normalizedId) {
    throw new Error(
      `This email address (${normalizedEmail}) is already registered under Student ID ${check.roll}. Each email can only be registered one time.`
    );
  }

  // 2. Reserve email in registered_emails collection
  const regDocRef = doc(db, 'registered_emails', encodeURIComponent(normalizedEmail));
  await setDoc(regDocRef, {
    email: normalizedEmail,
    roll: normalizedId,
    studentName: primary.name,
    teamName: cleanTeamName,
    registeredAt: Date.now()
  });

  // 3. Save student profile with generated credentials and mustChangePassword flag
  await saveStudentProfileToFirestore(normalizedId, {
    roll: normalizedId,
    teamName: cleanTeamName,
    primary,
    nominees,
    completed: true,
    googleUid: googleUid || '',
    email: normalizedEmail,
    password: pass,
    mustChangePassword: true,
    verified: true,
    verifiedAt: Date.now()
  });

  // 4. Initialize portfolio with starting capital and team name
  const portDocRef = doc(db, 'portfolios', normalizedId);
  const existingPort = await getDoc(portDocRef);
  if (!existingPort.exists()) {
    const initialPort = defaultPortfolio(normalizedId, primary.name, normalizedEmail, cleanTeamName);
    await setDoc(portDocRef, initialPort);
  } else {
    await updateDoc(portDocRef, {
      studentName: primary.name,
      teamName: cleanTeamName,
      email: normalizedEmail,
      isDeleted: false,
      lastActive: Date.now()
    });
  }

  return { studentId: normalizedId, autoPassword: pass };
}

// Verifies student credentials (User ID / Roll / Email + Password) for registered users
export async function verifyStudentCredentials(identifier: string, password: string): Promise<{
  success: boolean;
  profile?: StudentProfile;
  mustChangePassword?: boolean;
  error?: string;
}> {
  const cleanId = identifier.trim();
  const cleanPass = password.trim();
  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Please enter both your User ID / Email and Password.' };
  }

  let profile: StudentProfile | null = null;
  if (cleanId.includes('@')) {
    profile = await findStudentProfileByEmail(cleanId);
  } else {
    profile = await loadStudentProfileFromFirestore(cleanId.toUpperCase());
    if (!profile) {
      // Fallback search across student_profiles collection for roll or rollNumber
      const allSnap = await getDocs(collection(db, 'student_profiles'));
      for (const d of allSnap.docs) {
        const p = d.data() as StudentProfile;
        if (
          p.roll?.toUpperCase() === cleanId.toUpperCase() ||
          p.primary?.rollNumber?.toUpperCase() === cleanId.toUpperCase()
        ) {
          profile = p;
          break;
        }
      }
    }
  }

  if (!profile) {
    return { success: false, error: 'No student account found with this User ID or Email. Please register first.' };
  }

  if (!profile.password) {
    return {
      success: false,
      error: 'This account does not have a password set. Please sign in with your registered Google email.'
    };
  }

  if (profile.password !== cleanPass) {
    return { success: false, error: 'Incorrect password. Please verify and try again.' };
  }

  return {
    success: true,
    profile,
    mustChangePassword: !!profile.mustChangePassword
  };
}

// Updates student password and clears the mustChangePassword flag
export async function updateStudentPassword(roll: string, newPassword: string): Promise<void> {
  const cleanRoll = roll.trim().toUpperCase();
  const cleanPass = newPassword.trim();
  if (cleanPass.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }

  const profileRef = doc(db, 'student_profiles', cleanRoll);
  await updateDoc(profileRef, {
    password: cleanPass,
    mustChangePassword: false,
    updatedAt: Date.now()
  });
}

// Validates current password against Firestore profile and updates to new password
export async function changeStudentPassword(
  roll: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const cleanRoll = roll.trim().toUpperCase();
  const cleanCurrent = currentPassword.trim();
  const cleanNew = newPassword.trim();

  if (!cleanRoll) {
    return { success: false, error: 'User ID is missing.' };
  }
  if (!cleanCurrent) {
    return { success: false, error: 'Please enter your current password.' };
  }
  if (cleanNew.length < 4) {
    return { success: false, error: 'New password must be at least 4 characters long.' };
  }
  if (cleanCurrent === cleanNew) {
    return { success: false, error: 'New password must be different from your current password.' };
  }

  const profile = await loadStudentProfileFromFirestore(cleanRoll);
  if (!profile) {
    return { success: false, error: 'Student account not found in database.' };
  }

  // If a password exists on the profile, ensure currentPassword matches
  if (profile.password && profile.password !== cleanCurrent) {
    return { success: false, error: 'Incorrect current password. Please verify and try again.' };
  }

  await updateStudentPassword(cleanRoll, cleanNew);
  return { success: true };
}

// Unregisters an email so it could potentially be re-registered (e.g. if instructor purged the student)
export async function unregisterEmailInFirestore(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  try {
    const regDocRef = doc(db, 'registered_emails', encodeURIComponent(normalized));
    await deleteDoc(regDocRef);
  } catch (err) {
    console.warn('Error unregistering email:', err);
  }
}

