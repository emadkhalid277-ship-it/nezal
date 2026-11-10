import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserMatchRecord } from '../types/match';

const MATCHES_COLLECTION = 'userMatches';
const ACTIVE_MATCH_STORAGE_KEY = 'nizal_active_match_id_v1';

export function getStoredActiveMatchId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_MATCH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredActiveMatchId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_MATCH_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function generateMatchId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Save or update match progress in Firestore
export async function saveMatchProgressToFirestore(
  match: UserMatchRecord
): Promise<void> {
  if (!match.userId || !match.id) return;

  const docRef = doc(db, MATCHES_COLLECTION, match.id);

  try {
    const docSnap = await getDoc(docRef);
    const isNew = !docSnap.exists();

    const payload: any = {
      id: match.id,
      userId: match.userId,
      userEmail: match.userEmail || null,
      userName: match.userName || null,
      mode: match.mode || 'local',
      status: match.status,
      activePage: match.activePage,
      isGameLocked: match.isGameLocked,
      teams: match.teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        players: t.players || [],
        score: t.score,
      })),
      teamSubcategoryIds: match.teamSubcategoryIds || {},
      selectingTeamIndex: match.selectingTeamIndex,
      timerDuration: match.timerDuration,
      activeTeamIndex: match.activeTeamIndex,
      usedTileKeys: match.usedTileKeys || [],
      roundUsedQuestionIds: match.roundUsedQuestionIds || [],
      usedQuestionIds: match.usedQuestionIds || [],
      selectedSubcategories: match.selectedSubcategories || [],
      activeQuestion: match.activeQuestion || null,
      totalQuestionsPlayed: match.totalQuestionsPlayed || 0,
      winnerTeamName: match.winnerTeamName || null,
      winnerScore: match.winnerScore || 0,
      roomId: match.roomId || null,
      updatedAt: serverTimestamp(),
    };

    if (isNew) {
      payload.createdAt = serverTimestamp();
    }

    if (match.status === 'completed' && !payload.completedAt) {
      payload.completedAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });
    setStoredActiveMatchId(match.id);
  } catch (error) {
    console.warn('Failed to save match progress to Firestore:', error);
  }
}

// Fetch the most recently updated unfinished match for a user
export async function fetchLatestUnfinishedMatch(
  userId: string
): Promise<UserMatchRecord | null> {
  if (!userId) return null;

  try {
    const q = query(
      collection(db, MATCHES_COLLECTION),
      where('userId', '==', userId),
      where('status', '==', 'in_progress')
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const matches: UserMatchRecord[] = [];
    snapshot.forEach((docSnap) => {
      matches.push(docSnap.data() as UserMatchRecord);
    });

    // Sort by updatedAt descending
    matches.sort((a, b) => {
      const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || 0);
      const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || 0);
      return Number(timeB) - Number(timeA);
    });

    return matches[0] || null;
  } catch (error) {
    console.warn('Failed to fetch unfinished match:', error);
    return null;
  }
}

// Fetch all matches for the user (history)
export async function fetchAllUserMatches(
  userId: string
): Promise<UserMatchRecord[]> {
  if (!userId) return [];

  try {
    const q = query(
      collection(db, MATCHES_COLLECTION),
      where('userId', '==', userId)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    const matches: UserMatchRecord[] = [];
    snapshot.forEach((docSnap) => {
      matches.push(docSnap.data() as UserMatchRecord);
    });

    // Sort newest first
    matches.sort((a, b) => {
      const timeA = a.updatedAt?.toMillis
        ? a.updatedAt.toMillis()
        : a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : 0;
      const timeB = b.updatedAt?.toMillis
        ? b.updatedAt.toMillis()
        : b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : 0;
      return Number(timeB) - Number(timeA);
    });

    return matches;
  } catch (error) {
    console.warn('Failed to fetch user matches:', error);
    return [];
  }
}

// Mark match as abandoned when user explicitly chooses "لعبة جديدة"
export async function abandonMatchInFirestore(
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
    console.warn('Failed to mark match abandoned:', error);
  }
}

// Complete match when game ends
export async function completeMatchInFirestore(
  matchId: string,
  winnerTeamName: string,
  winnerScore: number,
  totalQuestionsPlayed: number
): Promise<void> {
  if (!matchId) return;

  try {
    const docRef = doc(db, MATCHES_COLLECTION, matchId);
    await updateDoc(docRef, {
      status: 'completed',
      winnerTeamName,
      winnerScore,
      totalQuestionsPlayed,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Failed to complete match in Firestore:', error);
  }
}

// Delete match from history
export async function deleteMatchFromFirestore(matchId: string): Promise<void> {
  if (!matchId) return;

  try {
    const docRef = doc(db, MATCHES_COLLECTION, matchId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('Failed to delete match from Firestore:', error);
  }
}
