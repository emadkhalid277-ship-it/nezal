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

  try {
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
      await setDoc(userRef, newProfile);
      syncPublicPlayerProfile(user, {
        displayName: newProfile.displayName || undefined,
      }).catch(() => {});
      return newProfile;
    } else {
      const data = existingSnap.data() as UserProfileData;
      const mergedDisplayName = user.displayName || data.displayName || 'لاعب نِزال';
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
    console.warn('Could not sync user profile to Firestore (may need rules deployed):', err);
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'لاعب نِزال',
      photoURL: user.photoURL,
      role,
    };
  }
}

async function checkUserIsAdminDirect(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch {
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
    await markPresenceOfflineNow(uid).catch(() => {});
  }
  await signOut(auth);
}
