import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import {
  ActiveQuestionState,
  OnlineGameRoom,
  RoomPlayer,
  RoomSpectator,
  RoomTeam,
} from '../types/multiplayer';

const ROOMS_COLLECTION = 'gameSessions';
const ROOM_DOC_PREFIX = 'room_';
const PLAYER_STORAGE_KEY = 'nizal_mp_player_v1';
const ACTIVE_ROOM_STORAGE_KEY = 'nizal_active_online_room_v1';

export function getRoomDoc(code: string) {
  const clean = (code || '').trim().toUpperCase();
  return doc(db, ROOMS_COLLECTION, `${ROOM_DOC_PREFIX}${clean}`);
}

export interface PersistentPlayerProfile {
  id: string;
  name: string;
}

export function getOrCreatePlayerProfile(
  user?: User | null,
  defaultName?: string
): PersistentPlayerProfile {
  const effectiveUser = user || auth.currentUser;
  try {
    const saved = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.id === 'string' && parsed.id) {
        if (effectiveUser?.uid) {
          parsed.id = effectiveUser.uid;
        }
        if (
          effectiveUser?.displayName &&
          (!parsed.name || parsed.name.startsWith('لاعب'))
        ) {
          parsed.name = effectiveUser.displayName;
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

  const generatedId =
    effectiveUser?.uid ||
    `player_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  const initialName =
    defaultName?.trim() ||
    effectiveUser?.displayName ||
    effectiveUser?.email?.split('@')[0] ||
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

export function saveActiveOnlineRoomCode(code: string, role: 'player' | 'spectator', uid?: string | null) {
  try {
    localStorage.setItem(
      ACTIVE_ROOM_STORAGE_KEY,
      JSON.stringify({
        code: code.trim().toUpperCase(),
        role,
        uid: uid || auth.currentUser?.uid || null,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}

export function getActiveOnlineRoomSession(): {
  code: string;
  role: 'player' | 'spectator';
  uid: string | null;
  savedAt: number;
} | null {
  try {
    const raw = localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.code !== 'string' || !parsed.code.trim()) {
      return null;
    }
    return {
      code: parsed.code.trim().toUpperCase(),
      role: parsed.role === 'spectator' ? 'spectator' : 'player',
      uid: typeof parsed.uid === 'string' ? parsed.uid : null,
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

export function clearActiveOnlineRoomCode() {
  try {
    localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const DEFAULT_ONLINE_TEAMS: RoomTeam[] = [
  {
    id: 'team_1',
    name: 'المضيف',
    color: '#14543D',
    score: 0,
  },
  {
    id: 'team_2',
    name: 'الضيف',
    color: '#F07842',
    score: 0,
  },
];

async function getIdTokenOrThrow(user?: User | null): Promise<string> {
  const effectiveUser = user || auth.currentUser;
  if (!effectiveUser) {
    throw new Error('يجب تسجيل الدخول للمشاركة في اللعب عن بُعد.');
  }
  return effectiveUser.getIdToken();
}

async function callRoomApi<T>(
  path: string,
  body: Record<string, unknown> = {},
  user?: User | null
): Promise<T> {
  const idToken = await getIdTokenOrThrow(user);
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    room?: OnlineGameRoom;
  } & Record<string, unknown>;

  if (!res.ok) {
    throw new Error(payload?.error || `تعذر إتمام الطلب (HTTP ${res.status})`);
  }
  return payload as unknown as T;
}

export interface CreateRoomParams {
  hostName: string;
  user?: User | null;
  teamCount?: number;
  timerDuration?: number;
  customTeams?: { name: string; color: string }[];
}

export async function createOnlineRoom(params: CreateRoomParams): Promise<OnlineGameRoom> {
  getOrCreatePlayerProfile(params.user, params.hostName);
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    '/api/online-rooms',
    {
      hostName: params.hostName,
      timerDuration: params.timerDuration || 60,
      customTeams: params.customTeams,
    },
    params.user
  );
  saveActiveOnlineRoomCode(res.room.code, 'player', params.user?.uid);
  return res.room;
}

export async function fetchOnlineRoom(code: string): Promise<OnlineGameRoom | null> {
  const cleanCode = code.trim().toUpperCase();
  let snap = await getDoc(getRoomDoc(cleanCode));
  if (!snap.exists()) {
    snap = await getDoc(doc(db, ROOMS_COLLECTION, cleanCode));
  }
  if (!snap.exists()) return null;
  return snap.data() as OnlineGameRoom;
}

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

export async function joinOnlineRoom(params: {
  code: string;
  playerName: string;
  user?: User | null;
}): Promise<{ room: OnlineGameRoom; player: RoomPlayer }> {
  const cleanCode = params.code.trim().toUpperCase();
  const profile = getOrCreatePlayerProfile(params.user, params.playerName);
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/join`,
    {
      playerName: params.playerName,
      role: 'player',
    },
    params.user
  );
  saveActiveOnlineRoomCode(res.room.code, 'player', params.user?.uid);
  const player =
    res.room.players?.[profile.id] ||
    res.room.players?.[params.user?.uid || ''] ||
    Object.values(res.room.players || {}).find((p) => p.userId === (params.user?.uid || profile.id)) || {
      id: profile.id,
      name: params.playerName,
      teamId: 'team_2',
      isHost: false,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      connectionStatus: 'online' as const,
      userId: params.user?.uid || null,
    };
  return { room: res.room, player };
}

export async function joinOnlineRoomAsSpectator(params: {
  code: string;
  spectatorName: string;
  user?: User | null;
}): Promise<{ room: OnlineGameRoom; spectator: RoomSpectator }> {
  const cleanCode = params.code.trim().toUpperCase();
  const profile = getOrCreatePlayerProfile(params.user, params.spectatorName);
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/join`,
    {
      playerName: params.spectatorName,
      role: 'spectator',
    },
    params.user
  );
  saveActiveOnlineRoomCode(res.room.code, 'spectator', params.user?.uid);
  const spectator =
    res.room.spectators?.[profile.id] ||
    res.room.spectators?.[params.user?.uid || ''] || {
      id: profile.id,
      name: params.spectatorName,
      userId: params.user?.uid || null,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      connectionStatus: 'online' as const,
    };
  return { room: res.room, spectator };
}

export async function updateOnlinePlayerPresence(
  code: string,
  _playerId: string,
  status: 'online' | 'connecting' | 'offline'
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  try {
    await callRoomApi(`/api/online-rooms/${encodeURIComponent(cleanCode)}/presence`, { status });
  } catch {
    // silence background heartbeat errors
  }
}

export async function leaveOnlineRoom(code: string, _playerId?: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  clearActiveOnlineRoomCode();
  try {
    await callRoomApi(`/api/online-rooms/${encodeURIComponent(cleanCode)}/leave`, {});
  } catch (err) {
    console.error('Error leaving room:', err);
  }
}

export async function claimOnlineHost(code: string): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/claim-host`,
    {}
  );
  return res.room;
}

export async function toggleOnlineSubcategoryPick(
  code: string,
  subcategoryId: string
): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/categories/toggle`,
    { subcategoryId }
  );
  return res.room;
}

export async function confirmOnlineCategories(
  code: string,
  confirmed: boolean
): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/categories/confirm`,
    { confirmed }
  );
  return res.room;
}

export async function hostStartGame(code: string): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/start`,
    {}
  );
  return res.room;
}

export async function selectOnlineQuestion(params: {
  code: string;
  tileKey: string;
  questionId: string;
  subcategoryName?: string;
}): Promise<OnlineGameRoom> {
  const cleanCode = params.code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/select-question`,
    {
      tileKey: params.tileKey,
      questionId: params.questionId,
      subcategoryName: params.subcategoryName || '',
    }
  );
  return res.room;
}

export async function submitOnlineAnswer(params: {
  code: string;
  answer: string;
}): Promise<OnlineGameRoom> {
  const cleanCode = params.code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/submit-answer`,
    { answer: params.answer }
  );
  return res.room;
}

export async function timeoutOrSkipOnlineQuestion(code: string): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/timeout-question`,
    {}
  );
  return res.room;
}

export async function dismissResolvedOnlineQuestion(code: string): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/dismiss-result`,
    {}
  );
  return res.room;
}

export async function syncOnlineWalaKalimaState(
  code: string,
  activeQuestion: ActiveQuestionState | null
): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/wala-kalima-sync`,
    { activeQuestion }
  );
  return res.room;
}

export async function commitOnlineWalaKalimaResult(params: {
  code: string;
  tileKey: string;
  sessionId: string;
  earnedPoints: number;
}): Promise<OnlineGameRoom> {
  const cleanCode = params.code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/wala-kalima-commit`,
    {
      tileKey: params.tileKey,
      sessionId: params.sessionId,
      earnedPoints: params.earnedPoints,
    }
  );
  return res.room;
}

export async function hostFinishGame(code: string): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/finish`,
    {}
  );
  return res.room;
}

export async function hostRestartGame(code: string): Promise<OnlineGameRoom> {
  const cleanCode = code.trim().toUpperCase();
  const res = await callRoomApi<{ room: OnlineGameRoom }>(
    `/api/online-rooms/${encodeURIComponent(cleanCode)}/restart`,
    {}
  );
  return res.room;
}
