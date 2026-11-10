import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserGameMatch } from '../types/match';

const MATCHES_COLLECTION = 'userGameMatches';

export function generateMatchId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// 1. Save or update match progress in Firestore
export async function saveMatchProgressToFirestore(
  match: Partial<UserGameMatch> & { id: string; userId: string }
): Promise<void> {
  if (!match.userId || !match.id) return;

  try {
    const docRef = doc(db, MATCHES_COLLECTION, match.id);
    const existingSnap = await getDoc(docRef);

    const payload: any = {
      ...match,
      updatedAt: serverTimestamp(),
    };

    if (!existingSnap.exists()) {
      payload.createdAt = serverTimestamp();
    }

    if (match.status === 'completed' && !match.completedAt) {
      payload.completedAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    console.warn('Could not save match progress to Firestore:', error);
  }
}

// 2. Fetch the most recent active/incomplete match for a user
export async function fetchActiveIncompleteMatch(
  userId: string
): Promise<UserGameMatch | null> {
  if (!userId) return null;

  try {
    const colRef = collection(db, MATCHES_COLLECTION);
    const q = query(
      colRef,
      where('userId', '==', userId),
      where('status', '==', 'in_progress')
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const matches: UserGameMatch[] = [];
    snap.forEach((d) => {
      matches.push({ id: d.id, ...d.data() } as UserGameMatch);
    });

    // Sort by updatedAt or createdAt desc
    matches.sort((a, b) => {
      const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || 0);
      const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || 0);
      return timeB - timeA;
    });

    return matches[0] || null;
  } catch (error) {
    console.warn('Error fetching active incomplete match:', error);
    return null;
  }
}

// 3. Fetch all matches (completed, in_progress, abandoned) for a user
export async function fetchAllMatchesForUser(
  userId: string
): Promise<UserGameMatch[]> {
  if (!userId) return [];

  try {
    const colRef = collection(db, MATCHES_COLLECTION);
    const q = query(colRef, where('userId', '==', userId));

    const snap = await getDocs(q);
    const matches: UserGameMatch[] = [];

    snap.forEach((d) => {
      matches.push({ id: d.id, ...d.data() } as UserGameMatch);
    });

    // Sort by updatedAt or createdAt desc
    matches.sort((a, b) => {
      const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || 0);
      const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || 0);
      return timeB - timeA;
    });

    return matches;
  } catch (error) {
    console.warn('Error fetching user matches:', error);
    return [];
  }
}

// 4. Mark match as abandoned (when user confirms "لعبة جديدة")
export async function markMatchAbandoned(
  matchId: string,
  userId: string
): Promise<void> {
  if (!matchId || !userId) return;

  try {
    const docRef = doc(db, MATCHES_COLLECTION, matchId);
    await updateDoc(docRef, {
      status: 'abandoned',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Error marking match abandoned:', error);
  }
}

// 5. Mark match as completed
export async function markMatchCompleted(
  matchId: string,
  winnerTeamName: string,
  winnerScore: number
): Promise<void> {
  if (!matchId) return;

  try {
    const docRef = doc(db, MATCHES_COLLECTION, matchId);
    await updateDoc(docRef, {
      status: 'completed',
      winnerTeamName,
      winnerScore,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Error marking match completed:', error);
  }
}

// 6. Delete a match record from user history
export async function deleteMatchRecord(
  matchId: string,
  userId: string
): Promise<void> {
  if (!matchId || !userId) return;

  try {
    const docRef = doc(db, MATCHES_COLLECTION, matchId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('Error deleting match record:', error);
  }
}
