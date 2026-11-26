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
import {
  isFirestoreQuotaExceededError,
  isFirestoreQuotaPaused,
  trackFirestoreOp,
  triggerFirestoreQuotaCooldown,
} from '../utils/firestoreDiagnostics';

const MATCHES_COLLECTION = 'userGameMatches';

const knownCreatedMatchIds = new Set<string>();
const lastSavedMatchSignatures = new Map<string, string>();

export function clearMatchServiceCachesForTest(): void {
  knownCreatedMatchIds.clear();
  lastSavedMatchSignatures.clear();
}

function buildMatchSyncSignature(
  match: Partial<UserGameMatch> & { id: string; userId: string }
): string {
  const teamsSig = Array.isArray(match.teams)
    ? match.teams.map((t) => `${t.id}:${t.score}`).join(',')
    : '';
  const usedCount = Array.isArray(match.usedTileKeys) ? match.usedTileKeys.length : 0;
  const activeKey = match.activeQuestionState?.tileKey || '';
  const revealed = match.activeQuestionState?.answerRevealed ? 1 : 0;
  return `${match.status || ''}|${teamsSig}|${usedCount}|${match.activeTeamIndex ?? ''}|${activeKey}|${revealed}|${match.winnerTeamName || ''}|${match.winnerScore ?? ''}`;
}

export function generateMatchId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// 1. Save or update match progress in Firestore (deduped + read-minimized)
export async function saveMatchProgressToFirestore(
  match: Partial<UserGameMatch> & { id: string; userId: string }
): Promise<void> {
  if (!match.userId || !match.id) return;
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('match_sync', 'dedup_skip', 1, 'quota_paused');
    return;
  }

  const nextSignature = buildMatchSyncSignature(match);
  if (lastSavedMatchSignatures.get(match.id) === nextSignature) {
    trackFirestoreOp('match_sync', 'dedup_skip', 1, match.id);
    return;
  }

  try {
    const docRef = doc(db, MATCHES_COLLECTION, match.id);
    let exists = knownCreatedMatchIds.has(match.id);
    if (!exists) {
      trackFirestoreOp('match_sync', 'read', 1, match.id);
      const existingSnap = await getDoc(docRef);
      exists = existingSnap.exists();
      if (exists) {
        knownCreatedMatchIds.add(match.id);
      }
    }

    const payload: any = {
      ...match,
      updatedAt: serverTimestamp(),
    };

    if (!exists) {
      payload.createdAt = serverTimestamp();
    }

    if (match.status === 'completed' && !match.completedAt) {
      payload.completedAt = serverTimestamp();
    }

    trackFirestoreOp('match_sync', 'write', 1, match.id);
    await setDoc(docRef, payload, { merge: true });
    knownCreatedMatchIds.add(match.id);
    lastSavedMatchSignatures.set(match.id, nextSignature);
  } catch (error) {
    if (isFirestoreQuotaExceededError(error)) {
      triggerFirestoreQuotaCooldown('match_sync', error);
      return;
    }
    console.warn('Could not save match progress to Firestore:', error);
  }
}

// 2. Fetch the most recent active/incomplete match for a user
export async function fetchActiveIncompleteMatch(
  userId: string
): Promise<UserGameMatch | null> {
  if (!userId) return null;
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('match_sync', 'dedup_skip', 1, 'quota_paused_fetch_incomplete');
    return null;
  }

  try {
    const colRef = collection(db, MATCHES_COLLECTION);
    const q = query(
      colRef,
      where('userId', '==', userId),
      where('status', '==', 'in_progress')
    );

    trackFirestoreOp('match_sync', 'read', 1, 'fetchActiveIncompleteMatch');
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const matches: UserGameMatch[] = [];
    snap.forEach((d) => {
      knownCreatedMatchIds.add(d.id);
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
    if (isFirestoreQuotaExceededError(error)) {
      triggerFirestoreQuotaCooldown('match_sync', error);
      return null;
    }
    console.warn('Error fetching active incomplete match:', error);
    return null;
  }
}

// 3. Fetch all matches (completed, in_progress, abandoned, both local and online) for a user
export async function fetchAllMatchesForUser(
  userId: string
): Promise<UserGameMatch[]> {
  if (!userId) return [];

  try {
    const matchesMap = new Map<string, UserGameMatch>();

    // 1. Fetch from userGameMatches
    try {
      const colRef = collection(db, MATCHES_COLLECTION);
      const q = query(colRef, where('userId', '==', userId));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data = d.data();
        const mode = data.mode || (data.roomCode ? 'online' : 'local');
        matchesMap.set(d.id, {
          id: d.id,
          ...data,
          mode,
        } as UserGameMatch);
      });
    } catch (err) {
      console.warn('Error reading from userGameMatches:', err);
    }

    // 2. Fetch from gameSessions (local match history)
    try {
      const legacyCol = collection(db, 'gameSessions');
      const qLegacy = query(legacyCol, where('userId', '==', userId));
      const snapLegacy = await getDocs(qLegacy);
      snapLegacy.forEach((d) => {
        // If this match is already in userGameMatches or is a social doc, skip
        if (matchesMap.has(d.id) || d.id.startsWith('soc_')) return;
        const data = d.data();
        if (data?.socialDocType) return;
        const teams = Array.isArray(data.teams) ? data.teams : [];
        const matchTitle =
          data.matchTitle ||
          (teams.length >= 2 ? `${teams[0].name} ضد ${teams[1].name}` : 'مباراة نِزال محلية');

        matchesMap.set(d.id, {
          id: d.id,
          userId: data.userId || userId,
          matchTitle,
          status: 'completed',
          mode: 'local',
          teams,
          selectedSubcategories: Array.isArray(data.selectedSubcategories)
            ? data.selectedSubcategories
            : [],
          activeTeamIndex: 0,
          usedTileKeys: [],
          totalQuestionsPlayed: data.totalQuestionsPlayed || 0,
          winnerTeamName: data.winnerTeamName || undefined,
          winnerScore: data.winnerScore || undefined,
          createdAt: data.createdAt,
          updatedAt: data.completedAt || data.createdAt,
          completedAt: data.completedAt || data.createdAt,
        } as UserGameMatch);
      });
    } catch (err) {
      console.warn('Error reading legacy gameSessions:', err);
    }

    const matches: UserGameMatch[] = Array.from(matchesMap.values());

    // Helper to safely extract milliseconds from any date representation
    const getTime = (m: UserGameMatch): number => {
      const ts = m.updatedAt || m.createdAt || m.completedAt;
      if (!ts) return 0;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') return new Date(ts).getTime();
      return 0;
    };

    // Sort by most recent timestamp descending
    matches.sort((a, b) => getTime(b) - getTime(a));

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
    // Might be in gameSessions
    try {
      const legacyRef = doc(db, 'gameSessions', matchId);
      await deleteDoc(legacyRef);
    } catch (e) {
      console.warn('Error deleting match record:', e);
    }
  }
}
