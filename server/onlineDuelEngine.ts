import crypto from 'node:crypto';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseUser,
} from './cloudinarySignCore.ts';
import {
  firestoreCreateDoc,
  firestoreGetDoc,
  FirestoreHttpError,
  runRoomCasTransaction,
} from './firestoreRestClient.ts';
import { verifySubmittedAnswer } from '../src/utils/answerVerification.ts';
import { evaluateMatchOutcome } from '../src/utils/matchOutcome.ts';
import type {
  ActiveQuestionState,
  OnlineGameRoom,
  RoomEventEntry,
  RoomPlayer,
  RoomSpectator,
  RoomStatus,
  RoomTeam,
  TurnRole,
} from '../src/types/multiplayer.ts';
import type { PointValue, SubcategoryItem, TriviaQuestion } from '../src/types/game.ts';

const ROOMS_COLLECTION = 'gameSessions';
const ROOM_DOC_PREFIX = 'room_';
const VALID_POINTS = new Set<number>([100, 200, 300, 400, 500]);
const MAX_EVENT_LOG_ITEMS = 80;

interface CachedQuestionAnswer {
  questionId: string;
  tileKey: string;
  correctAnswer: string;
  acceptedAnswers?: string[];
  explanation: string;
  points: number;
}

interface AuthoritativeQuestionRecord {
  id: string;
  subcategoryId?: string;
  category: string;
  questionText: string;
  points: number;
  difficulty: string;
  correctAnswer: string;
  acceptedAnswers?: string[];
  explanation: string;
  mediaType?: 'text' | 'image' | 'audio';
  imageUrl?: string;
  imageDescription?: string;
  audioUrl?: string;
  audioMaxPlays?: number | null;
  status?: string;
}

// Per-room in-memory mutex to serialize mutations within this server instance
const roomLocks = new Map<string, Promise<void>>();
// Short-lived secret answer cache so correctAnswer never sits in Firestore before submission
const secretAnswerCache = new Map<string, CachedQuestionAnswer>();

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const PRESENCE_WRITE_MIN_INTERVAL_MS = 35_000;
const HOST_STALE_THRESHOLD_MS = 95_000;

interface TtlCacheEntry<T> {
  value: T;
  expiresAt: number;
}

const firestoreQuestionCache = new Map<string, TtlCacheEntry<AuthoritativeQuestionRecord | null>>();
const firestoreSubcategoryCache = new Map<string, TtlCacheEntry<SubcategoryItem | null>>();
const firestoreMainCategoryCache = new Map<
  string,
  TtlCacheEntry<{ isComingSoon?: boolean; isActive?: boolean; isDeleted?: boolean } | null>
>();

export function clearOnlineDuelCachesForTest(): void {
  firestoreQuestionCache.clear();
  firestoreSubcategoryCache.clear();
  firestoreMainCategoryCache.clear();
  secretAnswerCache.clear();
}

let builtinQuestionMapPromise: Promise<{
  questionsById: Map<string, AuthoritativeQuestionRecord>;
  subcategoriesById: Map<string, SubcategoryItem>;
}> | null = null;

function sanitizeDocId(rawId: string): string {
  const cleaned = String(rawId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 128);
  return cleaned || `item-${Date.now()}`;
}

function normalizeTextForCompare(val: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function withRoomLock<T>(roomCode: string, task: () => Promise<T>): Promise<T> {
  const cleanCode = roomCode.trim().toUpperCase();
  const prev = roomLocks.get(cleanCode) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => current);
  roomLocks.set(cleanCode, chained);

  return prev.then(task).finally(() => {
    release();
    if (roomLocks.get(cleanCode) === chained) {
      roomLocks.delete(cleanCode);
    }
  });
}

async function importTsModuleWithEsbuildFallback<T>(
  importer: () => Promise<T>,
  relPath: string
): Promise<T> {
  try {
    return await importer();
  } catch {
    const esbuild = await import('esbuild');
    const absPath = path.resolve(import.meta.dirname, relPath);
    const built = await esbuild.build({
      entryPoints: [absPath],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      logLevel: 'silent',
    });
    const code = built.outputFiles[0]?.text || '';
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
    return (await import(dataUrl)) as T;
  }
}

async function loadBuiltinCatalog(): Promise<{
  questionsById: Map<string, AuthoritativeQuestionRecord>;
  subcategoriesById: Map<string, SubcategoryItem>;
}> {
  if (!builtinQuestionMapPromise) {
    builtinQuestionMapPromise = (async () => {
      const questionsById = new Map<string, AuthoritativeQuestionRecord>();
      const subcategoriesById = new Map<string, SubcategoryItem>();

      const [questionsMod, seedMod] = await Promise.all([
        importTsModuleWithEsbuildFallback<{ ALL_EXPANDED_QUESTIONS: TriviaQuestion[] }>(
          () => import('../src/data/questions/index.ts'),
          '../src/data/questions/index.ts'
        ),
        importTsModuleWithEsbuildFallback<{
          DEFAULT_SUBCATEGORIES: SubcategoryItem[];
          INITIAL_SEED_QUESTIONS: Array<Partial<TriviaQuestion> & Pick<TriviaQuestion, 'id' | 'category' | 'questionText' | 'points' | 'correctAnswer'>>;
        }>(
          () => import('../src/data/categoriesAndSeed.ts'),
          '../src/data/categoriesAndSeed.ts'
        ),
      ]);

      for (const sub of seedMod.DEFAULT_SUBCATEGORIES || []) {
        subcategoriesById.set(sub.id, sub);
        subcategoriesById.set(sanitizeDocId(sub.id), sub);
      }

      const registerQuestion = (
        q: Partial<TriviaQuestion> & Pick<TriviaQuestion, 'id' | 'category' | 'questionText' | 'points' | 'correctAnswer'>
      ) => {
        const rec: AuthoritativeQuestionRecord = {
          id: q.id,
          subcategoryId: q.subcategoryId,
          category: q.category || 'عام',
          questionText: q.questionText,
          points: Number(q.points) || 100,
          difficulty: q.difficulty || 'سهل',
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          mediaType: q.mediaType,
          imageUrl: q.imageUrl,
          imageDescription: q.imageDescription,
          audioUrl: q.audioUrl,
          audioMaxPlays: q.audioMaxPlays ?? null,
          status: q.status,
        };
        questionsById.set(q.id, rec);
        questionsById.set(sanitizeDocId(q.id), rec);
      };

      for (const q of seedMod.INITIAL_SEED_QUESTIONS || []) {
        registerQuestion(q);
      }
      for (const q of questionsMod.ALL_EXPANDED_QUESTIONS || []) {
        registerQuestion(q);
      }

      return { questionsById, subcategoriesById };
    })();
  }
  return builtinQuestionMapPromise;
}

async function resolveAuthoritativeQuestion(
  questionId: string,
  idToken?: string
): Promise<AuthoritativeQuestionRecord | null> {
  const rawId = String(questionId || '').trim();
  if (!rawId) return null;
  const cleanId = sanitizeDocId(rawId);

  const now = Date.now();
  const cachedFs = firestoreQuestionCache.get(cleanId);
  if (cachedFs && cachedFs.expiresAt > now) {
    if (cachedFs.value) {
      return cachedFs.value.status === 'rejected' ? null : cachedFs.value;
    }
    const { questionsById } = await loadBuiltinCatalog();
    return questionsById.get(rawId) || questionsById.get(cleanId) || null;
  }

  // 1. Check Firestore first so admin edits/custom approved questions always take precedence (cached 5m)
  try {
    const fsDoc = await firestoreGetDoc<TriviaQuestion & { acceptedAnswers?: string[] }>(
      'questions',
      cleanId,
      idToken
    );
    if (fsDoc.exists && fsDoc.data) {
      const q = fsDoc.data;
      const mapped: AuthoritativeQuestionRecord = {
        id: q.id || cleanId,
        subcategoryId: q.subcategoryId,
        category: q.category || 'عام',
        questionText: q.questionText || '',
        points: Number(q.points) || 100,
        difficulty: q.difficulty || 'سهل',
        correctAnswer: q.correctAnswer || '',
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : undefined,
        explanation: q.explanation || '',
        mediaType: q.mediaType,
        imageUrl: q.imageUrl,
        imageDescription: q.imageDescription,
        audioUrl: q.audioUrl,
        audioMaxPlays: q.audioMaxPlays ?? null,
        status: q.status,
      };
      firestoreQuestionCache.set(cleanId, {
        value: mapped,
        expiresAt: now + METADATA_CACHE_TTL_MS,
      });
      return q.status === 'rejected' ? null : mapped;
    }
    firestoreQuestionCache.set(cleanId, {
      value: null,
      expiresAt: now + METADATA_CACHE_TTL_MS,
    });
  } catch (err) {
    if (err instanceof FirestoreHttpError && err.status === 429) {
      throw err;
    }
    // Fallback to built-in catalog on non-quota transient error
  }

  // 2. Built-in expanded question bank
  const { questionsById } = await loadBuiltinCatalog();
  return questionsById.get(rawId) || questionsById.get(cleanId) || null;
}

async function checkSubcategoryIsComingSoon(
  subcategoryId: string,
  idToken?: string
): Promise<{ exists: boolean; isComingSoon: boolean; name: string }> {
  const cleanId = sanitizeDocId(subcategoryId);
  const { subcategoriesById } = await loadBuiltinCatalog();
  const builtinSub = subcategoriesById.get(subcategoryId) || subcategoriesById.get(cleanId);

  let subName = builtinSub?.name || subcategoryId;
  let subComingSoon = Boolean(builtinSub?.isComingSoon);
  let mainCatId = builtinSub?.mainCategoryId || '';
  let exists = Boolean(builtinSub);

  const now = Date.now();
  const cachedSub = firestoreSubcategoryCache.get(cleanId);
  if (cachedSub && cachedSub.expiresAt > now) {
    const subData = cachedSub.value;
    if (subData) {
      exists = true;
      subName = subData.name || subName;
      subComingSoon = Boolean(subData.isComingSoon);
      if (subData.isDeleted || subData.isActive === false) {
        subComingSoon = true;
      }
      mainCatId = subData.mainCategoryId || mainCatId;
    }
  } else {
    try {
      const fsSub = await firestoreGetDoc<SubcategoryItem>('subcategories', cleanId, idToken);
      firestoreSubcategoryCache.set(cleanId, {
        value: fsSub.exists && fsSub.data ? fsSub.data : null,
        expiresAt: now + METADATA_CACHE_TTL_MS,
      });
      if (fsSub.exists && fsSub.data) {
        exists = true;
        subName = fsSub.data.name || subName;
        subComingSoon = Boolean(fsSub.data.isComingSoon);
        if (fsSub.data.isDeleted || fsSub.data.isActive === false) {
          subComingSoon = true;
        }
        mainCatId = fsSub.data.mainCategoryId || mainCatId;
      }
    } catch (err) {
      if (err instanceof FirestoreHttpError && err.status === 429) {
        throw err;
      }
      // ignore non-quota read error and rely on built-in catalog
    }
  }

  if (mainCatId) {
    const cleanMainId = sanitizeDocId(mainCatId);
    const cachedMain = firestoreMainCategoryCache.get(cleanMainId);
    if (cachedMain && cachedMain.expiresAt > now) {
      const mainData = cachedMain.value;
      if (mainData && (mainData.isComingSoon || mainData.isDeleted || mainData.isActive === false)) {
        subComingSoon = true;
      }
    } else {
      try {
        const fsMain = await firestoreGetDoc<{ isComingSoon?: boolean; isActive?: boolean; isDeleted?: boolean }>(
          'mainCategories',
          cleanMainId,
          idToken
        );
        firestoreMainCategoryCache.set(cleanMainId, {
          value: fsMain.exists && fsMain.data ? fsMain.data : null,
          expiresAt: now + METADATA_CACHE_TTL_MS,
        });
        if (fsMain.exists && fsMain.data) {
          if (fsMain.data.isComingSoon || fsMain.data.isDeleted || fsMain.data.isActive === false) {
            subComingSoon = true;
          }
        }
      } catch (err) {
        if (err instanceof FirestoreHttpError && err.status === 429) {
          throw err;
        }
        // ignore non-quota read error
      }
    }
  }

  return { exists, isComingSoon: subComingSoon, name: subName };
}

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

function makeEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function appendEventLog(
  currentLog: RoomEventEntry[] | undefined,
  entry: RoomEventEntry
): RoomEventEntry[] {
  const list = Array.isArray(currentLog) ? [...currentLog, entry] : [entry];
  if (list.length > MAX_EVENT_LOG_ITEMS) {
    return list.slice(list.length - MAX_EVENT_LOG_ITEMS);
  }
  return list;
}

function resolveActorRole(room: OnlineGameRoom, uid: string): TurnRole | null {
  const hostUid = room.hostUid || room.hostId;
  const guestUid = room.guestUid || room.guestId || null;
  if (uid === hostUid) return 'host';
  if (guestUid && uid === guestUid) return 'guest';

  const player = room.players?.[uid];
  if (player) {
    if (player.isHost || player.teamId === room.teams?.[0]?.id) return 'host';
    if (player.teamId === room.teams?.[1]?.id) return 'guest';
  }
  return null;
}

function resolveTurnRole(room: OnlineGameRoom): TurnRole {
  if (room.activeTurnRole === 'host' || room.activeTurnRole === 'guest') {
    return room.activeTurnRole;
  }
  return (room.activeTeamIndex || 0) % 2 === 0 ? 'host' : 'guest';
}

function getTeamForRole(room: OnlineGameRoom, role: TurnRole): RoomTeam {
  const idx = role === 'host' ? 0 : 1;
  return (
    room.teams?.[idx] ||
    (role === 'host'
      ? { id: 'team_1', name: 'المضيف', color: '#14543D', score: 0 }
      : { id: 'team_2', name: 'الضيف', color: '#F07842', score: 0 })
  );
}

function getPlayerForRole(room: OnlineGameRoom, role: TurnRole): RoomPlayer | undefined {
  const targetUid = role === 'host' ? room.hostUid || room.hostId : room.guestUid || room.guestId;
  if (targetUid && room.players?.[targetUid]) {
    return room.players[targetUid];
  }
  const teamId = getTeamForRole(room, role).id;
  return Object.values(room.players || {}).find((p) => p.teamId === teamId);
}

function getRoleDisplayName(room: OnlineGameRoom, role: TurnRole): string {
  const p = getPlayerForRole(room, role);
  if (p?.name) return p.name;
  if (role === 'host') return room.hostName || 'المضيف';
  return room.guestName || 'الضيف';
}

function resolveTurnCount(room: OnlineGameRoom): number {
  return (room.selectedSubcategoryIds?.length || 6) * 5;
}

function computeLobbyStatus(room: {
  players: Record<string, RoomPlayer>;
  teamSubcategoryIds: Record<string, string[]>;
  teams: RoomTeam[];
  categoryConfirmations?: { host: boolean; guest: boolean };
  guestUid?: string | null;
}): RoomStatus {
  const hasGuest = Boolean(room.guestUid) || Object.keys(room.players || {}).length >= 2;
  if (!hasGuest) return 'waiting_for_opponent';

  const t1Id = room.teams[0]?.id || 'team_1';
  const t2Id = room.teams[1]?.id || 'team_2';
  const t1Count = (room.teamSubcategoryIds?.[t1Id] || []).length;
  const t2Count = (room.teamSubcategoryIds?.[t2Id] || []).length;
  const hostConfirmed = Boolean(room.categoryConfirmations?.host);
  const guestConfirmed = Boolean(room.categoryConfirmations?.guest);

  if (t1Count === 3 && t2Count === 3 && hostConfirmed && guestConfirmed) {
    return 'ready';
  }
  return 'selecting_categories';
}

function buildFinalOutcomeUpdate(
  room: OnlineGameRoom,
  nextTeams: RoomTeam[],
  nextUsedTiles: string[],
  now: number
): {
  isGameFinished: boolean;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  winnerScore: number;
  finishEvent: RoomEventEntry | null;
} {
  const totalTiles = resolveTurnCount(room);
  if (totalTiles <= 0 || nextUsedTiles.length < totalTiles) {
    return {
      isGameFinished: false,
      winnerTeamId: null,
      winnerTeamName: null,
      winnerScore: 0,
      finishEvent: null,
    };
  }

  const outcome = evaluateMatchOutcome(nextTeams);
  const finishMsg = outcome.isZeroScore
    ? 'انتهت المباراة بدون نقاط مسجلة'
    : outcome.isTie
    ? 'انتهت المباراة بالتعادل بين المضيف والضيف!'
    : `انتهت المباراة بفوز ${outcome.winnerTeamName} (${outcome.topScore} نقطة)`;

  return {
    isGameFinished: true,
    winnerTeamId: outcome.winnerTeamId,
    winnerTeamName: outcome.winnerTeamName,
    winnerScore: outcome.topScore,
    finishEvent: {
      id: makeEventId('evt_finish'),
      type: 'match_finished',
      timestamp: now,
      actorRole: 'system',
      message: finishMsg,
    },
  };
}

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function requireAuthenticatedUser(req: Request): Promise<{
  user: VerifiedFirebaseUser;
  idToken: string;
}> {
  const rawAuth = req.headers.authorization || '';
  const tokenMatch = rawAuth.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) {
    throw new ApiError(
      401,
      'auth/missing-token',
      'غير مصرح. يرجى تسجيل الدخول أولاً.'
    );
  }
  const idToken = tokenMatch[1].trim();
  try {
    const user = await verifyFirebaseIdToken(idToken);
    return { user, idToken };
  } catch {
    throw new ApiError(
      401,
      'auth/invalid-token',
      'انتهت صلاحية جلسة تسجيل الدخول أو أن الرمز غير صالح.'
    );
  }
}

function handleEngineError(res: Response, err: unknown, fallbackMsg: string): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      code: err.code,
      error: err.message,
    });
    return;
  }
  if (err instanceof FirestoreHttpError) {
    res.status(err.status).json({
      code: err.code,
      error: err.message,
      ...(err.retryAfterMs ? { retryAfterMs: err.retryAfterMs } : {}),
    });
    return;
  }
  const message = err instanceof Error ? err.message : fallbackMsg;
  console.error('[NIZAL OnlineDuelEngine Error]', err);
  res.status(400).json({
    code: 'online-room/error',
    error: message || fallbackMsg,
  });
}

function parseRoomCode(raw: string): string {
  const clean = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (clean.length < 4 || clean.length > 12) {
    throw new ApiError(400, 'room/invalid-code', 'رمز الغرفة غير صالح.');
  }
  return clean;
}

function getBodyObject(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object'
    ? (req.body as Record<string, unknown>)
    : {};
}

// =========================================================================
// HTTP HANDLERS FOR HOST-VS-GUEST ONLINE DUEL
// =========================================================================

export async function handleCreateOnlineRoom(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const body = getBodyObject(req);

    const hostName = String(body.hostName || body.playerName || user.email?.split('@')[0] || 'المضيف').trim().slice(0, 60);
    if (!hostName) {
      throw new ApiError(400, 'room/invalid-name', 'يرجى إدخال اسم المضيف.');
    }

    const rawTimer = Number(body.timerDuration || 60);
    const timerDuration = [30, 45, 60, 90].includes(rawTimer) ? rawTimer : 60;

    const rawCustomTeams = Array.isArray(body.customTeams) ? body.customTeams : [];
    const team1Custom = rawCustomTeams[0] as { name?: string; color?: string } | undefined;
    const team2Custom = rawCustomTeams[1] as { name?: string; color?: string } | undefined;

    const teams: RoomTeam[] = [
      {
        id: 'team_1',
        name: String(team1Custom?.name || `${hostName}`).trim().slice(0, 50) || 'المضيف',
        color: typeof team1Custom?.color === 'string' && team1Custom.color.startsWith('#') ? team1Custom.color : '#14543D',
        score: 0,
      },
      {
        id: 'team_2',
        name: String(team2Custom?.name || 'الضيف').trim().slice(0, 50) || 'الضيف',
        color: typeof team2Custom?.color === 'string' && team2Custom.color.startsWith('#') ? team2Custom.color : '#F07842',
        score: 0,
      },
    ];

    const now = Date.now();
    const hostPlayer: RoomPlayer = {
      id: user.uid,
      name: hostName,
      teamId: 'team_1',
      isHost: true,
      joinedAt: now,
      lastSeen: now,
      connectionStatus: 'online',
      userId: user.uid,
    };

    const initialEvent: RoomEventEntry = {
      id: makeEventId('evt_create'),
      type: 'room_created',
      timestamp: now,
      actorRole: 'host',
      actorName: hostName,
      message: `أنشأ المضيف ${hostName} غرفة المنافسة الثنائية، بانتظار دخول الضيف`,
    };

    // Retry code generation on unlikely collision
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = generateRoomCode();
      const newRoom: OnlineGameRoom = {
        id: code,
        code,
        mode: 'host_vs_guest',
        hostId: user.uid,
        hostUid: user.uid,
        hostName,
        guestId: null,
        guestUid: null,
        guestName: null,
        status: 'waiting_for_opponent',
        maxPlayers: 2,
        allowPlayerTeamSelection: false,
        timerDuration,
        teams,
        players: {
          [user.uid]: hostPlayer,
        },
        spectators: {},
        selectedSubcategoryIds: [],
        teamSubcategoryIds: {
          team_1: [],
          team_2: [],
        },
        categoryConfirmations: {
          host: false,
          guest: false,
        },
        activeTurnRole: 'host',
        turnNumber: 1,
        activeTeamIndex: 0,
        usedTileKeys: [],
        roundUsedQuestionIds: [],
        activeQuestion: null,
        lastResolvedTurn: null,
        eventLog: [initialEvent],
        winnerTeamId: null,
        winnerTeamName: null,
        winnerScore: 0,
        lastActionMessage: initialEvent.message,
        lastActionAt: now,
        hostLastSeen: now,
        playerRequests: {},
        createdAt: now,
        updatedAt: now,
      };

      try {
        const created = await firestoreCreateDoc<Record<string, unknown>>(
          ROOMS_COLLECTION,
          `${ROOM_DOC_PREFIX}${code}`,
          newRoom as unknown as Record<string, unknown>,
          idToken
        );
        res.status(201).json({ room: created.data });
        return;
      } catch (err) {
        if (err instanceof FirestoreHttpError && err.status === 409 && attempt < 3) {
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    handleEngineError(res, err, 'تعذر إنشاء غرفة اللعب عن بُعد.');
  }
}

export async function handleJoinOnlineRoom(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const roleRequested = body.role === 'spectator' ? 'spectator' : 'player';
    const playerName = String(body.playerName || user.email?.split('@')[0] || 'لاعب')
      .trim()
      .slice(0, 60);

    if (!playerName) {
      throw new ApiError(400, 'room/invalid-name', 'يرجى إدخال الاسم.');
    }

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const now = Date.now();

          if (roleRequested === 'spectator') {
            if (room.status === 'finished' || room.status === 'completed') {
              throw new ApiError(400, 'room/finished', 'المباراة في هذه الغرفة قد انتهت بالفعل.');
            }
            const existingSpec = room.spectators?.[user.uid];
            const spectator: RoomSpectator = {
              id: user.uid,
              name: playerName,
              userId: user.uid,
              joinedAt: existingSpec?.joinedAt || now,
              lastSeen: now,
              connectionStatus: 'online',
            };
            return {
              ...room,
              spectators: {
                ...(room.spectators || {}),
                [user.uid]: spectator,
              },
              updatedAt: now,
            } as unknown as Record<string, unknown>;
          }

          const hostUid = room.hostUid || room.hostId;
          const guestUid = room.guestUid || room.guestId || null;
          const isHostReconnect = user.uid === hostUid;
          const isGuestReconnect = Boolean(guestUid && user.uid === guestUid);

          if (!isHostReconnect && !isGuestReconnect && guestUid && guestUid !== user.uid) {
            throw new ApiError(
              409,
              'room/full',
              'الغرفة مخصصة لمنافسة ثنائية بين المضيف والضيف ومكتملة حالياً — يمكنك الدخول كمشاهد.'
            );
          }

          if (!isHostReconnect && !isGuestReconnect && (room.status === 'finished' || room.status === 'completed')) {
            throw new ApiError(
              400,
              'room/finished',
              'المباراة في هذه الغرفة انتهت بالفعل. يرجى إنشاء غرفة جديدة.'
            );
          }

          const team1Id = room.teams?.[0]?.id || 'team_1';
          const team2Id = room.teams?.[1]?.id || 'team_2';
          const assignedRole: TurnRole = isHostReconnect ? 'host' : 'guest';
          const assignedTeamId = assignedRole === 'host' ? team1Id : team2Id;
          const existingPlayer = room.players?.[user.uid];

          const nextPlayer: RoomPlayer = {
            id: user.uid,
            name: playerName,
            teamId: assignedTeamId,
            isHost: assignedRole === 'host',
            joinedAt: existingPlayer?.joinedAt || now,
            lastSeen: now,
            connectionStatus: 'online',
            userId: user.uid,
          };

          const nextPlayers = {
            ...(room.players || {}),
            [user.uid]: nextPlayer,
          };

          const nextTeams = (room.teams || []).map((t, idx) => {
            if (idx === 1 && !guestUid && (t.name === 'الضيف' || t.name === 'فريق الصقور')) {
              return { ...t, name: playerName };
            }
            if (idx === 0 && isHostReconnect) {
              return { ...t };
            }
            return t;
          });

          const isReconnect = isHostReconnect || isGuestReconnect;
          const nextGuestUid = assignedRole === 'guest' ? user.uid : guestUid;
          const nextGuestName = assignedRole === 'guest' ? playerName : room.guestName || null;

          const isLiveOrEnded =
            room.status === 'playing' ||
            room.status === 'in_game' ||
            room.status === 'finished' ||
            room.status === 'completed';

          const nextStatus: RoomStatus = isLiveOrEnded
            ? room.status
            : computeLobbyStatus({
                players: nextPlayers,
                teamSubcategoryIds: room.teamSubcategoryIds || {},
                teams: nextTeams,
                categoryConfirmations: room.categoryConfirmations,
                guestUid: nextGuestUid,
              });

          const eventMsg = isReconnect
            ? `عاد ${playerName} (${assignedRole === 'host' ? 'المضيف' : 'الضيف'}) للاتصال بالمباراة`
            : `انضم الضيف ${playerName}! اختاروا 3 فئات لكل لاعب ثم أكّدوا الاختيار`;

          const evt: RoomEventEntry = {
            id: makeEventId(isReconnect ? 'evt_reconn' : 'evt_join'),
            type: isReconnect ? 'player_reconnected' : 'player_joined',
            timestamp: now,
            actorRole: assignedRole,
            actorName: playerName,
            message: eventMsg,
          };

          return {
            ...room,
            mode: 'host_vs_guest',
            hostUid,
            guestId: nextGuestUid,
            guestUid: nextGuestUid,
            guestName: nextGuestName,
            teams: nextTeams,
            players: nextPlayers,
            status: nextStatus,
            eventLog: appendEventLog(room.eventLog, evt),
            lastActionMessage: eventMsg,
            lastActionAt: now,
            ...(assignedRole === 'host' ? { hostLastSeen: now } : {}),
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر الانضمام إلى الغرفة.');
  }
}

export async function handlePresenceUpdate(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const status =
      body.status === 'offline'
        ? 'offline'
        : body.status === 'connecting'
        ? 'connecting'
        : 'online';

    const txOutcome = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const now = Date.now();
          if (room.players?.[user.uid]) {
            const existing = room.players[user.uid];
            const lastSeenAge = now - Number(existing.lastSeen || 0);
            if (
              existing.connectionStatus === status &&
              lastSeenAge >= 0 &&
              lastSeenAge < PRESENCE_WRITE_MIN_INTERVAL_MS
            ) {
              // Skip redundant Firestore write & onSnapshot fanout when status is unchanged and recently pinged
              return null;
            }
            const isHost = (room.hostUid || room.hostId) === user.uid;
            return {
              ...room,
              players: {
                ...room.players,
                [user.uid]: {
                  ...existing,
                  lastSeen: now,
                  connectionStatus: status,
                },
              },
              ...(isHost ? { hostLastSeen: now } : {}),
              updatedAt: now,
            } as unknown as Record<string, unknown>;
          }
          if (room.spectators?.[user.uid]) {
            const existingSpec = room.spectators[user.uid];
            const nextSpecStatus = status === 'connecting' ? 'online' : status;
            const lastSeenAge = now - Number(existingSpec.lastSeen || 0);
            if (
              existingSpec.connectionStatus === nextSpecStatus &&
              lastSeenAge >= 0 &&
              lastSeenAge < PRESENCE_WRITE_MIN_INTERVAL_MS
            ) {
              return null;
            }
            return {
              ...room,
              spectators: {
                ...room.spectators,
                [user.uid]: {
                  ...existingSpec,
                  lastSeen: now,
                  connectionStatus: nextSpecStatus,
                },
              },
              updatedAt: now,
            } as unknown as Record<string, unknown>;
          }
          return null;
        },
      });
      return {
        room: result.data as unknown as OnlineGameRoom,
        changed: result.changed,
      };
    });

    res.json({ ok: true, changed: txOutcome.changed, room: txOutcome.room });
  } catch (err) {
    handleEngineError(res, err, 'تعذر تحديث حالة الاتصال.');
  }
}

export async function handleLeaveOnlineRoom(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));

    await withRoomLock(code, async () => {
      await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const now = Date.now();

          if (room.spectators?.[user.uid] && !room.players?.[user.uid]) {
            const nextSpecs = { ...(room.spectators || {}) };
            delete nextSpecs[user.uid];
            return {
              ...room,
              spectators: nextSpecs,
              updatedAt: now,
            } as unknown as Record<string, unknown>;
          }

          const player = room.players?.[user.uid];
          if (!player) return null;

          const role = resolveActorRole(room, user.uid);
          const isLobby =
            room.status === 'waiting_for_opponent' ||
            room.status === 'selecting_categories' ||
            room.status === 'ready' ||
            room.status === 'lobby' ||
            (room.status as string) === 'waiting';

          if (isLobby && role === 'guest') {
            const nextPlayers = { ...(room.players || {}) };
            delete nextPlayers[user.uid];
            const team2Id = room.teams?.[1]?.id || 'team_2';
            const nextTeamSubs = {
              ...(room.teamSubcategoryIds || {}),
              [team2Id]: [],
            };
            const nextConfirmations = {
              host: Boolean(room.categoryConfirmations?.host),
              guest: false,
            };
            const msg = `غادر الضيف ${player.name} صالة التحدي`;
            return {
              ...room,
              guestId: null,
              guestUid: null,
              guestName: null,
              players: nextPlayers,
              teamSubcategoryIds: nextTeamSubs,
              categoryConfirmations: nextConfirmations,
              status: 'waiting_for_opponent',
              eventLog: appendEventLog(room.eventLog, {
                id: makeEventId('evt_leave'),
                type: 'player_disconnected',
                timestamp: now,
                actorRole: 'guest',
                actorName: player.name,
                message: msg,
              }),
              lastActionMessage: msg,
              lastActionAt: now,
              updatedAt: now,
            } as unknown as Record<string, unknown>;
          }

          // In active game or host leaving -> keep slot intact & mark offline for seamless reconnect
          const msg = `انقطع اتصال ${player.name}`;
          return {
            ...room,
            players: {
              ...room.players,
              [user.uid]: {
                ...player,
                connectionStatus: 'offline',
                lastSeen: now,
              },
            },
            eventLog: appendEventLog(room.eventLog, {
              id: makeEventId('evt_off'),
              type: 'player_disconnected',
              timestamp: now,
              actorRole: role || 'system',
              actorName: player.name,
              message: msg,
            }),
            lastActionMessage: msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
    });

    res.json({ ok: true });
  } catch (err) {
    handleEngineError(res, err, 'تعذر مغادرة الغرفة.');
  }
}

export async function handleToggleCategoryPick(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const subcategoryId = String(body.subcategoryId || '').trim();

    if (!subcategoryId) {
      throw new ApiError(400, 'room/invalid-subcategory', 'معرّف الفئة الفرعية مطلوب.');
    }

    const subStatus = await checkSubcategoryIsComingSoon(subcategoryId, idToken);
    if (subStatus.isComingSoon) {
      throw new ApiError(
        400,
        'room/category-coming-soon',
        'هذه الفئة في وضع «قريباً» ولا يمكن اختيارها.'
      );
    }

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          if (
            room.status === 'playing' ||
            room.status === 'in_game' ||
            room.status === 'finished' ||
            room.status === 'completed'
          ) {
            throw new ApiError(
              400,
              'room/categories-locked',
              'لا يمكن تغيير الفئات بعد بدء المباراة.'
            );
          }

          const role = resolveActorRole(room, user.uid);
          if (!role) {
            throw new ApiError(
              403,
              'room/not-a-player',
              'أنت لست لاعباً في هذه الغرفة.'
            );
          }

          const isConfirmed =
            role === 'host'
              ? Boolean(room.categoryConfirmations?.host)
              : Boolean(room.categoryConfirmations?.guest);
          if (isConfirmed) {
            throw new ApiError(
              400,
              'room/already-confirmed',
              'لقد أكّدت فئاتك الثلاث بالفعل. اضغط «تعديل الاختيارات» أولاً قبل البدء.'
            );
          }

          const myTeamId = role === 'host' ? room.teams[0]?.id || 'team_1' : room.teams[1]?.id || 'team_2';
          const opponentTeamId = role === 'host' ? room.teams[1]?.id || 'team_2' : room.teams[0]?.id || 'team_1';

          const currentMyPicks = [...(room.teamSubcategoryIds?.[myTeamId] || [])];
          const opponentPicks = room.teamSubcategoryIds?.[opponentTeamId] || [];

          let nextMyPicks: string[];
          if (currentMyPicks.includes(subcategoryId)) {
            nextMyPicks = currentMyPicks.filter((id) => id !== subcategoryId);
          } else {
            if (opponentPicks.includes(subcategoryId)) {
              throw new ApiError(
                400,
                'room/duplicate-category',
                'هذه الفئة اختارها خصمك بالفعل! يرجى اختيار فئة أخرى ليصبح المجموع 6 فئات مختلفة.'
              );
            }
            if (currentMyPicks.length >= 3) {
              throw new ApiError(
                400,
                'room/max-categories',
                'لقد اخترت الحد الأقصى (3 فئات). أزل فئة أولاً لاختيار غيرها.'
              );
            }
            nextMyPicks = [...currentMyPicks, subcategoryId];
          }

          const nextTeamSubcategoryIds = {
            ...(room.teamSubcategoryIds || {}),
            [myTeamId]: nextMyPicks,
          };

          const nextConfirmations = {
            host: role === 'host' ? false : Boolean(room.categoryConfirmations?.host),
            guest: role === 'guest' ? false : Boolean(room.categoryConfirmations?.guest),
          };

          const nextStatus = computeLobbyStatus({
            players: room.players || {},
            teamSubcategoryIds: nextTeamSubcategoryIds,
            teams: room.teams || [],
            categoryConfirmations: nextConfirmations,
            guestUid: room.guestUid || room.guestId,
          });

          const now = Date.now();
          const actorName = getRoleDisplayName(room, role);
          const msg = `حدّث ${actorName} (${role === 'host' ? 'المضيف' : 'الضيف'}) اختياراته (${nextMyPicks.length}/3 فئات)`;

          return {
            ...room,
            teamSubcategoryIds: nextTeamSubcategoryIds,
            categoryConfirmations: nextConfirmations,
            status: nextStatus,
            eventLog: appendEventLog(room.eventLog, {
              id: makeEventId('evt_cat'),
              type: 'categories_updated',
              timestamp: now,
              actorRole: role,
              actorName,
              message: msg,
            }),
            lastActionMessage: msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر تحديث اختيار الفئة.');
  }
}

export async function handleConfirmCategories(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const confirmed = body.confirmed !== undefined ? Boolean(body.confirmed) : true;

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          if (
            room.status === 'playing' ||
            room.status === 'in_game' ||
            room.status === 'finished' ||
            room.status === 'completed'
          ) {
            throw new ApiError(
              400,
              'room/categories-locked',
              'لا يمكن تعديل تأكيد الفئات بعد بدء المباراة.'
            );
          }

          const role = resolveActorRole(room, user.uid);
          if (!role) {
            throw new ApiError(403, 'room/not-a-player', 'أنت لست لاعباً في هذه الغرفة.');
          }

          const myTeamId = role === 'host' ? room.teams[0]?.id || 'team_1' : room.teams[1]?.id || 'team_2';
          const myPicks = room.teamSubcategoryIds?.[myTeamId] || [];

          if (confirmed && myPicks.length !== 3) {
            throw new ApiError(
              400,
              'room/incomplete-categories',
              `يجب اختيار 3 فئات كاملة قبل التأكيد (لديك ${myPicks.length}/3).`
            );
          }

          const nextConfirmations = {
            host: role === 'host' ? confirmed : Boolean(room.categoryConfirmations?.host),
            guest: role === 'guest' ? confirmed : Boolean(room.categoryConfirmations?.guest),
          };

          const nextStatus = computeLobbyStatus({
            players: room.players || {},
            teamSubcategoryIds: room.teamSubcategoryIds || {},
            teams: room.teams || [],
            categoryConfirmations: nextConfirmations,
            guestUid: room.guestUid || room.guestId,
          });

          const now = Date.now();
          const actorName = getRoleDisplayName(room, role);
          const msg = confirmed
            ? `أكّد ${actorName} (${role === 'host' ? 'المضيف' : 'الضيف'}) فئاته الثلاث ✓`
            : `أعاد ${actorName} فتح تعديل الفئات`;

          return {
            ...room,
            categoryConfirmations: nextConfirmations,
            status: nextStatus,
            eventLog: appendEventLog(room.eventLog, {
              id: makeEventId('evt_conf'),
              type: 'categories_confirmed',
              timestamp: now,
              actorRole: role,
              actorName,
              message: msg,
            }),
            lastActionMessage: msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر تأكيد الفئات.');
  }
}

export async function handleStartOnlineMatch(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: async (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const hostUid = room.hostUid || room.hostId;
          if (user.uid !== hostUid) {
            throw new ApiError(403, 'room/host-only', 'المضيف فقط يملك صلاحية بدء المباراة.');
          }
          if (room.status === 'playing' || room.status === 'in_game') {
            return null;
          }

          const hasGuest = Boolean(room.guestUid || room.guestId) || Object.keys(room.players || {}).length >= 2;
          if (!hasGuest) {
            throw new ApiError(400, 'room/missing-guest', 'لا يمكن بدء المباراة قبل انضمام الضيف.');
          }

          const t1Id = room.teams[0]?.id || 'team_1';
          const t2Id = room.teams[1]?.id || 'team_2';
          const t1Picks = room.teamSubcategoryIds?.[t1Id] || [];
          const t2Picks = room.teamSubcategoryIds?.[t2Id] || [];

          if (t1Picks.length !== 3 || t2Picks.length !== 3) {
            throw new ApiError(
              400,
              'room/incomplete-categories',
              'يجب أن يختار كل من المضيف والضيف 3 فئات قبل البدء.'
            );
          }

          if (!room.categoryConfirmations?.host || !room.categoryConfirmations?.guest) {
            throw new ApiError(
              400,
              'room/unconfirmed-categories',
              'يجب أن يؤكد كلا اللاعبين (المضيف والضيف) اختياراتهما أولاً قبل بدء المباراة.'
            );
          }

          const merged = [...t1Picks, ...t2Picks];
          if (new Set(merged).size !== 6) {
            throw new ApiError(
              400,
              'room/duplicate-categories',
              'يجب أن تكون الفئات الست المختارة فريدة دون تكرار.'
            );
          }

          for (const subId of merged) {
            const check = await checkSubcategoryIsComingSoon(subId, idToken);
            if (check.isComingSoon) {
              throw new ApiError(
                400,
                'room/coming-soon',
                `الفئة «${check.name}» حالياً في وضع «قريباً» ولا يمكن بدء مباراة بها.`
              );
            }
          }

          const now = Date.now();
          const hostName = getRoleDisplayName(room, 'host');
          const startMsg = `انطلقت المنافسة! الدور الأول يبدأ عند المضيف ${hostName} 🔥`;

          return {
            ...room,
            status: 'playing',
            selectedSubcategoryIds: merged,
            teamSubcategoryIds: {
              [t1Id]: t1Picks,
              [t2Id]: t2Picks,
            },
            activeTurnRole: 'host',
            turnNumber: 1,
            activeTeamIndex: 0,
            usedTileKeys: [],
            roundUsedQuestionIds: [],
            activeQuestion: null,
            lastResolvedTurn: null,
            winnerTeamId: null,
            winnerTeamName: null,
            winnerScore: 0,
            eventLog: appendEventLog(room.eventLog, {
              id: makeEventId('evt_start'),
              type: 'match_started',
              timestamp: now,
              actorRole: 'host',
              actorName: hostName,
              nextTurnRole: 'host',
              nextTurnName: hostName,
              message: startMsg,
            }),
            lastActionMessage: startMsg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر بدء المباراة.');
  }
}

export async function handleSelectQuestion(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const tileKey = String(body.tileKey || '').trim();
    const questionId = String(body.questionId || '').trim();
    const subcategoryNameHint = String(body.subcategoryName || '').trim();

    if (!tileKey || !tileKey.includes('__')) {
      throw new ApiError(400, 'room/invalid-tile', 'مفتاح خانة السؤال غير صالح.');
    }

    const lastSep = tileKey.lastIndexOf('__');
    const subId = tileKey.slice(0, lastSep);
    const points = Number(tileKey.slice(lastSep + 2)) as PointValue;

    if (!subId || !VALID_POINTS.has(points)) {
      throw new ApiError(400, 'room/invalid-tile', 'قيمة النقاط أو الفئة غير صالحة.');
    }
    if (!questionId) {
      throw new ApiError(400, 'room/missing-question', 'معرّف السؤال مطلوب.');
    }

    const authQ = await resolveAuthoritativeQuestion(questionId, idToken);
    if (!authQ) {
      throw new ApiError(404, 'room/question-not-found', 'السؤال المطلوب غير موجود أو غير متاح.');
    }
    if (authQ.points !== points) {
      throw new ApiError(400, 'room/question-points-mismatch', 'نقاط السؤال لا تطابق الخانة المختارة.');
    }

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          if (room.status !== 'playing' && room.status !== 'in_game') {
            throw new ApiError(400, 'room/not-playing', 'المباراة ليست نشطة حالياً.');
          }

          const actorRole = resolveActorRole(room, user.uid);
          const activeRole = resolveTurnRole(room);
          if (!actorRole || actorRole !== activeRole) {
            throw new ApiError(
              403,
              'room/not-your-turn',
              'الدور ليس لك الآن! انتظر إكمال الخصم لدوره.'
            );
          }

          if (room.activeQuestion) {
            throw new ApiError(
              409,
              'room/question-already-open',
              'يوجد سؤال مفتوح حالياً. يجب إكماله أولاً.'
            );
          }

          if (!(room.selectedSubcategoryIds || []).includes(subId)) {
            throw new ApiError(
              400,
              'room/invalid-subcategory',
              'هذه الفئة غير مدرجة في لوحة المباراة.'
            );
          }

          if ((room.usedTileKeys || []).includes(tileKey)) {
            throw new ApiError(
              409,
              'room/tile-already-used',
              'تم استخدام هذا السؤال مسبقاً.'
            );
          }

          // Verify question belongs to selected subcategory if ID/name metadata present
          const matchesSubId =
            authQ.subcategoryId && sanitizeDocId(authQ.subcategoryId) === sanitizeDocId(subId);
          const matchesSubName =
            subcategoryNameHint &&
            normalizeTextForCompare(authQ.category) === normalizeTextForCompare(subcategoryNameHint);
          if (authQ.subcategoryId && !matchesSubId && !matchesSubName) {
            throw new ApiError(
              400,
              'room/question-category-mismatch',
              'السؤال لا ينتمي إلى الفئة المختارة.'
            );
          }

          const now = Date.now();
          const actorName = getRoleDisplayName(room, actorRole);
          const subLabel = subcategoryNameHint || authQ.category || 'فئة';

          // Never expose correctAnswer or explanation to Firestore before submission!
          const publicActiveQuestion: ActiveQuestionState = {
            tileKey,
            questionId: authQ.id,
            subcategoryId: subId,
            subcategoryName: subLabel,
            category: authQ.category,
            points,
            difficulty: authQ.difficulty,
            questionText: authQ.questionText,
            correctAnswer: '',
            explanation: '',
            mediaType: authQ.mediaType,
            imageUrl: authQ.imageUrl || '',
            imageDescription: authQ.imageDescription || '',
            audioUrl: authQ.audioUrl || '',
            audioMaxPlays: authQ.audioMaxPlays ?? null,
            isAnswerRevealed: false,
            openedAt: now,
            openedByHostId: user.uid,
            openedByRole: actorRole,
            openedByUid: user.uid,
            openedByName: actorName,
            submissionStatus: 'awaiting_answer',
            submittedByRole: null,
            submittedByUid: null,
            submittedByName: null,
            submittedAnswer: null,
            isCorrect: null,
            earnedPoints: 0,
            resolvedAt: null,
          };

          secretAnswerCache.set(`${code}__${tileKey}__${now}`, {
            questionId: authQ.id,
            tileKey,
            correctAnswer: authQ.correctAnswer,
            acceptedAnswers: authQ.acceptedAnswers,
            explanation: authQ.explanation,
            points: authQ.points,
          });

          const msg = `اختار ${actorName} (${actorRole === 'host' ? 'المضيف' : 'الضيف'}) سؤال ${subLabel} بقيمة ${points} نقطة`;

          return {
            ...room,
            activeQuestion: publicActiveQuestion,
            eventLog: appendEventLog(room.eventLog, {
              id: makeEventId('evt_qsel'),
              type: 'question_selected',
              timestamp: now,
              actorRole,
              actorName,
              tileKey,
              subcategoryName: subLabel,
              points,
              questionText: authQ.questionText,
              message: msg,
            }),
            lastActionMessage: msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر فتح السؤال.');
  }
}

export async function handleSubmitAnswer(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const submittedAnswerRaw = String(body.answer || body.submittedAnswer || '').trim();

    if (!submittedAnswerRaw) {
      throw new ApiError(
        400,
        'room/empty-answer',
        'يرجى كتابة الإجابة قبل الضغط على إرسال الإجابة.'
      );
    }
    if (submittedAnswerRaw.length > 300) {
      throw new ApiError(400, 'room/answer-too-long', 'الإجابة أطول من الحد المسموح به.');
    }

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: async (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          if (room.status !== 'playing' && room.status !== 'in_game') {
            throw new ApiError(400, 'room/not-playing', 'المباراة ليست في حالة لعب حالياً.');
          }

          const actorRole = resolveActorRole(room, user.uid);
          const activeRole = resolveTurnRole(room);
          if (!actorRole || actorRole !== activeRole) {
            throw new ApiError(
              403,
              'room/not-your-turn',
              'لا يمكنك الإجابة في غير دورك!'
            );
          }

          const aq = room.activeQuestion;
          if (!aq || aq.isWalaKalima) {
            throw new ApiError(404, 'room/no-active-question', 'لا يوجد سؤال مفتوح للإجابة عليه.');
          }
          if (aq.submissionStatus === 'resolved' || aq.isAnswerRevealed) {
            throw new ApiError(409, 'room/already-answered', 'تم إرسال وتقييم إجابة هذا السؤال بالفعل.');
          }
          if ((room.usedTileKeys || []).includes(aq.tileKey)) {
            throw new ApiError(409, 'room/tile-already-scored', 'تم احتساب هذا السؤال مسبقاً.');
          }

          const cacheKey = `${code}__${aq.tileKey}__${aq.openedAt}`;
          let secret = secretAnswerCache.get(cacheKey);
          if (!secret) {
            const authQ = await resolveAuthoritativeQuestion(aq.questionId, idToken);
            if (!authQ) {
              throw new ApiError(500, 'room/missing-answer', 'تعذر استرجاع الإجابة المعتمدة من قاعدة البيانات.');
            }
            secret = {
              questionId: authQ.id,
              tileKey: aq.tileKey,
              correctAnswer: authQ.correctAnswer,
              acceptedAnswers: authQ.acceptedAnswers,
              explanation: authQ.explanation,
              points: authQ.points,
            };
          }

          const verification = verifySubmittedAnswer({
            submittedAnswer: submittedAnswerRaw,
            correctAnswer: secret.correctAnswer,
            acceptedAnswers: secret.acceptedAnswers,
          });

          const earnedPoints = verification.isCorrect ? Number(aq.points || secret.points || 0) : 0;
          const actorName = getRoleDisplayName(room, actorRole);
          const teamIdx = actorRole === 'host' ? 0 : 1;
          const nextTeams = (room.teams || []).map((t, idx) =>
            idx === teamIdx ? { ...t, score: (t.score || 0) + earnedPoints } : t
          );

          const nextUsedTileKeys = [...(room.usedTileKeys || []), aq.tileKey];
          const nextRoundUsedQuestionIds = (room.roundUsedQuestionIds || []).includes(aq.questionId)
            ? room.roundUsedQuestionIds
            : [...(room.roundUsedQuestionIds || []), aq.questionId];

          const nextTurnRole: TurnRole = actorRole === 'host' ? 'guest' : 'host';
          const nextTeamIndex = nextTurnRole === 'host' ? 0 : 1;
          const nextTurnNumber = (room.turnNumber || 1) + 1;
          const nextTurnName = getRoleDisplayName(room, nextTurnRole);
          const now = Date.now();

          const outcomeData = buildFinalOutcomeUpdate(room, nextTeams, nextUsedTileKeys, now);

          const resolvedQuestion: ActiveQuestionState = {
            ...aq,
            correctAnswer: secret.correctAnswer,
            explanation: secret.explanation || '',
            isAnswerRevealed: true,
            submissionStatus: 'resolved',
            submittedByRole: actorRole,
            submittedByUid: user.uid,
            submittedByName: actorName,
            submittedAnswer: submittedAnswerRaw,
            isCorrect: verification.isCorrect,
            earnedPoints,
            resolvedAt: now,
          };

          const msg = verification.isCorrect
            ? `أجاب ${actorName} إجابة صحيحة وحصل على +${earnedPoints} نقطة! انتقل الدور إلى ${nextTurnName}`
            : `أجاب ${actorName} إجابة خاطئة («${submittedAnswerRaw}» — الصحيحة: ${secret.correctAnswer}). انتقل الدور إلى ${nextTurnName}`;

          const answerEvent: RoomEventEntry = {
            id: makeEventId('evt_ans'),
            type: 'answer_submitted',
            timestamp: now,
            actorRole,
            actorName,
            tileKey: aq.tileKey,
            subcategoryName: aq.subcategoryName,
            points: aq.points,
            questionText: aq.questionText,
            submittedAnswer: submittedAnswerRaw,
            correctAnswer: secret.correctAnswer,
            isCorrect: verification.isCorrect,
            earnedPoints,
            nextTurnRole,
            nextTurnName,
            message: msg,
          };

          let nextLog = appendEventLog(room.eventLog, answerEvent);
          if (outcomeData.finishEvent) {
            nextLog = appendEventLog(nextLog, outcomeData.finishEvent);
          }

          secretAnswerCache.delete(cacheKey);

          return {
            ...room,
            teams: nextTeams,
            usedTileKeys: nextUsedTileKeys,
            roundUsedQuestionIds: nextRoundUsedQuestionIds,
            activeQuestion: resolvedQuestion,
            activeTurnRole: nextTurnRole,
            activeTeamIndex: nextTeamIndex,
            turnNumber: nextTurnNumber,
            lastResolvedTurn: answerEvent,
            eventLog: nextLog,
            status: outcomeData.isGameFinished ? 'finished' : 'playing',
            winnerTeamId: outcomeData.winnerTeamId,
            winnerTeamName: outcomeData.winnerTeamName,
            winnerScore: outcomeData.winnerScore,
            lastActionMessage: outcomeData.finishEvent ? outcomeData.finishEvent.message : msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر إرسال الإجابة وتقييمها.');
  }
}

export async function handleTimeoutOrSkipQuestion(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: async (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          if (room.status !== 'playing' && room.status !== 'in_game') {
            throw new ApiError(400, 'room/not-playing', 'المباراة ليست نشطة.');
          }

          const actorRole = resolveActorRole(room, user.uid);
          if (!actorRole) {
            throw new ApiError(403, 'room/not-a-player', 'أنت لست لاعباً في هذه الغرفة.');
          }

          const aq = room.activeQuestion;
          if (!aq || aq.isWalaKalima) return null;
          if (aq.submissionStatus === 'resolved' || aq.isAnswerRevealed) return null;
          if ((room.usedTileKeys || []).includes(aq.tileKey)) return null;

          const activeRole = resolveTurnRole(room);
          const now = Date.now();
          const timerDurationSec = room.timerDuration || 60;
          const isAudio = aq.mediaType === 'audio' || Boolean(aq.audioUrl);
          const minElapsedMs = (timerDurationSec + (isAudio ? 8 : 0)) * 1000;
          const isTimerActuallyExpired = now - (aq.openedAt || 0) >= minElapsedMs - 1500;

          if (actorRole !== activeRole && !isTimerActuallyExpired) {
            throw new ApiError(
              403,
              'room/not-your-turn',
              'لا يمكنك تخطي السؤال في غير دورك قبل انتهاء المؤقت.'
            );
          }

          const cacheKey = `${code}__${aq.tileKey}__${aq.openedAt}`;
          let secret = secretAnswerCache.get(cacheKey);
          if (!secret) {
            const authQ = await resolveAuthoritativeQuestion(aq.questionId, idToken);
            secret = authQ
              ? {
                  questionId: authQ.id,
                  tileKey: aq.tileKey,
                  correctAnswer: authQ.correctAnswer,
                  acceptedAnswers: authQ.acceptedAnswers,
                  explanation: authQ.explanation,
                  points: authQ.points,
                }
              : {
                  questionId: aq.questionId,
                  tileKey: aq.tileKey,
                  correctAnswer: aq.correctAnswer || 'غير متوفرة',
                  explanation: aq.explanation || '',
                  points: aq.points,
                };
          }

          const nextUsedTileKeys = [...(room.usedTileKeys || []), aq.tileKey];
          const nextRoundUsedQuestionIds = (room.roundUsedQuestionIds || []).includes(aq.questionId)
            ? room.roundUsedQuestionIds
            : [...(room.roundUsedQuestionIds || []), aq.questionId];

          const nextTurnRole: TurnRole = activeRole === 'host' ? 'guest' : 'host';
          const nextTeamIndex = nextTurnRole === 'host' ? 0 : 1;
          const nextTurnNumber = (room.turnNumber || 1) + 1;
          const activeName = getRoleDisplayName(room, activeRole);
          const nextTurnName = getRoleDisplayName(room, nextTurnRole);

          const outcomeData = buildFinalOutcomeUpdate(room, room.teams || [], nextUsedTileKeys, now);

          const resolvedQuestion: ActiveQuestionState = {
            ...aq,
            correctAnswer: secret.correctAnswer,
            explanation: secret.explanation || '',
            isAnswerRevealed: true,
            submissionStatus: 'resolved',
            submittedByRole: activeRole,
            submittedByUid: aq.openedByUid || null,
            submittedByName: activeName,
            submittedAnswer: isTimerActuallyExpired ? 'انتهى الوقت' : 'تم تخطي السؤال',
            isCorrect: false,
            earnedPoints: 0,
            resolvedAt: now,
          };

          const msg = isTimerActuallyExpired
            ? `انتهى وقت سؤال ${activeName} دون إجابة (الصحيحة: ${secret.correctAnswer}). انتقل الدور إلى ${nextTurnName}`
            : `تخطّى ${activeName} السؤال بدون نقاط (الصحيحة: ${secret.correctAnswer}). انتقل الدور إلى ${nextTurnName}`;

          const timeoutEvent: RoomEventEntry = {
            id: makeEventId('evt_timeout'),
            type: 'question_timeout',
            timestamp: now,
            actorRole: activeRole,
            actorName: activeName,
            tileKey: aq.tileKey,
            subcategoryName: aq.subcategoryName,
            points: aq.points,
            questionText: aq.questionText,
            submittedAnswer: isTimerActuallyExpired ? 'انتهى الوقت' : 'تم التخطي',
            correctAnswer: secret.correctAnswer,
            isCorrect: false,
            earnedPoints: 0,
            nextTurnRole,
            nextTurnName,
            message: msg,
          };

          let nextLog = appendEventLog(room.eventLog, timeoutEvent);
          if (outcomeData.finishEvent) {
            nextLog = appendEventLog(nextLog, outcomeData.finishEvent);
          }

          secretAnswerCache.delete(cacheKey);

          return {
            ...room,
            usedTileKeys: nextUsedTileKeys,
            roundUsedQuestionIds: nextRoundUsedQuestionIds,
            activeQuestion: resolvedQuestion,
            activeTurnRole: nextTurnRole,
            activeTeamIndex: nextTeamIndex,
            turnNumber: nextTurnNumber,
            lastResolvedTurn: timeoutEvent,
            eventLog: nextLog,
            status: outcomeData.isGameFinished ? 'finished' : 'playing',
            winnerTeamId: outcomeData.winnerTeamId,
            winnerTeamName: outcomeData.winnerTeamName,
            winnerScore: outcomeData.winnerScore,
            lastActionMessage: outcomeData.finishEvent ? outcomeData.finishEvent.message : msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر إغلاق السؤال.');
  }
}

export async function handleDismissResolvedQuestion(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const role = resolveActorRole(room, user.uid);
          if (!role) {
            throw new ApiError(403, 'room/not-a-player', 'أنت لست لاعباً في هذه الغرفة.');
          }
          if (!room.activeQuestion) return null;
          if (!room.activeQuestion.isWalaKalima && room.activeQuestion.submissionStatus !== 'resolved') {
            throw new ApiError(
              400,
              'room/question-not-resolved',
              'لا يمكن إغلاق نافذة السؤال قبل إرسال الإجابة أو تخطيها.'
            );
          }
          return {
            ...room,
            activeQuestion: null,
            updatedAt: Date.now(),
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر العودة للوحة.');
  }
}

export async function handleWalaKalimaSyncState(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const questionPayload = body.activeQuestion as ActiveQuestionState | null | undefined;

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const actorRole = resolveActorRole(room, user.uid);
          const activeRole = resolveTurnRole(room);
          if (!actorRole || actorRole !== activeRole) {
            throw new ApiError(403, 'room/not-your-turn', 'الدور ليس لك الآن.');
          }
          const now = Date.now();
          if (!questionPayload) {
            return {
              ...room,
              activeQuestion: null,
              updatedAt: now,
            } as unknown as Record<string, unknown>;
          }
          return {
            ...room,
            activeQuestion: {
              ...questionPayload,
              openedByRole: actorRole,
              openedByUid: user.uid,
              openedByName: getRoleDisplayName(room, actorRole),
              isWalaKalima: true,
            },
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر مزامنة جولة ولا كلمة.');
  }
}

export async function handleWalaKalimaCommit(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));
    const body = getBodyObject(req);
    const tileKey = String(body.tileKey || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    const earnedPoints = Math.max(0, Math.min(2000, Math.floor(Number(body.earnedPoints || 0))));

    if (!tileKey) {
      throw new ApiError(400, 'room/invalid-tile', 'مفتاح الخانة مطلوب.');
    }

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const actorRole = resolveActorRole(room, user.uid);
          const activeRole = resolveTurnRole(room);
          if (!actorRole || actorRole !== activeRole) {
            throw new ApiError(403, 'room/not-your-turn', 'الدور ليس لك الآن.');
          }
          if ((room.usedTileKeys || []).includes(tileKey)) {
            return null;
          }

          const teamIdx = actorRole === 'host' ? 0 : 1;
          const nextTeams = (room.teams || []).map((t, idx) =>
            idx === teamIdx ? { ...t, score: (t.score || 0) + earnedPoints } : t
          );

          const nextUsedTileKeys = [...(room.usedTileKeys || []), tileKey];
          const nextRoundUsedQuestionIds = sessionId && !(room.roundUsedQuestionIds || []).includes(sessionId)
            ? [...(room.roundUsedQuestionIds || []), sessionId]
            : room.roundUsedQuestionIds || [];

          const nextTurnRole: TurnRole = actorRole === 'host' ? 'guest' : 'host';
          const nextTeamIndex = nextTurnRole === 'host' ? 0 : 1;
          const nextTurnNumber = (room.turnNumber || 1) + 1;
          const actorName = getRoleDisplayName(room, actorRole);
          const nextTurnName = getRoleDisplayName(room, nextTurnRole);
          const now = Date.now();

          const outcomeData = buildFinalOutcomeUpdate(room, nextTeams, nextUsedTileKeys, now);
          const msg =
            earnedPoints > 0
              ? `أتمّ ${actorName} جولة ولا كلمة وحصد +${earnedPoints} نقطة! انتقل الدور إلى ${nextTurnName}`
              : `أتمّ ${actorName} جولة ولا كلمة دون نقاط. انتقل الدور إلى ${nextTurnName}`;

          const wkEvent: RoomEventEntry = {
            id: makeEventId('evt_wk'),
            type: 'answer_submitted',
            timestamp: now,
            actorRole,
            actorName,
            tileKey,
            subcategoryName: 'ولا كلمة',
            points: earnedPoints,
            questionText: 'جولة تمثيل ولا كلمة (QR)',
            submittedAnswer: `${earnedPoints} نقطة`,
            correctAnswer: earnedPoints > 0 ? 'مكتملة' : 'دون نقاط',
            isCorrect: earnedPoints > 0,
            earnedPoints,
            nextTurnRole,
            nextTurnName,
            message: msg,
          };

          let nextLog = appendEventLog(room.eventLog, wkEvent);
          if (outcomeData.finishEvent) {
            nextLog = appendEventLog(nextLog, outcomeData.finishEvent);
          }

          return {
            ...room,
            teams: nextTeams,
            usedTileKeys: nextUsedTileKeys,
            roundUsedQuestionIds: nextRoundUsedQuestionIds,
            activeQuestion: null,
            activeTurnRole: nextTurnRole,
            activeTeamIndex: nextTeamIndex,
            turnNumber: nextTurnNumber,
            lastResolvedTurn: wkEvent,
            eventLog: nextLog,
            status: outcomeData.isGameFinished ? 'finished' : 'playing',
            winnerTeamId: outcomeData.winnerTeamId,
            winnerTeamName: outcomeData.winnerTeamName,
            winnerScore: outcomeData.winnerScore,
            lastActionMessage: outcomeData.finishEvent ? outcomeData.finishEvent.message : msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر اعتماد نتيجة ولا كلمة.');
  }
}

export async function handleFinishOnlineMatch(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const hostUid = room.hostUid || room.hostId;
          if (user.uid !== hostUid) {
            throw new ApiError(403, 'room/host-only', 'المضيف فقط يملك صلاحية إنهاء المباراة.');
          }
          const now = Date.now();
          const outcome = evaluateMatchOutcome(room.teams || []);
          const msg = outcome.isZeroScore
            ? 'أنهى المضيف المباراة بدون نقاط مسجلة'
            : outcome.isTie
            ? 'انتهت المباراة بالتعادل بين المضيف والضيف!'
            : `انتهت المباراة! مبروك الفوز لـ ${outcome.winnerTeamName} 🏆`;

          return {
            ...room,
            status: 'finished',
            activeQuestion: null,
            winnerTeamId: outcome.winnerTeamId,
            winnerTeamName: outcome.winnerTeamName,
            winnerScore: outcome.topScore,
            eventLog: appendEventLog(room.eventLog, {
              id: makeEventId('evt_fin'),
              type: 'match_finished',
              timestamp: now,
              actorRole: 'host',
              actorName: getRoleDisplayName(room, 'host'),
              message: msg,
            }),
            lastActionMessage: msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر إنهاء المباراة.');
  }
}

export async function handleRestartOnlineMatch(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const hostUid = room.hostUid || room.hostId;
          if (user.uid !== hostUid) {
            throw new ApiError(403, 'room/host-only', 'المضيف فقط يملك صلاحية إعادة بدء الجولة.');
          }
          const now = Date.now();
          const resetTeams = (room.teams || []).map((t) => ({ ...t, score: 0 }));
          const hasGuest = Boolean(room.guestUid || room.guestId) || Object.keys(room.players || {}).length >= 2;
          const hostName = getRoleDisplayName(room, 'host');
          const msg = `أعاد المضيف ${hostName} تشغيل الغرفة لجولة جديدة! اختاروا الفئات وأكّدوها`;

          return {
            ...room,
            status: hasGuest ? 'selecting_categories' : 'waiting_for_opponent',
            teams: resetTeams,
            usedTileKeys: [],
            roundUsedQuestionIds: [],
            selectedSubcategoryIds: [],
            categoryConfirmations: {
              host: false,
              guest: false,
            },
            activeQuestion: null,
            lastResolvedTurn: null,
            activeTurnRole: 'host',
            activeTeamIndex: 0,
            turnNumber: 1,
            winnerTeamId: null,
            winnerTeamName: null,
            winnerScore: 0,
            eventLog: appendEventLog(room.eventLog, {
              id: makeEventId('evt_restart'),
              type: 'match_restarted',
              timestamp: now,
              actorRole: 'host',
              actorName: hostName,
              message: msg,
            }),
            lastActionMessage: msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر إعادة بدء المباراة.');
  }
}

export async function handleClaimHostRole(req: Request, res: Response): Promise<void> {
  try {
    const { user, idToken } = await requireAuthenticatedUser(req);
    const code = parseRoomCode(String(req.params.code || ''));

    const updatedRoom = await withRoomLock(code, async () => {
      const result = await runRoomCasTransaction<Record<string, unknown>>({
        roomCode: code,
        idToken,
        mutator: (raw) => {
          const room = raw as unknown as OnlineGameRoom;
          const currentHostUid = room.hostUid || room.hostId;
          const candidate = room.players?.[user.uid];
          if (!candidate) {
            throw new ApiError(403, 'room/not-a-player', 'أنت لست لاعباً في هذه الغرفة.');
          }
          const currentHost = room.players?.[currentHostUid];
          const now = Date.now();
          const isStale =
            !currentHost ||
            currentHost.connectionStatus === 'offline' ||
            now - (currentHost.lastSeen || 0) > HOST_STALE_THRESHOLD_MS;

          if (!isStale && currentHostUid !== user.uid) {
            throw new ApiError(
              409,
              'room/host-still-active',
              'المضيف الحالي لا يزال متصلاً.'
            );
          }

          if (currentHostUid === user.uid) return null;

          const prevTeams = room.teams || [];
          const swappedTeams =
            prevTeams.length >= 2
              ? [
                  { ...prevTeams[1], id: 'team_1' },
                  { ...prevTeams[0], id: 'team_2' },
                ]
              : prevTeams;

          const prevSubs = room.teamSubcategoryIds || {};
          const swappedSubs = {
            team_1: prevSubs.team_2 || [],
            team_2: prevSubs.team_1 || [],
          };

          const swappedConfirmations = {
            host: Boolean(room.categoryConfirmations?.guest),
            guest: Boolean(room.categoryConfirmations?.host),
          };

          const prevRole = resolveTurnRole(room);
          const nextRole: TurnRole = prevRole === 'host' ? 'guest' : 'host';

          const nextPlayers = { ...(room.players || {}) };
          if (currentHost) {
            nextPlayers[currentHostUid] = {
              ...currentHost,
              isHost: false,
              teamId: 'team_2',
            };
          }
          nextPlayers[user.uid] = {
            ...candidate,
            isHost: true,
            teamId: 'team_1',
            connectionStatus: 'online',
            lastSeen: now,
          };

          const msg = `انتقلت صلاحية إدارة الغرفة إلى ${candidate.name} بعد انقطاع المضيف السابق`;
          return {
            ...room,
            hostId: user.uid,
            hostUid: user.uid,
            hostName: candidate.name,
            guestId: currentHostUid,
            guestUid: currentHostUid,
            guestName: currentHost?.name || room.hostName,
            teams: swappedTeams,
            teamSubcategoryIds: swappedSubs,
            categoryConfirmations: swappedConfirmations,
            activeTurnRole: nextRole,
            activeTeamIndex: nextRole === 'host' ? 0 : 1,
            hostLastSeen: now,
            players: nextPlayers,
            lastActionMessage: msg,
            lastActionAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>;
        },
      });
      return result.data as unknown as OnlineGameRoom;
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    handleEngineError(res, err, 'تعذر نقل صلاحية المضيف.');
  }
}
