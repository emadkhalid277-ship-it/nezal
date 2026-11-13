import {
  collection,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEFAULT_SUBCATEGORIES } from '../data/categoriesAndSeed';
import { SubcategoryItem } from '../types/game';

export type TimeFilterOption = '7d' | '30d' | '90d' | 'all';
export type MatchModeFilter = 'all' | 'local' | 'online';
export type TimelineGranularity = 'daily' | 'weekly' | 'monthly';

export interface AdminUserProfile {
  email?: string;
  displayName?: string;
  createdAt?: any;
  lastLoginAt?: any;
}

export interface CanonicalParticipant {
  playerKey: string;
  userId: string | null;
  isRegisteredAccount: boolean;
  displayName: string;
  email: string | null;
  teamId: string | null;
  teamName: string | null;
  isHost: boolean;
  pickedCategories: string[];
}

export interface CanonicalTeam {
  id: string;
  name: string;
  color?: string;
  score: number;
  players?: string[];
}

export interface CategorySelectionEvent {
  categoryName: string;
  teamId: string | null;
  playerKeys: string[];
}

export interface CanonicalMatch {
  matchKey: string;
  sourceIds: string[];
  mode: 'local' | 'online';
  status: 'completed' | 'incomplete';
  rawStatus: string;
  roomCode?: string;
  createdAt: number;
  updatedAt: number;
  teams: CanonicalTeam[];
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  winnerScore: number;
  isTie: boolean;
  participants: CanonicalParticipant[];
  subcategoryNames: string[];
  teamSubcategoryNames: Record<string, string[]>;
  categorySelections: CategorySelectionEvent[];
  isUnclassified: boolean;
}

export interface AdminPlayerSummary {
  userId: string;
  isRegisteredAccount: boolean;
  userName: string;
  userEmail: string;
  registeredAt: number | null;
  firstActivityAt: number;
  totalMatches: number;
  localMatches: number;
  onlineMatches: number;
  completedMatches: number;
  incompleteMatches: number;
  winsCount: number;
  lossesCount: number;
  drawsCount: number;
  winRate: number;
  lastPlayedAt: number;
  mostPlayedCategory: string;
  mostPlayedCategoryCount: number;
  matchesLast30d: number;
}

export interface AdminCategoryStat {
  categoryName: string;
  selectionCount: number;
  matchesAppearedCount: number;
  uniquePlayersCount: number;
  selectionPercentage: number;
  localSelectionCount: number;
  onlineSelectionCount: number;
  localMatchesCount: number;
  onlineMatchesCount: number;
}

export interface TimelineBucket {
  dateLabel: string;
  sortKey: string;
  localCount: number;
  onlineCount: number;
  totalCount: number;
  completedCount: number;
}

export interface AdminAnalyticsData {
  players: AdminPlayerSummary[];
  registeredPlayersOnly: AdminPlayerSummary[];
  categoryStats: AdminCategoryStat[];
  topCategoriesAll: AdminCategoryStat[];
  topCategoriesLocal: AdminCategoryStat[];
  topCategoriesOnline: AdminCategoryStat[];
  bottom10Categories: AdminCategoryStat[];
  kpis: {
    totalMatches: number;
    totalLocalMatches: number;
    totalOnlineMatches: number;
    completedMatches: number;
    incompleteMatches: number;
    completionRate: number;
    totalUniquePlayers: number;
    localPlayersCount: number;
    onlinePlayersCount: number;
    registeredAccountsCount: number;
    unclassifiedMatchesCount: number;
    avgMatchesPerPlayer: number;
  };
  leaderboards: {
    mostPlayed: AdminPlayerSummary[];
    mostWins: AdminPlayerSummary[];
    highestWinRate: AdminPlayerSummary[];
    mostLocal: AdminPlayerSummary[];
    mostOnline: AdminPlayerSummary[];
    mostActiveLast30d: AdminPlayerSummary[];
  };
  matchesTimelineDaily: TimelineBucket[];
  matchesTimelineWeekly: TimelineBucket[];
  matchesTimelineMonthly: TimelineBucket[];
  playerGrowthTimeline: {
    dateLabel: string;
    newPlayers: number;
    cumulativePlayers: number;
  }[];
  localVsOnlineChartData: {
    metric: string;
    local: number;
    online: number;
  }[];
  completionPieData: {
    name: string;
    value: number;
    fill: string;
  }[];
  topActivePlayersChartData: {
    name: string;
    localMatches: number;
    onlineMatches: number;
    totalMatches: number;
    winsCount: number;
  }[];
  rawMatchesCount: number;
}

// Convert Firestore Timestamp, seconds object, ISO string, or number to Unix millis
export function getMillis(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') {
    return val > 0 && val < 1e12 ? val * 1000 : val;
  }
  if (val.toMillis && typeof val.toMillis === 'function') return val.toMillis();
  if (val.toDate && typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  const parsed = new Date(val).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Identify explicit test/dummy fixture docs that must be excluded
export function isTestOrDummyMatchDoc(docId: string, data: Record<string, any>): boolean {
  const id = String(docId || '').trim();
  if (!id) return true;
  if (/^(TEST_|test_session|dummy_|debug_)/i.test(id)) return true;
  if (data.isTest === true || data.isDummy === true) return true;

  const hasTeams = Array.isArray(data.teams) && data.teams.length > 0;
  const hasPlayers =
    data.players && typeof data.players === 'object' && Object.keys(data.players).length > 0;
  const hasSubcats =
    (Array.isArray(data.selectedSubcategories) && data.selectedSubcategories.length > 0) ||
    (Array.isArray(data.selectedSubcategoryIds) && data.selectedSubcategoryIds.length > 0);
  const hasRoomSignals = Boolean(data.code || data.roomCode || data.hostId);

  // Pure empty probe docs like { ok: true } or { test: 1 }
  if (!hasTeams && !hasPlayers && !hasSubcats && !hasRoomSignals) {
    return true;
  }

  return false;
}

// Build a subcategory ID -> Arabic Name lookup dictionary
export function buildSubcategoryResolver(
  passedSubcategories: SubcategoryItem[] = [],
  firestoreSubcategories: SubcategoryItem[] = []
): (raw: string) => string {
  const idToName = new Map<string, string>();
  const nameToCanonical = new Map<string, string>();

  const register = (sub: Partial<SubcategoryItem>) => {
    const id = String(sub.id || '').trim();
    const name = String(sub.name || '').trim();
    if (id && name) {
      idToName.set(id, name);
      idToName.set(id.toLowerCase(), name);
    }
    if (name) {
      nameToCanonical.set(name, name);
      nameToCanonical.set(name.replace(/\s+/g, ' ').trim(), name);
    }
  };

  DEFAULT_SUBCATEGORIES.forEach(register);
  firestoreSubcategories.forEach(register);
  passedSubcategories.forEach(register);

  return (raw: string): string => {
    const clean = String(raw || '').trim();
    if (!clean) return '';

    if (idToName.has(clean)) return idToName.get(clean)!;
    if (idToName.has(clean.toLowerCase())) return idToName.get(clean.toLowerCase())!;
    if (nameToCanonical.has(clean)) return nameToCanonical.get(clean)!;

    // Preserve unknown legacy ID cleanly as unclassified rather than silently dropping
    if (/^sub[-_]/i.test(clean)) {
      return `فئة غير مصنفة (${clean.slice(-4)})`;
    }

    return clean;
  };
}

function normalizeTeamOutcome(
  teams: CanonicalTeam[],
  rawWinnerTeamId?: string | null,
  rawWinnerTeamName?: string | null,
  rawWinnerScore?: number
): {
  isTie: boolean;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  winnerScore: number;
} {
  if (!Array.isArray(teams) || teams.length === 0) {
    return {
      isTie: false,
      winnerTeamId: rawWinnerTeamId || null,
      winnerTeamName: rawWinnerTeamName || null,
      winnerScore: Number(rawWinnerScore) || 0,
    };
  }

  const sorted = [...teams].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const topScore = Number(sorted[0]?.score) || 0;
  const secondScore = sorted.length >= 2 ? Number(sorted[1]?.score) || 0 : -Infinity;

  if (sorted.length >= 2 && topScore === secondScore) {
    return {
      isTie: true,
      winnerTeamId: null,
      winnerTeamName: 'تعادل',
      winnerScore: topScore,
    };
  }

  const winningTeam = sorted[0];
  return {
    isTie: false,
    winnerTeamId: winningTeam?.id || rawWinnerTeamId || null,
    winnerTeamName: winningTeam?.name || rawWinnerTeamName || null,
    winnerScore: winningTeam ? Number(winningTeam.score) || 0 : Number(rawWinnerScore) || 0,
  };
}

function isLikelyFirebaseUid(val: string | null | undefined): boolean {
  if (!val) return false;
  const s = String(val).trim();
  if (!s) return false;
  if (
    s === 'guest' ||
    s === 'anonymous_legacy' ||
    s === 'unclassified_legacy' ||
    s.startsWith('player_') ||
    s.startsWith('guest:')
  ) {
    return false;
  }
  return true;
}

function resolveUserDisplayInfo(
  uid: string | null,
  fallbackName: string | null | undefined,
  fallbackEmail: string | null | undefined,
  usersMap: Map<string, AdminUserProfile>
): { displayName: string; email: string | null } {
  const profile = uid ? usersMap.get(uid) : undefined;
  const email = fallbackEmail || profile?.email || null;
  let name = fallbackName || profile?.displayName || '';
  if (!name && email && email.includes('@')) {
    name = email.split('@')[0];
  }
  if (!name) {
    name = uid ? `مستخدم (${uid.slice(0, 6)})` : 'لاعب غير مصنف';
  }
  return { displayName: name.trim(), email };
}

export interface RawMatchCollections {
  userGameMatches: { id: string; data: Record<string, any> }[];
  gameSessions: { id: string; data: Record<string, any> }[];
  gameRooms: { id: string; data: Record<string, any> }[];
  subcategories: SubcategoryItem[];
}

// Fetch raw documents across all Firestore collections safely
export async function fetchRawMatchCollectionsForAdmin(): Promise<RawMatchCollections> {
  const result: RawMatchCollections = {
    userGameMatches: [],
    gameSessions: [],
    gameRooms: [],
    subcategories: [],
  };

  await Promise.all([
    getDocs(collection(db, 'userGameMatches'))
      .then((snap) => {
        snap.forEach((d) => result.userGameMatches.push({ id: d.id, data: d.data() }));
      })
      .catch((err) => console.warn('Admin analytics: could not read userGameMatches:', err)),

    getDocs(collection(db, 'gameSessions'))
      .then((snap) => {
        snap.forEach((d) => result.gameSessions.push({ id: d.id, data: d.data() }));
      })
      .catch((err) => console.warn('Admin analytics: could not read gameSessions:', err)),

    getDocs(collection(db, 'gameRooms'))
      .then((snap) => {
        snap.forEach((d) => result.gameRooms.push({ id: d.id, data: d.data() }));
      })
      .catch(() => {
        // legacy optional collection
      }),

    getDocs(collection(db, 'subcategories'))
      .then((snap) => {
        snap.forEach((d) =>
          result.subcategories.push({ id: d.id, ...d.data() } as SubcategoryItem)
        );
      })
      .catch(() => {
        // fallback to passed subcategories & defaults
      }),
  ]);

  return result;
}

// Fetch all registered user profiles (admin-protected in Firestore Rules)
export async function fetchAllUsersMapForAdmin(): Promise<Map<string, AdminUserProfile>> {
  const usersMap = new Map<string, AdminUserProfile>();
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach((docSnap) => {
      usersMap.set(docSnap.id, docSnap.data() as AdminUserProfile);
    });
  } catch (e) {
    console.warn('Could not list users collection for admin:', e);
  }
  return usersMap;
}

// Build deduplicated, unified CanonicalMatch[] from ALL Firestore collections
export function buildCanonicalMatches(
  raw: RawMatchCollections,
  usersMap: Map<string, AdminUserProfile>,
  passedSubcategories: SubcategoryItem[] = []
): CanonicalMatch[] {
  const resolveCategory = buildSubcategoryResolver(passedSubcategories, raw.subcategories);

  type RawDoc = { source: 'userGameMatches' | 'gameSessions' | 'gameRooms'; id: string; data: Record<string, any> };
  const onlineGroups = new Map<string, RawDoc[]>();
  const localUserMatches: RawDoc[] = [];
  const localSessionDocs: RawDoc[] = [];

  const classifyAndBucket = (
    source: 'userGameMatches' | 'gameSessions' | 'gameRooms',
    id: string,
    data: Record<string, any>
  ) => {
    if (isTestOrDummyMatchDoc(id, data)) return;

    const isOnlineDoc =
      source === 'gameRooms' ||
      data.mode === 'online' ||
      Boolean(data.roomCode) ||
      id.startsWith('room_') ||
      id.startsWith('online_') ||
      Boolean(data.code) ||
      Boolean(data.hostId) ||
      (data.players && typeof data.players === 'object' && Object.keys(data.players).length > 0);

    if (isOnlineDoc) {
      let roomCode = String(data.code || data.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        if (id.startsWith('room_')) {
          roomCode = id.slice(5).trim().toUpperCase();
        } else if (id.startsWith('online_')) {
          const parts = id.slice(7).split('_');
          roomCode = (parts[0] || id).trim().toUpperCase();
        } else {
          roomCode = id.trim().toUpperCase();
        }
      }
      if (!onlineGroups.has(roomCode)) {
        onlineGroups.set(roomCode, []);
      }
      onlineGroups.get(roomCode)!.push({ source, id, data });
    } else if (source === 'userGameMatches') {
      localUserMatches.push({ source, id, data });
    } else {
      localSessionDocs.push({ source, id, data });
    }
  };

  raw.userGameMatches.forEach((d) => classifyAndBucket('userGameMatches', d.id, d.data));
  raw.gameSessions.forEach((d) => classifyAndBucket('gameSessions', d.id, d.data));
  raw.gameRooms.forEach((d) => classifyAndBucket('gameRooms', d.id, d.data));

  const canonicalMatches: CanonicalMatch[] = [];

  // 1. Canonicalize Online Matches (deduplicated 1 match per roomCode)
  onlineGroups.forEach((docs, roomCode) => {
    // Prefer gameSessions/gameRooms doc as canonical room state
    const roomDoc =
      docs.find((d) => d.source === 'gameSessions') ||
      docs.find((d) => d.source === 'gameRooms') ||
      docs[0];
    const matchDocs = docs.filter((d) => d.source === 'userGameMatches');

    const primaryData = roomDoc.data;
    const allSourceIds = docs.map((d) => `${d.source}:${d.id}`);

    // Determine completion status accurately
    const rawRoomStatus = String(primaryData.status || 'lobby').toLowerCase();
    const anyCompleted =
      rawRoomStatus === 'finished' ||
      rawRoomStatus === 'completed' ||
      matchDocs.some((md) => String(md.data.status || '').toLowerCase() === 'completed');

    const status: 'completed' | 'incomplete' = anyCompleted ? 'completed' : 'incomplete';

    // Best teams array (prefer the source that has non-zero scores or roomDoc)
    let rawTeams: any[] = Array.isArray(primaryData.teams) ? primaryData.teams : [];
    for (const md of matchDocs) {
      if (Array.isArray(md.data.teams) && md.data.teams.length >= rawTeams.length) {
        const mdScoreSum = md.data.teams.reduce((s: number, t: any) => s + (Number(t.score) || 0), 0);
        const curScoreSum = rawTeams.reduce((s: number, t: any) => s + (Number(t.score) || 0), 0);
        if (mdScoreSum > curScoreSum || rawTeams.length === 0) {
          rawTeams = md.data.teams;
        }
      }
    }

    const teams: CanonicalTeam[] = rawTeams.map((t: any, idx: number) => ({
      id: String(t.id || `team_${idx + 1}`),
      name: String(t.name || `الفريق ${idx + 1}`),
      color: t.color,
      score: Number(t.score) || 0,
      players: Array.isArray(t.players) ? t.players : undefined,
    }));

    // Timestamps
    const createdTimes = docs
      .map((d) => getMillis(d.data.createdAt || d.data.updatedAt))
      .filter((t) => t > 0);
    const updatedTimes = docs
      .map((d) => getMillis(d.data.completedAt || d.data.updatedAt || d.data.createdAt))
      .filter((t) => t > 0);
    const createdAt = createdTimes.length > 0 ? Math.min(...createdTimes) : Date.now();
    const updatedAt = updatedTimes.length > 0 ? Math.max(...updatedTimes) : createdAt;

    // Categories resolution (teamSubcategoryIds + selectedSubcategoryIds + selectedSubcategories)
    const teamSubcategoryNames: Record<string, string[]> = {};
    const teamSubIdsMap: Record<string, string[]> = primaryData.teamSubcategoryIds || {};

    Object.entries(teamSubIdsMap).forEach(([teamId, rawIds]) => {
      if (Array.isArray(rawIds)) {
        const resolved = Array.from(
          new Set(rawIds.map((x) => resolveCategory(String(x))).filter(Boolean))
        );
        if (resolved.length > 0) {
          teamSubcategoryNames[teamId] = resolved;
        }
      }
    });

    const rawCatPool: string[] = [];
    if (Array.isArray(primaryData.selectedSubcategoryIds)) {
      rawCatPool.push(...primaryData.selectedSubcategoryIds);
    }
    if (Array.isArray(primaryData.selectedSubcategories)) {
      rawCatPool.push(...primaryData.selectedSubcategories);
    }
    Object.values(teamSubIdsMap).forEach((arr) => {
      if (Array.isArray(arr)) rawCatPool.push(...arr);
    });
    matchDocs.forEach((md) => {
      if (Array.isArray(md.data.selectedSubcategories)) {
        rawCatPool.push(...md.data.selectedSubcategories);
      }
    });

    const subcategoryNames = Array.from(
      new Set(rawCatPool.map((x) => resolveCategory(String(x))).filter(Boolean))
    );

    // Collect & deduplicate ALL participants in this online room
    const participantMap = new Map<string, CanonicalParticipant>();

    const upsertParticipant = (p: {
      rawId: string;
      userId?: string | null;
      name?: string | null;
      email?: string | null;
      teamId?: string | null;
      isHost?: boolean;
    }) => {
      const uid = isLikelyFirebaseUid(p.userId)
        ? String(p.userId).trim()
        : isLikelyFirebaseUid(p.rawId)
        ? String(p.rawId).trim()
        : null;

      const isRegistered = Boolean(uid);
      const playerKey = uid || `guest:${p.rawId || 'anonymous'}`;

      const { displayName, email } = resolveUserDisplayInfo(
        uid,
        p.name,
        p.email,
        usersMap
      );

      // Infer teamId if missing
      let resolvedTeamId = p.teamId || null;
      if (!resolvedTeamId && teams.length > 0) {
        const matchedTeamByPlayerName = teams.find(
          (t) => Array.isArray(t.players) && t.players.includes(displayName)
        );
        if (matchedTeamByPlayerName) {
          resolvedTeamId = matchedTeamByPlayerName.id;
        } else if (p.isHost) {
          resolvedTeamId = teams[0].id;
        }
      }

      const teamObj = resolvedTeamId ? teams.find((t) => t.id === resolvedTeamId) : undefined;
      const pickedCats =
        resolvedTeamId && teamSubcategoryNames[resolvedTeamId]?.length
          ? teamSubcategoryNames[resolvedTeamId]
          : subcategoryNames;

      const existing = participantMap.get(playerKey);
      if (existing) {
        if (!existing.email && email) existing.email = email;
        if (
          (existing.displayName.startsWith('مستخدم (') || existing.displayName === 'لاعب غير مصنف') &&
          displayName
        ) {
          existing.displayName = displayName;
        }
        if (!existing.teamId && resolvedTeamId) {
          existing.teamId = resolvedTeamId;
          existing.teamName = teamObj?.name || existing.teamName;
          existing.pickedCategories = pickedCats;
        }
        if (p.isHost) existing.isHost = true;
      } else {
        participantMap.set(playerKey, {
          playerKey,
          userId: uid,
          isRegisteredAccount: isRegistered,
          displayName,
          email,
          teamId: resolvedTeamId,
          teamName: teamObj?.name || null,
          isHost: Boolean(p.isHost),
          pickedCategories: pickedCats,
        });
      }
    };

    // From room.players map
    const playersObj = primaryData.players;
    if (playersObj && typeof playersObj === 'object') {
      Object.values(playersObj).forEach((rp: any) => {
        if (!rp || typeof rp !== 'object') return;
        upsertParticipant({
          rawId: String(rp.id || ''),
          userId: rp.userId || null,
          name: rp.name || null,
          teamId: rp.teamId || null,
          isHost: Boolean(rp.isHost || rp.id === primaryData.hostId),
        });
      });
    } else if (primaryData.hostId || primaryData.hostName) {
      upsertParticipant({
        rawId: String(primaryData.hostId || ''),
        userId: isLikelyFirebaseUid(primaryData.hostId) ? primaryData.hostId : null,
        name: primaryData.hostName || null,
        teamId: teams[0]?.id || 'team_1',
        isHost: true,
      });
    }

    // Also merge every userGameMatches doc tied to this roomCode (guarantees signed-in email & UID capture)
    matchDocs.forEach((md) => {
      const d = md.data;
      if (d.userId || d.userEmail || d.userName) {
        upsertParticipant({
          rawId: String(d.userId || md.id),
          userId: d.userId || null,
          name: d.userName || null,
          email: d.userEmail || null,
          isHost: d.userId && primaryData.hostId === d.userId,
        });
      }
    });

    const participants = Array.from(participantMap.values());

    // Build category selection events (attributed by team if teamSubcategoryNames present, else match-wide)
    const categorySelections: CategorySelectionEvent[] = [];
    const teamIdsWithPicks = Object.keys(teamSubcategoryNames);
    if (teamIdsWithPicks.length > 0) {
      teamIdsWithPicks.forEach((tId) => {
        const teamPlayers = participants
          .filter((p) => p.teamId === tId)
          .map((p) => p.playerKey);
        teamSubcategoryNames[tId].forEach((catName) => {
          categorySelections.push({
            categoryName: catName,
            teamId: tId,
            playerKeys: teamPlayers.length > 0 ? teamPlayers : participants.map((p) => p.playerKey),
          });
        });
      });
    } else {
      const allKeys = participants.map((p) => p.playerKey);
      subcategoryNames.forEach((catName) => {
        categorySelections.push({
          categoryName: catName,
          teamId: null,
          playerKeys: allKeys,
        });
      });
    }

    const outcome = normalizeTeamOutcome(
      teams,
      primaryData.winnerTeamId,
      primaryData.winnerTeamName,
      primaryData.winnerScore
    );

    const isUnclassified =
      participants.length === 0 ||
      participants.every((p) => !p.isRegisteredAccount) ||
      subcategoryNames.length === 0;

    canonicalMatches.push({
      matchKey: `online:${roomCode}`,
      sourceIds: allSourceIds,
      mode: 'online',
      status,
      rawStatus: rawRoomStatus,
      roomCode,
      createdAt,
      updatedAt,
      teams,
      winnerTeamId: status === 'completed' ? outcome.winnerTeamId : null,
      winnerTeamName: status === 'completed' ? outcome.winnerTeamName : null,
      winnerScore: status === 'completed' ? outcome.winnerScore : 0,
      isTie: status === 'completed' ? outcome.isTie : false,
      participants,
      subcategoryNames,
      teamSubcategoryNames,
      categorySelections,
      isUnclassified,
    });
  });

  // 2. Canonicalize Local Matches from userGameMatches
  const seenLocalSignatures: {
    id: string;
    userId: string | null;
    status: string;
    winnerTeamName: string | null;
    winnerScore: number;
    time: number;
    teamCount: number;
  }[] = [];

  const addLocalMatch = (
    source: 'userGameMatches' | 'gameSessions',
    id: string,
    data: Record<string, any>
  ) => {
    const rawStatus = String(data.status || (source === 'gameSessions' ? 'completed' : 'in_progress')).toLowerCase();
    const status: 'completed' | 'incomplete' =
      rawStatus === 'completed' || rawStatus === 'finished' ? 'completed' : 'incomplete';

    const teams: CanonicalTeam[] = Array.isArray(data.teams)
      ? data.teams.map((t: any, idx: number) => ({
          id: String(t.id || `team_${idx + 1}`),
          name: String(t.name || `الفريق ${idx + 1}`),
          color: t.color,
          score: Number(t.score) || 0,
          players: Array.isArray(t.players) ? t.players : undefined,
        }))
      : [];

    const createdAt = getMillis(data.createdAt || data.updatedAt || data.completedAt) || Date.now();
    const updatedAt = getMillis(data.completedAt || data.updatedAt || data.createdAt) || createdAt;

    const uid = isLikelyFirebaseUid(data.userId) ? String(data.userId).trim() : null;
    const isRegistered = Boolean(uid);
    const playerKey = uid || 'unclassified_legacy';

    const { displayName, email } = uid
      ? resolveUserDisplayInfo(uid, data.userName, data.userEmail, usersMap)
      : { displayName: 'جلسات قديمة / لاعب زائر', email: null };

    const rawCats: string[] = [];
    if (Array.isArray(data.selectedSubcategories)) rawCats.push(...data.selectedSubcategories);
    if (Array.isArray(data.selectedSubcategoryIds)) rawCats.push(...data.selectedSubcategoryIds);

    const subcategoryNames = Array.from(
      new Set(rawCats.map((c) => resolveCategory(String(c))).filter(Boolean))
    );

    const participant: CanonicalParticipant = {
      playerKey,
      userId: uid,
      isRegisteredAccount: isRegistered,
      displayName,
      email,
      teamId: teams[0]?.id || null,
      teamName: teams[0]?.name || null,
      isHost: true,
      pickedCategories: subcategoryNames,
    };

    const categorySelections: CategorySelectionEvent[] = subcategoryNames.map((catName) => ({
      categoryName: catName,
      teamId: null,
      playerKeys: [playerKey],
    }));

    const outcome = normalizeTeamOutcome(
      teams,
      data.winnerTeamId,
      data.winnerTeamName,
      data.winnerScore
    );

    const isUnclassified = !isRegistered || subcategoryNames.length === 0;

    canonicalMatches.push({
      matchKey: `local:${source}:${id}`,
      sourceIds: [`${source}:${id}`],
      mode: 'local',
      status,
      rawStatus,
      createdAt,
      updatedAt,
      teams,
      winnerTeamId: status === 'completed' ? outcome.winnerTeamId : null,
      winnerTeamName: status === 'completed' ? outcome.winnerTeamName : null,
      winnerScore: status === 'completed' ? outcome.winnerScore : 0,
      isTie: status === 'completed' ? outcome.isTie : false,
      participants: [participant],
      subcategoryNames,
      teamSubcategoryNames: {},
      categorySelections,
      isUnclassified,
    });

    seenLocalSignatures.push({
      id,
      userId: uid,
      status,
      winnerTeamName: outcome.winnerTeamName,
      winnerScore: outcome.winnerScore,
      time: updatedAt,
      teamCount: teams.length,
    });
  };

  localUserMatches.forEach((d) => addLocalMatch('userGameMatches', d.id, d.data));

  // 3. Merge Legacy / Non-duplicated Local gameSessions docs
  localSessionDocs.forEach((d) => {
    const data = d.data;
    const uid = isLikelyFirebaseUid(data.userId) ? String(data.userId).trim() : null;
    const time = getMillis(data.completedAt || data.createdAt);
    const teams: CanonicalTeam[] = Array.isArray(data.teams) ? data.teams : [];
    const outcome = normalizeTeamOutcome(teams, null, data.winnerTeamName, data.winnerScore);

    // Check if App.tsx already wrote a userGameMatches completed record for this exact local match
    const isDuplicateOfUserMatch = seenLocalSignatures.some((sig) => {
      if (sig.id === d.id) return true;
      if (!uid || sig.userId !== uid) return false;
      if (sig.status !== 'completed') return false;
      if (sig.teamCount !== teams.length) return false;
      if (sig.winnerScore !== outcome.winnerScore) return false;
      if (
        sig.winnerTeamName &&
        outcome.winnerTeamName &&
        sig.winnerTeamName !== outcome.winnerTeamName
      ) {
        return false;
      }
      return Math.abs(sig.time - time) <= 120_000;
    });

    if (!isDuplicateOfUserMatch) {
      addLocalMatch('gameSessions', d.id, data);
    }
  });

  // Sort newest first
  canonicalMatches.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  return canonicalMatches;
}

// Compute full AdminAnalyticsData with Mode Filter & Time Filter
export function computeAdminAnalytics(
  canonicalMatches: CanonicalMatch[],
  usersMap: Map<string, AdminUserProfile>,
  timeFilter: TimeFilterOption,
  modeFilter: MatchModeFilter = 'all'
): AdminAnalyticsData {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  let minTimestamp = 0;

  if (timeFilter === '7d') {
    minTimestamp = now - 7 * 24 * 60 * 60 * 1000;
  } else if (timeFilter === '30d') {
    minTimestamp = thirtyDaysAgo;
  } else if (timeFilter === '90d') {
    minTimestamp = now - 90 * 24 * 60 * 60 * 1000;
  }

  // Time-windowed matches (both modes kept here for Local vs Online comparison chart when modeFilter==='all', and filtered for active mode)
  const timeWindowMatches = canonicalMatches.filter((m) => {
    if (minTimestamp === 0) return true;
    const matchTime = m.createdAt || m.updatedAt;
    return matchTime >= minTimestamp;
  });

  const activeMatches =
    modeFilter === 'all'
      ? timeWindowMatches
      : timeWindowMatches.filter((m) => m.mode === modeFilter);

  // Aggregation maps
  interface MutablePlayerAgg {
    userId: string;
    isRegisteredAccount: boolean;
    userName: string;
    userEmail: string;
    registeredAt: number | null;
    firstActivityAt: number;
    totalMatches: number;
    localMatches: number;
    onlineMatches: number;
    completedMatches: number;
    incompleteMatches: number;
    winsCount: number;
    lossesCount: number;
    drawsCount: number;
    lastPlayedAt: number;
    matchesLast30d: number;
    categoryCounts: Map<string, number>;
  }

  const playerMap = new Map<string, MutablePlayerAgg>();
  const localPlayerKeys = new Set<string>();
  const onlinePlayerKeys = new Set<string>();

  const getOrInitPlayer = (p: CanonicalParticipant, matchTime: number): MutablePlayerAgg => {
    const existing = playerMap.get(p.playerKey);
    const userProfile = p.userId ? usersMap.get(p.userId) : undefined;
    const regAt = userProfile?.createdAt ? getMillis(userProfile.createdAt) : null;

    if (existing) {
      if (
        (existing.userEmail === 'غير متوفر' || existing.userEmail === 'حساب مسجل') &&
        p.email
      ) {
        existing.userEmail = p.email;
      }
      if (matchTime > 0 && (existing.firstActivityAt === 0 || matchTime < existing.firstActivityAt)) {
        existing.firstActivityAt = matchTime;
      }
      return existing;
    }

    const emailDisplay =
      p.email ||
      userProfile?.email ||
      (p.isRegisteredAccount ? 'غير مسجل البريد' : 'جلسة زائر / غير مصنف');

    const agg: MutablePlayerAgg = {
      userId: p.playerKey,
      isRegisteredAccount: p.isRegisteredAccount,
      userName: p.displayName,
      userEmail: emailDisplay,
      registeredAt: regAt,
      firstActivityAt: matchTime || regAt || 0,
      totalMatches: 0,
      localMatches: 0,
      onlineMatches: 0,
      completedMatches: 0,
      incompleteMatches: 0,
      winsCount: 0,
      lossesCount: 0,
      drawsCount: 0,
      lastPlayedAt: 0,
      matchesLast30d: 0,
      categoryCounts: new Map(),
    };
    playerMap.set(p.playerKey, agg);
    return agg;
  };

  interface MutableCategoryAgg {
    categoryName: string;
    selectionCount: number;
    matchKeys: Set<string>;
    playerKeys: Set<string>;
    localSelectionCount: number;
    onlineSelectionCount: number;
    localMatchKeys: Set<string>;
    onlineMatchKeys: Set<string>;
  }

  const categoryMap = new Map<string, MutableCategoryAgg>();
  let totalCategorySelections = 0;

  const ensureCategory = (catName: string): MutableCategoryAgg => {
    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, {
        categoryName: catName,
        selectionCount: 0,
        matchKeys: new Set(),
        playerKeys: new Set(),
        localSelectionCount: 0,
        onlineSelectionCount: 0,
        localMatchKeys: new Set(),
        onlineMatchKeys: new Set(),
      });
    }
    return categoryMap.get(catName)!;
  };

  // Process every active match ONCE
  let totalLocalMatches = 0;
  let totalOnlineMatches = 0;
  let completedMatches = 0;
  let incompleteMatches = 0;
  let unclassifiedMatchesCount = 0;

  let localCompleted = 0;
  let localIncomplete = 0;
  let onlineCompleted = 0;
  let onlineIncomplete = 0;

  activeMatches.forEach((m) => {
    const matchTime = m.updatedAt || m.createdAt;
    const isCompleted = m.status === 'completed';

    if (m.mode === 'local') {
      totalLocalMatches += 1;
      if (isCompleted) localCompleted += 1;
      else localIncomplete += 1;
    } else {
      totalOnlineMatches += 1;
      if (isCompleted) onlineCompleted += 1;
      else onlineIncomplete += 1;
    }

    if (isCompleted) completedMatches += 1;
    else incompleteMatches += 1;

    if (m.isUnclassified) unclassifiedMatchesCount += 1;

    // 1. Attribute match stats to each unique participant
    m.participants.forEach((p) => {
      const agg = getOrInitPlayer(p, m.createdAt || matchTime);
      agg.totalMatches += 1;
      if (m.mode === 'local') {
        agg.localMatches += 1;
        localPlayerKeys.add(p.playerKey);
      } else {
        agg.onlineMatches += 1;
        onlinePlayerKeys.add(p.playerKey);
      }

      if (isCompleted) {
        agg.completedMatches += 1;
      } else {
        agg.incompleteMatches += 1;
      }

      if (matchTime > agg.lastPlayedAt) {
        agg.lastPlayedAt = matchTime;
      }
      if (matchTime >= thirtyDaysAgo) {
        agg.matchesLast30d += 1;
      }

      // Outcome attribution ONLY for completed matches (Rule #5: never count incomplete as win/loss)
      if (isCompleted) {
        if (m.isTie) {
          agg.drawsCount += 1;
        } else if (m.mode === 'online') {
          if (p.teamId && m.winnerTeamId) {
            if (p.teamId === m.winnerTeamId) agg.winsCount += 1;
            else agg.lossesCount += 1;
          } else if (p.teamName && m.winnerTeamName) {
            if (p.teamName === m.winnerTeamName) agg.winsCount += 1;
            else agg.lossesCount += 1;
          }
        } else {
          // Local match completed on single account: Team 1 vs Team 2+
          if (m.teams.length >= 2) {
            const firstTeam = m.teams[0];
            if (firstTeam.id === m.winnerTeamId || firstTeam.name === m.winnerTeamName) {
              agg.winsCount += 1;
            } else {
              agg.lossesCount += 1;
            }
          } else if (m.winnerTeamName) {
            agg.winsCount += 1;
          }
        }
      }

      // Player's per-category frequency
      p.pickedCategories.forEach((catName) => {
        if (!catName) return;
        agg.categoryCounts.set(catName, (agg.categoryCounts.get(catName) || 0) + 1);
      });
    });

    // 2. Category statistics
    m.categorySelections.forEach((evt) => {
      const cleanName = evt.categoryName.trim();
      if (!cleanName) return;
      totalCategorySelections += 1;
      const cAgg = ensureCategory(cleanName);
      cAgg.selectionCount += 1;
      cAgg.matchKeys.add(m.matchKey);
      evt.playerKeys.forEach((pk) => cAgg.playerKeys.add(pk));

      if (m.mode === 'local') {
        cAgg.localSelectionCount += 1;
        cAgg.localMatchKeys.add(m.matchKey);
      } else {
        cAgg.onlineSelectionCount += 1;
        cAgg.onlineMatchKeys.add(m.matchKey);
      }
    });
  });

  // Also ensure 30-day activity across ALL matches (respecting modeFilter) so "Most Active Last 30d" stays accurate even if timeFilter is '7d'
  const last30dMap = new Map<string, number>();
  canonicalMatches
    .filter((m) => (modeFilter === 'all' ? true : m.mode === modeFilter))
    .filter((m) => (m.updatedAt || m.createdAt) >= thirtyDaysAgo)
    .forEach((m) => {
      m.participants.forEach((p) => {
        last30dMap.set(p.playerKey, (last30dMap.get(p.playerKey) || 0) + 1);
      });
    });

  // Finalize Players List
  const allPlayers: AdminPlayerSummary[] = Array.from(playerMap.values()).map((agg) => {
    const decided = agg.winsCount + agg.lossesCount + agg.drawsCount;
    const winRate = decided > 0 ? Math.round((agg.winsCount / decided) * 1000) / 10 : 0;

    let topCat = '—';
    let topCatCount = 0;
    agg.categoryCounts.forEach((cnt, name) => {
      if (cnt > topCatCount) {
        topCat = name;
        topCatCount = cnt;
      }
    });

    return {
      userId: agg.userId,
      isRegisteredAccount: agg.isRegisteredAccount,
      userName: agg.userName,
      userEmail: agg.userEmail,
      registeredAt: agg.registeredAt,
      firstActivityAt: agg.firstActivityAt,
      totalMatches: agg.totalMatches,
      localMatches: agg.localMatches,
      onlineMatches: agg.onlineMatches,
      completedMatches: agg.completedMatches,
      incompleteMatches: agg.incompleteMatches,
      winsCount: agg.winsCount,
      lossesCount: agg.lossesCount,
      drawsCount: agg.drawsCount,
      winRate,
      lastPlayedAt: agg.lastPlayedAt,
      mostPlayedCategory: topCat,
      mostPlayedCategoryCount: topCatCount,
      matchesLast30d:
        timeFilter === 'all' || timeFilter === '90d' || timeFilter === '30d'
          ? agg.matchesLast30d
          : last30dMap.get(agg.userId) || agg.matchesLast30d,
    };
  });

  allPlayers.sort((a, b) => b.totalMatches - a.totalMatches || b.lastPlayedAt - a.lastPlayedAt);
  const registeredPlayersOnly = allPlayers.filter((p) => p.isRegisteredAccount);

  // Leaderboards (prefer registered accounts; fallback to allPlayers if empty)
  const leaderboardBase = registeredPlayersOnly.length > 0 ? registeredPlayersOnly : allPlayers;

  const leaderboards = {
    mostPlayed: [...leaderboardBase]
      .sort((a, b) => b.totalMatches - a.totalMatches || b.winsCount - a.winsCount)
      .slice(0, 10),
    mostWins: [...leaderboardBase]
      .filter((p) => p.winsCount > 0)
      .sort((a, b) => b.winsCount - a.winsCount || b.winRate - a.winRate)
      .slice(0, 10),
    highestWinRate: [...leaderboardBase]
      .filter((p) => p.winsCount + p.lossesCount + p.drawsCount > 0)
      .sort(
        (a, b) =>
          b.winRate - a.winRate ||
          b.winsCount - a.winsCount ||
          b.completedMatches - a.completedMatches
      )
      .slice(0, 10),
    mostLocal: [...leaderboardBase]
      .filter((p) => p.localMatches > 0)
      .sort((a, b) => b.localMatches - a.localMatches || b.winsCount - a.winsCount)
      .slice(0, 10),
    mostOnline: [...leaderboardBase]
      .filter((p) => p.onlineMatches > 0)
      .sort((a, b) => b.onlineMatches - a.onlineMatches || b.winsCount - a.winsCount)
      .slice(0, 10),
    mostActiveLast30d: [...leaderboardBase]
      .filter((p) => p.matchesLast30d > 0)
      .sort((a, b) => b.matchesLast30d - a.matchesLast30d || b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 10),
  };

  // Finalize Category Stats
  const categoryStats: AdminCategoryStat[] = Array.from(categoryMap.values())
    .map((c) => ({
      categoryName: c.categoryName,
      selectionCount: c.selectionCount,
      matchesAppearedCount: c.matchKeys.size,
      uniquePlayersCount: c.playerKeys.size,
      selectionPercentage:
        totalCategorySelections > 0
          ? Math.round((c.selectionCount / totalCategorySelections) * 1000) / 10
          : 0,
      localSelectionCount: c.localSelectionCount,
      onlineSelectionCount: c.onlineSelectionCount,
      localMatchesCount: c.localMatchKeys.size,
      onlineMatchesCount: c.onlineMatchKeys.size,
    }))
    .sort((a, b) => b.selectionCount - a.selectionCount || b.matchesAppearedCount - a.matchesAppearedCount);

  const topCategoriesAll = categoryStats.slice(0, 10);
  const topCategoriesLocal = [...categoryStats]
    .filter((c) => c.localSelectionCount > 0)
    .sort((a, b) => b.localSelectionCount - a.localSelectionCount)
    .slice(0, 10);
  const topCategoriesOnline = [...categoryStats]
    .filter((c) => c.onlineSelectionCount > 0)
    .sort((a, b) => b.onlineSelectionCount - a.onlineSelectionCount)
    .slice(0, 10);
  const bottom10Categories = [...categoryStats].reverse().slice(0, 10);

  // KPIs
  const totalMatches = activeMatches.length;
  const totalUniquePlayers =
    registeredPlayersOnly.length > 0 ? registeredPlayersOnly.length : allPlayers.length;
  const registeredLocalCount = Array.from(localPlayerKeys).filter((k) =>
    playerMap.get(k)?.isRegisteredAccount
  ).length;
  const registeredOnlineCount = Array.from(onlinePlayerKeys).filter((k) =>
    playerMap.get(k)?.isRegisteredAccount
  ).length;

  const localPlayersCount =
    registeredPlayersOnly.length > 0 ? registeredLocalCount : localPlayerKeys.size;
  const onlinePlayersCount =
    registeredPlayersOnly.length > 0 ? registeredOnlineCount : onlinePlayerKeys.size;

  const completionRate =
    totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 1000) / 10 : 0;
  const avgMatchesPerPlayer =
    totalUniquePlayers > 0
      ? Math.round((totalMatches / totalUniquePlayers) * 10) / 10
      : 0;

  // Timeline Builders (Daily, Weekly, Monthly)
  const buildTimeline = (granularity: TimelineGranularity): TimelineBucket[] => {
    const map = new Map<string, TimelineBucket>();

    activeMatches.forEach((m) => {
      const ts = m.createdAt || m.updatedAt;
      if (!ts) return;
      const d = new Date(ts);

      let sortKey = '';
      let dateLabel = '';

      if (granularity === 'daily') {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        sortKey = `${y}-${mo}-${day}`;
        dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;
      } else if (granularity === 'weekly') {
        // Align to start of week (Saturday/Sunday)
        const weekStart = new Date(d);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(d.getDate() - d.getDay());
        const y = weekStart.getFullYear();
        const mo = String(weekStart.getMonth() + 1).padStart(2, '0');
        const day = String(weekStart.getDate()).padStart(2, '0');
        sortKey = `${y}-${mo}-${day}`;
        dateLabel = `أسبوع ${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      } else {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        sortKey = `${y}-${mo}`;
        const arabicMonths = [
          'يناير',
          'فبراير',
          'مارس',
          'أبريل',
          'مايو',
          'يونيو',
          'يوليو',
          'أغسطس',
          'سبتمبر',
          'أكتوبر',
          'نوفمبر',
          'ديسمبر',
        ];
        dateLabel = `${arabicMonths[d.getMonth()]} ${y}`;
      }

      if (!map.has(sortKey)) {
        map.set(sortKey, {
          sortKey,
          dateLabel,
          localCount: 0,
          onlineCount: 0,
          totalCount: 0,
          completedCount: 0,
        });
      }
      const bucket = map.get(sortKey)!;
      bucket.totalCount += 1;
      if (m.mode === 'local') bucket.localCount += 1;
      else bucket.onlineCount += 1;
      if (m.status === 'completed') bucket.completedCount += 1;
    });

    const sorted = Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return granularity === 'daily' ? sorted.slice(-21) : sorted.slice(-16);
  };

  // Player Growth Timeline (Cumulative players over time by earliest registration or first match)
  const buildPlayerGrowth = () => {
    const growthSource = leaderboardBase;
    const dayMap = new Map<string, { sortKey: string; dateLabel: string; count: number }>();

    growthSource.forEach((p) => {
      const ts = p.registeredAt || p.firstActivityAt || p.lastPlayedAt;
      if (!ts) return;
      if (minTimestamp > 0 && ts < minTimestamp) return;
      const d = new Date(ts);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const sortKey = `${y}-${mo}-${day}`;
      const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;
      if (!dayMap.has(sortKey)) {
        dayMap.set(sortKey, { sortKey, dateLabel, count: 0 });
      }
      dayMap.get(sortKey)!.count += 1;
    });

    // Baseline before time window
    const baseline =
      minTimestamp > 0
        ? growthSource.filter((p) => {
            const ts = p.registeredAt || p.firstActivityAt || p.lastPlayedAt;
            return ts > 0 && ts < minTimestamp;
          }).length
        : 0;

    let cumulative = baseline;
    return Array.from(dayMap.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((item) => {
        cumulative += item.count;
        return {
          dateLabel: item.dateLabel,
          newPlayers: item.count,
          cumulativePlayers: cumulative,
        };
      })
      .slice(-21);
  };

  // Local vs Online Comparison Chart Data
  const localVsOnlineChartData = [
    { metric: 'إجمالي المباريات', local: totalLocalMatches, online: totalOnlineMatches },
    { metric: 'المكتملة', local: localCompleted, online: onlineCompleted },
    { metric: 'غير المكتملة', local: localIncomplete, online: onlineIncomplete },
    { metric: 'اللاعبون المشاركون', local: localPlayersCount, online: onlinePlayersCount },
  ];

  const completionPieData = [
    { name: 'مكتملة', value: completedMatches, fill: '#14543D' },
    { name: 'غير مكتملة', value: incompleteMatches, fill: '#F07842' },
  ].filter((d) => d.value > 0);

  const topActivePlayersChartData = leaderboards.mostPlayed.slice(0, 8).map((p) => ({
    name: p.userName.length > 16 ? `${p.userName.slice(0, 15)}..` : p.userName,
    localMatches: p.localMatches,
    onlineMatches: p.onlineMatches,
    totalMatches: p.totalMatches,
    winsCount: p.winsCount,
  }));

  return {
    players: allPlayers,
    registeredPlayersOnly,
    categoryStats,
    topCategoriesAll,
    topCategoriesLocal,
    topCategoriesOnline,
    bottom10Categories,
    kpis: {
      totalMatches,
      totalLocalMatches,
      totalOnlineMatches,
      completedMatches,
      incompleteMatches,
      completionRate,
      totalUniquePlayers,
      localPlayersCount,
      onlinePlayersCount,
      registeredAccountsCount: registeredPlayersOnly.length,
      unclassifiedMatchesCount,
      avgMatchesPerPlayer,
    },
    leaderboards,
    matchesTimelineDaily: buildTimeline('daily'),
    matchesTimelineWeekly: buildTimeline('weekly'),
    matchesTimelineMonthly: buildTimeline('monthly'),
    playerGrowthTimeline: buildPlayerGrowth(),
    localVsOnlineChartData,
    completionPieData,
    topActivePlayersChartData,
    rawMatchesCount: canonicalMatches.length,
  };
}

// Subscribe to live Firestore changes on match collections (debounced so updates appear automatically)
export function subscribeToAdminMatchUpdates(onChange: () => void): () => void {
  let timer: number | null = null;
  let initialSessions = true;
  let initialUserMatches = true;

  const trigger = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      onChange();
    }, 1200);
  };

  const unsubSessions = onSnapshot(
    collection(db, 'gameSessions'),
    () => {
      if (initialSessions) {
        initialSessions = false;
        return;
      }
      trigger();
    },
    () => {
      // ignore passive listener errors
    }
  );

  const unsubUserMatches = onSnapshot(
    collection(db, 'userGameMatches'),
    () => {
      if (initialUserMatches) {
        initialUserMatches = false;
        return;
      }
      trigger();
    },
    () => {
      // ignore passive listener errors
    }
  );

  return () => {
    if (timer) window.clearTimeout(timer);
    unsubSessions();
    unsubUserMatches();
  };
}
