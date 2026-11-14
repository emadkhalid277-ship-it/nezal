import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteField,
  runTransaction,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import {
  ActiveQuestionState,
  OnlineGameRoom,
  PlayerRequest,
  RoomPlayer,
  RoomSpectator,
  RoomStatus,
  RoomTeam,
} from '../types/multiplayer';
import { TEAM_COLOR_OPTIONS } from '../data/categoriesAndSeed';

// Primary Firestore collection for persistent room synchronization
// Uses gameSessions for full compatibility with existing Firestore security rules
const ROOMS_COLLECTION = 'gameSessions';
const ROOM_DOC_PREFIX = 'room_';
const PLAYER_STORAGE_KEY = 'nizal_mp_player_v1';

export function getRoomDoc(code: string) {
  const clean = (code || '').trim().toUpperCase();
  return doc(db, ROOMS_COLLECTION, `${ROOM_DOC_PREFIX}${clean}`);
}

export interface PersistentPlayerProfile {
  id: string;
  name: string;
}

// Generate persistent unique player profile for current browser session
export function getOrCreatePlayerProfile(user?: User | null, defaultName?: string): PersistentPlayerProfile {
  try {
    const saved = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.id === 'string' && parsed.id) {
        if (user && user.uid) {
          parsed.id = user.uid;
        }
        if (user && user.displayName && (!parsed.name || parsed.name.startsWith('لاعب'))) {
          parsed.name = user.displayName;
        }
        if (defaultName && defaultName.trim()) {
          parsed.name = defaultName.trim();
        }
        localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(parsed));
        return parsed;
      }
    }
  } catch {
    // fallback
  }

  const generatedId = user?.uid || `player_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  const initialName =
    defaultName?.trim() ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    `لاعب ${Math.floor(100 + Math.random() * 900)}`;

  const profile: PersistentPlayerProfile = {
    id: generatedId,
    name: initialName,
  };

  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }

  return profile;
}

export function savePlayerName(name: string) {
  try {
    const profile = getOrCreatePlayerProfile();
    profile.name = name.trim();
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

// Generate a random 6-character clean room code (uppercase, letters & digits)
export function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // excludes confusing 0, O, 1, I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const DEFAULT_ONLINE_TEAMS: RoomTeam[] = [
  {
    id: 'team_1',
    name: 'فريق طويق',
    color: '#14543D',
    score: 0,
  },
  {
    id: 'team_2',
    name: 'فريق الصقور',
    color: '#F07842',
    score: 0,
  },
  {
    id: 'team_3',
    name: 'فريق العارض',
    color: '#1E3A5F',
    score: 0,
  },
  {
    id: 'team_4',
    name: 'فريق النخبة',
    color: '#8C2D38',
    score: 0,
  },
];

export interface CreateRoomParams {
  hostName: string;
  user?: User | null;
  teamCount: number; // 2 to 4
  timerDuration?: number;
  customTeams?: { name: string; color: string }[];
}

// 1. Create a new Room in Firestore
export async function createOnlineRoom(params: CreateRoomParams): Promise<OnlineGameRoom> {
  const playerProfile = getOrCreatePlayerProfile(params.user, params.hostName);
  const code = generateRoomCode();
  const roomRef = getRoomDoc(code);

  const teamCount = Math.max(2, Math.min(4, params.teamCount || 2));
  const teams: RoomTeam[] = [];

  for (let i = 0; i < teamCount; i++) {
    const custom = params.customTeams && params.customTeams[i];
    const defaultTemplate = DEFAULT_ONLINE_TEAMS[i] || {
      id: `team_${i + 1}`,
      name: `الفريق ${i + 1}`,
      color: TEAM_COLOR_OPTIONS[i % TEAM_COLOR_OPTIONS.length].hex,
      score: 0,
    };
    teams.push({
      id: `team_${i + 1}`,
      name: custom?.name?.trim() || defaultTemplate.name,
      color: custom?.color || defaultTemplate.color,
      score: 0,
    });
  }

  const now = Date.now();
  const hostPlayer: RoomPlayer = {
    id: playerProfile.id,
    name: playerProfile.name,
    teamId: teams[0].id,
    isHost: true,
    joinedAt: now,
    lastSeen: now,
    connectionStatus: 'online',
    userId: params.user?.uid || null,
  };

  const initialRoom: OnlineGameRoom = {
    id: code,
    code,
    hostId: playerProfile.id,
    hostName: playerProfile.name,
    status: 'waiting_for_opponent',
    maxPlayers: 16,
    allowPlayerTeamSelection: true,
    timerDuration: params.timerDuration || 60,
    teams,
    players: {
      [playerProfile.id]: hostPlayer,
    },
    spectators: {},
    selectedSubcategoryIds: [],
    teamSubcategoryIds: {
      [teams[0].id]: [],
      [teams[1].id]: [],
    },
    activeTeamIndex: 0,
    usedTileKeys: [],
    roundUsedQuestionIds: [],
    activeQuestion: null,
    winnerTeamId: null,
    winnerTeamName: null,
    winnerScore: 0,
    lastActionMessage: `أنشأ ${playerProfile.name} الغرفة، بانتظار دخول المنافس...`,
    lastActionAt: now,
    hostLastSeen: now,
    playerRequests: {},
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(roomRef, initialRoom);
  return initialRoom;
}

// 2. Fetch single room
export async function fetchOnlineRoom(code: string): Promise<OnlineGameRoom | null> {
  const cleanCode = code.trim().toUpperCase();
  // Check primary room_CODE
  let snap = await getDoc(getRoomDoc(cleanCode));
  if (!snap.exists()) {
    // Check fallback without prefix
    snap = await getDoc(doc(db, ROOMS_COLLECTION, cleanCode));
  }
  if (!snap.exists()) {
    try {
      snap = await getDoc(doc(db, 'gameRooms', cleanCode));
    } catch {
      // ignore
    }
  }
  if (!snap.exists()) return null;
  return snap.data() as OnlineGameRoom;
}

// 3. Realtime Listener for room
export function subscribeToOnlineRoom(
  code: string,
  onUpdate: (room: OnlineGameRoom | null) => void,
  onError?: (err: Error) => void
): () => void {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);

  return onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
      } else {
        onUpdate(snap.data() as OnlineGameRoom);
      }
    },
    (err) => {
      console.error('Room realtime subscription error:', err);
      if (onError) onError(err);
    }
  );
}

// 4. Join an existing Room
export async function joinOnlineRoom(params: {
  code: string;
  playerName: string;
  user?: User | null;
  preferredTeamId?: string;
}): Promise<{ room: OnlineGameRoom; player: RoomPlayer }> {
  const cleanCode = params.code.trim().toUpperCase();
  const playerProfile = getOrCreatePlayerProfile(params.user, params.playerName);
  const roomRef = getRoomDoc(cleanCode);

  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    throw new Error('رمز الغرفة غير صحيح أو أن الغرفة غير موجودة');
  }

  const room = snap.data() as OnlineGameRoom;

  if (room.status === 'finished') {
    throw new Error('المباراة في هذه الغرفة انتهت بالفعل. يرجى إنشاء غرفة جديدة');
  }

  const existingPlayer = room.players ? room.players[playerProfile.id] : undefined;
  const totalPlayers = Object.keys(room.players || {}).length;

  if (!existingPlayer && totalPlayers >= (room.maxPlayers || 16)) {
    throw new Error('الغرفة ممتلئة بالكامل');
  }

  // Determine team: if opponent is entering, guarantee placement on the opposing team (team 2)
  let assignedTeamId = existingPlayer?.teamId || null;
  if (!assignedTeamId) {
    if (params.preferredTeamId && room.teams.some((t) => t.id === params.preferredTeamId)) {
      assignedTeamId = params.preferredTeamId;
    } else {
      const team1Id = room.teams[0]?.id || 'team_1';
      const team2Id = room.teams[1]?.id || 'team_2';
      // If player is host, put in team 1; if guest, place in team 2
      if (playerProfile.id === room.hostId) {
        assignedTeamId = team1Id;
      } else {
        assignedTeamId = team2Id;
      }
    }
  }

  const now = Date.now();
  const updatedPlayer: RoomPlayer = {
    id: playerProfile.id,
    name: playerProfile.name,
    teamId: assignedTeamId,
    isHost: existingPlayer ? existingPlayer.isHost : playerProfile.id === room.hostId,
    joinedAt: existingPlayer ? existingPlayer.joinedAt : now,
    lastSeen: now,
    connectionStatus: 'online',
    userId: params.user?.uid || null,
  };

  const nextPlayers = {
    ...(room.players || {}),
    [playerProfile.id]: updatedPlayer,
  };

  const isHost = updatedPlayer.isHost;
  const totalPlayersCount = Object.keys(nextPlayers).length;

  // Determine next room status
  let nextStatus: RoomStatus = room.status;
  if (totalPlayersCount >= 2) {
    const t1Id = room.teams[0]?.id || 'team_1';
    const t2Id = room.teams[1]?.id || 'team_2';
    const t1Count = (room.teamSubcategoryIds?.[t1Id] || []).length;
    const t2Count = (room.teamSubcategoryIds?.[t2Id] || []).length;

    if (t1Count === 3 && t2Count === 3) {
      nextStatus = 'ready';
    } else if (room.status === 'waiting_for_opponent' || room.status === 'lobby' || (room.status as string) === 'waiting') {
      nextStatus = 'selecting_categories';
    }
  } else {
    nextStatus = 'waiting_for_opponent';
  }

  const actionMsg = existingPlayer
    ? `عاد ${playerProfile.name} للاتصال باللعبة`
    : `انضم المنافس ${playerProfile.name}! ابدأوا باختيار 3 فئات لكل فريق 🎯`;

  await updateDoc(roomRef, {
    [`players.${playerProfile.id}`]: updatedPlayer,
    status: nextStatus,
    updatedAt: now,
    ...(isHost ? { hostLastSeen: now } : {}),
    lastActionMessage: actionMsg,
    lastActionAt: now,
  });

  return {
    room: {
      ...room,
      players: nextPlayers,
      status: nextStatus,
      lastActionMessage: actionMsg,
    },
    player: updatedPlayer,
  };
}

// 5. Update Player Presence (Heartbeat & Connection Status)
export async function updateOnlinePlayerPresence(
  code: string,
  playerId: string,
  status: 'online' | 'connecting' | 'offline'
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  try {
    await updateDoc(roomRef, {
      [`players.${playerId}.lastSeen`]: now,
      [`players.${playerId}.connectionStatus`]: status,
      updatedAt: now,
    });
  } catch {
    // silence background heartbeat errors
  }
}

// 6. Leave Room
export async function leaveOnlineRoom(code: string, playerId: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as OnlineGameRoom;
    const player = room.players ? room.players[playerId] : undefined;
    if (!player) return;

    if (room.status === 'lobby' || (room.status as string) === 'waiting') {
      // In lobby, completely remove player or transfer host
      const nextPlayers = { ...(room.players || {}) };
      delete nextPlayers[playerId];

      let nextHostId = room.hostId;
      let nextHostName = room.hostName;

      if (room.hostId === playerId) {
        const remaining = Object.values(nextPlayers);
        if (remaining.length > 0) {
          nextHostId = remaining[0].id;
          nextHostName = remaining[0].name;
          nextPlayers[nextHostId] = {
            ...remaining[0],
            isHost: true,
          };
        }
      }

      await updateDoc(roomRef, {
        [`players.${playerId}`]: deleteField(),
        hostId: nextHostId,
        hostName: nextHostName,
        lastActionMessage: `غادر ${player.name} الغرفة`,
        lastActionAt: now,
        updatedAt: now,
      });
    } else {
      // In active game, mark as offline so their progress and team membership remain intact
      await updateDoc(roomRef, {
        [`players.${playerId}.connectionStatus`]: 'offline',
        [`players.${playerId}.lastSeen`]: now,
        lastActionMessage: `انقطع اتصال ${player.name}`,
        lastActionAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.error('Error leaving room:', err);
  }
}

// 7. Transfer or Claim Host when Host is Inactive
export async function claimOnlineHost(code: string, newHostPlayerId: string): Promise<boolean> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return false;
    const room = snap.data() as OnlineGameRoom;

    const candidate = room.players ? room.players[newHostPlayerId] : undefined;
    if (!candidate) return false;

    // Verify current host is offline or hasn't responded in > 35 seconds
    const currentHost = room.players ? room.players[room.hostId] : undefined;
    const isCurrentHostStale =
      !currentHost ||
      currentHost.connectionStatus === 'offline' ||
      Date.now() - (currentHost.lastSeen || 0) > 35000;

    if (!isCurrentHostStale && room.hostId !== newHostPlayerId) {
      return false; // current host is still active
    }

    const now = Date.now();
    const nextPlayers = { ...(room.players || {}) };

    if (currentHost) {
      nextPlayers[room.hostId] = {
        ...currentHost,
        isHost: false,
      };
    }
    nextPlayers[newHostPlayerId] = {
      ...candidate,
      isHost: true,
      connectionStatus: 'online',
      lastSeen: now,
    };

    await updateDoc(roomRef, {
      hostId: newHostPlayerId,
      hostName: candidate.name,
      hostLastSeen: now,
      players: nextPlayers,
      lastActionMessage: `تم نقل صلاحيات المضيف إلى ${candidate.name}`,
      lastActionAt: now,
      updatedAt: now,
    });

    return true;
  } catch (err) {
    console.warn('Could not claim host:', err);
    return false;
  }
}

// 8. Host Actions: Change Teams Configuration (Lobby)
export async function hostUpdateTeams(
  code: string,
  hostId: string,
  newTeams: RoomTeam[]
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  await updateDoc(roomRef, {
    teams: newTeams,
    lastActionMessage: 'قام المضيف بتعديل إعدادات الفرق',
    lastActionAt: now,
    updatedAt: now,
  });
}

// 9. Host or Player: Move Player to Team
export async function assignPlayerTeam(
  code: string,
  targetPlayerId: string,
  targetTeamId: string
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  await updateDoc(roomRef, {
    [`players.${targetPlayerId}.teamId`]: targetTeamId,
    lastActionMessage: 'تم تغيير فريق أحد اللاعبين',
    lastActionAt: now,
    updatedAt: now,
  });
}

// 10. Host: Kick Player from Room
export async function hostKickPlayer(
  code: string,
  hostId: string,
  targetPlayerId: string
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const room = snap.data() as OnlineGameRoom;
  if (room.hostId !== hostId || targetPlayerId === hostId) return;

  const target = room.players ? room.players[targetPlayerId] : undefined;

  await updateDoc(roomRef, {
    [`players.${targetPlayerId}`]: deleteField(),
    lastActionMessage: `قام المضيف باستبعاد ${target ? target.name : 'لاعب'} من الغرفة`,
    lastActionAt: now,
    updatedAt: now,
  });
}

// 11. Team Subcategory Pick (Toggle up to 3 subcategories per team)
export async function toggleOnlineSubcategoryPick(
  code: string,
  playerId: string,
  teamId: string,
  subcategoryId: string
): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);

  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('الغرفة غير موجودة');
  const room = snap.data() as OnlineGameRoom;

  // Cannot modify categories once game has started
  if (
    room.status === 'playing' ||
    room.status === 'in_game' ||
    room.status === 'completed' ||
    room.status === 'finished'
  ) {
    throw new Error('لا يمكن تعديل الفئات بعد بدء المباراة');
  }

  // Security check: verify player belongs to this team
  const player = room.players ? room.players[playerId] : undefined;
  if (!player) throw new Error('أنت غير مسجل في هذه الغرفة');

  if (player.teamId !== teamId) {
    throw new Error('لا يمكنك تعديل اختيارات الفريق الآخر');
  }

  const currentPicks = room.teamSubcategoryIds?.[teamId] || [];
  let nextPicks: string[];

  if (currentPicks.includes(subcategoryId)) {
    // Deselect
    nextPicks = currentPicks.filter((id) => id !== subcategoryId);
  } else {
    // Select
    if (currentPicks.length >= 3) {
      throw new Error('لقد اخترت الحد الأقصى (3 فئات) لفريقك. اضغط على فئة لإلغاء تحديدها أولاً.');
    }
    nextPicks = [...currentPicks, subcategoryId];
  }

  const updatedTeamSubcategoryIds = {
    ...(room.teamSubcategoryIds || {}),
    [teamId]: nextPicks,
  };

  const team1Id = room.teams[0]?.id || 'team_1';
  const team2Id = room.teams[1]?.id || 'team_2';
  const team1Count = (updatedTeamSubcategoryIds[team1Id] || []).length;
  const team2Count = (updatedTeamSubcategoryIds[team2Id] || []).length;

  const playersList = Object.values(room.players || {});
  const hasOpponent = playersList.length >= 2;

  let nextStatus: RoomStatus = room.status;
  if (!hasOpponent) {
    nextStatus = 'waiting_for_opponent';
  } else if (team1Count === 3 && team2Count === 3) {
    nextStatus = 'ready';
  } else {
    nextStatus = 'selecting_categories';
  }

  const now = Date.now();
  const updatePayload = {
    teamSubcategoryIds: updatedTeamSubcategoryIds,
    status: nextStatus,
    lastActionMessage: `حدّث ${player.name} اختيارات فريقه (${nextPicks.length}/3 فئات)`,
    lastActionAt: now,
    updatedAt: now,
  };

  await updateDoc(roomRef, updatePayload);

  return {
    ...room,
    ...updatePayload,
  };
}

// 12. Host: Set Subcategories & Start Game (Enforcing opponent presence + 3 categories each)
export async function hostStartGame(
  code: string,
  hostId: string,
  selectedSubcategoryIds?: string[],
  teamSubcategoryIds?: Record<string, string[]>
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);

  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('الغرفة غير موجودة');
  const room = snap.data() as OnlineGameRoom;

  if (room.hostId !== hostId) {
    throw new Error('المضيف فقط يملك صلاحية بدء التحدي');
  }

  const playersList = Object.values(room.players || {});
  if (playersList.length < 2) {
    throw new Error('بانتظار دخول المنافس');
  }

  const t1Id = room.teams[0]?.id || 'team_1';
  const t2Id = room.teams[1]?.id || 'team_2';

  const t1Picks = teamSubcategoryIds?.[t1Id] || room.teamSubcategoryIds?.[t1Id] || [];
  const t2Picks = teamSubcategoryIds?.[t2Id] || room.teamSubcategoryIds?.[t2Id] || [];

  if (t1Picks.length !== 3) {
    throw new Error('يجب على الفريق الأول (المضيف) اختيار 3 فئات قبل البدء');
  }
  if (t2Picks.length !== 3) {
    throw new Error('يجب على الفريق الثاني (المنافس) اختيار 3 فئات قبل البدء');
  }

  const finalMergedIds = selectedSubcategoryIds && selectedSubcategoryIds.length === 6
    ? selectedSubcategoryIds
    : [...t1Picks, ...t2Picks];

  const now = Date.now();

  await updateDoc(roomRef, {
    status: 'playing',
    selectedSubcategoryIds: finalMergedIds,
    teamSubcategoryIds: {
      [t1Id]: t1Picks,
      [t2Id]: t2Picks,
    },
    activeTeamIndex: 0,
    usedTileKeys: [],
    roundUsedQuestionIds: [],
    activeQuestion: null,
    winnerTeamId: null,
    winnerTeamName: null,
    winnerScore: 0,
    lastActionMessage: 'بدأت المباراة والتحدي! بالتوفيق للفريقين 🔥',
    lastActionAt: now,
    updatedAt: now,
  });
}

// 12. Host: Open / Select Question (Broadcasting modal to all devices)
export async function hostSelectQuestion(
  code: string,
  hostId: string,
  questionPayload: ActiveQuestionState
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  await updateDoc(roomRef, {
    activeQuestion: questionPayload,
    lastActionMessage: `اختار المضيف سؤالاً بقيمة ${questionPayload.points} نقطة في فئة ${questionPayload.subcategoryName}`,
    lastActionAt: now,
    updatedAt: now,
  });
}

// 13. Host: Reveal Answer to all players
export async function hostRevealAnswer(code: string, hostId: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  await updateDoc(roomRef, {
    'activeQuestion.isAnswerRevealed': true,
    lastActionMessage: 'كشف المضيف الإجابة الصحيحة!',
    lastActionAt: now,
    updatedAt: now,
  });
}

// 14. Host: Close Active Question Modal without scoring (Dismiss)
export async function hostCloseActiveQuestion(code: string, hostId: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  await updateDoc(roomRef, {
    activeQuestion: null,
    lastActionMessage: 'أغلق المضيف السؤال الحالي',
    lastActionAt: now,
    updatedAt: now,
  });
}

// 15. Host: Award Points to a Team (Atomic Firestore Transaction to prevent duplicate scoring)
export async function hostAwardPoints(params: {
  code: string;
  hostId: string;
  awardedTeamIndex: number;
  points: number;
  tileKey: string;
  questionId: string;
  totalPlayableTiles: number;
}): Promise<void> {
  const cleanCode = params.code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) throw new Error('الغرفة غير موجودة');
    const room = snap.data() as OnlineGameRoom;

    if (room.hostId !== params.hostId) {
      throw new Error('المضيف فقط يملك صلاحية تسجيل النقاط');
    }

    // Strictly idempotent: tile already scored/used
    if ((room.usedTileKeys || []).includes(params.tileKey)) {
      return;
    }

    const nextUsedTiles = [...(room.usedTileKeys || []), params.tileKey];
    const nextRoundQuestions = (room.roundUsedQuestionIds || []).includes(params.questionId)
      ? room.roundUsedQuestionIds
      : [...(room.roundUsedQuestionIds || []), params.questionId];

    const safeTeamIndex =
      params.awardedTeamIndex >= 0 && params.awardedTeamIndex < room.teams.length
        ? params.awardedTeamIndex
        : 0;

    const awardedTeam = room.teams[safeTeamIndex];
    const nextTeams = room.teams.map((t, idx) =>
      idx === safeTeamIndex ? { ...t, score: t.score + params.points } : t
    );

    const nextActiveTeamIndex = (room.activeTeamIndex + 1) % room.teams.length;
    const now = Date.now();

    const isGameFinished = nextUsedTiles.length >= params.totalPlayableTiles;
    let winnerId: string | null = null;
    let winnerName: string | null = null;
    let winnerScore = 0;

    if (isGameFinished) {
      const sorted = [...nextTeams].sort((a, b) => b.score - a.score);
      const win = sorted[0];
      winnerId = win ? win.id : null;
      winnerName = win ? win.name : '';
      winnerScore = win ? win.score : 0;
    }

    transaction.update(roomRef, {
      teams: nextTeams,
      usedTileKeys: nextUsedTiles,
      roundUsedQuestionIds: nextRoundQuestions,
      activeTeamIndex: nextActiveTeamIndex,
      activeQuestion: null,
      status: isGameFinished ? 'finished' : room.status,
      winnerTeamId: winnerId,
      winnerTeamName: winnerName,
      winnerScore,
      lastActionMessage: `حصل ${awardedTeam.name} على +${params.points} نقطة! 🎉`,
      lastActionAt: now,
      updatedAt: now,
    });
  });
}

// 16. Host: Mark Tile Used with No Points (Skip - Atomic Transaction)
export async function hostMarkTileNoPoints(params: {
  code: string;
  hostId: string;
  tileKey: string;
  questionId: string;
  totalPlayableTiles: number;
}): Promise<void> {
  const cleanCode = params.code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as OnlineGameRoom;

    if (room.hostId !== params.hostId) return;
    if ((room.usedTileKeys || []).includes(params.tileKey)) return;

    const nextUsedTiles = [...(room.usedTileKeys || []), params.tileKey];
    const nextRoundQuestions = (room.roundUsedQuestionIds || []).includes(params.questionId)
      ? room.roundUsedQuestionIds
      : [...(room.roundUsedQuestionIds || []), params.questionId];

    const nextActiveTeamIndex = (room.activeTeamIndex + 1) % room.teams.length;
    const now = Date.now();

    const isGameFinished = nextUsedTiles.length >= params.totalPlayableTiles;
    let winnerId: string | null = null;
    let winnerName: string | null = null;
    let winnerScore = 0;

    if (isGameFinished) {
      const sorted = [...room.teams].sort((a, b) => b.score - a.score);
      const win = sorted[0];
      winnerId = win ? win.id : null;
      winnerName = win ? win.name : '';
      winnerScore = win ? win.score : 0;
    }

    transaction.update(roomRef, {
      usedTileKeys: nextUsedTiles,
      roundUsedQuestionIds: nextRoundQuestions,
      activeTeamIndex: nextActiveTeamIndex,
      activeQuestion: null,
      status: isGameFinished ? 'finished' : room.status,
      winnerTeamId: winnerId,
      winnerTeamName: winnerName,
      winnerScore,
      lastActionMessage: 'تم تخطي السؤال بدون نقاط',
      lastActionAt: now,
      updatedAt: now,
    });
  });
}

// 17. Host: Finish Game Manually
export async function hostFinishGame(code: string, hostId: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const room = snap.data() as OnlineGameRoom;
  if (room.hostId !== hostId) return;

  const sorted = [...room.teams].sort((a, b) => b.score - a.score);
  const win = sorted[0];

  await updateDoc(roomRef, {
    status: 'finished',
    activeQuestion: null,
    winnerTeamId: win ? win.id : null,
    winnerTeamName: win ? win.name : '',
    winnerScore: win ? win.score : 0,
    lastActionMessage: `انتهت المباراة! مبروك لـ ${win ? win.name : 'الفريق الفائز'} 🏆`,
    lastActionAt: now,
    updatedAt: now,
  });
}

// 18. Host: Restart Match with same room and players
export async function hostRestartGame(
  code: string,
  hostId: string,
  returnToLobby = false
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const room = snap.data() as OnlineGameRoom;
  if (room.hostId !== hostId) return;

  const resetTeams = room.teams.map((t) => ({ ...t, score: 0 }));

  await updateDoc(roomRef, {
    status: returnToLobby ? 'lobby' : 'selecting_categories',
    teams: resetTeams,
    usedTileKeys: [],
    roundUsedQuestionIds: [],
    activeQuestion: null,
    activeTeamIndex: 0,
    winnerTeamId: null,
    winnerTeamName: null,
    winnerScore: 0,
    lastActionMessage: 'أعاد المضيف بدء جولة جديدة بنفس الغرفة!',
    lastActionAt: now,
    updatedAt: now,
  });
}

// 19. Regular Player: Send Request (Request Reveal, Buzz In, Cheer)
export async function playerSendOnlineRequest(
  code: string,
  request: PlayerRequest
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  const now = Date.now();

  try {
    await updateDoc(roomRef, {
      [`playerRequests.${request.id}`]: {
        ...request,
        timestamp: now,
      },
      lastActionMessage: `${request.playerName}: ${request.message}`,
      lastActionAt: now,
      updatedAt: now,
    });
  } catch (err) {
    console.error('Error sending player request:', err);
  }
}

// 20. Join an existing Room strictly as a Spectator (read-only, does not count as a player)
export async function joinOnlineRoomAsSpectator(params: {
  code: string;
  spectatorName: string;
  user?: User | null;
}): Promise<{ room: OnlineGameRoom; spectator: RoomSpectator }> {
  const cleanCode = params.code.trim().toUpperCase();
  const profile = getOrCreatePlayerProfile(params.user, params.spectatorName);
  const roomRef = getRoomDoc(cleanCode);

  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    throw new Error('رمز الغرفة غير صحيح أو أن الغرفة غير موجودة');
  }

  const room = snap.data() as OnlineGameRoom;
  if (room.status === 'finished' || room.status === 'completed') {
    throw new Error('المباراة في هذه الغرفة قد انتهت بالفعل');
  }

  const now = Date.now();
  const existingSpectator = room.spectators ? room.spectators[profile.id] : undefined;
  const spectator: RoomSpectator = {
    id: profile.id,
    name: profile.name,
    userId: params.user?.uid || null,
    joinedAt: existingSpectator ? existingSpectator.joinedAt : now,
    lastSeen: now,
    connectionStatus: 'online',
  };

  await updateDoc(roomRef, {
    [`spectators.${profile.id}`]: spectator,
    updatedAt: now,
  });

  return {
    room: {
      ...room,
      spectators: {
        ...(room.spectators || {}),
        [profile.id]: spectator,
      },
    },
    spectator,
  };
}

// 21. Update Spectator Presence
export async function updateOnlineSpectatorPresence(
  code: string,
  spectatorId: string,
  status: 'online' | 'offline'
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  try {
    await updateDoc(roomRef, {
      [`spectators.${spectatorId}.lastSeen`]: Date.now(),
      [`spectators.${spectatorId}.connectionStatus`]: status,
    });
  } catch {
    // silence background heartbeat errors
  }
}

// 22. Leave Room as Spectator
export async function leaveOnlineRoomAsSpectator(
  code: string,
  spectatorId: string
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const roomRef = getRoomDoc(cleanCode);
  try {
    await updateDoc(roomRef, {
      [`spectators.${spectatorId}`]: deleteField(),
      updatedAt: Date.now(),
    });
  } catch {
    // ignore
  }
}
