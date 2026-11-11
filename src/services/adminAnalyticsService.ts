import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserGameMatch } from '../types/match';

export interface AdminPlayerSummary {
  userId: string;
  userName: string;
  userEmail: string;
  registeredAt: number | null;
  totalMatches: number;
  completedMatches: number;
  inProgressMatches: number;
  lastPlayedAt: number;
  winsCount: number;
}

export interface AdminCategoryStat {
  categoryName: string;
  selectionCount: number;
  selectionPercentage: number;
  uniquePlayersCount: number;
}

export interface AdminAnalyticsData {
  players: AdminPlayerSummary[];
  categoryStats: AdminCategoryStat[];
  top10Categories: AdminCategoryStat[];
  bottom10Categories: AdminCategoryStat[];
  kpis: {
    totalPlayersWhoPlayed: number;
    totalMatchesStarted: number;
    totalMatchesCompleted: number;
    totalMatchesInProgress: number;
    activePlayersCount: number;
    avgMatchesPerPlayer: number;
    mostActivePlayer: { name: string; count: number } | null;
    mostVictoriousPlayer: { name: string; wins: number } | null;
  };
  matchesOverTime: { dateLabel: string; matchesCount: number; completedCount: number }[];
  completionPieData: { name: string; value: number; fill: string }[];
  rawMatchesCount: number;
}

export type TimeFilterOption = 'today' | '7d' | '30d' | '90d' | 'all';

// Helper to convert Firestore timestamp or number to Unix millis
export function getMillis(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val.toMillis && typeof val.toMillis === 'function') return val.toMillis();
  if (val.toDate && typeof val.toDate === 'function') return val.toDate().getTime();
  if (val.seconds) return val.seconds * 1000;
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

// 1. Fetch all raw matches for admin
export async function fetchAllMatchesForAdmin(): Promise<UserGameMatch[]> {
  try {
    const colRef = collection(db, 'userGameMatches');
    const snap = await getDocs(colRef);
    const matches: UserGameMatch[] = [];

    snap.forEach((docSnap) => {
      matches.push({
        id: docSnap.id,
        ...docSnap.data(),
      } as UserGameMatch);
    });

    // Also check legacy gameSessions collection to incorporate any past matches
    try {
      const legacyCol = collection(db, 'gameSessions');
      const legacySnap = await getDocs(legacyCol);
      const existingIds = new Set(matches.map((m) => m.id));

      legacySnap.forEach((docSnap) => {
        if (!existingIds.has(docSnap.id)) {
          const data = docSnap.data();
          const pseudoMatch: UserGameMatch = {
            id: docSnap.id,
            userId: data.userId || 'anonymous_legacy',
            userEmail: data.userEmail || null,
            userName: data.userName || null,
            status: 'completed',
            mode: 'local',
            teams: data.teams || [],
            selectedSubcategories: data.selectedSubcategories || [],
            activeTeamIndex: 0,
            usedTileKeys: Array.from({ length: data.totalQuestionsPlayed || 0 }).map((_, i) => `tile_${i}`),
            winnerTeamName: data.winnerTeamName,
            winnerScore: data.winnerScore,
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          };
          matches.push(pseudoMatch);
        }
      });
    } catch (e) {
      // ignore legacy session fetch if not available
    }

    // Sort descending by date
    matches.sort((a, b) => getMillis(b.updatedAt || b.createdAt) - getMillis(a.updatedAt || a.createdAt));

    return matches;
  } catch (error) {
    console.error('Failed to fetch matches for admin analytics:', error);
    return [];
  }
}

// 2. Fetch all registered users for admin
export async function fetchAllUsersMapForAdmin(): Promise<Map<string, { email?: string; displayName?: string; createdAt?: any }>> {
  const usersMap = new Map<string, { email?: string; displayName?: string; createdAt?: any }>();
  try {
    const colRef = collection(db, 'users');
    const snap = await getDocs(colRef);
    snap.forEach((docSnap) => {
      usersMap.set(docSnap.id, docSnap.data() as any);
    });
  } catch (e) {
    console.warn('Could not list users collection for admin:', e);
  }
  return usersMap;
}

// 3. Process matches and users into structured analytics with time filter
export function computeAdminAnalytics(
  allMatches: UserGameMatch[],
  usersMap: Map<string, { email?: string; displayName?: string; createdAt?: any }>,
  timeFilter: TimeFilterOption
): AdminAnalyticsData {
  const now = Date.now();
  let minTimestamp = 0;

  if (timeFilter === 'today') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    minTimestamp = startOfToday.getTime();
  } else if (timeFilter === '7d') {
    minTimestamp = now - 7 * 24 * 60 * 60 * 1000;
  } else if (timeFilter === '30d') {
    minTimestamp = now - 30 * 24 * 60 * 60 * 1000;
  } else if (timeFilter === '90d') {
    minTimestamp = now - 90 * 24 * 60 * 60 * 1000;
  } else {
    minTimestamp = 0; // all time
  }

  // Filter matches based on time window
  const matches = allMatches.filter((m) => {
    if (minTimestamp === 0) return true;
    const matchTime = getMillis(m.createdAt || m.updatedAt);
    return matchTime >= minTimestamp;
  });

  // Group by user
  const playerMap = new Map<string, {
    userId: string;
    userName: string;
    userEmail: string;
    registeredAt: number | null;
    totalMatches: number;
    completedMatches: number;
    inProgressMatches: number;
    lastPlayedAt: number;
    winsCount: number;
  }>();

  // Category counts
  const categoryCounts = new Map<string, { count: number; players: Set<string> }>();
  let totalCategorySelections = 0;

  matches.forEach((m) => {
    const userId = m.userId || 'guest';
    const matchTime = getMillis(m.createdAt || m.updatedAt);
    const isCompleted = m.status === 'completed';
    const isInProgress = m.status === 'in_progress';

    // User Profile lookup
    const userProfile = usersMap.get(userId);
    const email = m.userEmail || userProfile?.email || (userId !== 'guest' ? 'حساب مسجل' : 'ضيف');
    let name = m.userName || userProfile?.displayName;
    if (!name && email && email.includes('@')) {
      name = email.split('@')[0];
    }
    if (!name) {
      name = userId === 'guest' ? 'لاعب ضيف' : `مستخدم (${userId.slice(0, 6)})`;
    }

    const regAt = userProfile?.createdAt ? getMillis(userProfile.createdAt) : null;

    if (!playerMap.has(userId)) {
      playerMap.set(userId, {
        userId,
        userName: name,
        userEmail: email,
        registeredAt: regAt,
        totalMatches: 0,
        completedMatches: 0,
        inProgressMatches: 0,
        lastPlayedAt: 0,
        winsCount: 0,
      });
    }

    const player = playerMap.get(userId)!;
    player.totalMatches += 1;
    if (isCompleted) player.completedMatches += 1;
    if (isInProgress) player.inProgressMatches += 1;
    if (matchTime > player.lastPlayedAt) {
      player.lastPlayedAt = matchTime;
    }

    // Winner detection: if there is a winner and match is completed
    if (isCompleted && m.winnerTeamName) {
      player.winsCount += 1;
    }

    // Category analysis
    const cats = m.selectedSubcategories || [];
    cats.forEach((cat) => {
      const cleanCat = String(cat || '').trim();
      if (!cleanCat) return;

      totalCategorySelections += 1;
      if (!categoryCounts.has(cleanCat)) {
        categoryCounts.set(cleanCat, { count: 0, players: new Set() });
      }
      const cData = categoryCounts.get(cleanCat)!;
      cData.count += 1;
      cData.players.add(userId);
    });
  });

  const playersList: AdminPlayerSummary[] = Array.from(playerMap.values()).sort(
    (a, b) => b.totalMatches - a.totalMatches
  );

  // Category stats list
  const categoryStats: AdminCategoryStat[] = Array.from(categoryCounts.entries())
    .map(([catName, data]) => ({
      categoryName: catName,
      selectionCount: data.count,
      selectionPercentage:
        totalCategorySelections > 0
          ? Math.round((data.count / totalCategorySelections) * 1000) / 10
          : 0,
      uniquePlayersCount: data.players.size,
    }))
    .sort((a, b) => b.selectionCount - a.selectionCount);

  const top10Categories = categoryStats.slice(0, 10);
  const bottom10Categories = [...categoryStats].reverse().slice(0, 10);

  // KPIs
  const totalPlayersWhoPlayed = playersList.filter((p) => p.userId !== 'guest').length || playersList.length;
  const totalMatchesStarted = matches.length;
  const totalMatchesCompleted = matches.filter((m) => m.status === 'completed').length;
  const totalMatchesInProgress = matches.filter((m) => m.status === 'in_progress').length;

  // Active players in the selected window (played at least once)
  const activePlayersCount = playersList.length;

  const avgMatchesPerPlayer =
    totalPlayersWhoPlayed > 0
      ? Math.round((totalMatchesStarted / totalPlayersWhoPlayed) * 10) / 10
      : 0;

  const mostActive = playersList.length > 0 ? { name: playersList[0].userName, count: playersList[0].totalMatches } : null;

  const sortedByWins = [...playersList].sort((a, b) => b.winsCount - a.winsCount);
  const mostVictorious = sortedByWins.length > 0 && sortedByWins[0].winsCount > 0
    ? { name: sortedByWins[0].userName, wins: sortedByWins[0].winsCount }
    : null;

  // Matches over time (group by day or date string)
  const dateMap = new Map<string, { matchesCount: number; completedCount: number }>();

  matches.forEach((m) => {
    const time = getMillis(m.createdAt || m.updatedAt);
    if (!time) return;

    const d = new Date(time);
    const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;

    if (!dateMap.has(dateLabel)) {
      dateMap.set(dateLabel, { matchesCount: 0, completedCount: 0 });
    }
    const item = dateMap.get(dateLabel)!;
    item.matchesCount += 1;
    if (m.status === 'completed') {
      item.completedCount += 1;
    }
  });

  const matchesOverTime = Array.from(dateMap.entries())
    .map(([dateLabel, val]) => ({
      dateLabel,
      matchesCount: val.matchesCount,
      completedCount: val.completedCount,
    }))
    .slice(-14); // latest 14 data points

  const completionPieData = [
    { name: 'مكتملة', value: totalMatchesCompleted, fill: '#14543D' },
    { name: 'غير مكتملة', value: totalMatchesInProgress, fill: '#F07842' },
    {
      name: 'متوقفة',
      value: Math.max(0, totalMatchesStarted - totalMatchesCompleted - totalMatchesInProgress),
      fill: '#9CA3AF',
    },
  ].filter((d) => d.value > 0);

  return {
    players: playersList,
    categoryStats,
    top10Categories,
    bottom10Categories,
    kpis: {
      totalPlayersWhoPlayed,
      totalMatchesStarted,
      totalMatchesCompleted,
      totalMatchesInProgress,
      activePlayersCount,
      avgMatchesPerPlayer,
      mostActivePlayer: mostActive,
      mostVictoriousPlayer: mostVictorious,
    },
    matchesOverTime,
    completionPieData,
    rawMatchesCount: allMatches.length,
  };
}
