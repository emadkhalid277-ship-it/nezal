import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  getDocFromServer,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  markPresenceOfflineNow,
  syncPublicPlayerProfile,
} from '../services/presenceService';
import {
  isFirestoreQuotaExceededError,
  isFirestoreQuotaPaused,
  trackFirestoreOp,
  triggerFirestoreQuotaCooldown,
} from '../utils/firestoreDiagnostics';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

// Connect to default Firestore if firestoreDatabaseId is empty or '(default)'
export const db =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Optional Analytics
export let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  isSupported().then((supported) => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch {
        // ignore analytics init error in restricted iframes
      }
    }
  });
}

export const BOOTSTRAPPED_ADMIN_EMAIL = 'emadkhalid277@gmail.com';

export interface UserProfileData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'user';
  createdAt?: any;
  lastLoginAt?: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isUserAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
}

// Automatically save/update user profile in Firestore upon sign in
export async function syncUserProfile(user: User): Promise<UserProfileData> {
  const userRef = doc(db, 'users', user.uid);
  const isAdminUser =
    isUserAdminEmail(user.email) ||
    (await checkUserIsAdminDirect(user.uid));

  const role: 'admin' | 'user' = isAdminUser ? 'admin' : 'user';

  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('auth_profile', 'dedup_skip', 1, 'quota_paused_syncUserProfile');
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'لاعب نِزال',
      photoURL: user.photoURL,
      role,
    };
  }

  try {
    trackFirestoreOp('auth_profile', 'read', 1, 'users_profile');
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      const newProfile: UserProfileData = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'لاعب نِزال',
        photoURL: user.photoURL || '',
        role,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };
      trackFirestoreOp('auth_profile', 'write', 1, 'users_profile_create');
      await setDoc(userRef, newProfile);
      syncPublicPlayerProfile(user, {
        displayName: newProfile.displayName || undefined,
      }).catch(() => {});
      return newProfile;
    } else {
      const data = existingSnap.data() as UserProfileData;
      const mergedDisplayName = user.displayName || data.displayName || 'لاعب نِزال';
      trackFirestoreOp('auth_profile', 'write', 1, 'users_profile_update');
      await setDoc(
        userRef,
        {
          displayName: mergedDisplayName,
          photoURL: user.photoURL || data.photoURL || '',
          lastLoginAt: serverTimestamp(),
          role: data.role === 'admin' || isAdminUser ? 'admin' : 'user',
        },
        { merge: true }
      );
      syncPublicPlayerProfile(user, {
        displayName: mergedDisplayName,
      }).catch(() => {});
      return {
        ...data,
        role: data.role === 'admin' || isAdminUser ? 'admin' : 'user',
      };
    }
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('auth_profile', err);
    } else {
      console.warn('Could not sync user profile to Firestore (may need rules deployed):', err);
    }
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'لاعب نِزال',
      photoURL: user.photoURL,
      role,
    };
  }
}

const ADMIN_CHECK_CACHE_TTL_MS = 5 * 60 * 1000;
const adminCheckCache = new Map<string, { value: boolean; expiresAt: number }>();

async function checkUserIsAdminDirect(uid: string): Promise<boolean> {
  const cached = adminCheckCache.get(uid);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    trackFirestoreOp('auth_profile', 'cache_hit', 1, 'admins_check');
    return cached.value;
  }
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('auth_profile', 'dedup_skip', 1, 'quota_paused_checkAdmin');
    return false;
  }
  try {
    trackFirestoreOp('auth_profile', 'read', 1, 'admins_check');
    const snap = await getDoc(doc(db, 'admins', uid));
    const isAdminDoc = snap.exists();
    adminCheckCache.set(uid, {
      value: isAdminDoc,
      expiresAt: now + ADMIN_CHECK_CACHE_TTL_MS,
    });
    return isAdminDoc;
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('auth_profile', err);
    }
    return false;
  }
}

export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.email) return false;
  if (isUserAdminEmail(user.email)) return true;
  return checkUserIsAdminDirect(user.uid);
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await syncUserProfile(result.user);
  return result.user;
}

export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  await syncUserProfile(result.user);
  return result.user;
}

export async function registerWithEmail(
  email: string,
  pass: string,
  displayName: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName) {
    try {
      await updateProfile(result.user, { displayName });
    } catch {
      // ignore
    }
  }
  await syncUserProfile(result.user);
  return result.user;
}

export async function resetUserPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) {
    adminCheckCache.delete(uid);
    await markPresenceOfflineNow(uid).catch(() => {});
  }
  await signOut(auth);
}
